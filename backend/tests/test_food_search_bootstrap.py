"""HTML food bootstrap regression: first-visit data and safe script embedding."""
import json
import re
import sys
import unittest
from pathlib import Path

BACKEND=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BACKEND))
from food_reference_catalog import reference_food_items
from food_local_bootstrap import embed_food_catalog,BOOTSTRAP_ID

_SCRIPT='<script src="/static/calculator-prototype.js?v=37" defer></script>'
_JSON_TAG=re.compile(
    r'<script id="'+re.escape(BOOTSTRAP_ID)+
    r'" type="application/json">(.*?)</script>',re.DOTALL
)

class FoodBootstrapTests(unittest.TestCase):
    def test_render_bootstrap_contains_approved_and_approximate_foods(self):
        html=(BACKEND/"static"/"calculator-prototype.html").read_text(
            encoding="utf-8")
        foods=reference_food_items()
        rendered=embed_food_catalog(
            html,foods,{"курица":"курятина","говядина":"яловичина"},
            (("курятина","chicken"),("яловичина","beef"))
        )
        match=_JSON_TAG.search(rendered)
        self.assertIsNotNone(match)
        payload=json.loads(match.group(1))
        self.assertEqual(len(payload["items"]),len(foods))
        self.assertGreaterEqual(len(foods),200)
        self.assertEqual(payload["query_replacements"]["говядина"],"яловичина")
        self.assertIn(["яловичина","beef"],payload["english_aliases"])
        self.assertEqual(sum(x.get("approximate") is True
                             for x in payload["items"]),26)
        self.assertTrue(any(x.get("source_fdc_id") for x in payload["items"]))
        self.assertLess(rendered.index('id="'+BOOTSTRAP_ID+'"'),
                        rendered.index('/static/calculator-prototype.js?v='))
        self.assertIn('</body>',rendered)

    def test_bootstrap_json_cannot_close_its_script_or_inject_html(self):
        html="<html><body>"+_SCRIPT+"</body></html>"
        foods=[{"name":"safe"} for _ in range(25)]
        foods.append({"name":'</script><img src=x onerror=alert(1)>&'})
        rendered=embed_food_catalog(html,foods,{},())
        self.assertEqual(rendered.count("</script>"),2)
        self.assertNotIn("<img src=x",rendered)
        payload=json.loads(_JSON_TAG.search(rendered).group(1))
        self.assertEqual(payload["items"][-1]["name"],
                         '</script><img src=x onerror=alert(1)>&')

    def test_bootstrap_fails_closed_without_script_anchor(self):
        foods=reference_food_items()
        for html in ("<html><body></body></html>",
                     _SCRIPT+_SCRIPT):
            with self.subTest(html=html):
                with self.assertRaises(ValueError):
                    embed_food_catalog(html,foods,{},())

    def test_prototype_routes_use_shared_embedded_html(self):
        source=(BACKEND/"app.py").read_text(encoding="utf-8")
        home=source.split('def home():',1)[1].split('def pwa_app():',1)[0]
        app=source.split('def pwa_app():',1)[1].split('@app.get("/pwa-reset")',1)[0]
        self.assertIn("_prototype_food_bootstrapped_html()",home)
        self.assertIn("_prototype_food_bootstrapped_html()",app)
        self.assertIn("embed_food_catalog(",source)

if __name__=="__main__":
    unittest.main()
