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
    "_food_preparation_rank", "_food_broad_relation_rank", "_food_title_language_rank",
    "_food_contains_cue",
    "_food_search_related_terms", "_food_full_title_matches",
    "_food_expand_specific_candidates", "_food_native_local_match_count",
    "_food_extra_meat_count", "_food_named_dish_conflicts",
    "_food_manufacture_country", "_food_broad_case_forms", "_food_search_type",
}
CONSTANTS = {
    "FOOD_QUERY_REPLACEMENTS", "FOOD_USDA_ALIASES",
    "FOOD_SEARCH_LINK_WORDS", "UKRAINIAN_BRAND_HINTS",
    "FOOD_SEARCH_CASE_EQUIVALENTS",
    "FOOD_SEARCH_COMMON_BASES","FOOD_SEARCH_NAME_EQUIVALENTS",
    "FOOD_COOKED_CUES","FOOD_PROCESSED_CUES","FOOD_PROCESSED_WHOLE_WORDS","FOOD_DISH_CUES",
    "FOOD_DISH_COMPLEMENT_CUES","FOOD_DISH_CATEGORY_CUES",
    "FOOD_PROCESSED_CATEGORY_CUES","FOOD_BROAD_MEAT_TERMS",
    "FOOD_NON_MEAT_ANIMAL_STEMS","FOOD_MEAT_FAMILY_CUES",
    "FOOD_SPECIFIC_DISH_CUES",
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

    def test_broad_food_cases_expand_without_sku_special_cases(self):
        cases={
            "Говядина":["яловичини","яловичиною"],
            "Свинина":["свинини","свининою"],
            "Курица":["курятини","курятиною"],
            "Курка":["курки","куркою"],
            "Картопля":["картоплі","картоплею"],
            "Морква":["моркви","морквою"],
            "Олія":["олії","олією"],
        }
        for query,forms in cases.items():
            with self.subTest(query=query):
                normalized=R["normalize_food_query"](query)
                self.assertEqual(R["_food_broad_case_forms"](normalized),forms)
                for form in forms:
                    self.assertTrue(R["_food_match_word"](normalized,form))
                    self.assertTrue(R["_food_match_word"](form,normalized))

    def test_specific_food_queries_do_not_expand_noun_cases(self):
        for phrase in ("Пельмени с говядиной","Курка гриль",
                       "Картопля з грибами","Chicken breast", "Сир 5%"):
            with self.subTest(query=phrase):
                self.assertEqual(R["_food_broad_case_forms"](
                    R["normalize_food_query"](phrase)),[])

    def test_broad_query_preserves_product_before_dishes_in_other_cases(self):
        for query,basic,dish in (
            ("говядина","Яловичина","Гуляш з яловичиною"),
            ("курка","Курка","Салат з куркою"),
            ("картопля","Картопля","Пиріг з картоплею"),
        ):
            with self.subTest(query=query):
                ranked=self.rank(query,[food(dish,"Локальний",True),
                                        food(basic,"Локальний",True)])
                self.assertEqual([item["name"] for item in ranked],[basic,dish])

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


    def test_related_catalogue_spellings_cover_both_russian_cases(self):
        nominative=R["food_search_variants"]("Пельмени с говядиной")
        genitive=R["food_search_variants"]("Пельмени с говядины")
        self.assertIn("пельмені з яловичиною",nominative)
        self.assertIn("пельмені з яловичиною",genitive)
        self.assertIn("пельмені з яловичини",nominative)
        self.assertIn("пельмені з яловичини",genitive)
        self.assertIn("beef dumplings",genitive)
        self.assertEqual(R["_food_search_related_terms"]("пельмені з яловичини"),
                         ["пельмені","яловичина","пельмени","говядина"])

    def test_both_russian_cases_rank_local_pelmeni(self):
        candidates=[
            food("Beef Dumplings","International",False),
            food("Пельмені Зі Свининою Та Яловичиною","Три Ведмеді",True),
            food("Пельмені «Фірмові» З Яловичиною Та Свининою","Levada",True),
            food("Пельмені Traditional, гьодза з яловичиною","Another",True),
        ]
        for query in ("Пельмени с говядиной","Пельмени с говядины"):
            with self.subTest(query=query):
                ranked=self.rank(query,candidates)
                self.assertEqual(ranked[0]["brand"],"Три Ведмеді")
                self.assertEqual(ranked[1]["brand"],"Levada")

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
        self.assertEqual(calls, ["пельмені","яловичина","пельмени","говядина"])
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
        # Broad chicken searches must keep the two relevant Ukrainian foods
        # ahead of the English one, but neither Ukrainian brand has to win
        # against the other merely because of its shop/producer name.
        self.assertIn(ranked[0]["name"], ("Куряче філе","Курка охолоджена"))
        self.assertLess(names.index("Куряче філе"),names.index("Chicken breast"))
        self.assertLess(names.index("Курка охолоджена"),names.index("Chicken breast"))

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
            [0,0,1,1,2,2,3],
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

    def test_english_hits_do_not_stop_local_compound_discovery(self):
        foreign=[
            food("Beef Dumplings","Foreign Food",False),
            food("Beef and Chicken Dumplings","Foreign",False),
        ]
        calls=[]
        def collect(term):
            calls.append(term)
            if term=="пельмені":
                return [
                    food("Пельмені зі свининою та яловичиною","Місцевий",True),
                    food("Пельмені з яловичиною","Інший місцевий",True),
                ]
            return []
        expanded=R["_food_expand_specific_candidates"](
            R["normalize_food_query"]("Пельмени с говядиной"),
            foreign,8,collect,
        )
        self.assertEqual(calls,["пельмені"])
        self.assertEqual(len(expanded),4)
        ranked=self.rank("Пельмени с говядиной",expanded)
        self.assertEqual(ranked[0]["name"],"Пельмені з яловичиною")
        self.assertIn("Beef Dumplings",[x["name"] for x in ranked])

    def test_named_filling_favors_requested_meat_at_same_local_tier(self):
        options=[
            food("Пельмені зі свининою та яловичиною","Місцевий",True),
            food("Пельмені з яловичиною","Інший місцевий",True),
            food("Пельмені з куркою та яловичиною","Третій місцевий",True),
        ]
        self.assertEqual(
            self.rank("Пельмени с говядиной",options)[0]["name"],
            "Пельмені з яловичиною",
        )
        self.assertEqual(
            self.rank("Пельмені зі свининою та яловичиною",options)[0]["name"],
            "Пельмені зі свининою та яловичиною",
        )

    def test_real_1842_pelmeni_gyoza_screenshot(self):
        matches=[
            food('Пельмені "Traditional", гьодза з яловичиною',"McJUNAI",True),
            food("Пельмені Зі Свининою Та Яловичиною","Три Ведмеді",True),
            food("Пельмені «Фірмові» З Яловичиною Та Свининою","Levada",True),
            food("Beef Dumplings","Mama Vicky's Food",False),
        ]
        result=self.rank("Пельмени с говядиной",matches)
        self.assertEqual(result[0]["brand"],"Три Ведмеді")
        self.assertEqual(result[1]["brand"],"Levada")
        self.assertIn("McJUNAI",[item["brand"] for item in result])
        self.assertIn("Mama Vicky's Food",[item["brand"] for item in result])

    def test_dish_identity_not_brand_specific(self):
        options=[
            food("Пельмені з яловичиною","Brand One",True),
            food("Пельмені з яловичиною, гьодза","Brand Two",True),
            food("Гьодза з яловичиною","Brand Three",True),
        ]
        self.assertEqual(self.rank("Пельмені з яловичиною",options)[0]["brand"],"Brand One")
        self.assertEqual(self.rank("Гьодза з яловичиною",options)[0]["brand"],"Brand Three")
        self.assertEqual(self.rank("Пельмені гьодза з яловичиною",options)[0]["brand"],"Brand Two")

    def test_ukrainian_manufacture_vs_available_in_ukraine(self):
        local=food("Пельмені з яловичиною","Unknown local brand",True)
        local["manufacture_country"]="ua"
        listed=food("Пельмені з яловичиною","Unverified brand",True)
        foreign=food("Пельмені з яловичиною","Сільпо",True)
        foreign["manufacture_country"]="other"
        self.assertEqual(R["_food_local_tier"](local),0)
        self.assertEqual(R["_food_local_tier"](listed),1)
        self.assertEqual(R["_food_local_tier"](foreign),1)
        self.assertEqual(self.rank("Пельмені з яловичиною",[listed,foreign,local])[0]["brand"],"Unknown local brand")

    def test_manufacturing_place_evidence_is_conservative(self):
        infer=R["_food_manufacture_country"]
        self.assertEqual(infer({"manufacturing_places_tags":["en:ukraine"]}),"ua")
        self.assertEqual(infer({"manufacturing_places":"Київ, Україна"}),"ua")
        self.assertEqual(infer({"manufacturing_places_tags":["en:poland"]}),"other")
        self.assertEqual(infer({"countries_tags":["en:ukraine"]}),"unknown")
        self.assertEqual(infer({"manufacturing_places_tags":["en:ukraine","en:poland"]}),"unknown")
        self.assertEqual(infer({}),"unknown")

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
        self.assertTrue(all(R["_food_preparation_rank"](item)>=2 for item in ranked[3:]))

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
            ("Курка су-від з овочами",3),
            ("Рис з куркою",3),
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
            [2,2,3],
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
        self.assertEqual(
            [R["_food_preparation_rank"](item) for item in candidates],
            [2,3,2],
        )
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


    def test_chicken_screenshot_1743_plain_before_marinades_and_meals(self):
        candidates=[
            food("Chicken Thighs Pesto","Nasha Ryaba",True),
            food("Chicken Thighs Yoghurt Marinade","Nasha Ryaba",True),
            food("Курка Су-Від З Овочами Та Зеленню","Наша ряба",True),
            food("Chicken Wings In Cherry Marinade","Appetitna",True),
            food("Куряче філе мале «Міньйон»","Наша ряба",True),
            food("Chicken Breast","Epikur",True),
            food("Chicken Thighs","Epicur",True),
            food("Chicken Thighs, Skinless, Marinated","Nasha Ryaba",True),
        ]
        result=self.rank("Курица",candidates)
        self.assertEqual(
            [R["_food_preparation_rank"](r) for r in result],
            [0,0,0,2,2,2,2,3],
        )
        self.assertEqual(result[0]["name"],"Куряче філе мале «Міньйон»")

    def test_categories_can_refine_incomplete_names_without_brand_rules(self):
        plain=food("Chicken thighs","Other",True)
        prepared=food("Chicken thighs","Same",True)
        prepared["categories_tags"]=["en:prepared-meals","en:meats"]
        marinated=food("Chicken thighs","SameElse",True)
        marinated["categories_tags"]=["en:marinated-meat"]
        ranked=self.rank("Курица",[prepared,marinated,plain])
        self.assertEqual([R["_food_preparation_rank"](x) for x in ranked],[0,2,3])

    def test_generic_categories_do_not_make_basic_food_a_dish(self):
        item=food("Chicken breast","Other",True)
        item["categories_tags"]=["en:meats","en:poultry","en:chicken"]
        self.assertEqual(R["_food_preparation_rank"](item),0)

    def test_ordinary_milk_with_vitamins_and_fish_with_no_additions(self):
        for name in (
            "Молоко з вітаміном D3","Лосось філе свіже",
            "Сир кисломолочний", "Chicken Drumsticks Raw",
        ):
            self.assertEqual(R["_food_preparation_rank"](food(name,"UA",True)),0)
    def test_broad_ingredient_ranking_across_food_groups(self):
        # All groups use the same ranking algorithm, not per-product overrides.
        scenarios = (
            ("Курица", "Куряче філе", "Курка гриль", "Салат з куркою"),
            ("Картошка", "Картопля", "Картопля запечена", "Пюре з картоплі"),
            ("Рис", "Рис басматі", "Рис відварений", "Рис з овочами"),
            ("Лосось", "Лосось філе", "Лосось на парі", "Лосось з овочами"),
            ("Молоко", "Молоко", "Молоко пастеризоване", "Молоко з шоколадом"),
        )
        for query, basic, prepared, dish in scenarios:
            with self.subTest(query=query):
                candidates = [food(dish, "UA", True),
                              food(prepared, "UA", True),
                              food(basic, "UA", True)]
                ranked = self.rank(query, candidates)
                self.assertEqual(ranked[0]["name"], basic)
                self.assertIn(dish, [x["name"] for x in ranked])

    def test_explicit_prepared_food_query_not_hidden(self):
        candidates = [
            food("Картопля", "UA", True),
            food("Картопля запечена", "UA", True),
            food("Картопля з сиром", "UA", True),
        ]
        self.assertEqual(self.rank("Картопля з сиром", candidates)[0]["name"],
                         "Картопля з сиром")

    def test_broad_food_prefers_ordinary_products_to_secondary_parts(self):
        for query, basic, secondary in (
            ("chicken", "Chicken breast", "Chicken skin"),
            ("chicken", "Chicken thighs", "Chicken feet"),
            ("chicken", "Chicken breast", "Chicken, meatless"),
            ("pork", "Pork fillet", "Pork tail"),
            ("potato", "Potato", "Potato skins"),
        ):
            with self.subTest(query=query, secondary=secondary):
                ranked=self.rank(query,[food(secondary,"UA",True),
                                        food(basic,"Foreign",False)])
                self.assertEqual(ranked[0]["name"],basic)
                self.assertEqual(len(ranked),2)

    def test_specific_secondary_part_search_remains_accurate(self):
        ranked=self.rank("Chicken skin",[
            food("Chicken breast","UA",True),
            food("Chicken skin","Foreign",False),
        ])
        self.assertEqual(ranked[0]["name"],"Chicken skin")

    def test_language_preference_detection_has_safe_unknown_group(self):
        examples = (
            ("Куряче філе",0),
            ("Картопля з грибами",0),
            ("Молоко с витамином",2),
            ("Куриное филе",2),
            ("Курица",2),
            ("Молоко",1),
            ("Chicken breast",3),
            ("Milk",3),
        )
        for name,expected in examples:
            with self.subTest(name=name):
                self.assertEqual(R["_food_title_language_rank"]({"name":name}),expected)

    def test_language_tie_breaker_ukrainian_russian_english(self):
        candidates=[
            food("Milk with vitamin D3","Same",True),
            food("Молоко с витамином D3","Same",True),
            food("Молоко з вітаміном D3","Same",True),
        ]
        ranked=self.rank("Молоко",candidates)
        self.assertEqual([item["name"] for item in ranked],[
            "Молоко з вітаміном D3",
            "Молоко с витамином D3",
            "Milk with vitamin D3",
        ])

    def test_relevance_and_preparation_beat_language_preference(self):
        # English plain food must still beat a Ukrainian multi-ingredient dish.
        candidates=[
            food("Молоко з шоколадом","Local",True),
            food("Milk","Local",True),
        ]
        ranked=self.rank("Молоко",candidates)
        self.assertEqual(ranked[0]["name"],"Milk")
        # Explicit English names still remain accessible.
        self.assertEqual(self.rank("Milk",candidates)[0]["name"],"Milk")

    def test_stable_across_repeated_calls(self):
        once = [x["name"] for x in self.rank("Говядина")]
        twice = [x["name"] for x in self.rank("Говядина")]
        self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
