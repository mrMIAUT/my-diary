"""Offline regression tests for EPLAN 1.2 search tabs + provisional catalogue.

External OFF/USDA calls and production database are never used here.
"""
import ast
import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from food_reference_catalog import reference_food_items
from test_food_search_ranking import R, food


def unique_foods(items):
    seen = set()
    out = []
    for item in items:
        key = (item.get("source"), item.get("source_id"))
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def mock_endpoint(candidates):
    """Compile only the prototype search handler, without importing the app."""
    source = (BACKEND / "app.py").read_text(encoding="utf-8")
    nodes = [n for n in ast.parse(source).body
             if isinstance(n, ast.FunctionDef)
             and n.name in {"prototype_food_search","_food_result_page"}]
    for node in nodes:
        node.decorator_list = []
    namespace = {
        **R,
        "Query": lambda default=None, **kwargs: default,
        "PROTOTYPE_MODE": True,
        "FOOD_SEARCH_MAX_RESULTS": 24,
        "_off_search": lambda *a, **kw: [],
        "_off_collect": lambda *a, **kw: candidates,
        # Keep the isolated route harness compatible with search caching:
        # bypass caching to exercise ranking/pagination against mock sources.
        "_food_cache_get": lambda *a, **kw: None,
        "_food_cache_set": lambda *a, **kw: None,
        "_food_collect_off_batches": lambda jobs: [candidates for _ in jobs],
        "FOOD_RESULT_CACHE": {},
        "FOOD_RESULT_CACHE_LOCK": None,
        "FOOD_RESULT_CACHE_TTL_SECONDS": 180,
        "FOOD_RESULT_CACHE_MAX_ENTRIES": 96,
        "_off_barcode": lambda barcode: [],
        "_off_brand_matches": lambda query, items: [],
        "_usda_search": lambda *a, **kw: [],
        "USDA_GENERIC_TYPES": ["Foundation", "Survey (FNDDS)", "SR Legacy"],
        "USDA_BRANDED_TYPES": ["Branded"],
        "_dedupe_food_items": unique_foods,
        "reference_food_items": reference_food_items,
    }
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "foods-category-route", "exec"),
         namespace)
    return namespace["prototype_food_search"]


class ReferenceFoodTests(unittest.TestCase):
    def test_reference_entries_are_unique_explicitly_approximate_and_per_100g(self):
        items = reference_food_items()
        self.assertGreaterEqual(len(items), 20)
        self.assertEqual(len(items), len({x["source_id"] for x in items}))
        for item in items:
            with self.subTest(item=item["name"]):
                self.assertEqual(item["source"], "reference")
                self.assertTrue(item["approximate"])
                self.assertEqual(item["food_type"], "generic")
                self.assertEqual(item["brand"], "")
                self.assertTrue(item["name"])
                self.assertGreater(item["kcal_100"], 0)
                for macro in ("protein_100", "fat_100", "carbs_100"):
                    self.assertGreaterEqual(item[macro], 0)
                    self.assertLessEqual(item[macro], 100)
        self.assertTrue(all(x["source_id"].startswith("eplan12-") for x in items))

    def test_raw_dry_and_cooked_weights_do_not_share_a_single_profile(self):
        items = {x["source_id"]: x for x in reference_food_items()}
        self.assertEqual(items["eplan12-rice-white-dry"]["preparation_state"], "dry")
        self.assertEqual(items["eplan12-rice-boiled"]["preparation_state"], "cooked")
        self.assertGreater(items["eplan12-rice-white-dry"]["kcal_100"],
                           items["eplan12-rice-boiled"]["kcal_100"])
        self.assertNotEqual(items["eplan12-potato-raw"]["source_id"],
                            items["eplan12-potato-boiled"]["source_id"])

    def test_type_classifier_distinguishes_generic_branded_and_dishes(self):
        classify = R["_food_search_type"]
        reference = reference_food_items()[0]
        usda_plain = {**food("Rice, white, dry", "", False), "source": "usda",
                      "data_type": "Foundation"}
        usda_brand = {**food("Rice", "Example", False), "source": "usda",
                      "data_type": "Branded"}
        off_no_brand = food("Картопля сира", "", True)
        dish = food("Суп з картоплею", "Місцевий", True)
        self.assertEqual(classify(reference), "generic")
        self.assertEqual(classify(usda_plain), "generic")
        self.assertEqual(classify(usda_brand), "branded")
        self.assertEqual(classify(off_no_brand), "branded")
        self.assertEqual(classify(dish), "dish")

    def test_generic_reference_search_works_without_external_data(self):
        search = mock_endpoint([])
        result = search(q="Картопля", limit=8, page=1, food_type="generic")
        self.assertTrue(result["items"])
        self.assertTrue(all(x["source"] == "reference" for x in result["items"]))
        self.assertIn("Картопля сира", [x["name"] for x in result["items"]])
        self.assertIn("Картопля варена", [x["name"] for x in result["items"]])
        self.assertEqual(result["food_type"], "generic")

    def test_tabs_filter_before_pagination_and_keep_all_tab_compatible(self):
        candidates = [
            food("Картопля фрі", "Своя лінія", True),
            food("Картопля очищена", "Грінвіль", True),
            food("Суп з картоплею", "Місцевий", True),
            food("Картопля по-домашньому", "Другий", True),
        ]
        search = mock_endpoint(candidates)
        all_results = search(q="Картошка", limit=24, page=1, food_type="all")
        self.assertEqual(all_results["items"][0]["name"], "Картопля сира")
        self.assertEqual(all_results["items"][0]["food_type"], "generic")
        self.assertIn("Картопля фрі", [x["name"] for x in all_results["items"]])

        branded_first = search(q="Картошка", limit=1, page=1, food_type="branded")
        branded_second = search(q="Картошка", limit=1, page=2, food_type="branded")
        names = [x["name"] for x in branded_first["items"] + branded_second["items"]]
        self.assertEqual(set(names), {"Картопля фрі", "Картопля очищена"})
        self.assertTrue(branded_first["has_more"])
        self.assertFalse(branded_second["has_more"])
        self.assertTrue(all(x["food_type"] == "branded"
                            for x in branded_first["items"] + branded_second["items"]))

        dishes = search(q="Картошка", limit=8, page=1, food_type="dish")
        self.assertEqual({x["name"] for x in dishes["items"]},
                         {"Суп з картоплею", "Картопля по-домашньому"})
        self.assertTrue(all(x["food_type"] == "dish" for x in dishes["items"]))

    def test_specific_dish_query_still_outweighs_generic_reference(self):
        search = mock_endpoint([
            food("Суп з картоплею", "Локальний", True),
            food("Картопля фрі", "Локальний", True),
        ])
        ranked = search(q="Суп з картоплею", limit=8, page=1, food_type="all")
        self.assertEqual(ranked["items"][0]["name"], "Суп з картоплею")
        self.assertFalse(any(x["source"] == "reference" for x in ranked["items"]))


if __name__ == "__main__":
    unittest.main()
