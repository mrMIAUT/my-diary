"""Sample real USDA and Open Food Facts records and audit their normalized macros.

Read-only. Uses public APIs and USDA DEMO_KEY; coverage is a small sampled
subset, never the complete databases. Failures are reported, not hidden.
"""
import json
import urllib.error
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


def get_json(url, attempts=3):
    request = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise
            retry_after = exc.headers.get("Retry-After")
            try:
                wait = min(30, max(1, int(retry_after)))
            except (TypeError, ValueError):
                wait = 3 * (attempt + 1)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            time.sleep(3 * (attempt + 1))


def number(value):
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def off_record(product):
    n = product.get("nutriments") or {}
    kcal = number(n.get("energy-kcal_100g"))
    if kcal is None:
        kj = number(n.get("energy_100g"))
        if kj is not None:
            kcal = round(kj / 4.184, 2)
    return {
        "source": "off", "source_id": str(product.get("code") or ""),
        "barcode": str(product.get("code") or ""),
        "name": product.get("product_name") or product.get("product_name_en") or "",
        "kcal_100": kcal,
        "protein_100": number(n.get("proteins_100g")),
        "fat_100": number(n.get("fat_100g")),
        "carbs_100": number(n.get("carbohydrates_100g")),
    }


def usda_record(food):
    nutrients = food.get("foodNutrients") or []

    def nutrient(number_id, names=(), unit=None):
        # USDA nutrientId is a database ID (e.g. 1008); nutrientNumber
        # can use a different code (e.g. 208 for energy).
        for n in nutrients:
            if str(n.get("nutrientId") or "") != number_id and (
                str(n.get("nutrientName") or n.get("name") or "").lower()
                not in names
            ):
                continue
            if unit and str(n.get("unitName") or "").upper() != unit:
                continue
            value = number(n.get("value"))
            if value is not None:
                return value
        return None

    kcal = nutrient("1008", ("energy",), "KCAL")
    # Foundation foods may report Atwater energy under IDs 2047/2048
    # rather than 1008. Do not convert kJ without explicit units.
    if kcal is None:
        kcal = nutrient("2047", ("energy (atwater general factors)",), "KCAL")
    if kcal is None:
        kcal = nutrient("2048", ("energy (atwater specific factors)",), "KCAL")
    return {
        "source": "usda", "source_id": str(food.get("fdcId") or ""),
        "name": food.get("description") or "",
        "kcal_100": kcal,
        "protein_100": nutrient("1003", ("protein",)),
        "fat_100": nutrient("1004", ("total lipid (fat)",)),
        "carbs_100": nutrient("1005", ("carbohydrate, by difference",)),
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
        time.sleep(6)
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
    # Incomplete nutrition fields and contradictory nutrition are different issues.
    report["quality_breakdown"] = {}
    for source in ("off", "usda"):
        records = [i for i in items if i.get("source") == source]
        flagged = [i for i in report["flagged"] if i.get("source") == source]
        incomplete = [i for i in flagged if any(
            issue.startswith("missing_or_invalid_") or issue in ("missing_name", "missing_source_id")
            for issue in i["issues"])]
        contradictory = [i for i in flagged if any(issue in (
            "energy_macro_mismatch_review", "kcal_out_of_range",
            "macro_out_of_range", "macros_exceed_100g") for issue in i["issues"])]
        report["quality_breakdown"][source] = {
            "checked": len(records), "flagged": len(flagged),
            "incomplete": len(incomplete), "nutrition_anomalies": len(contradictory),
            "no_automated_issues": len(records) - len(flagged),
        }
    # Attach the actual values to flagged records for reproducible review.
    # The report remains a read-only GitHub Actions artifact.
    lookup = {(str(item.get("source")), str(item.get("source_id"))): item
              for item in items}
    for flagged in report["flagged"]:
        key = (str(flagged.get("source")), str(flagged.get("source_id")))
        item = lookup.get(key, {})
        flagged["nutrition_per_100g"] = {
            field: item.get(field) for field in
            ("kcal_100", "protein_100", "fat_100", "carbs_100")
        }
    report["queries"] = list(QUERIES)
    report["fetch_failures"] = failures
    report["fetch_success_queries"] = {source: len(QUERIES) - sum(f["source"] == source for f in failures) for source in ("off", "usda")}
    report["scope"] = "Small sampled API results only, not full USDA/OFF database."
    Path("nutrition-audit-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in
        ("checked", "by_source", "flagged_count", "quality_breakdown", "issue_counts", "fetch_failures", "fetch_success_queries", "review_categories")},
        ensure_ascii=False, indent=2))
    if not items:
        raise SystemExit("No records fetched from either API")


if __name__ == "__main__":
    main()
