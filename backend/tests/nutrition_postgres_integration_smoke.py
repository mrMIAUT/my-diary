"""Isolated PostgreSQL rehearsal for real trainer nutrition integration.

Runs against disposable localhost CI database only. It seeds a legacy table,
starts the actual app schema migration, verifies old data remains unchanged,
then saves structured recipe foods, reloads, validates and tests rollback.
"""
import json
import os
import sys
from datetime import datetime,timezone
from pathlib import Path
from psycopg import connect
from psycopg.rows import dict_row
from fastapi import HTTPException

url=os.environ["DATABASE_URL"]
assert "localhost" in url or "127.0.0.1" in url,"Refuse nonlocal database."
os.environ.setdefault("TRAINER_EMAIL","nutrition-ci@example.invalid")
os.environ.setdefault("TRAINER_PASSWORD","CI-Isolated-Nutrition-Password-2026")
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

with connect(url,row_factory=dict_row) as conn:
    # Existing schema before the optional structured foods_json migration.
    conn.execute("""CREATE TABLE clients(
       id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE,password TEXT,
       goal TEXT,weight DOUBLE PRECISION,kcal INTEGER,protein INTEGER,
       fat INTEGER,carbs INTEGER,meal_plan TEXT DEFAULT '',
       status TEXT DEFAULT 'Активний',created_at TIMESTAMP)""")
    conn.execute("""CREATE TABLE nutrition_plan_items(
       id SERIAL PRIMARY KEY,client_id INTEGER,meal_number INTEGER,
       variant_number INTEGER,content TEXT DEFAULT '',sort INTEGER DEFAULT 0)""")
    client=conn.execute("INSERT INTO clients(name,email,password,kcal,protein,fat,carbs) VALUES('CI User','eplan-nutrition@example.invalid','',2380,160,60,300) RETURNING id").fetchone()["id"]
    conn.execute("INSERT INTO nutrition_plan_items(client_id,meal_number,variant_number,content,sort) VALUES(%s,1,1,'Старий текстовий план',0)",(client,))
    conn.commit()

import app
from nutrition_structured import foods_for_trainer

row=app.one("SELECT content,foods_json FROM nutrition_plan_items WHERE client_id=?",(client,))
assert row["content"]=="Старий текстовий план",row
assert json.loads(row["foods_json"])==[],row

user=app.AuthUser(
    role="trainer",user_id=1,client_id=None,session_id=0,
    expires_at=datetime.now(timezone.utc),name="CI Trainer"
)
# Test only persistence business logic here. Auth/access is separately
# covered in the app's real request authorization regressions.
app.authorize_client=lambda _user,_cid:None
app.require_active_client=lambda _cid,_feature:{"allowed":True}
catalog=foods_for_trainer()
egg=next(x for x in catalog if x["name"]=="Яйце куряче (варене круто)")
rice=next(x for x in catalog if x["name"]=="Рис білий (відварений)")
tomato=next(x for x in catalog if x["name"]=="Помідор (сирий)")
payload=app.NutritionTargetIn(
    kcal=2380,protein=160,fat=60,carbs=300,
    meals=[
      app.NutritionPlanItemIn(
         meal_number=1,variant_number=1,content="",
         dish_title="Тести з яйцем",preparation="Звари яйця і подай з рисом.",
         foods=[
           {"source_id":egg["source_id"],"grams":101,"count":2,"count_in_targets":True},
           {"source_id":rice["source_id"],"grams":180,"count_in_targets":True},
           {"source_id":tomato["source_id"],"grams":120,"count_in_targets":False},
         ],
      ),
      app.NutritionPlanItemIn(
         meal_number=1,variant_number=2,content="Варіант без структури"),
    ])
app.update_client_nutrition(client,payload,user)
rows=app.rows("SELECT content,foods_json,variant_number FROM nutrition_plan_items WHERE client_id=? ORDER BY variant_number",(client,))
assert len(rows)==2,rows
assert "Страва: Тести з яйцем" in rows[0]["content"]
assert "Приготування: Звари яйця" in rows[0]["content"]
assert json.loads(rows[0]["foods_json"])[0]["grams"]==100,rows[0]
assert "2 шт." in rows[0]["content"]
assert "овочі поза цільовими" in rows[0]["content"]
assert rows[1]["content"]=="Варіант без структури",rows[1]
assert json.loads(rows[1]["foods_json"])==[],rows[1]
snapshot=rows

bad=app.NutritionTargetIn(kcal=2380,protein=160,fat=60,carbs=300,
 meals=[app.NutritionPlanItemIn(
   meal_number=1,variant_number=1,
   foods=[{"source_id":"not-an-approved-product","grams":100}]
 )])
