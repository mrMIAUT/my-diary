"""Source-audited local nutrition catalogue for the EPLAN 1.2 prototype.

The candidate manifest is only a plan: it never provides nutrition values.
Only manually source-reviewed entries in food_local_nutrition.json become
searchable. An FDC ID or a plausible kcal value alone does NOT verify accuracy.
Source extraction and human review must happen before a record is approved.
"""
from functools import lru_cache
from pathlib import Path
import json
import math
import re

ROOT = Path(__file__).resolve().parent
CANDIDATES_PATH = ROOT / "food_catalog_candidates.json"
NUTRITION_PATH = ROOT / "food_local_nutrition.json"
NUTRIENTS = ("kcal_100", "protein_100", "fat_100", "carbs_100")
STATES = {"raw", "dry", "cooked", "as_sold"}


def candidate_manifest(path=CANDIDATES_PATH):
    """Read only the catalogue plan. Never treat its entries as diary food."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or data.get("planned_only") is not True:
        raise ValueError("Invalid pending-source candidate manifest")
    items = data.get("products")
    if not isinstance(items, list):
        raise ValueError("Candidate products must be a list")
    seen_ids, seen_names = set(), set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Invalid candidate")
        item_id = item.get("id")
        name = item.get("name_uk")
        state = item.get("preparation_state")
        if not isinstance(item_id, str) or not item_id.startswith("plan-"):
            raise ValueError("Missing candidate ID")
        if not isinstance(name, str) or not name.strip() or state not in STATES:
            raise ValueError("Incomplete candidate identity or food state")
        if item.get("nutrition_status") != "pending_source":
            raise ValueError("Candidate unexpectedly presented as reviewed")
        if any(key in item for key in NUTRIENTS):
            raise ValueError("Candidate cannot contain unverified nutrition")
        signature = (name.casefold().strip(), state)
        if item_id in seen_ids or signature in seen_names:
            raise ValueError("Duplicate candidate ID or name/state")
        seen_ids.add(item_id)
        seen_names.add(signature)
    return items


def validate_reviewed_record(record, by_id):
    """Reject unsafe/untraceable entries; this cannot replace source review.

    A source snapshot SHA256 is a provenance fingerprint, *not* proof of
    correctness. The actual official record must be checked independently.
    """
    if not isinstance(record, dict):
        raise ValueError("Nutrition record must be an object")
    candidate_id = record.get("candidate_id")
    candidate = by_id.get(candidate_id)
    if candidate is None:
        raise ValueError("Nutrition record has no matching candidate")
    if record.get("review_status") != "approved":
        raise ValueError("Nutrition record has not been reviewed")
    if record.get("name_uk") != candidate["name_uk"]:
        raise ValueError("Nutrition record name differs from candidate")
    if record.get("preparation_state") != candidate["preparation_state"]:
        raise ValueError("Nutrition record state differs from candidate")
    if record.get("source_system") != "USDA_FDC":
        raise ValueError("Only reviewed USDA records currently permitted")
    fdc_id = record.get("fdc_id")
    if type(fdc_id) is not int or fdc_id <= 0:
        raise ValueError("A positive numeric USDA FDC ID is required")
    if record.get("source_data_type") not in (
        "Foundation", "SR Legacy", "Survey (FNDDS)"
    ):
        # Branded product values cannot be presented as universal nutrition
        # for a generic food unless the exact brand/label is also preserved.
        raise ValueError("Unqualified branded or unknown USDA record type")
    for field in ("source_archive_version", "reviewed_by", "reviewed_at",
                  "source_food_description", "source_portion_basis"):
        value = record.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Missing source-review metadata: " + field)
    snapshot = record.get("source_snapshot_sha256")
    if not isinstance(snapshot, str) or re.fullmatch(r"[0-9a-f]{64}", snapshot) is None:
        raise ValueError("Missing source snapshot SHA256 fingerprint")
    # A source serving-size, cooked/raw state and edible portion MUST match
    # the candidate before approval, not merely its food name.
    if record.get("source_portion_basis") != "100g_edible_portion":
        raise ValueError("Nutrition must be per 100g edible portion")
    # Explicitly store the nutrient IDs and original numbers copied from
    # the source record. Catch transcription/normalization errors before a
    # reviewed record can be displayed to the user.
    source_nutrient_ids = record.get("source_nutrient_ids")
    if not isinstance(source_nutrient_ids, dict) or (
        source_nutrient_ids.get("kcal_100") not in (1008, 2047, 2048)
        or source_nutrient_ids.get("protein_100") != 1003
        or source_nutrient_ids.get("fat_100") != 1004
        or source_nutrient_ids.get("carbs_100") != 1005
    ):
        raise ValueError("Missing USDA nutrient identifiers")
    source_values = record.get("source_nutrients_100g")
    if not isinstance(source_values, dict):
        raise ValueError("Original official nutrient values required")
    values = {}
    for key in NUTRIENTS:
        n, original = record.get(key), source_values.get(key)
        if any(type(v) not in (int, float) for v in (n, original)):
            raise ValueError("Missing source or normalized nutrition: " + key)
        if not math.isfinite(n) or not math.isfinite(original):
            raise ValueError("Non-finite nutrition: " + key)
        if abs(n - original) > .011:
            raise ValueError("Normalized nutrition differs from cited source")
        values[key] = float(n)
    if not (0 < values["kcal_100"] <= 900):
        raise ValueError("Energy outside allowed bounds")
    if any(not 0 <= values[k] <= 100 for k in NUTRIENTS[1:]):
        raise ValueError("Macro outside possible per-100g bounds")
    if sum(values[k] for k in NUTRIENTS[1:]) > 105:
        raise ValueError("Macros exceed approximately 100g of product")
    rough_kcal = (values["protein_100"] * 4 +
                  values["fat_100"] * 9 +
                  values["carbs_100"] * 4)
    mismatch = abs(rough_kcal - values["kcal_100"])
    if mismatch > max(50, values["kcal_100"] * .30):
        note = record.get("energy_discrepancy_review")
        if not isinstance(note, str) or len(note.strip()) < 20:
            raise ValueError("Energy/macros mismatch needs documented review")
    # Compatible with the existing EPLAN reference search. Brand products
    # may be approved later, but must retain their distinct variant.
    return {
        "source": "reference",
        "source_label": "ЄПЛАН · джерело USDA FoodData Central",
        "source_id": "eplan12-fdc-" + str(fdc_id),
        "barcode": "",
        "name": candidate["name_uk"],
        "brand": "",
        **values,
        "data_type": "reference",
        "food_type": "generic",
        "preparation_state": candidate["preparation_state"],
        "approximate": False,
        "source_fdc_id": fdc_id,
        "source_data_type": record["source_data_type"],
        "source_archive_version": record["source_archive_version"],
        "review_status": "approved",
    }


@lru_cache(maxsize=1)
def approved_reference_food_items():
    """Fail closed if source-backed nutrition has not been reviewed."""
    candidates = candidate_manifest()
    by_id = {item["id"]: item for item in candidates}
    data = json.loads(NUTRITION_PATH.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("records"), list):
        raise ValueError("Invalid reviewed nutrition catalogue")
    seen_ids, seen_source_ids = set(), set()
    approved = []
    for row in data["records"]:
        item = validate_reviewed_record(row, by_id)
        if row["candidate_id"] in seen_ids or item["source_id"] in seen_source_ids:
            raise ValueError("Duplicate approved candidate or source ID")
        seen_ids.add(row["candidate_id"])
        seen_source_ids.add(item["source_id"])
        approved.append(item)
    return tuple(approved)
