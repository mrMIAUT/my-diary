"""Regression: selected load phase is visibly checked, not just outlined on iPhone."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
WORKOUT=(ROOT/"backend/static/js/workout.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class WorkoutPhaseCheckmarkVisualTests(unittest.TestCase):
    def test_radio_has_a_visible_checked_sibling(self):
        self.assertIn('type="radio" name="workoutLoadPhase"',WORKOUT)
        self.assertIn('onchange="selectWorkoutLoadPhase(this)"',WORKOUT)
        self.assertIn('<span class="workout-phase-check" aria-hidden="true">✓</span>',WORKOUT)
        # The checkmark directly follows the actual radio so CSS :checked is
        # bound to the authoritative state rather than a stale JS-only class.
        self.assertRegex(WORKOUT,re.compile(
            r'name="workoutLoadPhase"[^>]*><span class="workout-phase-check"'))
        self.assertIn('input[name="workoutLoadPhase"]:checked',WORKOUT)
        self.assertIn("root.querySelectorAll('.workout-phase-option')",WORKOUT)

    def test_selected_circle_is_blue_with_white_check_and_focus(self):
        part=CSS.split("/* v252 — iPhone:",1)[1]
        self.assertIn('input[type="radio"]:checked + .workout-phase-check{',part)
        selected=part.split('input[type="radio"]:checked + .workout-phase-check{',1)[1].split("}",1)[0]
        for rule in ("background:#1677ff","border-color:#1677ff","color:#fff"):
            self.assertIn(rule,selected)
        normal=part.split(" .workout-phase-check{",1)[1].split("}",1)[0]
        self.assertIn("border-radius:50%",normal)
        self.assertIn("color:transparent",normal)
        self.assertIn('input[type="radio"]:focus-visible + .workout-phase-check',part)
        self.assertIn("opacity:0!important",part)
        self.assertIn("pointer-events:none!important",part)

    def test_cache_bumped_without_touching_workout_api(self):
        for source in (INDEX,SW):
            self.assertIn("/static/js/workout.js?v=183",source)
            self.assertIn("/static/css/redesign.css?v=252",source)
        self.assertIn("const VERSION='eplan-v209'",SW)
        self.assertIn("day_name:day,load_phase:loadPhase",WORKOUT)


if __name__=="__main__":
    unittest.main()
