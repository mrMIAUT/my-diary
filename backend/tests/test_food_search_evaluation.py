"""Offline search evaluation matrix: 144 representative search scenarios.

Tests do NOT make external API calls or claim to validate the entire Open Food
Facts catalogue. They exercise shared ranking across product families and
specific-query intent, preventing hand-patched brand/SKU ordering.
"""
import unittest
from test_food_search_ranking import R, food


# Russian everyday query, Ukrainian source name, cooked, processed, mixed dish.
COOKABLE_FOODS = (
    ("Курица", "Курка", "Курка гриль", "Курка маринована", "Курка з овочами"),
    ("Говядина", "Яловичина", "Яловичина гриль", "Яловичина маринована", "Яловичина з овочами"),
    ("Индейка", "Індичка", "Індичка гриль", "Індичка маринована", "Індичка з овочами"),
    ("Утка", "Качка", "Качка запечена", "Качка маринована", "Качка з овочами"),
    ("Лосось", "Лосось", "Лосось гриль", "Лосось маринований", "Лосось з овочами"),
    ("Тунец", "Тунець", "Тунець гриль", "Тунець маринований", "Тунець з овочами"),
    ("Картошка", "Картопля", "Картопля варена", "Картопля зі спеціями", "Картопля з грибами"),
    ("Рис", "Рис", "Рис відварений", "Рис зі спеціями", "Рис з овочами"),
    ("Макароны", "Макарони", "Макарони варені", "Макарони зі спеціями", "Макарони з овочами"),
    ("Гречка", "Гречка", "Гречка варена", "Гречка зі спеціями", "Гречка з овочами"),
    ("Морковь", "Морква", "Морква запечена", "Морква зі спеціями", "Морква з грибами"),
    ("Свекла", "Буряк", "Буряк варений", "Буряк зі спеціями", "Буряк з квасолею"),
)

# Other common foods: direct entries vs packaged/flavoured variants.
SIMPLE_FOODS = (
    ("Молоко", "Молоко", "Молоко з шоколадом"),
    ("Сыр", "Сир", "Сир з грибами"),
    ("Кефир", "Кефір", "Кефір з полуницею"),
    ("Яйца", "Яйця", "Яйця з грибами"),
    ("Йогурт", "Йогурт", "Йогурт з шоколадом"),
    ("Банан", "Банан", "Банан з шоколадом"),
    ("Яблоко", "Яблуко", "Яблуко з шоколадом"),
    ("Овсянка", "Вівсяні пластівці", "Вівсяні пластівці з шоколадом"),
    ("Арахис", "Арахіс", "Арахіс з шоколадом"),
    ("Огурец", "Огірок", "Огірок з сиром"),
    ("Помидор", "Помідор", "Помідор з сиром"),
    ("Чеснок", "Часник", "Часник з сиром"),
)


def rank(query, items):
    return R["_food_rank"](R["normalize_food_query"](query), items)


class FoodSearchEvaluation(unittest.TestCase):
    def test_96_cookable_family_scenarios(self):
        checks = 0
        for ru, plain, cooked, processed, dish in COOKABLE_FOODS:
            # One identical candidate pool per family; no catalog-specific
            # fixture ids are hardcoded into search implementation.
            items = [
                food(dish, "Сільпо", True),
                food(processed, "Сільпо", True),
                food(cooked, "Сільпо", True),
                food(plain, "Сільпо", True),
                food("Ноутбук і навушники", "Сільпо", True),
            ]
            expectation = [plain, cooked, processed, dish]
            for label, query, expected in (
                ("russian broad", ru, expectation),
                ("ukrainian broad", plain, expectation),
                ("cooked specific", cooked, [cooked]),
                ("processed specific", processed, [processed]),
                ("dish specific", dish, [dish]),
            ):
                with self.subTest(family=plain, case=label):
                    result = rank(query, items)
                    if len(expected) == 1:
                        self.assertEqual(result[0]["name"], expected[0])
                    else:
                        self.assertEqual([x["name"] for x in result], expected)
                    checks += 1
            # Relevance and preparation outweigh locality, but country still
            # differentiates otherwise equivalent products.
            foreign_plain=food(plain, "Foreign Brand", False)
            local_plain=food(plain, "Сільпо", True)
            for label, query, entries, expected_first in (
                ("local within equal matches",ru,[foreign_plain,local_plain],"Сільпо"),
                ("plain foreign above local dish",ru,[food(dish,"Сільпо",True),foreign_plain],"Foreign Brand"),
                ("off-topic excluded",ru,items,plain),
            ):
                with self.subTest(family=plain,case=label):
                    result=rank(query,entries)
                    self.assertEqual(result[0]["brand"] if label!="off-topic excluded" else result[0]["name"],expected_first)
                    if label=="off-topic excluded":
                        self.assertNotIn("Ноутбук і навушники",[x["name"] for x in result])
                    checks+=1
        self.assertEqual(checks,96)

    def test_48_everyday_family_scenarios(self):
        checks=0
        for ru, plain, with_additions in SIMPLE_FOODS:
            base=food(plain,"Сільпо",True)
            extra=food(with_additions,"Сільпо",True)
            cases=(
                ("russian",ru,[extra,base],plain),
                ("ukrainian",plain,[extra,base],plain),
                ("specific",with_additions,[base,extra],with_additions),
                ("equal-name country preference",ru,[food(plain,"Imported",False),base],plain),
            )
            for label,query,items,expected in cases:
                with self.subTest(family=plain,case=label):
                    result=rank(query,items)
                    self.assertEqual(result[0]["name"],expected)
                    if label=="equal-name country preference":
                        self.assertEqual(result[0]["brand"],"Сільпо")
                    checks+=1
        self.assertEqual(checks,48)


if __name__ == "__main__":
    unittest.main()
