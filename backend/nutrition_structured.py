"""Structured nutrition-plan food provenance, units, and dual totals.

The trainer stores catalog IDs and quantities, never nutrition values from the
browser. All food nutrition and generated legacy text are rebuilt from the
reviewed local USDA catalog on the server.
"""
import json
from functools import lru_cache
from food_local_catalog import approved_reference_food_items

# Only low-energy, non-starchy vegetables can be omitted from *target*
# calculations. All are still counted in actual dietary intake totals.
FREE_VEGETABLE_NAMES = frozenset({
    "Огірок (сирий)",
    "Помідор (сирий)",
    "Шпинат (сирий)",
    "Шпинат (відварений)",
})
EGG_NAMES = frozenset({"Яйце куряче (варене круто)", "Яйце куряче (сире)"})
EGG_EDIBLE_GRAMS = 50
MAX_FOODS_PER_VARIANT = 30
MAX_GRAMS = 2000
NUTRIENTS = ("kcal", "protein", "fat", "carbs")
SOURCE_KEYS = ("kcal_100", "protein_100", "fat_100", "carbs_100")


@lru_cache(maxsize=1)
def food_map():
    reviewed=approved_reference_food_items()
    return {item["source_id"]: item for item in reviewed}


def foods_for_trainer():
    """Only 100% approved records, in a small safe projection."""
    return [{
        "source_id": item["source_id"], "name": item["name"],
        "state": item["preparation_state"],
        **{key:item[key] for key in SOURCE_KEYS},
        "unit": "pcs" if item["name"] in EGG_NAMES else "g",
        "grams_per_piece": EGG_EDIBLE_GRAMS if item["name"] in EGG_NAMES else None,
        "optional_vegetable": item["name"] in FREE_VEGETABLE_NAMES,
        "source": item["source_label"],
    } for item in food_map().values()]


def validate_structured_foods(items):
    """Validate server-side instead of trusting editable browser nutrient data."""
    if not isinstance(items, list) or len(items)>MAX_FOODS_PER_VARIANT:
        raise ValueError("У прийомі їжі може бути до 30 продуктів.")
    source=food_map()
    clean=[]
    for row in items:
        if not isinstance(row, dict):
            raise ValueError("Некоректний продукт.")
        sid=row.get("source_id")
        food=source.get(sid)
        if not food:
            raise ValueError("Продукт не знайдено у перевіреному каталозі.")
        name=food["name"]
        egg=name in EGG_NAMES
        try:
            if egg:
                count=row.get("count")
                if type(count) is not int or not (1<=count<=8):
                    raise ValueError("Кількість яєць має бути цілим числом від 1 до 8.")
                grams=count*EGG_EDIBLE_GRAMS
            else:
                grams=row.get("grams")
                if type(grams) not in (int,float) or not (0<grams<=MAX_GRAMS):
                    raise ValueError("Перевір масу продукту.")
                grams=round(float(grams),1)
        except (OverflowError, TypeError):
            raise ValueError("Некоректна порція продукту.") from None
        flag=row.get("count_in_targets",True)
        if type(flag) is not bool:
            raise ValueError("Некоректний режим обліку продукту.")
        if not flag and name not in FREE_VEGETABLE_NAMES:
            raise ValueError("Лише некрохмалисті овочі дозволено виключати з цільових БЖВ.")
        clean.append({
            "source_id":sid,
            "grams":grams,
            "count":count if egg else None,
            "count_in_targets":flag,
        })
    return clean


def structured_meal_summary(rows):
    """Returns actual + target-accounted nutrition and a readable client text."""
    source=food_map()
    tracked={k:0. for k in NUTRIENTS}
    actual={k:0. for k in NUTRIENTS}
    lines=[]
    for row in rows:
        food=source[row["source_id"]]
        nutrient={key:float(food[src])*row["grams"]/100.
                  for key,src in zip(NUTRIENTS,SOURCE_KEYS)}
        for key,v in nutrient.items():
            actual[key]+=v
            if row["count_in_targets"]:
                tracked[key]+=v
        if row.get("count") is not None:
            unit=f'{row["count"]} шт. (≈ {row["grams"]:g} г їстівної частини)'
        else:
            unit=f'{row["grams"]:g} г'
        suffix='' if row["count_in_targets"] else ' · овочі поза цільовими БЖВ'
        lines.append(f'{food["name"]} — {unit}{suffix}')
    for record in (tracked,actual):
        for key in record:
            record[key]=round(record[key],1)
    content="\n".join(lines)
    if lines:
        content+="\n\nДо цільових БЖВ: "+(
          f'{tracked["kcal"]:g} ккал · Б {tracked["protein"]:g} · '
          f'Ж {tracked["fat"]:g} · В {tracked["carbs"]:g}')
        if tracked!=actual:
            content+="\nФактично разом з овочами: "+(
              f'{actual["kcal"]:g} ккал · Б {actual["protein"]:g} · '
              f'Ж {actual["fat"]:g} · В {actual["carbs"]:g}')
    return {"content":content,"tracked":tracked,"actual":actual}


def serialize_structured_foods(items):
    validated=validate_structured_foods(items)
    return validated,json.dumps(validated,ensure_ascii=False,separators=(",",":"))
