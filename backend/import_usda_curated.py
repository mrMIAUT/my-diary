"""Import manually selected USDA FDC records into the EPLAN 1.2 local catalogue.

The crosswalk specifies exact candidate names and source FDC IDs and is
reviewed separately. This script *never* fuzzy-matches or silently infers
nutrition by product name. Downloads two pinned OFFICIAL USDA archives,
checks their SHA256 hashes and source nutrient IDs, validates every import
row, and writes only source-backed records (on --write).
"""
import argparse
from collections import Counter
from datetime import date
import hashlib
import json
from pathlib import Path
from food_local_catalog import (
    CANDIDATES_PATH, NUTRITION_PATH, NUTRIENTS, candidate_manifest,
    validate_reviewed_record,
)
from usda_source_scan import OFFICIAL_ARCHIVES, load_source

EXPECTED_ARCHIVE_SHA256 = {
    "SR Legacy": "b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0",
    "Foundation": "70457ee9d9342f43bda2010318c85f04210c689fdeb9cd2da4c513b0e8dbc655",
}
CROSSWALK = Path(__file__).resolve().parent/"usda_curated_crosswalk.json"
REVIEW_DATE = "2026-10-09"
REVIEWED_BY = "EPLAN USDA exact-ID crosswalk; manual description/state review"
# These descriptions lack essential characteristics of the named candidate,
# or require an unusually large energy/macronutrient discrepancy explanation.
# They are deliberately held out rather than approved automatically.
HOLD_FOR_REVIEW = {
    "Макарони з пшениці твердих сортів (сухі)",
    "Макарони з пшениці твердих сортів (відварені)",
    "Какао-порошок без цукру",
}

def build_records():
    candidates = candidate_manifest()
    by_name={x["name_uk"]:x for x in candidates}
    crosswalk=json.loads(CROSSWALK.read_text(encoding="utf-8"))
    if crosswalk.get("schema_version")!=1:
        raise ValueError("Unknown source crosswalk version")
    selected=crosswalk.get("records")
    if not isinstance(selected,list):
        raise ValueError("Crosswalk must be a list")
    indexed={}
    for label,configuration in OFFICIAL_ARCHIVES.items():
        parsed=load_source(label,configuration)
        actual=parsed["archive_sha256"]
        if actual!=EXPECTED_ARCHIVE_SHA256[label]:
            raise ValueError("Official "+label+" source archive changed: "+
                             actual+" (requires independent re-review)")
        for row in parsed["foods"]:
            if row["fdc_id"] in indexed:
                raise ValueError("USDA FDC ID collision: "+str(row["fdc_id"]))
            indexed[row["fdc_id"]]=row
    records=[]
    rejected=[]
    seen_candidates=set()
    seen_fdc=set()
    for entry in selected:
        if not isinstance(entry,dict):
            raise ValueError("Invalid crosswalk entry")
        name,fdc_id=entry.get("name_uk"),entry.get("fdc_id")
        if not isinstance(name,str) or type(fdc_id)!=int:
            raise ValueError("Missing candidate name or USDA source ID")
        if name in seen_candidates or fdc_id in seen_fdc:
            raise ValueError("Duplicate crosswalk candidate or FDC ID")
        seen_candidates.add(name)
        seen_fdc.add(fdc_id)
        candidate=by_name.get(name)
        source=indexed.get(fdc_id)
        if not candidate or not source:
            raise ValueError("No candidate or valid USDA source for "+repr(name))
        if name in HOLD_FOR_REVIEW:
            rejected.append({"name":name,"fdc_id":fdc_id,
                             "reason":"ambiguous_description_or_macro_review"})
            continue
        description=source["description"]
        ids=source["source_nutrient_ids"]
        values={k:float(source[k]) for k in NUTRIENTS}
        note=None
        approx=abs(4*values["protein_100"]+9*values["fat_100"]+
                   4*values["carbs_100"]-values["kcal_100"])
        if approx>max(50,values["kcal_100"]*.30):
            rejected.append({"name":name,"fdc_id":fdc_id,
                             "reason":"large_energy_macro_discrepancy"})
            continue
        snapshot={
            "fdc_id":fdc_id,
            "description":description,
            "source_nutrient_ids":ids,
            "source_nutrients_100g":values,
        }
        fingerprint=hashlib.sha256(json.dumps(snapshot,
            ensure_ascii=False,sort_keys=True,separators=(",",":")
        ).encode("utf-8")).hexdigest()
        record={
            "candidate_id":candidate["id"],
            "name_uk":name,
            "name_ru":entry.get("name_ru"),
            "name_en":description,
            "preparation_state":candidate["preparation_state"],
            "review_status":"approved",
            "source_system":"USDA_FDC",
            "fdc_id":fdc_id,
            "source_data_type":source["source_type"],
            "source_archive_version":source["source_release"],
            "source_archive_sha256":source["source_archive_sha256"],
            "source_url":source["source_url"],
            "source_food_description":description,
            "source_portion_basis":"100g_edible_portion",
            "reviewed_by":REVIEWED_BY,
            "reviewed_at":REVIEW_DATE,
            "source_nutrient_ids":ids,
            "source_nutrients_100g":values,
            "source_snapshot":snapshot,
            "source_snapshot_sha256":fingerprint,
            **values,
        }
        validate_reviewed_record(record,{candidate["id"]:candidate})
        records.append(record)
    records.sort(key=lambda row:row["candidate_id"])
    return records,rejected,len(candidates),len(selected)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--write",action="store_true",help="Update local USDA nutrition JSON")
    parser.add_argument("--out",type=Path,default=Path("usda_import_report.json"))
    args=parser.parse_args()
    records,held,planned,mapped=build_records()
    data={
        "schema_version":1,
        "provenance_policy":"Official USDA ZIP SHA256 pinned; explicit FDC ID and edible state matched; nutrient IDs and exact values saved; no fuzzy approvals.",
        "records":records,
    }
    summary={
        "planned_candidates":planned,
        "curated_mapping_count":mapped,
        "approved_source_backed":len(records),
        "held_for_review":held,
        "pending_source":planned-len(records),
        "source":"USDA FDC official SR Legacy 2018-04 & Foundation 2026-04",
        "note":"The source record is authentic and traceable, but food values naturally vary by variety, recipe and brand.",
    }
    args.out.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if args.write:
        NUTRITION_PATH.write_text(
            json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"
        )
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
    return summary

if __name__=="__main__":
    main()
