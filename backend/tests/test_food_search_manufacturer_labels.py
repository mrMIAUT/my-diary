"""Manufacturer-declared labels must remain explicit branded products.

These regression fixtures lock reviewed manufacturer declarations as captured
on 2026-10-09. A passing test checks consistency and metadata only; it does
NOT independently establish a food's laboratory nutritional composition.
"""
import json
import math
import sys
import unittest
from pathlib import Path

BACKEND=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BACKEND))
from food_manufacturer_catalog import (
    manufacturer_label_food_items, validate_label_record, SOURCE_FILE,
)
from food_reference_catalog import reference_food_items
from test_food_search_ranking import R

class ManufacturerLabels(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw=json.loads(SOURCE_FILE.read_text(encoding="utf-8"))["records"]
        cls.labels=manufacturer_label_food_items()

    def test_manufacturer_foods_are_branded_not_usda_or_generic(self):
        self.assertEqual(len(self.labels),18)
        self.assertEqual(len({x["source_id"] for x in self.labels}),18)
        self.assertEqual({r["brand"] for r in self.labels},
                         {"Галичина","Яготинське для дітей"})
        for item in self.labels:
            with self.subTest(name=item["name"],brand=item["brand"]):
                self.assertEqual(item["source"],"reference")
                self.assertEqual(item["source_kind"],"manufacturer_label")
                self.assertEqual(item["review_status"],"manufacturer_label_reviewed")
                self.assertFalse(item["approximate"])
                self.assertEqual(item["data_type"],"manufacturer_label")
                self.assertEqual(item["food_type"],"branded")
                self.assertEqual(R["_food_search_type"](item),"branded")
                self.assertNotIn("source_fdc_id",item)
                self.assertTrue(item["brand"] and item["source_url"])
                self.assertTrue(all(math.isfinite(item[k]) for k in
                    ("kcal_100","protein_100","fat_100","carbs_100")))

    def test_known_manufacturer_declarations_exact(self):
        by_id={x["id"]:x for x in self.raw}
        # Independently reviewed labels: [kcal, protein, fat, carbs] / 100g.
        examples={
            "yagotyn-kids-milk-25":(53,3,2.5,4.7),
            "yagotyn-kids-milk-lactosefree-25":(54,3,2.5,4.8),
            "galychyna-milk-25":(51.7,2.8,2.5,4.5),
            "galychyna-kefir-25":(49,2.9,2.5,3.8),
            "galychyna-curd-5":(120.2,17,5,1.8),
            "galychyna-sourcream-15":(159,3,15,3),
            "galychyna-ryazhenka-4":(66,3,4,3.5),
        }
        for slug,expected in examples.items():
            with self.subTest(slug=slug):
                x=by_id[slug]
                self.assertEqual(tuple(x[k] for k in (
                    "kcal_100","protein_100","fat_100","carbs_100")),expected)

    def test_label_must_retain_specific_product_brand_and_url(self):
        raw=self.raw[0]
        for change in (
            {"source_url":"http://yagotynkids.com.ua/fake"},
            {"source_url":"https://evil.example/path"},
            {"source_url":"https://yagotynkids.com.ua.evil.example/path"},
            {"source_url":"https://yagotynkids.com.ua/"},
            {"source_url":"https://yagotynkids.com.ua/ua/product/x?new=true"},
            {"source_nutrition_basis":"per_serving"},
            {"brand":"Невідомо"},
            {"source_product_heading":""},
            {"source_publisher":"retailer"},
            {"nutrition_status":"pending_source"},
            {"kcal_100":float("nan")},
            {"fat_100":200},
            {"fat_100":9},
            {"protein_100":None},
            {"kcal_100":800},
            {"preparation_state":"cooked"},
        ):
            with self.subTest(change=change):
                with self.assertRaises(ValueError):
                    validate_label_record(dict(raw,**change))

    def test_both_brands_and_generic_usda_coexist_without_same_source_id(self):
        all_items=reference_food_items()
        self.assertEqual(
            sum(x.get("source_kind")=="manufacturer_label" for x in all_items),
            18,
        )
        self.assertEqual(
            sum(x.get("review_status")=="approved" for x in all_items),261
        )
        self.assertEqual(
            sum(x.get("approximate") is True for x in all_items),26
        )
        self.assertEqual(len({x["source_id"] for x in all_items}),len(all_items))
        expected=next(x for x in all_items if
                      x["source_id"]=="eplan12-manufacturer-galychyna-milk-25")
        self.assertEqual(expected["brand"],"Галичина")
        self.assertEqual(expected["name"],"Молоко 2,5%")

if __name__=="__main__":
    unittest.main()
