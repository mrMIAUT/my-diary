from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from typing import List
import os, shutil
import psycopg
from psycopg.rows import dict_row
from datetime import date

BASE=Path(__file__).resolve().parent
DATABASE_URL=os.environ["DATABASE_URL"]
UPLOADS=BASE/"uploads"
UPLOADS.mkdir(exist_ok=True)

app=FastAPI(title="Зроби себе зі мною V3")
app.mount("/static",StaticFiles(directory=BASE/"static"),name="static")
app.mount("/uploads",StaticFiles(directory=UPLOADS),name="uploads")

def con():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)
def rows(q,p=()):
    with con() as c:return [dict(x) for x in c.execute(q.replace('?', '%s'),p).fetchall()]
def one(q,p=()):
    with con() as c:
        x=c.execute(q.replace('?', '%s'),p).fetchone(); return dict(x) if x else None
def run(q,p=()):
    sql=q.replace('?', '%s')
    with con() as c:
        if sql.lstrip().upper().startswith('INSERT INTO') and 'RETURNING' not in sql.upper():
            cur=c.execute(sql + ' RETURNING id',p)
            new_id=cur.fetchone()['id']
            c.commit()
            return new_id
        cur=c.execute(sql,p)
        c.commit()
        return None

def init():
    with con() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS clients(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE,password TEXT DEFAULT 'client123',goal TEXT,weight DOUBLE PRECISION,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,status TEXT DEFAULT 'Активний')""")
        c.execute("""CREATE TABLE IF NOT EXISTS program(id SERIAL PRIMARY KEY,client_id INTEGER,day_name TEXT,exercise TEXT,sets INTEGER,reps TEXT,target_rir INTEGER,sort INTEGER DEFAULT 0)""")
        c.execute("""CREATE TABLE IF NOT EXISTS results(id SERIAL PRIMARY KEY,client_id INTEGER,exercise TEXT,day TEXT,weight DOUBLE PRECISION,reps INTEGER,sets INTEGER,rir INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS result_sets(id SERIAL PRIMARY KEY,client_id INTEGER,program_id INTEGER,exercise TEXT,day TEXT,set_number INTEGER,weight DOUBLE PRECISION,reps INTEGER,rir INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS nutrition(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,checked INTEGER DEFAULT 0,screenshot TEXT)""")
        c.execute("""CREATE TABLE IF NOT EXISTS measurements(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,weight DOUBLE PRECISION,waist DOUBLE PRECISION,chest DOUBLE PRECISION,hips DOUBLE PRECISION)""")
        if c.execute("SELECT COUNT(*) AS n FROM clients").fetchone()["n"]==0:
            anna_id=c.execute("INSERT INTO clients(name,email,goal,weight,kcal,protein,fat,carbs) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",("Анна Коваленко","anna@demo.local","Набір м'язів",61,2340,145,68,265)).fetchone()["id"]
            with c.cursor() as cur:
                cur.executemany("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir,sort) VALUES(%s,%s,%s,%s,%s,%s,%s)",[(anna_id,"День A","Присідання",3,"8",2,1),(anna_id,"День A","Жим лежачи",3,"10",2,2),(anna_id,"День B","Румунська тяга",3,"8-10",2,1),(anna_id,"День B","Тяга верхнього блока",3,"10-12",2,2)])
            with c.cursor() as cur:
                cur.executemany("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(%s,%s,%s,%s,%s,%s,%s)",[(anna_id,"Присідання","2026-09-08",70,8,3,2),(anna_id,"Присідання","2026-09-15",72.5,8,3,2)])
            with c.cursor() as cur:
                cur.executemany("INSERT INTO measurements(client_id,day,weight,waist) VALUES(%s,%s,%s,%s)",[(anna_id,"2026-08-20",62.4,72),(anna_id,"2026-09-15",61,71)])
        c.commit()
init()

class Login(BaseModel): email:str; password:str
class ClientIn(BaseModel):
    name:str; email:str; password:str="client123"; goal:str=""; weight:float=0; kcal:int=0; protein:int=0; fat:int=0; carbs:int=0
class ProgramIn(BaseModel):
    client_id:int; day_name:str; exercise:str; sets:int=3; reps:str="8-12"; target_rir:int=2
class ResultIn(BaseModel):
    client_id:int; exercise:str; weight:float; reps:int; sets:int; rir:int
class SetIn(BaseModel):
    set_number:int; weight:float; reps:int; rir:int
class SetResultIn(BaseModel):
    client_id:int; program_id:int; exercise:str; sets:List[SetIn]
class NutIn(BaseModel):
    client_id:int; kcal:int; protein:int; fat:int; carbs:int
class MeasureIn(BaseModel):
    client_id:int; weight:float; waist:float=0; chest:float=0; hips:float=0

@app.get("/")
def home(): return FileResponse(BASE/"static"/"index.html")
@app.get("/health")
def health(): return {"status":"online","version":"V3","database":"postgresql"}

@app.post("/api/login")
def login(x:Login):
    if x.email=="trainer@demo.local" and x.password=="trainer123": return {"role":"trainer","name":"Михайло","client_id":None}
    u=one("SELECT * FROM clients WHERE email=? AND password=?",(x.email,x.password))
    if u:return {"role":"client","name":u["name"],"client_id":u["id"]}
    raise HTTPException(401,"Невірний email або пароль")

@app.get("/api/clients")
def clients(): return rows("SELECT * FROM clients ORDER BY id DESC")
@app.post("/api/clients")
def add_client(x:ClientIn):
    try:
        i=run("INSERT INTO clients(name,email,password,goal,weight,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?,?,?,?)",(x.name,x.email,x.password,x.goal,x.weight,x.kcal,x.protein,x.fat,x.carbs))
        if x.weight: run("INSERT INTO measurements(client_id,day,weight) VALUES(?,?,?)",(i,str(date.today()),x.weight))
        return one("SELECT * FROM clients WHERE id=?",(i,))
    except psycopg.errors.UniqueViolation: raise HTTPException(400,"Email вже використовується")
@app.delete("/api/clients/{cid}")
def del_client(cid:int):
    for t in ("program","results","result_sets","nutrition","measurements"): run(f"DELETE FROM {t} WHERE client_id=?",(cid,))
    run("DELETE FROM clients WHERE id=?",(cid,)); return {"ok":True}
@app.get("/api/client/{cid}")
def client(cid:int):
    c=one("SELECT * FROM clients WHERE id=?",(cid,))
    if not c: raise HTTPException(404)
    return {"client":c,
            "program":rows("SELECT * FROM program WHERE client_id=? ORDER BY day_name,sort,id",(cid,)),
            "results":rows("SELECT * FROM results WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),
            "result_sets":rows("SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number",(cid,)),
            "nutrition":rows("SELECT * FROM nutrition WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),
            "measurements":rows("SELECT * FROM measurements WHERE client_id=? ORDER BY day,id",(cid,))}
@app.post("/api/program")
def add_program(x:ProgramIn):
    i=run("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir) VALUES(?,?,?,?,?,?)",(x.client_id,x.day_name,x.exercise,x.sets,x.reps,x.target_rir)); return {"id":i}
@app.delete("/api/program/{pid}")
def del_program(pid:int): run("DELETE FROM program WHERE id=?",(pid,)); return {"ok":True}
@app.post("/api/results")
def add_result(x:ResultIn):
    i=run("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(?,?,?,?,?,?,?)",(x.client_id,x.exercise,str(date.today()),x.weight,x.reps,x.sets,x.rir)); return {"id":i}

@app.post("/api/result-sets")
def add_result_sets(x:SetResultIn):
    if not x.sets:
        raise HTTPException(400,"Додай хоча б один підхід")
    today=str(date.today())
    # Re-saving the same exercise on the same day replaces that exercise's set details.
    run("DELETE FROM result_sets WHERE client_id=? AND program_id=? AND day=?",(x.client_id,x.program_id,today))
    ids=[]
    for s in x.sets:
        ids.append(run("INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir) VALUES(?,?,?,?,?,?,?,?)",
                       (x.client_id,x.program_id,x.exercise,today,s.set_number,s.weight,s.reps,s.rir)))
    return {"ok":True,"ids":ids}

@app.post("/api/nutrition")
def add_nutrition(x:NutIn):
    i=run("INSERT INTO nutrition(client_id,day,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?)",(x.client_id,str(date.today()),x.kcal,x.protein,x.fat,x.carbs)); return {"id":i}
@app.patch("/api/nutrition/{nid}/check")
def check_nutrition(nid:int): run("UPDATE nutrition SET checked=1 WHERE id=?",(nid,)); return {"ok":True}
@app.post("/api/nutrition/{nid}/screenshot")
async def screenshot(nid:int,file:UploadFile=File(...)):
    ext=Path(file.filename or "image.jpg").suffix or ".jpg"; name=f"nutrition_{nid}_{int(__import__('time').time())}{ext}"
    with open(UPLOADS/name,"wb") as f: shutil.copyfileobj(file.file,f)
    run("UPDATE nutrition SET screenshot=? WHERE id=?",(name,nid)); return {"url":"/uploads/"+name}
@app.post("/api/measurements")
def measurement(x:MeasureIn):
    i=run("INSERT INTO measurements(client_id,day,weight,waist,chest,hips) VALUES(?,?,?,?,?,?)",(x.client_id,str(date.today()),x.weight,x.waist,x.chest,x.hips))
    run("UPDATE clients SET weight=? WHERE id=?",(x.weight,x.client_id)); return {"id":i}
