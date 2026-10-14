"""Reviewed manufacturer-declared nutrition for exact Ukrainian branded foods.

Distinct from USDA standard reference foods and approximate generic entries.
Every record links to a named product on the manufacturer's own website.
Correct brand and fat level must remain visible to the user. Brand averages
cannot be silently reused as generic nutrition for other manufacturers.
"""
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit,parse_qsl
import json
import math
import re

SOURCE_FILE=Path(__file__).resolve().parent/"food_manufacturer_labels.json"
NUTRIENTS=("kcal_100","protein_100","fat_100","carbs_100")
ALLOWED_MANUFACTURERS={
    "Галичина":{"galychyna.com.ua","dostavka.galychyna.com.ua"},
    "Яготинське для дітей":{"yagotynkids.com.ua"},
    "BioTechUSA":{"shop.biotechusa.com"},
    "Activia":{"activia.ua"},
    "OstroVit":{"ostrovit.com"},
    "Optimum Nutrition":{"www.optimumnutrition.com"},
    "Myprotein":{"www.myprotein.com"},
    "Ehrmann":{"www.ehrmann.de"},
    "Barebells":{"barebells.com"},
}


def validate_label_record(row):
    if not isinstance(row,dict):
        raise ValueError("Manufacturer label record must be an object")
    required=("id","name_uk","name_ru","brand","source_product_heading",
              "source_url","reviewed_on")
    if any(not isinstance(row.get(key),str) or not row[key].strip()
           for key in required):
        raise ValueError("Incomplete manufacturer product identity")
    if not re.fullmatch(r"[a-z0-9-]{8,90}",row["id"]):
        raise ValueError("Invalid manufacturer source record ID")
    if row.get("source_publisher")!="manufacturer":
        raise ValueError("A manufacturer's own page is required")
    if row.get("source_nutrition_basis")!="per_100g_product":
        raise ValueError("Nutrition must be declared per 100g, not per portion")
    if row.get("nutrition_status")!="manufacturer_label_reviewed":
        raise ValueError("Unreviewed branded label is not selectable")
    if row.get("preparation_state")!="as_sold":
        raise ValueError("Manufacturer declarations must match product as sold")
    brand=row["brand"]
    parts=urlsplit(row["source_url"])
    # Some manufacturers identify an exact flavour/size by a variant query.
    # Only accept that single, digit-only selector for those specific hosts.
    variation_allowed=(
        (brand=="Optimum Nutrition" and bool(re.fullmatch(r"variant=\d{8,18}",parts.query)))
        or (brand=="Myprotein" and bool(re.fullmatch(r"variation=\d{6,15}",parts.query)))
    )
    if (brand not in ALLOWED_MANUFACTURERS
        or parts.scheme!="https"
        or parts.hostname not in ALLOWED_MANUFACTURERS[brand]
        or parts.username or parts.password
        or not parts.path or parts.path=="/"
        or (parts.query and not variation_allowed) or parts.fragment):
        raise ValueError("Untrusted or non-specific manufacturer source URL")
    nutrition={}
    for nutrient in NUTRIENTS:
        amount=row.get(nutrient)
        if type(amount) not in (int,float) or not math.isfinite(amount):
            raise ValueError("Missing or non-finite label nutrient: "+nutrient)
        nutrition[nutrient]=float(amount)
    if not (0<nutrition["kcal_100"]<=900):
        raise ValueError("Invalid declared label energy")
    if any(not 0<=nutrition[key]<=100 for key in NUTRIENTS[1:]):
        raise ValueError("Invalid declared macronutrients")
    if sum(nutrition[k] for k in NUTRIENTS[1:])>105:
        raise ValueError("More macronutrients than food mass")
    rough=4*nutrition["protein_100"]+9*nutrition["fat_100"]+4*nutrition["carbs_100"]
    if abs(rough-nutrition["kcal_100"])>max(25,nutrition["kcal_100"]*.25):
        raise ValueError("Unexplained manufacturer calorie discrepancy")
    label_pct=re.findall(r"(\d+(?:[.,]\d+)?)\s*%",row["name_uk"])
    # In a protein line, '100%' is part of the product name, not fat%.
    if label_pct and row.get("product_kind")!="protein_powder" and (
        abs(float(label_pct[-1].replace(",","."))-nutrition["fat_100"])>.1
    ):
        raise ValueError("Brand fat percentage differs from label fat value")
    additional={}
    for field,maximum in (("saturated_fat_100","fat_100"),("sugars_100","carbs_100")):
        value=row.get(field)
        if value is None:
            continue
        if type(value) not in (int,float) or not math.isfinite(value):
            raise ValueError("Invalid optional nutrient: "+field)
        if not 0<=value<=nutrition[maximum]:
            raise ValueError("Optional nutrient exceeds its parent: "+field)
        additional[field]=float(value)
    # EAN is accepted only if it was printed on the manufacturer's own
    # flavour/size page. Never generate a barcode from a product name.
    barcode=row.get("barcode","")
    if barcode:
        if brand!="OstroVit" or not isinstance(barcode,str) or not re.fullmatch(r"\d{13}",barcode):
            raise ValueError("Unverified manufacturer barcode")
        checksum=(10-sum(int(d)*(1 if i%2==0 else 3) for i,d in enumerate(barcode[:12]))%10)%10
        if checksum!=int(barcode[-1]):
            raise ValueError("Invalid manufacturer EAN-13 checksum")
    return {
        "source":"reference",     # Local, independent of OFF/USDA request.
        "source_kind":"manufacturer_label",
        "source_label":"Дані виробника · 100 г",
        "source_id":"eplan12-manufacturer-"+row["id"],
        "name":row["name_uk"],
        "brand":brand,
        "barcode":barcode,
        "search_aliases":list(dict.fromkeys((
            row["name_ru"],
            brand+" "+row["name_uk"],
            row["name_uk"]+" "+brand,
            row["name_ru"]+" "+brand,
            row["source_product_heading"],
        ))),
        "kcal_100":nutrition["kcal_100"],
        "protein_100":nutrition["protein_100"],
        "fat_100":nutrition["fat_100"],
        "carbs_100":nutrition["carbs_100"],
        "data_type":"manufacturer_label",
        "food_type":"branded",
        "preparation_state":"as_sold",
        "approximate":False,
        "review_status":"manufacturer_label_reviewed",
        "source_url":row["source_url"],
        "source_product_heading":row["source_product_heading"],
        "reviewed_on":row["reviewed_on"],
        **additional,
    }


@lru_cache(maxsize=1)
def manufacturer_label_food_items():
    data=json.loads(SOURCE_FILE.read_text(encoding="utf-8"))
    if data.get("schema_version")!=1 or (
        data.get("source_kind")!="manufacturer_label"
    ) or not isinstance(data.get("records"),list):
        raise ValueError("Invalid manufacturer label catalogue")
    records=[]
    seen_ids=set()
    seen_products=set()
    seen_barcodes=set()
    for raw in data["records"]:
        item=validate_label_record(raw)
        sig=(item["brand"].casefold(),item["name"].casefold())
        if item["source_id"] in seen_ids or sig in seen_products:
            raise ValueError("Duplicate manufacturer product record")
        if item["barcode"] and item["barcode"] in seen_barcodes:
            raise ValueError("Duplicate manufacturer barcode")
        seen_ids.add(item["source_id"])
        seen_products.add(sig)
        if item["barcode"]:
            seen_barcodes.add(item["barcode"])
        records.append(item)
    return tuple(records)
