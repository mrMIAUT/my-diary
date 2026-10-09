"""Regression tests: proposed foods must never bypass USDA BJU source review.

Synthetic test values are not claims about real food composition.
"""
import json
import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from food_local_catalog import (
    candidate_manifest, validate_reviewed_record, approved_reference_food_items,
)
from food_reference_catalog import reference_food_items


class LocalCatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates = candidate_manifest()
        cls.by_id = {row["id"]: row for row in cls.candidates}

    def sample_record(self, candidate_id="plan-0001"):
        candidate = self.by_id[candidate_id]
        return {
            "candidate_id": candidate_id,
            "name_uk": candidate["name_uk"],
            "preparation_state": candidate["preparation_state"],
            "review_status": "approved",
            "source_system": "USDA_FDC",
            "fdc_id": 1234567,  # synthetic ID for validation tests ONLY
            "source_data_type": "Foundation",
            "source_archive_version": "synthetic-test-fixture",
            "source_snapshot_sha256": "a" * 64,
            "source_food_description": "Synthetic test food",
            "source_portion_basis": "100g_edible_portion",
            "source_nutrient_ids": {
                "kcal_100": 1008, "protein_100": 1003,
                "fat_100": 1004, "carbs_100": 1005,
            },
            "source_nutrients_100g": {
                "kcal_100": 120.0, "protein_100": 23.0,
                "fat_100": 2.6, "carbs_100": 0.0,
            },
            "reviewed_by": "unit-test-fixture",
            "reviewed_at": "2026-10-09",
            "kcal_100": 120.0,
            "protein_100": 23.0,
            "fat_100": 2.6,
            "carbs_100": 0.0,
        }

    def test_candidate_manifest_is_large_and_not_nutrition_data(self):
        self.assertGreaterEqual(len(self.candidates), 300)
        self.assertGreaterEqual(len({c["category"] for c in self.candidates}), 10)
        self.assertEqual(len(self.by_id), len(self.candidates))
        for row in self.candidates:
            with self.subTest(name=row["name_uk"]):
                self.assertEqual(row["nutrition_status"], "pending_source")
                self.assertFalse(any(key in row for key in
                    ("kcal_100", "protein_100", "fat_100", "carbs_100")))

    def test_current_empty_source_store_does_not_promote_candidates(self):
        data = json.loads((BACKEND / "food_local_nutrition.json").read_text(
            encoding="utf-8"
        ))
        self.assertEqual(data["schema_version"], 1)
        # Existing approximate foods stay explicitly labeled and distinct
        # from records that have actually passed source review.
        approved = approved_reference_food_items()
        for row in approved:
            self.assertFalse(row["approximate"])
            self.assertEqual(row["review_status"], "approved")
            self.assertTrue(row["source_fdc_id"] > 0)
        all_reference = reference_food_items()
        self.assertGreaterEqual(len(all_reference), 26)
        self.assertEqual(len({row["source_id"] for row in all_reference}),
                         len(all_reference))

    def test_source_review_records_require_identical_food_state(self):
        record = self.sample_record()
        approved = validate_reviewed_record(record, self.by_id)
        self.assertEqual(approved["source_fdc_id"], 1234567)
        self.assertFalse(approved["approximate"])
        bad = dict(record,preparation_state="cooked")
        with self.assertRaises(ValueError):
            validate_reviewed_record(bad,self.by_id)
        bad = dict(record,source_portion_basis="per_serving")
        with self.assertRaises(ValueError):
            validate_reviewed_record(bad,self.by_id)

    def test_incomplete_or_untraceable_nutrition_never_passes_review(self):
        original = self.sample_record()
        for changes in (
            {"source_snapshot_sha256": ""},
            {"source_system": "OFF"},
            {"source_data_type": "Branded"},
            {"source_nutrients_100g": {}},
            {"source_nutrient_ids": {}},
            {"review_status": "pending"},
            {"fdc_id": 0},
            {"reviewed_by": ""},
            {"protein_100": None},
            {"kcal_100": float("nan")},
            {"kcal_100": 5561.0},
            {"protein_100": 101.0},
            {"carbs_100": -1},
            {"protein_100": 65, "fat_100": 45},
            {"source_portion_basis": "100g_uncooked_when_cooked"},
        ):
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError):
                    validate_reviewed_record(dict(original, **changes),self.by_id)

    def test_major_calorie_macro_discrepancies_need_review_note(self):
        bad = dict(self.sample_record(), kcal_100=650)
        with self.assertRaises(ValueError):
            validate_reviewed_record(bad,self.by_id)
        bad["energy_discrepancy_review"] = (
            "Specific Atwater factors and non-macro energy contribution "
            "checked against the actual official source record."
        )
        bad["source_nutrients_100g"] = {
            **bad["source_nutrients_100g"], "kcal_100": 650,
        }
        # The review gate allows an explained exception, but cannot independently
        # verify its source; a human must compare underlying official records.
        self.assertEqual(
            validate_reviewed_record(bad,self.by_id)["kcal_100"],650
        )


if __name__ == "__main__":
    unittest.main()