try:app.update_client_nutrition(client,bad,user)
except HTTPException as e:assert e.status_code==422,e
else:raise AssertionError("Bad catalogue id was accepted")
assert app.rows("SELECT content,foods_json,variant_number FROM nutrition_plan_items WHERE client_id=? ORDER BY variant_number",(client,))==snapshot,"Invalid input corrupted saved client plan"

recipes=app.trainer_meal_recipe_library(user)
assert len(recipes["templates"])==60,len(recipes["templates"])
for group in ("breakfast","lunch","dinner","snack"):
    subset=[r for r in recipes["templates"] if r["category"]==group]
    assert len(subset)==15,group
    assert all(r["minutes"]<=20 for r in subset)
assert all(r["foods"] and r["source_url"].startswith("https://") for r in recipes["templates"])
assert all(x["foods"][0]["source_id"] in {f["source_id"] for f in catalog} for x in recipes["templates"])

app.init()
again=app.rows("SELECT content,foods_json,variant_number FROM nutrition_plan_items WHERE client_id=? ORDER BY variant_number",(client,))
assert again==snapshot,"Second startup failed idempotent migration"
# EPLAN 1.2 food diary: independent from historical manual totals and the
# trainer-assigned plan, with server-owned identity on every operation.
day=app.kyiv_today()
client_user=app.AuthUser(role="client",user_id=client,client_id=client,session_id=0,
 expires_at=datetime.now(timezone.utc),name="CI Client")
entry=app.FoodDiaryAddIn(
 day=day,meal="lunch",name="Рис білий (сухий)",brand="",
 source_label="Орієнтовні довідкові БЖВ",source_id="eplan12-rice-white-dry",
 approximate=True,grams=150,kcal_100=365,protein_100=7.1,fat_100=0.7,carbs_100=80
)
saved=app.food_diary_add(entry,client_user)["item"]
assert saved["grams"]==150 and saved["kcal"]==547.5,saved
assert saved["protein"]==10.7 and saved["fat"]==1.1 and saved["carbs"]==120,saved
snapshot=app.rows("SELECT content,foods_json,variant_number FROM nutrition_plan_items WHERE client_id=? ORDER BY variant_number",(client,))
overview=app.food_diary_overview(30,client_user)
assert len(overview["days"])==1 and overview["days"][0]["kcal"]==547.5,overview
assert app.food_diary_get(day,client_user)["active"] is True
assert len(app.food_diary_get(day,client_user)["items"])==1
assert app.rows("SELECT * FROM nutrition WHERE client_id=?",(client,))==[], "Diary must never silently change legacy hand-entered daily BJU"
assert app.rows("SELECT content,foods_json,variant_number FROM nutrition_plan_items WHERE client_id=? ORDER BY variant_number",(client,))==snapshot, "Diary write must not alter assigned nutrition plan"
changed=app.food_diary_edit(saved["id"],app.FoodDiaryEditIn(meal="dinner",grams=100),client_user)["item"]
assert changed["meal"]=="dinner" and changed["kcal"]==365 and changed["grams"]==100,changed
# Per-100ml RTD label is stored as millilitres, not inferred mass.
from food_reference_catalog import reference_food_items
drink=next(item for item in reference_food_items()
           if item["source_id"]=="eplan12-manufacturer-ehrmann-high-protein-drink-banana-250ml")
assert drink["portion_unit"]=="ml" and drink["source_nutrition_basis"]=="per_100ml_product"
assert any(r["source_id"]==drink["source_id"] for r in app.prototype_food_preview("Ehrmann High Protein Banana",12)["items"])
drink_input=dict(day=day,meal="snack",name=drink["name"],brand=drink["brand"],
                source_label=drink["source_label"],source_id=drink["source_id"],
                approximate=False,grams=250,portion_unit="ml",
                **{key:drink[key] for key in ("kcal_100","protein_100","fat_100","carbs_100")})
logged_drink=app.food_diary_add(app.FoodDiaryAddIn(**drink_input),client_user)["item"]
assert logged_drink["portion_unit"]=="ml" and logged_drink["portion_amount"]==250,logged_drink
assert logged_drink["kcal"]==137.5 and logged_drink["protein"]==20,logged_drink
assert app.food_diary_overview(30,client_user)["days"][0]["kcal"]==502.5
edited_drink=app.food_diary_edit(logged_drink["id"],
    app.FoodDiaryEditIn(meal="snack",grams=125,portion_unit="ml"),client_user)["item"]
