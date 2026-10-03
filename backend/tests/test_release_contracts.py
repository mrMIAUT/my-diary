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
                "nutrition": False,
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

    def test_frontend_respects_tariff_contract(self):
        self.assertIn("features.workouts?item('training'", CORE)
        self.assertIn("features.nutrition?item('nutrition'", CORE)
        self.assertIn("checkinEnabled=!!features.checkin", HOME)
        self.assertIn("nutritionEnabled=!!features.nutrition", HOME)
        self.assertIn("features?.meal_plan?", NUTRITION)

    def test_no_unfinished_program_template_placeholder(self):
        self.assertNotIn("Конструктор шаблонів програм додамо наступним етапом", TRAINER)
        self.assertNotIn("trainerProgramsTab", TRAINER)

    def test_index_shell_assets_exist_and_are_cached(self):
        urls = re.findall(r'(?:src|href)="(/(?:static/[^"]+|manifest\.webmanifest[^"]*))"', INDEX)
        shell_urls = [u for u in urls if u.endswith(".js") or ".js?" in u or u.endswith(".css") or ".css?" in u or "manifest.webmanifest" in u]
        self.assertTrue(shell_urls, "no app shell assets found in index.html")
        for url in shell_urls:
            path = url.split("?", 1)[0].lstrip("/")
            self.assertTrue((ROOT / "backend" / path).exists(), f"missing asset: {path}")
            self.assertIn(repr(url), SW, f"service worker cache is missing {url}")


if __name__ == "__main__":
    unittest.main()
