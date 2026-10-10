"""Trainer client-action sheet must stay fully visible above the fixed mobile nav."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
TRAINER=(ROOT/"backend/static/js/trainer.js").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class ClientActionsLayerRegression(unittest.TestCase):
    def test_sheet_renders_above_nav_and_reserves_safe_bottom(self):
        css=CSS.split("/* v250 — trainer client action sheet",1)[1]
        sheet=css.split(".trainer-client-actions-layer{",1)[1].split("}",1)[0]
        self.assertIn("z-index:12060!important",sheet)
        self.assertIn("118px + env(safe-area-inset-bottom",sheet)
        # Navigation cannot cover the actions when the sheet is open.
        nav=CSS.split("/* Trainer bottom navigation scroll stability — iOS */",1)[1]
        nav=nav.split(".trainer-bottom-nav{",1)[1].split("}",1)[0]
        self.assertIn("z-index:950!important",nav)
        self.assertGreater(12060,950)

    def test_sheet_can_scroll_on_short_iphone_screen(self):
        css=CSS.split("/* v250 — trainer client action sheet",1)[1]
        card=css.split(".trainer-client-actions-layer>.trainer-client-actions-pop{",1)[1].split("}",1)[0]
        self.assertIn("max-height:calc(100dvh",card)
        self.assertIn("overflow-y:auto!important",card)
        self.assertIn("@media(max-height:530px)",css)

    def test_freeze_delete_and_backdrop_close_preserved(self):
        self.assertIn('id="trainerClientActionsLayer"',TRAINER)
        self.assertIn('onclick="closeTrainerClientActions()"',TRAINER)
        self.assertIn('onclick="event.stopPropagation()"',TRAINER)
        self.assertIn("Видалити клієнта",TRAINER)
        self.assertIn("Заморозити клієнта",TRAINER)
        self.assertIn("async function deleteClientAccount(cid)",TRAINER)
        self.assertIn("if(!confirm('Видалити клієнта?",TRAINER)

    def test_versioned_asset(self):
        for shell in (INDEX,SW):
            self.assertIn("/static/css/redesign.css?v=251",shell)
        self.assertIn("const VERSION='eplan-v208'",SW)


if __name__=="__main__":
    unittest.main()
