import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from food_reference_catalog import reference_food_items
from food_local_catalog import approved_reference_food_items
from food_manufacturer_catalog import manufacturer_label_food_items


class MainFoodIntegrationTests(unittest.TestCase):
    def test_reviewed_catalogue_loads_without_database(self):
        items = reference_food_items()
        self.assertGreaterEqual(len(items), 300)
        approved = approved_reference_food_items()
        manufacturers = manufacturer_label_food_items()
        self.assertGreaterEqual(len(approved), 260)
        self.assertGreaterEqual(len(manufacturers), 18)

    def test_new_branded_yogurts_and_flavoured_whey_have_exact_labels(self):
        from food_manufacturer_catalog import validate_label_record
        from json import loads
        manifest=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        new=[r for r in manifest["records"] if r["reviewed_on"]=="2026-10-14"]
        self.assertEqual(len(new),24)
        self.assertEqual(sum(r["brand"]=="BioTechUSA" for r in new),8)
        self.assertEqual(sum(r["brand"]=="Галичина" for r in new),16)
        items=manufacturer_label_food_items()
        self.assertGreaterEqual(len(items),42)
        index={x["source_id"]:x for x in items}
        for raw in new:
            with self.subTest(product=raw["id"]):
                result=validate_label_record(raw)
                self.assertEqual(result["brand"],raw["brand"])
                self.assertEqual(result["source_url"],raw["source_url"])
                self.assertEqual(result["food_type"],"branded")
                self.assertIn(result["source_id"],index)
                if raw["brand"]=="BioTechUSA":
                    self.assertLessEqual(result["saturated_fat_100"],result["fat_100"])
                    self.assertLessEqual(result["sugars_100"],result["carbs_100"])
                else:
                    self.assertNotIn("sugars_100",result)
                    self.assertNotIn("saturated_fat_100",result)
        natural=index["eplan12-manufacturer-biotechusa-100-pure-whey-natural"]
        self.assertEqual((natural["kcal_100"],natural["protein_100"]), (406,80))
        self.assertIn(natural,reference_food_items())

    def test_optional_manufacturer_nutrients_fail_closed(self):
        from food_manufacturer_catalog import validate_label_record
        from json import loads
        manifest=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        natural=next(r for r in manifest["records"] if r["id"]=="biotechusa-100-pure-whey-natural")
        for key,value in (("sugars_100",101),("saturated_fat_100",7),
                          ("sugars_100",-1),("sugars_100","8")):
            with self.subTest(nutrient=key,value=value),self.assertRaises(ValueError):
                validate_label_record({**natural,key:value})

    def test_nutrition_and_sources_are_bounded(self):
        for row in reference_food_items():
            with self.subTest(name=row["name"]):
                self.assertTrue(row["name"].strip())
                self.assertIn("source", row)
                self.assertIn("preparation_state", row)
                for key in ("kcal_100", "protein_100", "fat_100", "carbs_100"):
                    self.assertGreaterEqual(row[key], 0)
                    self.assertLessEqual(row[key], 905)

    def test_authenticated_food_endpoints_and_navigation(self):
        app = (BACKEND / "app.py").read_text(encoding="utf-8")
        nutrition = (BACKEND / "static/js/nutrition-redesign.js").read_text(encoding="utf-8")
        index = (BACKEND / "static/index.html").read_text(encoding="utf-8")
        shell = (BACKEND / "static/sw.js").read_text(encoding="utf-8")
        for endpoint in ("search", "preview", "local-catalog", "preparation", "chicken-preparation"):
            self.assertIn('@app.get("/api/foods/' + endpoint + '",dependencies=[Depends(require_food_search_access)])', app)
        self.assertIn('require_active_client(user.client_id,"nutrition")', app)
        self.assertIn('RATE_LIMITS["food.search"]=(30,60)', app)
        self.assertIn("window.openFoodSearchLazy = async function(meal='')", nutrition)
        self.assertIn("window.openFoodSearchModal", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertNotIn("window.calculateNutritionTargets = function()", nutrition)
        trainer_nutrition = (BACKEND / "static/js/nutrition.js").read_text(encoding="utf-8")
        self.assertIn("window.calculateTrainerNutritionTargets = function()", trainer_nutrition)
        self.assertIn("window.pendingTrainerNutritionTargets={kcal,protein,fat,carbs}", trainer_nutrition)
        self.assertNotIn('src="/static/js/food-lookup.js', index)
        self.assertIn("/static/js/food-lookup.js?v=7", nutrition)
        self.assertIn("lookupLocal(", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertIn("/foods/preview", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertNotIn("/static/js/food-lookup.js", shell)
        self.assertIn("nutrition-redesign.js?v=316", index)
        self.assertIn("nutrition-redesign.js?v=316", shell)


if __name__ == "__main__":
    unittest.main()