assert edited_drink["kcal"]==68.8 and edited_drink["portion_amount"]==125,edited_drink
for invalid in ({**drink_input,"portion_unit":"g"},
                {**drink_input,"source_id":"not-reviewed"},
                {**drink_input,"kcal_100":999},
                {**drink_input,"name":"Other product"}):
    try:app.food_diary_add(app.FoodDiaryAddIn(**invalid),client_user)
    except HTTPException as e:assert e.status_code==400,e
    else:raise AssertionError("Non-authoritative ml drink input was accepted")
try:app.food_diary_edit(logged_drink["id"],
    app.FoodDiaryEditIn(meal="snack",grams=250,portion_unit="g"),client_user)
except HTTPException as e:assert e.status_code==400,e
else:raise AssertionError("Converting a logged liquid to grams was accepted")
try:app.create_saved_recipe(app.SavedRecipeCreateIn(
    name="Неправильний мікс мл і грамів",day=day,meal="snack"),client_user)
except HTTPException as e:assert e.status_code==400,e
else:raise AssertionError("Liquid portions were silently summed into a gram recipe")
other_user=app.AuthUser(role="client",user_id=client+1000,client_id=client+1000,
 session_id=0,expires_at=datetime.now(timezone.utc),name="Other")
try:app.food_diary_edit(saved["id"],app.FoodDiaryEditIn(meal="lunch",grams=200),other_user)
except HTTPException as e:assert e.status_code==404,e
else:raise AssertionError("Cross-client diary mutation was allowed")
try:app.food_diary_delete(saved["id"],other_user)
except HTTPException as e:assert e.status_code==404,e
else:raise AssertionError("Cross-client diary deletion was allowed")
# Private products are never visible globally before an explicit trainer review.
private=app.create_private_food(app.PrivateFoodIn(
 name="Домашній сир CI",brand="Власний",kcal_100=142,
 protein_100=18,fat_100=7,carbs_100=2,submit_for_review=False),client_user)["item"]
assert private["review_status"]=="private"
assert private["saturated_fat_100"] is None and private["sugars_100"] is None, "Legacy custom foods must preserve unknown optional values as NULL"
private=app.edit_private_food(private["id"],app.PrivateFoodIn(
 name="Домашній сир CI",brand="Власний",kcal_100=142,
 protein_100=18,fat_100=7,carbs_100=2,
 saturated_fat_100=3.2,sugars_100=1.2),client_user)["item"]
assert private["saturated_fat_100"]==3.2 and private["sugars_100"]==1.2,private
assert any(x["saturated_fat_100"]==3.2 for x in app.my_private_foods(client_user)["items"])
try:app.create_private_food(app.PrivateFoodIn(
 name="Недійсні жири",kcal_100=100,protein_100=1,
 fat_100=3,carbs_100=10,saturated_fat_100=4),client_user)
except HTTPException as e:assert e.status_code==400,e
else:raise AssertionError("Saturated fat larger than total fat was accepted")
try:app.create_private_food(app.PrivateFoodIn(
 name="Недійсні цукри",kcal_100=100,protein_100=1,
 fat_100=3,carbs_100=10,sugars_100=11),client_user)
except HTTPException as e:assert e.status_code==400,e
else:raise AssertionError("Sugar larger than total carbohydrates was accepted")
assert any(x["id"]==private["id"] for x in app.my_private_foods(client_user)["items"])
assert not any(x["name"]=="Домашній сир CI" for x in app._public_food_matches("Домашній сир CI",8))
try:app.edit_private_food(private["id"],app.PrivateFoodIn(
 name="Чужий сир",kcal_100=190,protein_100=10,fat_100=8,carbs_100=8),other_user)
except HTTPException as e:assert e.status_code==404,e
else:raise AssertionError("Another client edited a private product")
candidate=app.create_private_food(app.PrivateFoodIn(
 name="Йогурт перевірка CI",brand="CI",kcal_100=87,
 protein_100=6.0,fat_100=2.7,carbs_100=10.5,
 saturated_fat_100=1.2,sugars_100=9.1,
 submit_for_review=True),client_user)["item"]
assert candidate["review_status"]=="pending"
assert candidate["saturated_fat_100"]==1.2 and candidate["sugars_100"]==9.1
assert any(x["sugars_100"]==9.1 for x in app.trainer_food_submissions(
 app.AuthUser(role="trainer",user_id=1,client_id=None,session_id=0,
 expires_at=datetime.now(timezone.utc),name="Trainer"))["items"])
assert not app._public_food_matches("Йогурт перевірка CI",8)
trainer=app.AuthUser(role="trainer",user_id=1,client_id=None,session_id=0,
 expires_at=datetime.now(timezone.utc),name="Trainer")
