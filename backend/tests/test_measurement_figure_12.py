"""ЄПЛАН 1.2 заміри: silhouette/source and existing flow regression checks."""
from pathlib import Path
import shutil
import subprocess
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "backend" / "static"
MEASURES = (STATIC / "js/measurements.js").read_text(encoding="utf-8")
HTML = (STATIC / "index.html").read_text(encoding="utf-8")
CSS = (STATIC / "css/redesign.css").read_text(encoding="utf-8")
SW = (STATIC / "sw.js").read_text(encoding="utf-8")


class MeasurementFigureContracts(unittest.TestCase):
    def test_both_figures_are_valid_svg_with_front_and_back(self):
        for sex in ("male", "female"):
            path = STATIC / f"img/measurements/figure-{sex}.svg"
            root = ET.parse(path).getroot()
            self.assertTrue(root.tag.endswith("svg"))
            self.assertEqual(root.attrib.get("viewBox"), "0 0 528 765")
            transformations = [node.get("transform", "")
                               for node in root.iter() if node.tag.endswith("g")]
            self.assertTrue(any("translate(140 " in tr for tr in transformations))
            self.assertTrue(any("translate(368 " in tr for tr in transformations))

    def test_light_theme_and_preserved_measurement_workflows(self):
        self.assertIn("measurement-figure-panel", CSS)
        self.assertIn("background:linear-gradient(180deg,#fff", CSS)
        self.assertIn("measurementFigurePanelHTML(last,d,canWrite)", MEASURES)
        self.assertIn("measurementHistoryCalendarHTML(xs,cid)", MEASURES)
        self.assertIn("measurementComparisonHTML(xs)", MEASURES)
        self.assertIn("function saveMeasurement(cid", MEASURES)
        self.assertIn("function measurementShowAddForm()", MEASURES)
        self.assertIn("measurementMetricCard-'+k+", MEASURES)
        self.assertNotIn('onchange="measurementGender', MEASURES)

    def test_pwa_assets_only_in_experimental_build(self):
        self.assertIn("2026-10-10-eplan-1.2-zamiry-001", HTML)
        for file in (HTML, SW):
            self.assertIn("/static/js/measurements.js?v=161", file)
            self.assertIn("/static/css/redesign.css?v=206", file)
        for sex in ("male", "female"):
            self.assertIn(f"/static/img/measurements/figure-{sex}.svg", SW)
        self.assertIn("const VERSION='eplan-v147'", SW)

    @unittest.skipUnless(shutil.which("node"), "Node is needed for behavior checks")
    def test_profile_sex_selects_svg_and_legacy_pairs_display(self):
        js = r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let src=fs.readFileSync('backend/static/js/measurements.js','utf8');
const ctx={window:{},fmtProgress:x=>String(x),esc:x=>String(x),console};
vm.createContext(ctx);
vm.runInContext(src,ctx);
const female={client:{sex:'Жіноча'},measurements:[]};
const male={client:{sex:'Чоловіча'},measurements:[]};
const unspecified={client:{sex:''},measurements:[]};
const other={client:{sex:'Інше'},measurements:[]};
assert.equal(ctx.measurementGender(female),'female');
assert.equal(ctx.measurementGender(male),'male');
assert.equal(ctx.measurementGender(unspecified),'male');
assert.equal(ctx.measurementGender(other),'male');
let sample={chest:102,waist:82,hips:98,arms_right:38,arms_left:37,calves:37};
let f=ctx.measurementFigurePanelHTML(sample,female,true);
assert(f.includes('figure-female.svg'));
assert(f.includes('102'));
assert(f.includes('38/37'));
assert(f.includes('Додати заміри'));
assert(f.includes('measurementJumpToMetric'));
let m=ctx.measurementFigurePanelHTML(null,unspecified,false);
assert(m.includes('figure-male.svg'));
assert(!m.includes('class="measurement-figure-add"'));
assert(m.includes('—'));
let legacy=ctx.measurementFigurePanelHTML({arms:36},male,true);
assert(legacy.includes('>36 <small>см</small>'));
console.log('measurements sex fallback, pairs and blank-state PASS');
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
