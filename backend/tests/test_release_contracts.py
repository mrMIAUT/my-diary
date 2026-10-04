import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = (ROOT / "backend" / "app.py").read_text(encoding="utf-8")
CORE = (ROOT / "backend" / "static" / "js" / "core.js").read_text(encoding="utf-8")
TRAINER = (ROOT / "backend" / "static" / "js" / "trainer.js").read_text(encoding="utf-8")
HOME = (ROOT / "backend" / "static" / "js" / "home-redesign.js").read_text(encoding="utf-8")
NUTRITION = (ROOT / "backend" / "static" / "js" / "nutrition-redesign.js").read_text(encoding="utf-8")
MORE = (ROOT / "backend" / "static" / "js" / "more-redesign.js").read_text(encoding="utf-8")
LIBRARY = (ROOT / "backend" / "static" / "js" / "library.js").read_text(encoding="utf-8")
INDEX = (ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
SW = (ROOT / "backend" / "static" / "sw.js").read_text(encoding="utf-8")


def literal_assignment(source: str, name: str):
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return ast.literal_eval(node.value)
    raise AssertionError(f"{name} assignment not found")


class ReleaseContracts(unittest.TestCase):
    def test_api_routes_are_unique(self):
        routes = re.findall(
            r'@app\.(get|post|put|patch|delete|api_route)\("([^"]+)"',
            APP,
        )
        duplicates = sorted({route for route in routes if routes.count(route) > 1})
        self.assertEqual(duplicates, [], f"duplicate API routes: {duplicates}")

    def test_tariff_matrix(self):
        plans = literal_assignment(APP, "PLAN_FEATURES")
        self.assertEqual(
            plans["coaching"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": True,
                "meal_plan": True,
                "checkin": True,
            },
        )
        self.assertEqual(
            plans["workout_plan"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": False,
                "meal_plan": False,
                "checkin": False,
            },
        )
        self.assertEqual(
            plans["workout_nutrition"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": False,
                "meal_plan": True,
                "checkin": False,
            },
        )
        self.assertEqual(
            plans["self"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": False,
                "meal_plan": False,
                "checkin": False,
            },
        )
        self.assertTrue(all(value is False for value in plans["free"].values()))

    def test_coaching_only_mutations_are_server_gated(self):
        self.assertIn("require_active_client(cid,'checkin')", APP)
        self.assertIn("require_active_client(s[\"client_id\"],'trainer_review')", APP)
        self.assertIn("require_active_client(x.client_id,'trainer_review')", APP)
        self.assertIn("require_active_client(rec[\"client_id\"],'nutrition')", APP)
        self.assertIn("require_active_client(cid,'meal_plan')", APP)

    def test_access_downgrade_preserves_manual_status_and_closes_live_workout(self):
        block = APP.split('@app.patch("/api/clients/{cid}/access")', 1)[1].split('return {"ok":True,"access":access}', 1)[0]
        self.assertNotIn("status=CASE WHEN", block)
        self.assertNotIn("status='Активний'", block)
        self.assertIn("FOR UPDATE", block)
        self.assertIn('if not access["features"].get("workouts",False):', block)
        self.assertIn("status='training'", block)

    def test_review_side_effects_are_coaching_only(self):
        self.assertIn("require_active_client(rec[\"client_id\"],'trainer_review')", APP)
        self.assertIn('if access["features"].get("trainer_review",False):', APP)
        self.assertIn('kind in {"workout_finished","cardio","comment"}', APP)

    def test_frontend_respects_tariff_contract(self):
        self.assertIn("features.workouts?item('training'", CORE)
        self.assertIn("item('nutrition','Харчування','food'", CORE)
        self.assertNotIn("features.nutrition?item('nutrition'", CORE)
        self.assertIn("Персональний план харчування", NUTRITION)
        self.assertIn("Переглянути тренерів", NUTRITION)
        self.assertIn("checkinEnabled=!!features.checkin", HOME)
        self.assertIn("nutritionEnabled=!!features.nutrition", HOME)
        self.assertIn("features?.meal_plan", NUTRITION)
        self.assertIn("openNutritionTargetsModal", NUTRITION)
        self.assertIn("ЄПЛАН Самостійно", TRAINER)
        self.assertIn("redesignHomeTrainersHTML", HOME)
        self.assertIn("api('/trainers')", HOME)
        measurements = (ROOT / "backend" / "static" / "js" / "measurements.js").read_text(encoding="utf-8")
        trainer = (ROOT / "backend" / "static" / "js" / "trainer.js").read_text(encoding="utf-8")
        self.assertIn("hasFeature('measurements'", measurements)
        self.assertIn("isoAddMonthsFrom", trainer)
        self.assertIn("trainerAccessIsActive", trainer)

    def test_trainer_profile_upsert_uses_trainer_id_safe_transaction(self):
        block = APP.split('@app.patch("/api/trainer/profile")', 1)[1].split('@app.post("/api/trainer/profile/avatar")', 1)[0]
        self.assertIn("with con() as db:", block)
        self.assertIn("ON CONFLICT(trainer_id)", block)
        self.assertNotIn('run("""INSERT INTO trainer_profiles', block)
        self.assertNotIn("RETURNING id", block)

    def test_trainer_marketplace_foundation(self):
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_profiles", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_requests", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_client_history", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_reviews", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS program_templates", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS program_template_items", APP)
        self.assertIn('@app.get("/api/trainers")', APP)
        self.assertIn('@app.get("/api/trainer/profile")', APP)
        self.assertIn('@app.post("/api/trainer/profile/avatar")', APP)
        self.assertIn('@app.put("/api/trainers/{trainer_id}/review")', APP)
        self.assertIn('@app.post("/api/trainers/{trainer_id}/request")', APP)
        self.assertIn('@app.get("/api/trainer/program-templates")', APP)
        self.assertIn('@app.post("/api/trainer/program-templates/{template_id}/apply")', APP)
        self.assertIn('"trainer_id"', APP)
        self.assertIn("active_clients", APP)
        self.assertIn("rating_avg", APP)
        self.assertIn('@app.patch("/api/client/{cid}/nutrition-targets")', APP)
        self.assertIn('if access["features"].get("meal_plan",False):', APP)
        self.assertIn("showClientTrainers", MORE)
        self.assertIn("showClientTrainerProfile", MORE)
        self.assertIn("openTrainerReviewModal", MORE)
        self.assertIn("showTrainerPublicProfileEditor", TRAINER)
        self.assertIn("showTrainerCoachRequests", TRAINER)
        self.assertIn("openCreateProgramTemplateModal", TRAINER)
        self.assertIn("applyProgramTemplate", TRAINER)
        self.assertIn("openTrainerAvatarCropper", TRAINER)
        self.assertIn("saveTrainerAvatarCrop", TRAINER)
        self.assertIn("canvas.toBlob", TRAINER)
        self.assertIn("canvas.width=512", TRAINER)
        self.assertNotIn("file.size>10*1024*1024", TRAINER)

    def test_exercise_library_has_platform_and_trainer_scopes(self):
        self.assertIn("owner_trainer_id", APP)
        self.assertIn("visibility", APP)
        self.assertIn("ux_exercise_library_platform_name", APP)
        self.assertIn("ux_exercise_library_trainer_name", APP)
        self.assertIn('exercise["scope"]="platform"', APP)
        self.assertIn("Моя вправа", LIBRARY)
        self.assertIn("Усі бібліотеки", LIBRARY)
        self.assertIn("Мої вправи", LIBRARY)


    def test_no_unfinished_program_template_placeholder(self):
        self.assertNotIn("Конструктор шаблонів програм додамо наступним етапом", TRAINER)
        self.assertNotIn("trainerProgramsTab", TRAINER)

    def test_index_shell_assets_exist_and_are_cached(self):
        urls = re.findall(r'(?:src|href)="(/(?:static/[^"]+|manifest\.webmanifest[^"]*))"', INDEX)
        shell_urls = [u for u in urls if u.endswith(".js") or ".js?" in u or u.endswith(".css") or ".css?" in u or "manifest.webmanifest" in u]
        self.assertTrue(shell_urls, "no app shell assets found in index.html")
        for url in shell_urls:
            path = url.split("?", 1)[0].lstrip("/")
            disk_path = ROOT / "backend" / ("static/manifest.webmanifest" if path == "manifest.webmanifest" else path)
            self.assertTrue(disk_path.exists(), f"missing asset: {path}")
            self.assertIn(repr(url), SW, f"service worker cache is missing {url}")


if __name__ == "__main__":
    unittest.main()
