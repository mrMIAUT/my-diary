"""Deterministic offline tests for food search speed and stable pagination."""
import ast
import re
import threading
import time
import unittest
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

APP = (Path(__file__).resolve().parents[1] / "app.py").read_text(encoding="utf-8")
HELPERS = {
    "_food_cache_get", "_food_cache_set", "_food_collect_off_batches",
    "_food_result_page", "_usda_search",
}


def load_helpers(extra=()):
    tree = ast.parse(APP)
    names = HELPERS | set(extra)
    selected = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in names:
            node.decorator_list = []
            selected.append(node)
    ns = {
        "time": time,
        "threading": threading,
        "urllib": urllib,
        "FOOD_USDA_CACHE": {},
        "FOOD_USDA_CACHE_LOCK": threading.Lock(),
        "FOOD_USDA_CACHE_TTL_SECONDS": 900,
        "FOOD_USDA_CACHE_MAX_ENTRIES": 192,
        "USDA_API_KEY": "offline-test-key",
        "USDA_GENERIC_TYPES": ["Foundation", "Survey (FNDDS)", "SR Legacy"],
        "USDA_BRANDED_TYPES": ["Branded"],
        "_usda_item": lambda food: dict(food),
        "Query": lambda *args, **kw: kw.get("default"),
        "FOOD_SEARCH_MAX_RESULTS": 24,
        "PROTOTYPE_MODE": True,
    }
    exec(compile(ast.Module(body=selected, type_ignores=[]), "food-cache", "exec"), ns)
    return ns


class FoodSearchPerformance(unittest.TestCase):
    def test_cache_is_bounded_and_expires(self):
        ns = load_helpers()
        cache,lock = {},threading.Lock()
        put,get = ns["_food_cache_set"],ns["_food_cache_get"]
        put(cache,lock,"a",[1],2)
        put(cache,lock,"b",[2],2)
        self.assertEqual(get(cache,lock,"a",30),[1])
        put(cache,lock,"c",[3],2)
        self.assertNotIn("b",cache)
        self.assertIn("a",cache)
        self.assertIn("c",cache)
        cache["a"]=(time.monotonic()-31,[1])
        self.assertIsNone(get(cache,lock,"a",30))
        self.assertNotIn("a",cache)

    def test_usda_success_cached_and_api_failure_not_cached(self):
        ns = load_helpers()
        calls = []
        def fetch(url,payload):
            calls.append(payload["query"])
            return {"foods":[{"description":"Oats","fdcId":123}]}
        ns["_food_fetch_json"]=fetch
        first=ns["_usda_search"]("oats",8)
        second=ns["_usda_search"]("oats",8)
        self.assertEqual(first,second)
        self.assertEqual(calls,["oats"])
        first[0]["description"]="MUTATED"
        self.assertEqual(ns["_usda_search"]("oats",8)[0]["description"],"Oats")

        ns["FOOD_USDA_CACHE"].clear()
        calls.clear()
        def fail_then_succeed(url,payload):
            calls.append(payload["query"])
            if len(calls)==1:return None
            return {"foods":[{"description":"Rice","fdcId":234}]}
        ns["_food_fetch_json"]=fail_then_succeed
        self.assertEqual(ns["_usda_search"]("rice",8),[])
        self.assertEqual(len(ns["_usda_search"]("rice",8)),1)
        self.assertEqual(len(calls),2)

    def test_off_batches_are_concurrent_but_ordered(self):
        ns=load_helpers()
        barrier=threading.Barrier(2)
        def off_collect(query,country,pages,page_size):
            barrier.wait(timeout=4)
            return [{"name":query,"country":country}]
        ns["_off_collect"]=off_collect
        with ThreadPoolExecutor(max_workers=2) as pool:
            ns["FOOD_OFF_SEARCH_POOL"]=pool
            batches=ns["_food_collect_off_batches"]([
                ("rice","Ukraine",2,24),
                ("milk","Ukraine",4,24),
            ])
        self.assertEqual([batch[0]["name"] for batch in batches],["rice","milk"])

    def test_page_and_filter_share_one_fixed_window(self):
        ns=load_helpers()
        candidates=(
            (
                {"name":"Generic A","food_type":"generic"},
                {"name":"Brand A","food_type":"branded"},
                {"name":"Generic B","food_type":"generic"},
            ),
            False,{"open_food_facts":True,"usda":True},
        )
        page=ns["_food_result_page"]
        first=page("rice","rice",["rice"],candidates,1,1,"generic")
        second=page("rice","rice",["rice"],candidates,1,2,"generic")
        self.assertEqual([x["name"] for x in first["items"]],["Generic A"])
        self.assertEqual([x["name"] for x in second["items"]],["Generic B"])
        self.assertTrue(first["has_more"])
        self.assertFalse(second["has_more"])
        self.assertEqual(first["candidate_count"],2)
        self.assertEqual(page("rice","rice",["rice"],candidates,2,1,"all")["candidate_count"],3)
        first["items"][0]["name"]="edited"
        self.assertEqual(candidates[0][0]["name"],"Generic A")

    def test_cache_hit_skips_all_external_sources_even_for_page_two(self):
        ns=load_helpers(extra={"prototype_food_search"})
        candidates=(
            tuple({"name":str(i),"food_type":"generic"} for i in range(3)),
            False,{"open_food_facts":True,"usda":True},
        )
        ns.update({
            "FOOD_RESULT_CACHE":{},
            "FOOD_RESULT_CACHE_LOCK":threading.Lock(),
            "FOOD_RESULT_CACHE_TTL_SECONDS":180,
            "normalize_food_query":lambda q:q.casefold(),
            "food_search_variants":lambda q:[q.casefold()],
        })
        ns["_food_cache_set"](ns["FOOD_RESULT_CACHE"],ns["FOOD_RESULT_CACHE_LOCK"],
                              ("rice",2),candidates,96)
        result=ns["prototype_food_search"](q="rice",limit=2,page=2,food_type="all")
        self.assertEqual([x["name"] for x in result["items"]],["2"])
        self.assertFalse(result["has_more"])
        self.assertEqual(result["candidate_count"],3)


if __name__ == "__main__":
    unittest.main()
