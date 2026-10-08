"""Regression tests for the read-only USDA/OFF audit."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from food_nutrition_audit import audit, audit_item


class NutritionAuditTests(unittest.TestCase):
    def test_plausible_usda(self):
        item = {"source": "usda", "source_id": "123", "name": "Rice",
                "kcal_100": 130, "protein_100": 2.7, "fat_100": 0.3,
                "carbs_100": 28.2}
        self.assertEqual(audit_item(item), [])

    def test_flags_bad_off_energy(self):
        item = {"source": "off", "source_id": "12345", "barcode": "12345",
                "name": "Food", "kcal_100": 50, "protein_100": 25,
                "fat_100": 20, "carbs_100": 10}
        self.assertIn("energy_macro_mismatch_review", audit_item(item))

    def test_missing_data_does_not_become_zero(self):
        item = {"source": "off", "source_id": "2", "name": "Unknown"}
        self.assertIn("missing_or_invalid_kcal_100", audit_item(item))

    def test_duplicates_flagged_and_records_unchanged(self):
        item = {"source": "usda", "source_id": "7", "name": "Apple",
                "kcal_100": 52, "protein_100": 0.3, "fat_100": 0.2,
                "carbs_100": 13.8}
        original = dict(item)
        result = audit([item, dict(item)])
        self.assertEqual(result["checked"], 2)
        self.assertEqual(result["issue_counts"]["duplicate_source_id"], 1)
        self.assertEqual(item, original)


if __name__ == "__main__":
    unittest.main()
