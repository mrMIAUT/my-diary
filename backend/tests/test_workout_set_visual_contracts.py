"""Regression checks for iPhone workout set styling and PWA updates."""
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]/"backend"/"static"
CSS=(ROOT/"css"/"redesign.css").read_text(encoding="utf-8")
HTML=(ROOT/"index.html").read_text(encoding="utf-8")
SW=(ROOT/"sw.js").read_text(encoding="utf-8")


class WorkoutSetVisualContracts(unittest.TestCase):
    def test_pwa_uses_updated_workout_css(self):
        for source in (HTML,SW):
            self.assertIn("/static/css/redesign.css?v=245",source)
            self.assertNotIn("/static/css/redesign.css?v=244",source)
        self.assertIn("const VERSION='eplan-v201'",SW)

    def test_completed_set_surface_has_uniform_fill(self):
        rules=CSS.split("/* v245 — client workout set:",1)[1]
        for selector in (
            ".lyfta-set-wrap.is-complete{",
            ".lyfta-set-wrap.is-complete .lyfta-set-swipe-content{",
            ".lyfta-set-wrap.is-complete .lyfta-set-row input{",
            ".lyfta-set-wrap.is-complete .lyfta-drop-zone{",
        ):
            part=rules.split(selector,1)[1].split("}",1)[0]
            self.assertIn("background:#f1faf4!important",part)

    def test_focus_ring_is_internal_and_swipe_is_kept(self):
        rules=CSS.split("/* v245 — client workout set:",1)[1]
        self.assertIn("padding:3px 7px 9px",rules)
        self.assertIn("padding:3px 2px 0",rules)
        self.assertIn("outline:0!important",rules)
        self.assertIn("box-shadow:inset 0 0 0 1.5px",rules)
        self.assertIn(".lyfta-set-swipe.open .lyfta-set-swipe-content",CSS)
        self.assertIn("transform:translateX(-92px)",CSS)
        self.assertRegex(CSS,r"\.lyfta-set-swipe\s*\{[^}]*overflow:hidden;")


if __name__=="__main__":
    unittest.main()
