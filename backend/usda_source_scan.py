"""Download official USDA FoodData Central CSV archives and produce an audit.

Never copies data into the live EPLAN catalogue and never auto-approves macro
values. The output is a source-backed short list for independent inspection.
Can be run on GitHub Actions where USDA downloads are accessible.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import time
import urllib.request
import zipfile
from pathlib import Path
from food_local_catalog import food_energy_valid

OFFICIAL_ARCHIVES = {
    "SR Legacy": {
        "url": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
        "release": "2018-04",
        "max_bytes": 30_000_000,
    },
    "Foundation": {
        "url": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip",
        "release": "2026-04",
        "max_bytes": 30_000_000,
    },
}
IDS = {1003:"protein_100",1004:"fat_100",1005:"carbs_100",
       1008:"kcal_100",2047:"kcal_100",2048:"kcal_100"}
SEARCHES = {
    "chicken_breast": "chicken breast",
    "chicken_thigh": "chicken thigh",
    "turkey_breast": "turkey breast",
    "beef": "beef",
    "pork": "pork",
    "egg": "egg, whole",
    "milk": "milk",
    "yogurt": "yogurt",
    "cheese_cottage": "cheese, cottage",
    "cheese_mozzarella": "mozzarella",
    "rice": "rice, white",
    "buckwheat": "buckwheat",
    "oats": "oats",
    "potato": "potato",
    "apple": "apples",
    "banana": "bananas",
    "tomato": "tomatoes",
    "cucumber": "cucumber",
    "carrot": "carrots",
    "salmon": "salmon",
    "tuna": "tuna",
    "olive_oil": "oil, olive",
    "sunflower_oil": "oil, sunflower",
    "lentils": "lentils",
    "beans": "beans",
    "almonds": "nuts, almonds",
    "walnuts": "nuts, walnuts",
    "poppy_seed":"poppy seed",
    "lard":"lard",
    "beef_tallow":"beef tallow",
}

def get_bytes(url, max_bytes):
    error = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={
                "User-Agent": "EPLAN-1.2-USDA-import-audit/1.0",
                "Accept": "application/zip",
            })
            with urllib.request.urlopen(request,timeout=55) as response:
                blob=response.read(max_bytes+1)
            if len(blob)>max_bytes:
                raise ValueError("Source ZIP unexpectedly large")
            if not blob.startswith(b"PK"):
                raise ValueError("Official USDA response is not a ZIP")
            return blob
        except (OSError, ValueError) as exc:
            error=exc
            if attempt!=2:time.sleep((attempt+1)*3)
    raise RuntimeError("USDA archive unavailable: "+type(error).__name__) from error

def csv_rows(zf,base):
    filename=next((n for n in zf.namelist()
                  if n.lower().endswith("/"+base) or n.lower()==base),None)
    if filename is None:raise ValueError("Expected USDA file missing: "+base)
    with zf.open(filename) as raw:
        with io.TextIOWrapper(raw,encoding="utf-8-sig",errors="replace",newline="") as txt:
            yield from csv.DictReader(txt)

def load_source(label,cfg):
    blob=get_bytes(cfg["url"],cfg["max_bytes"])
    archive_sha=hashlib.sha256(blob).hexdigest()
    foods,nutrients={},{}
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        if zf.testzip() is not None:raise ValueError("Corrupt USDA ZIP")
        for row in csv_rows(zf,"food.csv"):
            try: food_id=int(row["fdc_id"])
            except (KeyError,ValueError):continue
            desc=str(row.get("description") or "").strip()
            if not desc:continue
            foods[food_id]={"fdc_id":food_id,"description":desc,
                "data_type":row.get("data_type",label),
                "publication_date":row.get("publication_date","")}
        for row in csv_rows(zf,"food_nutrient.csv"):
            try:
                food_id=int(row["fdc_id"])
                nutrient_id=int(row["nutrient_id"])
                number=float(row["amount"])
            except (KeyError,ValueError,TypeError):continue
            if food_id not in foods or nutrient_id not in IDS:continue
            nutrients.setdefault(food_id,{})[str(nutrient_id)]=number
    complete=[]
    incomplete=0
    for food_id,food in foods.items():
        ns=nutrients.get(food_id,{})
        energy=next(((k,ns[k]) for k in ("1008","2047","2048") if k in ns),None)
        if not energy or any(x not in ns for x in ("1003","1004","1005")):
            incomplete+=1
            continue
        item={**food,"source_release":cfg["release"],"source_type":label,
              "source_url":cfg["url"],"source_archive_sha256":archive_sha,
              "source_nutrient_ids":{
                  "kcal_100":int(energy[0]),"protein_100":1003,
                  "fat_100":1004,"carbs_100":1005,
              },
              "kcal_100":energy[1],"protein_100":ns["1003"],
              "fat_100":ns["1004"],"carbs_100":ns["1005"]}
        estimated=4*item["protein_100"]+9*item["fat_100"]+4*item["carbs_100"]
        item["energy_difference_4_9_4"]=round(item["kcal_100"]-estimated,2)
        # Only screen for impossible values here. Soft kcal differences
        # need independent review due to fiber/Atwater factors.
        if not food_energy_valid(item["kcal_100"],item["protein_100"],item["fat_100"],item["carbs_100"]):continue
        if any(item[k]<0 or item[k]>100 for k in
               ("protein_100","fat_100","carbs_100")):continue
        if item["protein_100"]+item["fat_100"]+item["carbs_100"]>105:continue
        complete.append(item)
    return {
        "source":label,"archive_sha256":archive_sha,
        "url":cfg["url"],"release":cfg["release"],
        "total_foods":len(foods),"incomplete_nutrients":incomplete,
        "complete_nutrition_records":len(complete),
        "foods":complete,
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",type=Path,default=Path("usda_source_report"))
    args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    sources=[]
    for label,cfg in OFFICIAL_ARCHIVES.items():
        print("Downloading USDA",label,flush=True)
        src=load_source(label,cfg)
        print("SOURCE",label,"foods",src["total_foods"],
              "complete",src["complete_nutrition_records"],
              "sha256",src["archive_sha256"],flush=True)
        sources.append(src)
    records=[food for source in sources for food in source["foods"]]
    report={"sources":[{k:v for k,v in x.items() if k!="foods"} for x in sources],
            "matches":{}}
    for key,phrase in SEARCHES.items():
        matches=[x for x in records if phrase in x["description"].casefold()]
        matches.sort(key=lambda x:(
            x["source_type"]!="SR Legacy",
            len(x["description"]),x["description"]))
        report["matches"][key]=matches[:50]
        print("MATCH",key,len(matches),flush=True)
        for item in matches[:8]:
            print("  ",item["fdc_id"],item["source_type"],
                  item["description"][:100],
                  "kcal",item["kcal_100"],
                  "P",item["protein_100"],
                  "F",item["fat_100"],
                  "C",item["carbs_100"],flush=True)
    report["note"]="Automated candidates ONLY. Similar description is not sufficient for approval."
    dest=args.out/"usda_source_proposals.json"
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    # Full 8K validated nutrient rows retained for deterministic human
    # matching. No products are auto-approved or inserted by this workflow.
    all_source=args.out/"usda_all_source_foods.json"
    all_source.write_text(json.dumps(records,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    candidates_file=Path(__file__).resolve().parent/"food_catalog_candidates.json"
    if candidates_file.exists():
        (args.out/"food_catalog_candidates.json").write_bytes(candidates_file.read_bytes())
    crosswalk_file=Path(__file__).resolve().parent/"usda_curated_crosswalk.json"
    if crosswalk_file.exists():
        (args.out/"usda_curated_crosswalk.json").write_bytes(crosswalk_file.read_bytes())
    print("SOURCE AUDIT SUCCESS:",dest,"full records",len(records),flush=True)

if __name__=="__main__":
    main()
