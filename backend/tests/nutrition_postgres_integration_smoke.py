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
assert saved["protein"]==10.6 and saved["carbs"]==120,saved
snapshot=app.rows("SELECT content,foods_json,variant_number FROM nutrition_plan_items WHERE client_id=? ORDER BY variant_number",(client,))
overview=app.food_diary_overview(30,client_user)
assert len(overview["days"])==1 and overview["days"][0]["kcal"]==547.5,overview
assert app.food_diary_get(day,client_user)["active"] is True
assert len(app.food_diary_get(day,client_user)["items"])==1
assert app.rows("SELECT * FROM nutrition WHERE client_id=?",(client,))==[], "Diary must never silently change legacy hand-entered daily BJU"
assert app.rows("SELECT content,foods_json,variant_number FROM nutrition_plan_items WHERE client_id=? ORDER BY variant_number",(client,))==snapshot, "Diary write must not alter assigned nutrition plan"
changed=app.food_diary_edit(saved["id"],app.FoodDiaryEditIn(meal="dinner",grams=100),client_user)["item"]
assert changed["meal"]=="dinner" and changed["kcal"]==365 and changed["grams"]==100,changed
other_user=app.AuthUser(role="client",user_id=client+1000,client_id=client+1000,
 session_id=0,expires_at=datetime.now(timezone.utc),name="Other")
try:app.food_diary_edit(saved["id"],app.FoodDiaryEditIn(meal="lunch",grams=200),other_user)
except HTTPException as e:assert e.status_code==404,e
else:raise AssertionError("Cross-client diary mutation was allowed")
try:app.food_diary_delete(saved["id"],other_user)
except HTTPException as e:assert e.status_code==404,e
else:raise AssertionError("Cross-client diary deletion was allowed")
try:app.FoodDiaryAddIn(
 day=day,meal="lunch",name="Invalid",grams=float("nan"),
 kcal_100=250,protein_100=10,fat_100=2,carbs_100=22)
except Exception:pass
else:raise AssertionError("NaN portion was accepted")
assert app.food_diary_delete(saved["id"],client_user)["ok"] is True
empty=app.food_diary_get(day,client_user)
assert empty["active"] is True and empty["items"]==[] and empty["totals"]["kcal"]==0,empty
app.init()
assert app.food_diary_get(day,client_user)["active"] is True, "Idempotent schema startup unexpectedly removed diary-mode day"

print("NUTRITION POSTGRES: legacy migration, structured+text save, recipes, rollback, repeat init PASS")
