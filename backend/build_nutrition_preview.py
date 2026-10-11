"""Build a no-database interactive preview of the actual structured nutrition editor.

This static demo is completely isolated from production and cannot write to
client accounts. It uses only audited local USDA nutrition records.
"""
import json
import shutil
from pathlib import Path
from meal_plan_generator import generate_meal_plan
from nutrition_structured import foods_for_trainer

# Presentation-only terminology for fresh vegetables in the demo. USDA
# identifiers, stored catalogue names, cooked/dried foods and BJU are unchanged.
FRESH_VEGETABLES = frozenset({
    "Баклажан (сирий)", "Броколі (сирі)", "Брюссельська капуста (сира)",
    "Буряк (сирий)", "Гарбуз (сирий)", "Зелена квасоля (сира)",
    "Кабачок (сирий)", "Капуста білоголова (сира)",
    "Капуста червоноголова (сира)", "Капуста пекінська (сира)",
    "Капуста цвітна (сира)", "Морква (сира)", "Морська капуста (сира)",
    "Огірок (сирий)", "Перець солодкий червоний (сирий)",
    "Перець солодкий зелений (сирий)", "Помідор (сирий)",
    "Редиска (сира)", "Рукола (сира)", "Салат айсберг (сирий)",
    "Салат ромен (сирий)", "Селера коренева (сира)",
    "Селера стеблова (сира)", "Спаржа (сира)",
    "Шпинат (сирий)", "Цибуля червона (сира)",
    "Цибуля ріпчаста (сира)", "Часник (сирий)",
})
FRESH_SUFFIX = {
    " (сирий)": " (свіжий)",
    " (сира)": " (свіжа)",
    " (сирі)": " (свіжі)",
    " (сире)": " (свіже)",
}

def fresh_vegetable_display_name(name):
    if name not in FRESH_VEGETABLES:
        return name
    for old, new in FRESH_SUFFIX.items():
        if name.endswith(old):
            return name[:-len(old)] + new
    raise ValueError(f"Unexpected vegetable name: {name}")


backend=Path(__file__).resolve().parent
root=backend.parent
out=root/"nutrition-preview-dist"
(out/"static/js").mkdir(parents=True,exist_ok=True)
shutil.copyfile(backend/"static/nutrition-constructor-preview.html",out/"index.html")
shutil.copyfile(backend/"static/js/structured-meal-editor.js",out/"static/js/structured-meal-editor.js")
shutil.copyfile(backend/"static/js/nutrition-constructor-demo.js",out/"static/js/nutrition-constructor-demo.js")
catalog={"items":foods_for_trainer()}
original_names={item["source_id"]:item["name"] for item in catalog["items"]}
assert FRESH_VEGETABLES <= set(original_names.values()),"Unknown vegetable in name mapping"
for item in catalog["items"]:
    item["name"]=fresh_vegetable_display_name(item["name"])
# Nutrition and identity are unchanged: this is not an edit to USDA nutrition data.
assert len(original_names)==len(catalog["items"])
assert len({item["name"] for item in catalog["items"]})==len(catalog["items"])
assert all(item["source_id"] in original_names for item in catalog["items"])
plan=generate_meal_plan(2380,160,60,300,meals=4,variants=2)
for meal in plan["meals"]:
    for food in meal["foods"]:
        old=food["name"]
        new=fresh_vegetable_display_name(old)
        food["name"]=new
        if old!=new:
            meal["content"]=meal["content"].replace(old,new)
# The static sample should contain real dish descriptions, not arbitrary
# ingredients or oil as a separate food to eat.
assert plan["meals"] and len(plan["meals"])==8
assert plan["within_tolerance"],f"Sample macro tolerance failed: {plan['deviations_pct']}"
for meal in plan["meals"]:
    assert len(meal["dish_title"])>=12 and len(meal["preparation"])>=35
    assert meal["foods"],"A composed meal cannot have an empty ingredient list"
    for ingredient in meal["foods"]:
        if ingredient["name"]=="Оливкова олія":
            assert ingredient["usage_note"] and "окрем" in ingredient["usage_note"]
            assert "оливков" in meal["preparation"].lower()
demo={"targets":plan["targets"],"meals":plan["meals"]}
for filename,payload in (("catalog.json",catalog),("plan.json",demo)):
    (out/filename).write_text(json.dumps(payload,ensure_ascii=False),encoding="utf-8")
print(f"Static preview ready: {len(catalog['items'])} approved foods, {len(demo['meals'])} meal variants")
