
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from datetime import date

app = FastAPI(title="Зроби себе зі мною")
BASE = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE/"static"), name="static")

clients = [
    {"id":1,"name":"Анна Коваленко","goal":"Набір м'язів","weight":61.0,"kcal":2340,"protein":145,"fat":68,"carbs":265,"status":"Активний"},
    {"id":2,"name":"Олексій Бондар","goal":"Рекомпозиція","weight":88.0,"kcal":2680,"protein":188,"fat":76,"carbs":310,"status":"Активний"},
    {"id":3,"name":"Сергій Мельник","goal":"Зниження жиру","weight":113.0,"kcal":2500,"protein":200,"fat":70,"carbs":260,"status":"Активний"},
]
results = [
    {"id":1,"client_id":1,"exercise":"Присідання","day":"2026-09-08","weight":70,"reps":8,"sets":3,"rir":2},
    {"id":2,"client_id":1,"exercise":"Присідання","day":"2026-09-15","weight":72.5,"reps":8,"sets":3,"rir":2},
    {"id":3,"client_id":1,"exercise":"Жим лежачи","day":"2026-09-08","weight":60,"reps":10,"sets":3,"rir":2},
    {"id":4,"client_id":1,"exercise":"Жим лежачи","day":"2026-09-15","weight":62.5,"reps":10,"sets":3,"rir":1},
]
nutrition = [
    {"id":1,"client_id":1,"day":"2026-09-19","kcal":2310,"protein":142,"fat":70,"carbs":260,"checked":False},
    {"id":2,"client_id":2,"day":"2026-09-19","kcal":2710,"protein":190,"fat":74,"carbs":315,"checked":True},
]
weights = {1:[["2026-08-20",62.4],["2026-09-01",61.8],["2026-09-15",61.0]],2:[["2026-08-20",89.1],["2026-09-15",88.0]],3:[["2026-08-20",115.2],["2026-09-15",113.0]]}

class Login(BaseModel):
    email:str
    password:str
class ResultIn(BaseModel):
    client_id:int
    exercise:str
    weight:float
    reps:int
    sets:int
    rir:int
class NutritionIn(BaseModel):
    client_id:int
    kcal:int
    protein:int
    fat:int
    carbs:int
class WeightIn(BaseModel):
    client_id:int
    weight:float

@app.get("/")
def home(): return FileResponse(BASE/"static"/"index.html")

@app.get("/health")
def health(): return {"status":"online"}

@app.post("/api/login")
def login(x:Login):
    if x.email=="trainer@demo.local" and x.password=="trainer123":
        return {"role":"trainer","name":"Михайло","client_id":None}
    if x.email=="anna@demo.local" and x.password=="client123":
        return {"role":"client","name":"Анна Коваленко","client_id":1}
    raise HTTPException(401,"Невірний email або пароль")

@app.get("/api/clients")
def get_clients(): return clients

@app.get("/api/client/{cid}")
def get_client(cid:int):
    c=next((x for x in clients if x["id"]==cid),None)
    if not c: raise HTTPException(404)
    return {"client":c,"results":[x for x in results if x["client_id"]==cid],
            "nutrition":[x for x in nutrition if x["client_id"]==cid],
            "weights":weights.get(cid,[])}

@app.post("/api/results")
def add_result(x:ResultIn):
    item={"id":len(results)+1,**x.model_dump(),"day":str(date.today())}
    results.append(item); return item

@app.post("/api/nutrition")
def add_nutrition(x:NutritionIn):
    item={"id":len(nutrition)+1,**x.model_dump(),"day":str(date.today()),"checked":False}
    nutrition.append(item); return item

@app.patch("/api/nutrition/{nid}/check")
def check_nutrition(nid:int):
    n=next((x for x in nutrition if x["id"]==nid),None)
    if not n: raise HTTPException(404)
    n["checked"]=True; return n

@app.post("/api/weight")
def add_weight(x:WeightIn):
    weights.setdefault(x.client_id,[]).append([str(date.today()),x.weight])
    for c in clients:
        if c["id"]==x.client_id: c["weight"]=x.weight
    return {"ok":True}
