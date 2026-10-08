"""Regression tests for broad vs specific food searches (no API or DB needed)."""
import ast
import re
import unittest
from pathlib import Path

APP = (Path(__file__).resolve().parents[1] / "app.py").read_text(encoding="utf-8")
FUNCTIONS = {
    "normalize_food_query", "usda_food_query", "food_search_variants",
    "_food_match_words", "_food_match_word", "_food_match_coverage",
    "_food_match_quality", "_food_local_tier", "_food_rank",
}
CONSTANTS = {
    "FOOD_QUERY_REPLACEMENTS", "FOOD_USDA_ALIASES",
    "FOOD_SEARCH_LINK_WORDS", "UKRAINIAN_BRAND_HINTS",
}


def load_ranking_logic():
    tree = ast.parse(APP)
    nodes = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in FUNCTIONS:
            nodes.append(node)
        elif isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id in CONSTANTS for t in node.targets
        ):
            nodes.append(node)
    namespace = {"re": re, "_dedupe_food_items": lambda items: items}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "food-search", "exec"), namespace)
    return namespace


R = load_ranking_logic()


def food(name, brand, ukraine=False):
    return {
        "source": "off", "source_id": name + "/" + brand, "barcode": "",
        "name": name, "brand": brand, "ukraine": ukraine,
        "kcal_100": 150, "protein_100": 20, "fat_100": 8, "carbs_100": 0,
    }


class FoodSearchRanking(unittest.TestCase):
    def setUp(self):
        self.items = [
            food("Яловичина Ангус стейк Рібай", "Сільпо", True),
            food("Яловичина для стейка", "Food Works", True),
            food("Beef Steak", "Globyno", True),
            food("Beef jerky", "Foreign Brand"),
            food("Гьодза з яловичиною", "Vici", True),
            food("Пельмені з яловичиною", "Український виробник", True),
            food("Лазанья з яловичиною", "Italian Brand", True),
        ]

    def rank(self, query, items=None):
        normalized = R["normalize_food_query"](query)
        return R["_food_rank"](normalized, items or self.items)

    def test_russian_query_translates_to_ukrainian(self):
        self.assertEqual(R["normalize_food_query"]("Говядина"), "яловичина")
        self.assertEqual(
            R["normalize_food_query"]("Пельмени с говядиной"),
            "пельмені з яловичиною",
        )

    def test_related_dishes_stay_in_results(self):
        ranked = self.rank("Говядина")
        names = [item["name"] for item in ranked]
        self.assertIn("Гьодза з яловичиною", names)
        self.assertIn("Пельмені з яловичиною", names)
        self.assertIn("Лазанья з яловичиною", names)
        self.assertLess(names.index("Яловичина Ангус стейк Рібай"), names.index("Гьодза з яловичиною"))

    def test_more_specific_query_prioritizes_named_dish(self):
        ranked = self.rank("Пельмени с говядиной")
        self.assertEqual(ranked[0]["name"], "Пельмені з яловичиною")

    def test_ukrainian_brand_wins_among_direct_matches(self):
        ranked = self.rank("Говядина", [
            food("Beef Steak", "Foreign Brand"),
            food("Beef Steak", "Globyno", True),
        ])
        self.assertEqual(ranked[0]["brand"], "Globyno")

    def test_general_relevance_works_for_unlisted_food_categories(self):
        items = [
            food("Пюре з картоплі", "Локальний", True),
            food("Картопля", "Локальний", True),
        ]
        ranked = self.rank("картошка", items)
        self.assertEqual(ranked[0]["name"], "Картопля")
        self.assertEqual(len(ranked), 2)

    def test_stable_across_repeated_calls(self):
        once = [x["name"] for x in self.rank("Говядина")]
        twice = [x["name"] for x in self.rank("Говядина")]
        self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
