from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import sqlite3, os, shutil
from datetime import date

BASE=Path(__file__).resolve().parent
DB=BASE/"fitness.db"
UPLOADS=BASE/"uploads"
UPLOADS.mkdir(exist_ok=True)

app=FastAPI(title="Зроби себе зі мною V2")
app.mount("/static",StaticFiles(directory=BASE/"static"),name="static")
app.mount("/uploads",StaticFiles(directory=UPLOADS),name="uploads")

def con():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c
def rows(q,p=()):
    with con() as c:return [dict(x) for x in c.execute(q,p).fetchall()]
def one(q,p=()):
    with con() as c:
        x=c.execute(q,p).fetchone(); return dict(x) if x else None
def run(q,p=()):
    with con() as c:
        cur=c.execute(q,p); c.commit(); return cur.lastrowid

def init():
    with con() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE,password TEXT DEFAULT 'client123',goal TEXT,weight REAL,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,status TEXT DEFAULT 'Активний');
        CREATE TABLE IF NOT EXISTS program(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,day_name TEXT,exercise TEXT,sets INTEGER,reps TEXT,target_rir INTEGER,sort INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,exercise TEXT,day TEXT,weight REAL,reps INTEGER,sets INTEGER,rir INTEGER);
        CREATE TABLE IF NOT EXISTS nutrition(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,day TEXT,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,checked INTEGER DEFAULT 0,screenshot TEXT);
        CREATE TABLE IF NOT EXISTS measurements(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,day TEXT,weight REAL,waist REAL,chest REAL,hips REAL);
        """)
        if c.execute("SELECT COUNT(*) FROM clients").fetchone()[0]==0:
            c.execute("INSERT INTO clients(name,email,goal,weight,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?,?,?)",("Анна Коваленко","anna@demo.local","Набір м'язів",61,2340,145,68,265))
            c.executemany("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir,sort) VALUES(?,?,?,?,?,?,?)",[(1,"День A","Присідання",3,"8",2,1),(1,"День A","Жим лежачи",3,"10",2,2),(1,"День B","Румунська тяга",3,"8-10",2,1),(1,"День B","Тяга верхнього блока",3,"10-12",2,2)])
            c.executemany("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(?,?,?,?,?,?,?)",[(1,"Присідання","2026-09-08",70,8,3,2),(1,"Присідання","2026-09-15",72.5,8,3,2)])
            c.executemany("INSERT INTO measurements(client_id,day,weight,waist) VALUES(?,?,?,?)",[(1,"2026-08-20",62.4,72),(1,"2026-09-15",61,71)])
        c.commit()
init()

class Login(BaseModel): email:str; password:str
class ClientIn(BaseModel):
    name:str; email:str; password:str="client123"; goal:str=""; weight:float=0; kcal:int=0; protein:int=0; fat:int=0; carbs:int=0
class ProgramIn(BaseModel):
    client_id:int; day_name:str; exercise:str; sets:int=3; reps:str="8-12"; target_rir:int=2
class ResultIn(BaseModel):
    client_id:int; exercise:str; weight:float; reps:int; sets:int; rir:int
class NutIn(BaseModel):
    client_id:int; kcal:int; protein:int; fat:int; carbs:int
class MeasureIn(BaseModel):
    client_id:int; weight:float; waist:float=0; chest:float=0; hips:float=0

@app.get("/")
def home(): return FileResponse(BASE/"static"/"index.html")
@app.get("/health")
def health(): return {"status":"online","version":"V2"}

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
    except sqlite3.IntegrityError: raise HTTPException(400,"Email вже використовується")
@app.delete("/api/clients/{cid}")
def del_client(cid:int):
    for t in ("program","results","nutrition","measurements"): run(f"DELETE FROM {t} WHERE client_id=?",(cid,))
    run("DELETE FROM clients WHERE id=?",(cid,)); return {"ok":True}
@app.get("/api/client/{cid}")
def client(cid:int):
    c=one("SELECT * FROM clients WHERE id=?",(cid,))
    if not c: raise HTTPException(404)
    return {"client":c,"program":rows("SELECT * FROM program WHERE client_id=? ORDER BY day_name,sort,id",(cid,)),"results":rows("SELECT * FROM results WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),"nutrition":rows("SELECT * FROM nutrition WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),"measurements":rows("SELECT * FROM measurements WHERE client_id=? ORDER BY day,id",(cid,))}
@app.post("/api/program")
def add_program(x:ProgramIn):
    i=run("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir) VALUES(?,?,?,?,?,?)",(x.client_id,x.day_name,x.exercise,x.sets,x.reps,x.target_rir)); return {"id":i}
@app.delete("/api/program/{pid}")
def del_program(pid:int): run("DELETE FROM program WHERE id=?",(pid,)); return {"ok":True}
@app.post("/api/results")
def add_result(x:ResultIn):
    i=run("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(?,?,?,?,?,?,?)",(x.client_id,x.exercise,str(date.today()),x.weight,x.reps,x.sets,x.rir)); return {"id":i}
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
