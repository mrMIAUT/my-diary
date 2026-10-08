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
    "_food_search_related_terms", "_food_full_title_matches",
    "_food_expand_specific_candidates",
}
CONSTANTS = {
    "FOOD_QUERY_REPLACEMENTS", "FOOD_USDA_ALIASES",
    "FOOD_SEARCH_LINK_WORDS", "UKRAINIAN_BRAND_HINTS",
    "FOOD_SEARCH_COMMON_BASES","FOOD_SEARCH_NAME_EQUIVALENTS",
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


    def test_russian_genitive_prepositions(self):
        self.assertEqual(
            R["normalize_food_query"]("Пельмени из говядины"),
            "пельмені з яловичини",
        )
        self.assertEqual(
            R["normalize_food_query"]("Пельмени с говядины"),
            "пельмені з яловичини",
        )
        self.assertIn(
            "beef dumplings",
            R["food_search_variants"]("Пельмени из говядины"),
        )

    def test_broad_beef_result_with_pelmeni_mixed_meat(self):
        ranked = self.rank("Пельмени из говядины", [
            food("Яловичина для стейка", "Сільпо", True),
            food("Пельмені Свинина Яловичина", "Український виробник", True),
        ])
        self.assertEqual(ranked[0]["name"], "Пельмені Свинина Яловичина")

    def test_failed_phrase_search_expands_by_food_terms(self):
        calls = []
        def collect(term):
            calls.append(term)
            if term=="яловичина":
                return [food("Пельмені Свинина Яловичина", "Український виробник", True)]
            return []
        result = R["_food_expand_specific_candidates"](
            R["normalize_food_query"]("Пельмени из говядины"),
            [],8,collect,
        )
        self.assertEqual(calls, ["пельмені","яловичина"])
        self.assertEqual(result[0]["name"], "Пельмені Свинина Яловичина")

    def test_exact_milk_is_above_related_chocolate(self):
        ranked = self.rank("молоко", [
            food('Молочно-шоколадний батон "Milk Chocolate"', "Roshen", True),
            food("Молоко", "Галичина", True),
            food("Молоко 2,5%", "Молокія", True),
        ])
        self.assertEqual(ranked[0]["name"], "Молоко")
        self.assertEqual(ranked[-1]["brand"], "Roshen")

    def test_single_word_query_does_not_expand(self):
        calls = []
        result = R["_food_expand_specific_candidates"](
            "яловичина",[],8,lambda term:calls.append(term) or []
        )
        self.assertEqual(result, [])
        self.assertEqual(calls, [])


    def test_chicken_has_ukrainian_and_english_search_variants(self):
        self.assertEqual(R["normalize_food_query"]("Курица"),"курятина")
        variants = R["food_search_variants"]("Курица")
        self.assertIn("курятина",variants)
        self.assertIn("курка",variants)
        self.assertIn("куряче",variants)
        self.assertIn("chicken",variants)
        self.assertEqual(R["usda_food_query"]("курятина"),"chicken")

    def test_chicken_title_rank_and_translation(self):
        ranked = self.rank("Курица", [
            food("Куряче філе", "Наша Ряба",True),
            food("Яловичина Ангус", "Сільпо",True),
            food("Chicken breast", "World brand",False),
            food("Курка охолоджена", "Сільпо",True),
        ])
        names=[x["name"] for x in ranked]
        self.assertIn("Куряче філе", names)
        self.assertIn("Chicken breast", names)
        self.assertIn("Курка охолоджена", names)
        self.assertNotIn("Яловичина Ангус", names)
        self.assertEqual(ranked[0]["brand"],"Сільпо")

    def test_unrelated_pasta_not_in_potato_results(self):
        ranked = self.rank("Картошка", [
            food("Картопля варена з маслом","Novus",True),
            food("Локшина макаронні вироби","Своя Лінія",True),
            food("Пюре з картоплі", "Місцеві",True),
        ])
        names=[x["name"] for x in ranked]
        self.assertNotIn("Локшина макаронні вироби",names)
        self.assertIn("Пюре з картоплі",names)

    def test_milk_chocolate_bars_are_below_actual_milk(self):
        ranked = self.rank("Молоко", [
            food('Молочно-шоколадний батон "Milk Chocolate"', "Roshen",True),
            food("Молоко 2,5%", "Галичина",True),
            food("Молоко коров'яче", "Молокія",True),
            food('Молочно-шоколадний батон "Milk Chocolate with Coconut"', "Roshen",True),
        ])
        self.assertEqual([x["brand"] for x in ranked[:2]],["Галичина","Молокія"])
        self.assertTrue(all(x["brand"]=="Roshen" for x in ranked[2:]))

    def test_specific_beef_dumplings_and_related_beef_dishes_still_found(self):
        ranked = self.rank("Пельмени с говядиной", [
            food("Пельмені зі свининою та яловичиною","Три Ведмеді",True),
            food("Яловичина для стейка","Сільпо",True),
            food("Beef dumplings","International",False),
        ])
        self.assertEqual(ranked[0]["brand"],"Три Ведмеді")
        self.assertIn("Beef dumplings",[x["name"] for x in ranked])

    def test_stable_across_repeated_calls(self):
        once = [x["name"] for x in self.rank("Говядина")]
        twice = [x["name"] for x in self.rank("Говядина")]
        self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
