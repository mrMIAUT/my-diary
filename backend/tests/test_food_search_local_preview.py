"""Read-only local catalogue fast path: never calls external USDA/OFF APIs."""
import ast
import sys
import unittest
from pathlib import Path

BACKEND=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BACKEND))
from food_reference_catalog import reference_food_items

APP=ast.parse((BACKEND/"app.py").read_text(encoding="utf-8"))

def local_endpoint():
    node=next(n for n in APP.body
        if isinstance(n,ast.FunctionDef) and
        n.name=="prototype_food_local_catalog")
    node.decorator_list=[]
    class HttpException(Exception):pass
    ns={
        "PROTOTYPE_MODE":True,
        "HTTPException":HttpException,
        "reference_food_items":reference_food_items,
        "FOOD_QUERY_REPLACEMENTS":{"курица":"курятина"},
        "FOOD_USDA_ALIASES":(("курятина","chicken"),),
        "JSONResponse":lambda data,headers=None:{"data":data,"headers":headers},
    }
    exec(compile(ast.Module(body=[node],type_ignores=[]),
                 "local-food", "exec"),ns)
    return ns["prototype_food_local_catalog"],ns

class LocalPreviewTests(unittest.TestCase):
    def test_local_catalogue_exposes_reviewed_data_without_api_fetch(self):
        endpoint,ns=local_endpoint()
        ns["_off_collect"]=lambda *a,**k:self.fail("OFF was contacted")
        ns["_usda_search"]=lambda *a,**k:self.fail("USDA was contacted")
        response=endpoint()
        payload=response["data"]
        self.assertTrue(payload["preliminary"])
        self.assertGreaterEqual(len(payload["items"]),26)
        self.assertEqual(payload["query_replacements"]["курица"],"курятина")
        self.assertIn(("курятина","chicken"),payload["english_aliases"])
        self.assertTrue(response["headers"]["Cache-Control"].startswith("private"))
        self.assertTrue(all(item.get("source")=="reference" for item in payload["items"]))
        for item in payload["items"]:
            with self.subTest(name=item["name"]):
                self.assertTrue(item.get("approximate") is True or
                                item.get("review_status") in
                                {"approved","manufacturer_label_reviewed"})

    def test_catalogue_endpoint_is_disabled_outside_prototype(self):
        endpoint,ns=local_endpoint()
        ns["PROTOTYPE_MODE"]=False
        with self.assertRaises(ns["HTTPException"]):
            endpoint()

if __name__=="__main__":
    unittest.main()
