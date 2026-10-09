"""Regression contracts: body-weight sets may track reps without invented RIR."""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = (ROOT / "backend" / "app.py").read_text(encoding="utf-8")
WORKOUT = (ROOT / "backend" / "static/js/workout.js").read_text(encoding="utf-8")
LYFTA = (ROOT / "backend" / "static/js/workout-lyfta.js").read_text(encoding="utf-8")
PROGRESS = (ROOT / "backend" / "static/js/progress-redesign.js").read_text(encoding="utf-8")


class OptionalWorkoutSetContracts(unittest.TestCase):
    def test_server_accepts_null_rir_on_all_workout_set_paths(self):
        tree = ast.parse(APP)
        models = ("SetIn", "CompletedWorkoutSetIn", "HistoricalSetIn")
        for name in models:
            with self.subTest(name=name):
                node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == name)
                field = next(n for n in node.body if isinstance(n, ast.AnnAssign)
                             and isinstance(n.target, ast.Name) and n.target.id == "rir")
                self.assertEqual(ast.unparse(field.annotation), "int | None")
                self.assertIn("default=None", ast.unparse(field.value))

    def test_only_reps_required_to_mark_or_save_working_set(self):
        self.assertIn("if(!r?.value||!(+r.value>0))", LYFTA)
        self.assertIn("if(!reps)return alert", WORKOUT)
        self.assertIn("weight:weight===''?0:+weight", WORKOUT)
        self.assertIn("rir:rir===''?null:+rir", WORKOUT)
        self.assertIn("weight:weight===''?0:+weight", PROGRESS)
        self.assertIn("rir:rir===''?null:+rir", PROGRESS)
        self.assertNotIn("if(!w?.value||!r?.value||!i?.value)", LYFTA)

    def test_untracked_rir_is_not_mislabeled_as_zero(self):
        self.assertIn("set?.rir===undefined||set?.rir===null||set?.rir===''", WORKOUT)
        self.assertIn("p.rir===null||p.rir===undefined||p.rir===''", LYFTA)
        self.assertIn("workoutRecordedSetText(set,set.repeat_mode)", PROGRESS)
        self.assertIn("workoutRecordedMetaText(set)", PROGRESS)


if __name__ == "__main__":
    unittest.main()
