"""Deterministic preview regression, source provenance and no unsafe silent matches."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from meal_plan_generator import generate_meal_plan, approved_plan_catalog, FOODS

class AutomaticMealPlanTests(unittest.TestCase):
    def test_all_curated_foods_are_source_reviewed_and_preparation_specific(self):
        records=approved_plan_catalog()
        self.assertEqual(set(records),set(FOODS))
        for key,item in records.items():
            self.assertEqual(item['review_status'],'approved',key)
            self.assertFalse(item['approximate'],key)
            self.assertTrue(item.get('source_fdc_id'),key)
            self.assertIn(item['preparation_state'],{'raw','dry','cooked','as_sold'},key)

    def test_daily_totals_count_only_primary_variants_and_include_source_foods(self):
        result=generate_meal_plan(2380,160,60,300,meals=4,variants=2)
        self.assertEqual(len(result['meals']),8)
        self.assertTrue(result['within_tolerance'],str(result['deviations_pct']))
        self.assertEqual({x['meal_number'] for x in result['meals']},{1,2,3,4})
        self.assertTrue(result['review_required'])
        for meal in result['meals']:
            self.assertTrue(meal['foods'])
            self.assertTrue(meal['content'])
            self.assertLessEqual(len(meal['content']),5000)
            for product in meal['foods']:
                self.assertGreater(product['grams'],0)
                self.assertTrue(product['source_id'].startswith('eplan12-fdc-'))
                self.assertIn(product['name'],meal['content'])
        for nutrient in ('kcal','protein','fat','carbs'):
            expected=sum(x['totals'][nutrient] for x in result['meals'] if x['variant_number']==1)
            self.assertAlmostEqual(expected,result['totals'][nutrient],places=1)
        self.assertEqual(result['targets'],{'kcal':2380.0,'protein':160.0,'fat':60.0,'carbs':300.0})

    def test_three_and_five_meal_variants_are_bounded(self):
        for count in (3,5):
            r=generate_meal_plan(2380,160,60,300,meals=count,variants=1)
            self.assertEqual(len(r['meals']),count)
            self.assertTrue(all(1<=x['meal_number']<=count for x in r['meals']))

    def test_exclusions_filter_templates_without_allergy_safety_claim(self):
        r=generate_meal_plan(2380,160,60,300,meals=4,variants=1,excluded=['dairy'])
        self.assertNotIn('Йогурт',"\n".join(x['content'] for x in r['meals']))
        self.assertTrue(any('не гарантує' in x for x in r['warnings']))

    def test_incompatible_exclusions_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'бракує'):
            generate_meal_plan(2380,160,60,300,meals=4,variants=2,excluded=['fish','nuts'])

    def test_invalid_targets_and_restricted_inputs_fail(self):
        for kwargs in (
            {'kcal':900,'protein':160,'fat':60,'carbs':300},
            {'kcal':3500,'protein':160,'fat':60,'carbs':300},
            {'kcal':2380,'protein':160,'fat':60,'carbs':300,'meals':6},
            {'kcal':2380,'protein':160,'fat':60,'carbs':300,'excluded':['unknown']},
        ):
            with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):
                generate_meal_plan(**kwargs)

if __name__=='__main__':
    unittest.main()
