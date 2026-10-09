"""Read-only quality gate for EPLAN 1.2's locally controlled food catalog.

Usage: python backend/check_food_local_catalog.py
Counts planned vs fully source-reviewed records. It does not independently
verify USDA measurements: that requires official source data review.
"""
from collections import Counter
import json
from food_local_catalog import candidate_manifest, approved_reference_food_items
from food_reference_catalog import reference_food_items


def main():
    candidates=candidate_manifest()
    approved=approved_reference_food_items()
    current=reference_food_items()
    counts=Counter(item["category"] for item in candidates)
    existing_approximate=sum(item.get("approximate") is True for item in current)
    local_reviewed=sum(item.get("review_status")=="approved" for item in current)
    if existing_approximate+local_reviewed!=len(current):
        raise ValueError("Unclassified food provenance in reference catalogue")
    if local_reviewed!=len(approved):
        raise ValueError("Reviewed records not included exactly once")
    if len({r["source_id"] for r in current}) != len(current):
        raise ValueError("Duplicate source IDs in combined reference catalogue")
    summary={
        "planned_candidates":len(candidates),
        "categories":dict(counts),
        "existing_approximate":existing_approximate,
        "source_reviewed_approved":local_reviewed,
        "still_pending_source":len(candidates)-local_reviewed,
        "status":"plan_not_nutrition_data",
        "note":"Source audit and official FDC record comparison required before approving BJU.",
    }
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    return summary


if __name__=="__main__":
    main()
