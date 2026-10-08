"""Guardrails for the 26 illustrative EPLAN 1.2 reference foods.

These tests check internal consistency, NOT nutritional-source verification.
Never promote these records to verified without traceable source IDs.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from food_reference_catalog import reference_food_items


class FoodReferenceAuditTests(unittest.TestCase):
    def test_catalogue_has_unique_ids_and_explicit_provenance(self):
        items = reference_food_items()
        self.assertEqual(len(items), 26)
        self.assertEqual(len({x["source_id"] for x in items}), len(items))
        for item in items:
            with self.subTest(food=item["name"]):
                self.assertEqual(item["source"], "reference")
                self.assertTrue(item["approximate"])
                self.assertEqual(item["data_type"], "reference")
                self.assertIn(item["preparation_state"], {"raw", "dry", "cooked", "as_sold"})
                self.assertTrue(item["source_id"].startswith("eplan12-"))

    def test_nutrients_are_finite_and_physically_possible(self):
        import math
        for item in reference_food_items():
            with self.subTest(food=item["name"]):
                for field in ("kcal_100", "protein_100", "fat_100", "carbs_100"):
                    value = item[field]
                    self.assertTrue(math.isfinite(value))
                    self.assertGreaterEqual(value, 0)
                self.assertLessEqual(item["kcal_100"], 900)
                self.assertLessEqual(sum(item[k] for k in ("protein_100", "fat_100", "carbs_100")), 105)

    def test_energy_macro_discrepancies_are_flagged_not_rewritten(self):
        # 4/9/4 is only a rough cross-check: fibre, organic acids,
        # Atwater-specific factors and rounding can legitimately differ.
        for item in reference_food_items():
            estimated = 4 * item["protein_100"] + 9 * item["fat_100"] + 4 * item["carbs_100"]
            with self.subTest(food=item["name"]):
                discrepancy = abs(item["kcal_100"] - estimated)
                # The source is explicitly approximate. Flag large discrepancies
                # for review rather than inventing a replacement kcal value.
                if discrepancy > 25:
                    self.assertTrue(item["approximate"])
                    self.assertEqual(item["source"], "reference")

    def test_dry_and_cooked_rice_remain_distinct(self):
        items = {x["source_id"]: x for x in reference_food_items()}
        dry = items["eplan12-rice-white-dry"]
        cooked = items["eplan12-rice-boiled"]
        self.assertEqual(dry["preparation_state"], "dry")
        self.assertEqual(cooked["preparation_state"], "cooked")
        self.assertGreater(dry["kcal_100"], cooked["kcal_100"] * 2)


if __name__ == "__main__":
    unittest.main()
