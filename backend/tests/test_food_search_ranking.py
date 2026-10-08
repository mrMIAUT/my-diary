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
    "_food_preparation_rank", "_food_broad_relation_rank",
    "_food_search_related_terms", "_food_full_title_matches",
    "_food_expand_specific_candidates",
}
CONSTANTS = {
    "FOOD_QUERY_REPLACEMENTS", "FOOD_USDA_ALIASES",
    "FOOD_SEARCH_LINK_WORDS", "UKRAINIAN_BRAND_HINTS",
    "FOOD_SEARCH_COMMON_BASES","FOOD_SEARCH_NAME_EQUIVALENTS",
    "FOOD_READY_PRODUCT_STEMS","FOOD_COOKED_PRODUCT_STEMS",
    "FOOD_DISH_SIDE_STEMS","FOOD_READY_PRODUCT_WORDS",
    "FOOD_BROAD_MEAT_TERMS","FOOD_NON_MEAT_ANIMAL_STEMS",
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
        self.assertEqual({x["brand"] for x in ranked[:2]},{"Галичина","Молокія"})
        self.assertTrue(all(x["brand"]=="Roshen" for x in ranked[2:]))

    def test_specific_beef_dumplings_and_related_beef_dishes_still_found(self):
        ranked = self.rank("Пельмени с говядиной", [
            food("Пельмені зі свининою та яловичиною","Три Ведмеді",True),
            food("Яловичина для стейка","Сільпо",True),
            food("Beef dumplings","International",False),
        ])
        self.assertEqual(ranked[0]["brand"],"Три Ведмеді")
        self.assertIn("Beef dumplings",[x["name"] for x in ranked])


    def test_broad_chicken_prioritizes_basic_then_cooked_then_snacks(self):
        ranked=self.rank("Курица",[
            food("Chicken Jerky","Silpo",True),
            food("Курка гриль","Сільпо",True),
            food("Chicken breast","Imported",False),
            food("Куряче філе сушене","М'ясоріг",True),
            food("Куряче філе","Наша ряба",True),
            food("Chicken noodles","Rozumnyi Vybir",True),
            food("Курка відварена","Local",True),
        ])
        self.assertEqual(
            [R["_food_preparation_rank"](item) for item in ranked],
            [0,0,1,1,2,2,2],
        )
        self.assertEqual(ranked[0]["brand"],"Наша ряба")
        self.assertEqual(ranked[1]["brand"],"Imported")

    def test_ukrainian_brands_wins_within_broad_food_group(self):
        ranked=self.rank("Курица",[
            food("Chicken breast","Foreign",False),
            food("Chicken Breast","Наша ряба",True),
            food("Курка гриль","Other",False),
            food("Курка гриль","Сільпо",True),
        ])
        self.assertEqual(ranked[0]["brand"],"Наша ряба")
        cooked=[x for x in ranked if R["_food_preparation_rank"](x)==1]
        self.assertEqual(cooked[0]["brand"],"Сільпо")

    def test_specific_chicken_snack_query_is_not_downgraded(self):
        ranked=self.rank("Chicken Jerky",[
            food("Chicken breast","Наша ряба",True),
            food("Chicken Jerky","Local",True),
            food("Chicken Kabanos","Silpo",True),
        ])
        self.assertEqual(ranked[0]["name"],"Chicken Jerky")

    def test_generic_potato_and_milk_dont_lose_related_foods(self):
        potato=self.rank("Картошка",[
            food("Чипси картопляні","Novus",True),
            food("Картопля запечена","Novus",True),
            food("Картопля","Foreign",False),
        ])
        self.assertEqual(
            [R["_food_preparation_rank"](x) for x in potato],[0,1,2],
        )
        milk=self.rank("Молоко",[
            food('Молочно-шоколадний батон "Milk Chocolate"',"Roshen",True),
            food("Молоко 2,5%","Молокія",True),
        ])
        self.assertEqual(len(milk),2)
        self.assertEqual(milk[0]["brand"],"Молокія")

    def test_beef_dumplings_stay_discoverable(self):
        ranked=self.rank("Пельмени с говядиной",[
            food("Яловичина для стейка","Сільпо",True),
            food("Пельмені з яловичиною","Три Ведмеді",True),
            food("Beef dumplings","Foreign",False),
        ])
        self.assertEqual(ranked[0]["brand"],"Три Ведмеді")
        self.assertEqual(len(ranked),3)


    def test_real_chicken_screenshot_basic_cuts_before_meals(self):
        # Reported 8 October: mixed dishes appeared before chicken cuts for
        # Russian "Курица" even though broad search should prefer plain foods.
        actual=[
            food("Курка Су-Від З Овочами Та Зеленню","Наша Ряба",True),
            food("Куряче філе мале «Міньйон»","Наша ряба",True),
            food("Курка Для Шаурми","М'ясторія",True),
            food("Курка під соусом «Териякі» з овочами та рисом","Meal Time",True),
            food("Chicken Breast","Epikur"),
            food("Chicken Fiesta","Objerky"),
            food("Chicken Nuggets","Befoodie"),
            food("Chicken Thighs","Epicur"),
        ]
        ranked=self.rank("Курица",actual)
        self.assertEqual(len(ranked),len(actual))
        self.assertEqual(
            [item["name"] for item in ranked[:3]],
            ["Куряче філе мале «Міньйон»","Chicken Breast","Chicken Thighs"],
        )
        self.assertTrue(all(R["_food_preparation_rank"](item)==2 for item in ranked[3:]))

    def test_mixed_dish_vs_plain_cooked_general_food_categories(self):
        groups=(
            ("Рис",["Рис басматі","Рис відварений","Рис з овочами"]),
            ("Картошка",["Картопля","Картопля гриль","Картопля з сиром"]),
            ("Лосось",["Лосось філе","Лосось на парі","Лосось з овочами"]),
            ("Говядина",["Яловичина для стейка","Яловичина гриль","Яловичина в соусі"]),
        )
        for query,names in groups:
            with self.subTest(query=query):
                original=[
                    food(names[2],"Сільпо",True),
                    food(names[1],"Сільпо",True),
                    food(names[0],"Сільпо",True),
                ]
                ranked=self.rank(query,original)
                self.assertEqual([x["name"] for x in ranked],names)

    def test_single_raw_food_and_plain_sous_vide_not_marked_a_mixed_meal(self):
        for name,category in (
            ("Курка охолоджена",0),
            ("Chicken Thighs",0),
            ("Овочі свіжі",0),
            ("Молоко з вітаміном D3",0),
            ("Курка су-від",1),
            ("Курка су-від з овочами",2),
            ("Рис з куркою",2),
            ("Сир кисломолочний",0),
        ):
            with self.subTest(name=name):
                self.assertEqual(R["_food_preparation_rank"](food(name,"Local",True)),category)

    def test_detailed_dish_search_still_prioritizes_recipe(self):
        ranked=self.rank("Рис з куркою",[
            food("Рис басматі","Сільпо",True),
            food("Рис з куркою","Local",True),
            food("Куряче філе","Наша ряба",True),
        ])
        self.assertEqual(ranked[0]["name"],"Рис з куркою")
        self.assertEqual(len(ranked),2)


    def test_real_chicken_1731_screenshot_basic_cuts_first(self):
        # Production-like examples reported in screenshot: plain meat must
        # outrank eggs, deli ham and pelmeni for the generic "Курица" query.
        actual=[
            food("Куряче філе мале «Міньйон»","Наша ряба",True),
            food("Курячі яйця 10шт","Квочка",True),
            food("Chicken Breast","Epikur",False),
            food("Chicken ham","Укрпромпостач перияслав",True),
            food("Chicken Thighs","Epicur",False),
            food("Chicken & Butter Pelmeni","Bilyi Byk",True),
            food("Chicken Drumsticks Raw","Epikur",False),
            food("Chicken Strips Spicy","Легко!",True),
        ]
        ranked=self.rank("Курица",actual)
        self.assertEqual(len(ranked),8)
        self.assertEqual([x["name"] for x in ranked[:4]],[
            "Куряче філе мале «Міньйон»",
            "Chicken Breast",
            "Chicken Thighs",
            "Chicken Drumsticks Raw",
        ])
        self.assertEqual(ranked[-1]["name"],"Курячі яйця 10шт")
        self.assertEqual(
            [R["_food_preparation_rank"](x) for x in ranked[4:7]],
            [2,2,2],
        )

    def test_chicken_related_eggs_kept_and_eggs_search_unaffected(self):
        items=[
            food("Курячі яйця 10шт","Квочка",True),
            food("Куряче філе","Наша ряба",True),
        ]
        meat=self.rank("Курица",items)
        self.assertEqual(meat[-1]["name"],"Курячі яйця 10шт")
        self.assertEqual(len(meat),2)
        eggs=self.rank("Яйца",items)
        self.assertEqual([x["name"] for x in eggs],["Курячі яйця 10шт"])

    def test_processed_meat_words_and_specific_queries(self):
        candidates=[
            food("Chicken ham","Укрпромпостач",True),
            food("Chicken & Butter Pelmeni","Bilyi Byk",True),
            food("Chicken Strips Spicy","Легко!",True),
        ]
        for item in candidates:
            self.assertEqual(R["_food_preparation_rank"](item),2)
        self.assertEqual(
            self.rank("Chicken ham",candidates)[0]["name"],"Chicken ham"
        )
        self.assertEqual(
            self.rank("Chicken Strips Spicy",candidates)[0]["name"],
            "Chicken Strips Spicy",
        )
        self.assertEqual(
            self.rank("Chicken & Butter Pelmeni",candidates)[0]["name"],
            "Chicken & Butter Pelmeni",
        )

    def test_hamachi_is_not_ham(self):
        self.assertEqual(
            R["_food_preparation_rank"](food("Hamachi fillet","Local",True)),0
        )

    def test_stable_across_repeated_calls(self):
        once = [x["name"] for x in self.rank("Говядина")]
        twice = [x["name"] for x in self.rank("Говядина")]
        self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
