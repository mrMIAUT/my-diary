"""Food source fallback and cache regression tests, without HTTP requests."""
import ast
import re
import threading
import time
import unittest
import urllib.parse
from pathlib import Path

SOURCE=(Path(__file__).resolve().parents[1]/"app.py").read_text(encoding="utf-8")
OFF_SEARCH=next(n for n in ast.parse(SOURCE).body
                if isinstance(n,ast.FunctionDef) and n.name=="_off_search")


def load_search(fetch):
    ns={
        "time":time,
        "urllib":urllib,
        "FOOD_OFF_SEARCH_CACHE":{},
        "FOOD_OFF_SEARCH_CACHE_LOCK":threading.Lock(),
        "FOOD_OFF_CACHE_TTL_SECONDS":1800,
        "FOOD_OFF_CACHE_MAX_ENTRIES":64,
        "_food_fetch_json":fetch,
        "_off_item":lambda x:x,
    }
    exec(compile(ast.Module(body=[OFF_SEARCH],type_ignores=[]),
                 "isolated-food-source", "exec"),ns)
    return ns


class FoodSourceFallbackTests(unittest.TestCase):
    def test_v2_fallback_filters_to_ukraine_and_caches_success(self):
        urls=[]
        def fetch(url):
            urls.append(url)
            if "/cgi/search.pl" in url:return None
            return {"products":[
                {"name":"Пельмені з яловичиною","ukraine":True},
                {"name":"Imported beef dumplings","ukraine":False},
            ]}
        r=load_search(fetch)
        first=r["_off_search"]("пельмені",24,1,"Ukraine")
        self.assertEqual([x["name"] for x in first],["Пельмені з яловичиною"])
        second=r["_off_search"]("пельмені",24,1,"Ukraine")
        self.assertEqual(second,first)
        self.assertEqual(len(urls),2)
        self.assertIn("/api/v2/search?",urls[1])

    def test_cached_good_data_survives_source_failure(self):
        mode={"online":True}
        def fetch(url):
            if mode["online"]:return {"products":[{"name":"Лосось","ukraine":True}]}
            return None
        r=load_search(fetch)
        self.assertEqual(len(r["_off_search"]("лосось",24,1,"Ukraine")),1)
        mode["online"]=False
        r["FOOD_OFF_CACHE_TTL_SECONDS"]=-1
        self.assertEqual(len(r["_off_search"]("лосось",24,1,"Ukraine")),1)

    def test_empty_source_response_does_not_poison_cache(self):
        mode={"empty":True}
        def fetch(url):
            if mode["empty"]:return {"products":[]}
            return {"products":[{"name":"Пельмені","ukraine":True}]}
        r=load_search(fetch)
        self.assertEqual(r["_off_search"]("пельмені",24,1,"Ukraine"),[])
        self.assertFalse(r["FOOD_OFF_SEARCH_CACHE"])
        mode["empty"]=False
        self.assertEqual(len(r["_off_search"]("пельмені",24,1,"Ukraine")),1)

    def test_country_cache_is_not_used_for_global_results(self):
        calls=[]
        def fetch(url):
            calls.append(url)
            return {"products":[{"name":"Pelmeni","ukraine":False}]}
        r=load_search(fetch)
        self.assertEqual(r["_off_search"]("пельмені",24,1,"Ukraine"),[])
        self.assertEqual(len(r["_off_search"]("пельмені",24,1,None)),1)
        self.assertEqual(len(calls),2)


if __name__=="__main__":
    unittest.main()
