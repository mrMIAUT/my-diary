"""iPhone rest timer: compact +30 button, proper gear and SVG stopwatch."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
TIMER=(ROOT/"backend/static/js/timer.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class RestTimerCompactControlsTests(unittest.TestCase):
    def test_horizontal_plus_30_in_all_phone_widths(self):
        c=CSS.split("/* v257 — final rest controls:",1)[1]
        self.assertIn(".workout-featured-rest-actions>.workout-featured-rest-add{",c)
        for rule in (
            "display:flex!important",
            "flex-direction:row!important",
            "flex-wrap:nowrap!important",
            "white-space:nowrap!important",
        ):
            self.assertIn(rule,c)
        self.assertIn(".workout-featured-rest-actions>.workout-featured-rest-add>span{",c)
        self.assertIn("font-size:11px!important",c)
        self.assertIn("@media(max-width:350px)",c)

    def test_app_cache_references_match(self):
        for source in (INDEX,SW):
            self.assertIn("/static/css/redesign.css?v=263",source)
            self.assertIn("/static/js/timer.js?v=169",source)
        self.assertIn("const VERSION='eplan-v224'",SW)

    def test_clean_single_face_dial(self):
        c=CSS.split("/* v258 — single-face rest dial:",1)[1]
        self.assertIn("stroke-width:5!important",c)
        self.assertIn(".workout-featured-rest-ring>span svg{",c)
        self.assertIn("display:none!important",c)
        self.assertIn(".workout-featured-rest-ring>span::before",c)
        self.assertIn(".workout-featured-rest-ring>span::after",c)
        self.assertIn("background:transparent!important",c)
        self.assertIn("transform:rotate(120deg)",c)

    @unittest.skipUnless(shutil.which("node"),"Node.js required")
    def test_real_svg_icons_and_unchanged_timer_controls(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('backend/static/js/timer.js','utf8');
const ctx={console,Math,window:{},setTimeout:()=>0};
vm.createContext(ctx);vm.runInContext(src,ctx);
const gear=ctx.featuredRestTimerIcon('settings');
const watch=ctx.featuredRestTimerIcon('stopwatch');
assert(gear.includes('<circle cx="12" cy="12" r="3"'));
assert(gear.includes('L22 10v4')); // visible toothed rim, not sunburst
assert(watch.includes('M9 2h6'));
assert(watch.includes('V14l3 2'));
assert(watch.includes('<circle cx="12" cy="14"'));
assert(watch.includes('stroke="currentColor"'));
const section=ctx.featuredRestTimerHTML(25,3,false);
assert(section.includes('featured')||section.includes('workout-featured-rest'));
assert(section.includes(gear));
assert(section.includes(watch));
assert(section.includes('onclick="extendFeaturedRestTimer(30)"'));
assert(section.includes('<span>+30 сек</span>'));
assert(section.includes('onclick="cancelRestTimer()"'));
assert(section.includes('onclick="toggleRestTimerPlayback()"'));
console.log('SVG stopwatch and gear, +30 horizontal label, rest controls PASS');
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
