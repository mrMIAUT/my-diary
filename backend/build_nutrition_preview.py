"""Build a no-database interactive preview of the actual structured nutrition editor.

This static demo is completely isolated from production and cannot write to
client accounts. It uses only audited local USDA nutrition records.
"""
import json
import shutil
from pathlib import Path
from meal_plan_generator import generate_meal_plan, approved_plan_catalog, _fit_meal, FOODS, MEAL_SOURCES
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
shutil.copyfile(backend/"static/js/recipe-template-picker.js",out/"static/js/recipe-template-picker.js")
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
# Compile every researched recipe into an editable, source-linked food template,
# rather than fetching recipe sites or recalculating in the browser.
catalog_foods=approved_plan_catalog()
PORTIONS={"breakfast":.27,"lunch":.35,"snack":.14,"dinner":.24,"evening":.11}
templates=[]
for category,menu in MEAL_SOURCES.items():
    portion=PORTIONS[category]
    meal_target=tuple(float(plan["targets"][k])*portion for k in ("kcal","protein","fat","carbs"))
    for recipe in menu:
        keys=tuple(recipe["keys"])
        food_rows,totals,actual=_fit_meal(keys,meal_target,catalog_foods)
        for food in food_rows:
            original=food["name"]
            food["name"]=fresh_vegetable_display_name(original)
            key=next((k for k in keys if FOODS[k][0]==original),None)
            food["usage_note"]=recipe["notes"].get(key,"")
        # Bounded editable grams are part of the published template data.
        # A serving is not allowed to become e.g. 700 g of dry oats, 11 eggs,
        # or 90 g oil merely to force an exact macro match.
        if key is not None:
            _,lo,hi,step,base,_=FOODS[key]
            lo=max(3,lo) if key=="oil" else max(1,lo)
            food["portion_rules"]={"min_grams":lo,"max_grams":hi,"step_grams":step}
        if "oil" in keys:
            assert "оливков" in recipe["preparation"].lower()
            assert recipe["notes"].get("oil") and "окрем" in recipe["notes"]["oil"]
        if "oats" in keys and "yogurt" in keys:
            assert ("ніч" in recipe["title"].lower() or "замоч" in recipe["preparation"].lower()
                    or "відвари" in recipe["preparation"].lower())
        # Add omitted optional recipe ingredients back as small but sensible
        # portions. A dressing named in instructions cannot disappear from
        # the ingredient list simply because macro fitting set it to 0 g.
        present={row["source_id"] for row in food_rows}
        for key in keys:
            source=catalog_foods[key]
            if source["source_id"] in present:
                continue
            _,lo,hi,step,start,_=FOODS[key]
            lo=max(3,lo) if key=="oil" else max(1,lo)
            grams=max(lo,min(hi,start if key=="oil" else lo))
            food_rows.append({
              "source_id":source["source_id"],"name":fresh_vegetable_display_name(source["name"]),
              "grams":grams,"count":int(grams/50) if key=="eggs" else None,
              "count_in_targets":source["name"] not in (
                "Огірок (сирий)","Помідор (сирий)","Шпинат (сирий)"
              ),
              "usage_note":recipe["notes"].get(key,""),
              "portion_rules":{"min_grams":lo,"max_grams":hi,"step_grams":step}
            })
            present.add(source["source_id"])
        templates.append({
          "id":recipe["id"],"category":category,"title":recipe["title"],
          "preparation":recipe["preparation"],"source_name":recipe["source_name"],
          "source_url":recipe["source_url"],"source_relation":recipe["source_relation"],
          "minutes":recipe["minutes"],"tags":recipe["tags"],
          "foods":food_rows,"totals":totals,"actual_totals":actual,
        })
assert len(templates)>=40 and len({rec["id"] for rec in templates})==len(templates)
assert any(x["title"].startswith("Нічна вівсянка") for x in templates)
assert any("Гаряча вівсяна каша" in x["title"] for x in templates)
assert all(row["source_id"] in original_names for x in templates for row in x["foods"])
for filename,payload in (("catalog.json",catalog),("plan.json",demo),
                         ("recipe-library.json",{"version":1,"templates":templates,
                          "note":"Ідеї страв адаптовані за кулінарними джерелами; БЖВ перераховано за базою Є ПЛАН."})):
    (out/filename).write_text(json.dumps(payload,ensure_ascii=False),encoding="utf-8")
print(f"Static preview ready: {len(catalog['items'])} approved foods, {len(demo['meals'])} meal variants, {len(templates)} culinary templates")
