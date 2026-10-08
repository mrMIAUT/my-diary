"""Sample real USDA and Open Food Facts records and audit their normalized macros.

Read-only. Uses public APIs and USDA DEMO_KEY; coverage is a small sampled
subset, never the complete databases. Failures are reported, not hidden.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from food_nutrition_audit import audit

QUERIES = ("rice", "potato", "milk", "chicken", "buckwheat")
HEADERS = {"User-Agent": "EPLAN-NutritionAudit/1.0 (read-only sample)"}


def get_json(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def number(value):
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def off_record(product):
    n = product.get("nutriments") or {}
    return {
        "source": "off", "source_id": str(product.get("code") or ""),
        "barcode": str(product.get("code") or ""),
        "name": product.get("product_name") or product.get("product_name_en") or "",
        "kcal_100": number(n.get("energy-kcal_100g")),
        "protein_100": number(n.get("proteins_100g")),
        "fat_100": number(n.get("fat_100g")),
        "carbs_100": number(n.get("carbohydrates_100g")),
    }


def usda_record(food):
    nutrients = food.get("foodNutrients") or []
    def nutrient(nid):
        for n in nutrients:
            if str(n.get("nutrientId") or n.get("nutrientNumber")) == nid:
                return number(n.get("value"))
        return None
    return {
        "source": "usda", "source_id": str(food.get("fdcId") or ""),
        "name": food.get("description") or "",
        "kcal_100": nutrient("1008"), "protein_100": nutrient("1003"),
        "fat_100": nutrient("1004"), "carbs_100": nutrient("1005"),
    }


def main():
    items, failures = [], []
    key = os.environ.get("USDA_API_KEY") or "DEMO_KEY"
    for query in QUERIES:
        try:
            params = urllib.parse.urlencode({
                "search_terms": query, "page_size": 20,
                "fields": "code,product_name,product_name_en,nutriments",
                "json": 1, "action": "process", "search_simple": 1,
            })
            payload = get_json("https://world.openfoodfacts.org/cgi/search.pl?" + params)
            products = payload.get("products") or []
            if not products:
                failures.append({"source": "off", "query": query, "error": "no_records"})
            items.extend(off_record(p) for p in products)
        except Exception as exc:
            failures.append({"source": "off", "query": query, "error": type(exc).__name__})
        time.sleep(2)
    for query in QUERIES:
        try:
            params = urllib.parse.urlencode({"api_key": key, "query": query,
                                             "pageSize": 20, "dataType": "Foundation"})
            payload = get_json("https://api.nal.usda.gov/fdc/v1/foods/search?" + params)
            foods = payload.get("foods") or []
            if not foods:
                failures.append({"source": "usda", "query": query, "error": "no_records"})
            items.extend(usda_record(p) for p in foods)
        except Exception as exc:
            failures.append({"source": "usda", "query": query, "error": type(exc).__name__})
        time.sleep(1)
    report = audit(items)
    report["queries"] = list(QUERIES)
    report["fetch_failures"] = failures
    report["scope"] = "Small sampled API results only, not full USDA/OFF database."
    Path("nutrition-audit-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in
        ("checked", "by_source", "flagged_count", "issue_counts", "fetch_failures")},
        ensure_ascii=False, indent=2))
    if not items:
        raise SystemExit("No records fetched from either API")


if __name__ == "__main__":
    main()