queue=app.trainer_food_submissions(trainer)["items"]
assert any(x["id"]==candidate["id"] for x in queue)
approved=app.trainer_food_review(candidate["id"],app.PrivateFoodReviewIn(
 decision="approve",name="Йогурт перевірка CI",brand="CI",note="Verified CI test label",
 kcal_100=81,protein_100=6,fat_100=2.4,carbs_100=9.8,
 saturated_fat_100=1.4,sugars_100=8.6),trainer)
assert approved["status"]=="approved"
global_hit=app._public_food_matches("Йогурт перевірка CI",8)
assert len(global_hit)==1 and global_hit[0]["kcal_100"]==81,global_hit
assert global_hit[0]["saturated_fat_100"]==1.4 and global_hit[0]["sugars_100"]==8.6,global_hit
assert any(x["source_id"]==global_hit[0]["source_id"] for x in
 app.prototype_food_preview("Йогурт перевірка CI",8)["items"])
assert any(x["name"]=="Йогурт перевірка CI" for x in
 app.prototype_food_search("Йогурт перевірка CI",8,1,"all")["items"])
try:app.trainer_food_review(candidate["id"],app.PrivateFoodReviewIn(
 decision="reject",note="Already approved"),trainer)
except HTTPException as e:assert e.status_code==409,e
else:raise AssertionError("Moderation decision was applied twice")
reject=app.create_private_food(app.PrivateFoodIn(
 name="Невідомі БЖВ CI",kcal_100=99,protein_100=5,
 fat_100=1,carbs_100=10,submit_for_review=True),client_user)["item"]
app.trainer_food_review(reject["id"],app.PrivateFoodReviewIn(
 decision="reject",note="No reliable label or source"),trainer)
assert not app._public_food_matches("Невідомі БЖВ CI",8)
# Save a filled meal as a reusable private recipe. Ingredient snapshots come
# from owned diary rows, never from a client-supplied nutrient payload.
recipe=app.create_saved_recipe(app.SavedRecipeCreateIn(
 name="Моя вечірня страва",day=day,meal="dinner"),client_user)
recipes=app.my_saved_recipes(client_user)["items"]
assert len(recipes)==1 and recipes[0]["id"]==recipe["id"]
assert len(recipes[0]["ingredients"])==1
assert recipes[0]["grams"]==100 and recipes[0]["kcal_100"]==365
try:app.log_saved_recipe(recipe["id"],app.SavedRecipeLogIn(
 day=day,meal="lunch",grams=100),other_user)
except HTTPException as e:assert e.status_code==404,e
else:raise AssertionError("Other client's private recipe was accessible")
logged=app.log_saved_recipe(recipe["id"],app.SavedRecipeLogIn(
 day=day,meal="breakfast",grams=100),client_user)["item"]
assert logged["kcal"]==365 and logged["source_id"]=="recipe:"+str(recipe["id"])
assert app.delete_saved_recipe(recipe["id"],client_user)["ok"] is True
assert any(x["id"]==logged["id"] for x in app.food_diary_get(day,client_user)["items"]),\
 "Deleting a recipe must not delete historical consumed diary records"
assert app.food_diary_delete(logged["id"],client_user)["ok"] is True
# Idempotent additive schema migration must preserve older and newly filled
# optional values, with no rewriting of saved diary or assigned plans.
app.init()
assert any(i["portion_unit"]=="g" for i in app.food_diary_get(day,client_user)["items"])
assert any(i["portion_unit"]=="ml" and i["portion_amount"]==125 for i in
           app.food_diary_get(day,client_user)["items"])
post=app.rows("SELECT saturated_fat_100,sugars_100 FROM nutrition_private_foods WHERE id=?",
              (private["id"],))[0]
assert float(post["saturated_fat_100"])==3.2 and float(post["sugars_100"])==1.2

try:app.FoodDiaryAddIn(
 day=day,meal="lunch",name="Invalid",grams=float("nan"),
 kcal_100=250,protein_100=10,fat_100=2,carbs_100=22)
except Exception:pass
else:raise AssertionError("NaN portion was accepted")
assert app.food_diary_delete(saved["id"],client_user)["ok"] is True
assert app.food_diary_delete(logged_drink["id"],client_user)["ok"] is True
empty=app.food_diary_get(day,client_user)
assert empty["active"] is True and empty["items"]==[] and empty["totals"]["kcal"]==0,empty
app.init()
assert app.food_diary_get(day,client_user)["active"] is True, "Idempotent schema startup unexpectedly removed diary-mode day"

print("NUTRITION POSTGRES: legacy migration, structured+text save, recipes, rollback, repeat init PASS")
