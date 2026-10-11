"""Build a no-database interactive preview of the actual structured nutrition editor.

This static demo is completely isolated from production and cannot write to
client accounts. It uses only audited local USDA nutrition records.
"""
import json
import shutil
from pathlib import Path
from meal_plan_generator import generate_meal_plan
from nutrition_structured import foods_for_trainer

backend=Path(__file__).resolve().parent
root=backend.parent
out=root/"nutrition-preview-dist"
(out/"static/js").mkdir(parents=True,exist_ok=True)
shutil.copyfile(backend/"static/nutrition-constructor-preview.html",out/"index.html")
shutil.copyfile(backend/"static/js/structured-meal-editor.js",out/"static/js/structured-meal-editor.js")
shutil.copyfile(backend/"static/js/nutrition-constructor-demo.js",out/"static/js/nutrition-constructor-demo.js")
catalog={"items":foods_for_trainer()}
plan=generate_meal_plan(2380,160,60,300,meals=4,variants=2)
demo={"targets":plan["targets"],"meals":plan["meals"]}
for filename,payload in (("catalog.json",catalog),("plan.json",demo)):
    (out/filename).write_text(json.dumps(payload,ensure_ascii=False),encoding="utf-8")
print(f"Static preview ready: {len(catalog['items'])} approved foods, {len(demo['meals'])} meal variants")
