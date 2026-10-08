"""Read-only nutrition quality audit for EPLAN 1.2 normalized food search results.

Not a certification of USDA/OFF accuracy. Run against exported JSON arrays from
both sources; preserves records and reports actionable anomalies.
Usage: python backend/food_nutrition_audit.py --input foods.json --output audit.json
"""
import argparse
import json
import math
from collections import Counter
from pathlib import Path


def audit_item(item):
    issues = []
    source = str(item.get("source") or "")
    if source not in {"usda", "off"}:
        issues.append("unsupported_source")
    if not str(item.get("source_id") or "").strip():
        issues.append("missing_source_id")
    if not str(item.get("name") or "").strip():
        issues.append("missing_name")
    numbers = {}
    for field in ("kcal_100", "protein_100", "fat_100", "carbs_100"):
        try:
            value = float(item[field])
            if not math.isfinite(value):
                raise ValueError("non-finite")
            numbers[field] = value
        except (KeyError, ValueError, TypeError, OverflowError):
            issues.append("missing_or_invalid_" + field)
    if len(numbers) != 4:
        return issues
    kcal, protein, fat, carbs = (numbers[k] for k in
        ("kcal_100", "protein_100", "fat_100", "carbs_100"))
    if not 0 <= kcal <= 900:
        issues.append("kcal_out_of_range")
    if any(not 0 <= x <= 100 for x in (protein, fat)):
        issues.append("macro_out_of_range")
    if carbs < 0 and source == "usda" and carbs >= -1:
        # USDA Foundation "carbohydrate by difference" can be slightly
        # negative due to independent component measurements/rounding.
        # Retain the original value and explicitly mark for review.
        issues.append("usda_trace_negative_carbs_review")
    elif not 0 <= carbs <= 100:
        issues.append("macro_out_of_range")
    if protein + fat + carbs > 105:
        issues.append("macros_exceed_100g")
    # Hard physical plausibility checks are separate from softer 4/9/4
    # discrepancies, which can be explained by fibre and Atwater factors.
    if source == "off" and kcal > 900:
        issues.append("off_impossible_energy_review")
    if source == "off" and kcal >= 0 and (protein * 4 + fat * 9 + carbs * 4) > kcal + 250:
        issues.append("off_severe_energy_mismatch_review")
    estimated = 4 * protein + 9 * fat + 4 * carbs
    # This is a heuristic only: fibre, alcohol, specific Atwater factors
    # and label rounding can explain differences.
    if abs(estimated - kcal) > max(50, kcal * 0.30):
        issues.append("energy_macro_mismatch_review")
    if source == "off" and not item.get("barcode"):
        issues.append("off_missing_barcode")
    return issues


def audit(items):
    counts = Counter()
    flagged = []
    by_source = Counter()
    seen = set()
    for item in items:
        source = str(item.get("source") or "unknown")
        by_source[source] += 1
        issues = audit_item(item)
        identity = (source, str(item.get("source_id") or ""))
        if identity in seen:
            issues.append("duplicate_source_id")
        seen.add(identity)
        if issues:
            counts.update(issues)
            flagged.append({"source": source, "source_id": item.get("source_id"),
                            "name": item.get("name"), "issues": issues})
    review_categories = {}
    for entry in flagged:
        codes = entry["issues"]
        if any(code.startswith("missing_or_invalid_") or code in
               ("missing_name", "missing_source_id") for code in codes):
            category = "incomplete_data"
        elif "usda_trace_negative_carbs_review" in codes:
            category = "usda_calculation_review"
        elif any(code in ("kcal_out_of_range", "off_impossible_energy_review",
                         "off_severe_energy_mismatch_review", "macro_out_of_range",
                         "macros_exceed_100g", "energy_macro_mismatch_review")
                 for code in codes):
            category = "nutrition_anomaly_review"
        else:
            category = "metadata_review"
        entry["review_category"] = category
        review_categories[category] = review_categories.get(category, 0) + 1
    return {"checked": len(items), "by_source": dict(by_source),
            "review_categories": review_categories,
            "flagged_count": len(flagged), "issue_counts": dict(counts),
            "flagged": flagged,
            "note": "Automated sanity checks only; passing does not verify label accuracy."}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    items = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        parser.error("Input must be a JSON array of normalized food records")
    result = audit(items)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(f"Checked {result['checked']} records; flagged {result['flagged_count']}")


if __name__ == "__main__":
    main()
