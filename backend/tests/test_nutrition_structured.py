"""Structured EPLAN meal planner: trustworthy source nutrition and safe eggs/veg."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from nutrition_structured import (food_map, foods_for_trainer, validate_structured_foods,
   structured_meal_summary, serialize_structured_foods, EGG_EDIBLE_GRAMS,
   FREE_VEGETABLE_NAMES, EGG_NAMES)
from meal_plan_generator import generate_meal_plan

class NutritionStructuredTests(unittest.TestCase):
 def _find(self,name):
    return next(x for x in foods_for_trainer() if x["name"]==name)

 def test_approved_catalog_and_one_egg_is_whole_piece(self):
    egg=self._find("Яйце куряче (варене круто)")
    self.assertEqual(egg["unit"],"pcs")
    self.assertEqual(egg["grams_per_piece"],50)
    self.assertTrue(egg["source_id"] in food_map())
    rows=validate_structured_foods([{"source_id":egg["source_id"],"count":2,
                                     "grams":37,"count_in_targets":True}])
    self.assertEqual(rows[0]["grams"],2*EGG_EDIBLE_GRAMS)
    self.assertEqual(rows[0]["count"],2)
    s=structured_meal_summary(rows)
    self.assertIn("2 шт.",s["content"])
    self.assertAlmostEqual(s["tracked"]["protein"],12.6,delta=1)
    for invalid in (0,2.5,-1,9,None):
      with self.subTest(invalid=invalid),self.assertRaises(ValueError):
        validate_structured_foods([{"source_id":egg["source_id"],"count":invalid}])

 def test_vegetable_separate_goal_and_actual_energy(self):
    tomato=self._find("Помідор (сирий)")
    row={"source_id":tomato["source_id"],"grams":200,"count_in_targets":False}
    clean=validate_structured_foods([row])
    s=structured_meal_summary(clean)
    self.assertEqual(s["tracked"]["kcal"],0)
    self.assertGreater(s["actual"]["kcal"],0)
    self.assertIn("овочі поза цільовими",s["content"])
    s2=structured_meal_summary(validate_structured_foods([
        {**row,"count_in_targets":True}]))
    self.assertEqual(s2["actual"],s2["tracked"])

 def test_starchy_and_nonvegetable_cannot_be_silently_ignored(self):
    potato=self._find("Картопля (відварена без шкірки)")
    chicken=self._find("Куряче філе (запечене)")
    for item in (potato,chicken):
      with self.subTest(name=item["name"]),self.assertRaises(ValueError):
        validate_structured_foods([{"source_id":item["source_id"],"grams":150,
                                     "count_in_targets":False}])
    self.assertNotIn("Картопля (відварена без шкірки)",FREE_VEGETABLE_NAMES)

 def test_invalid_source_quantity_and_oversize_rejected(self):
    rice=self._find("Рис білий (відварений)")
    for invalid in (float('nan'),float('inf'),-50,0,2001,"200"):
      with self.subTest(invalid=str(invalid)),self.assertRaises(ValueError):
        validate_structured_foods([{"source_id":rice["source_id"],"grams":invalid}])
    with self.assertRaises(ValueError):
      validate_structured_foods([{"source_id":"unknown-fake", "grams":100}])
    with self.assertRaises(ValueError):
      validate_structured_foods([{"source_id":rice["source_id"],"grams":100}]*31)

 def test_all_generated_eggs_are_whole_and_nonstrarchy_veg_flagged(self):
    result=generate_meal_plan(2380,160,60,300,meals=4,variants=2)
    for meal in result["meals"]:
      foods=meal["foods"]
      self.assertTrue(foods)
      clean=validate_structured_foods(foods)
      server=structured_meal_summary(clean)
      self.assertEqual(len(clean),len(foods))
      for food in foods:
        if food["name"] in EGG_NAMES:
          self.assertEqual(food["grams"]%50,0)
          self.assertEqual(food["count"],food["grams"]//50)
        if food["name"] in FREE_VEGETABLE_NAMES:
          self.assertFalse(food["count_in_targets"])
      self.assertAlmostEqual(server["tracked"]["kcal"],meal["totals"]["kcal"],delta=0.2)

if __name__=="__main__":
 unittest.main()
