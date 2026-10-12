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
        self.assertIn("/static/js/food-lookup.js?v=4", nutrition)
        self.assertIn("lookupLocal(", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertIn("/foods/preview", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertNotIn("/static/js/food-lookup.js", shell)
        self.assertIn("nutrition-redesign.js?v=313", index)
        self.assertIn("nutrition-redesign.js?v=313", shell)


if __name__ == "__main__":
    unittest.main()
