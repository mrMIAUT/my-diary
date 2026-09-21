from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from typing import List
import os
import json, shutil, hashlib, hmac, secrets, urllib.request, urllib.error
import psycopg
from psycopg.rows import dict_row
from datetime import date, datetime, timedelta

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

def hash_password(password:str)->str:
    salt=secrets.token_hex(16)
    digest=hashlib.pbkdf2_hmac("sha256",password.encode(),bytes.fromhex(salt),200000).hex()
    return "pbkdf2$"+salt+"$"+digest

def check_password(password:str,stored:str)->bool:
    if not stored:return False
    if not stored.startswith("pbkdf2$"):
        return hmac.compare_digest(password,stored)
    try:
        _,salt,digest=stored.split("$",2)
        test=hashlib.pbkdf2_hmac("sha256",password.encode(),bytes.fromhex(salt),200000).hex()
        return hmac.compare_digest(test,digest)
    except Exception:return False

def client_state(cid:int):
    return one("SELECT id,status FROM clients WHERE id=?",(cid,))

def require_active_client(cid:int):
    c=client_state(cid)
    if not c: raise HTTPException(404,"Клієнта не знайдено")
    if c["status"]=="Видалений": raise HTTPException(403,"Доступ до акаунта закрито")
    if c["status"]=="Заморожений": raise HTTPException(403,"Акаунт заморожено. Доступний лише перегляд історії.")

def send_reset_email(email:str,link:str):
    key=os.getenv("RESEND_API_KEY","").strip()
    sender=os.getenv("RESET_FROM_EMAIL","Є ПЛАН <noreply@eplan.com.ua>").strip()
    if not key:return False
    data=json.dumps({"from":sender,"to":[email],"subject":"Доступ до Є ПЛАН",
                     "html":f"<h2>Є ПЛАН</h2><p>Щоб створити або відновити пароль до кабінету, відкрийте посилання:</p><p><a href='{link}'>Встановити пароль</a></p><p>Якщо ви не очікували цей лист, просто проігноруйте його.</p>"}).encode()
    req=urllib.request.Request("https://api.resend.com/emails",data=data,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json","Accept":"application/json","User-Agent":"eplan.com.ua/1.0"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            ok=200<=r.status<300
            print(f"RESEND: status={r.status} to={email}", flush=True)
            return ok
    except urllib.error.HTTPError as e:
        try:
            body=e.read().decode("utf-8",errors="replace")
        except Exception:
            body="<could not read response body>"
        print(f"RESEND ERROR to={email}: status={e.code} reason={e.reason} body={body}", flush=True)
        return False
    except Exception as e:
        print(f"RESEND ERROR to={email}: {type(e).__name__}: {e}", flush=True)
        return False

def init():
    with con() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS clients(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE,password TEXT DEFAULT 'client123',goal TEXT,weight DOUBLE PRECISION,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,meal_plan TEXT DEFAULT '',status TEXT DEFAULT 'Активний')""")
        c.execute("""CREATE TABLE IF NOT EXISTS program(id SERIAL PRIMARY KEY,client_id INTEGER,day_name TEXT,exercise TEXT,sets INTEGER,reps TEXT,target_rir INTEGER,sort INTEGER DEFAULT 0)""")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS superset_group TEXT DEFAULT ''")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS superset_order INTEGER DEFAULT 0")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS technique_url TEXT DEFAULT ''")
        c.execute("""CREATE TABLE IF NOT EXISTS results(id SERIAL PRIMARY KEY,client_id INTEGER,exercise TEXT,day TEXT,weight DOUBLE PRECISION,reps INTEGER,sets INTEGER,rir INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS result_sets(id SERIAL PRIMARY KEY,client_id INTEGER,program_id INTEGER,exercise TEXT,day TEXT,set_number INTEGER,weight DOUBLE PRECISION,reps INTEGER,rir INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS workout_sessions(id SERIAL PRIMARY KEY,client_id INTEGER,day_name TEXT,started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,finished_at TIMESTAMP,status TEXT DEFAULT 'training')""")
        c.execute("""CREATE TABLE IF NOT EXISTS nutrition(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,checked INTEGER DEFAULT 0,screenshot TEXT)""")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS meal_plan TEXT DEFAULT ''")
        c.execute("""CREATE TABLE IF NOT EXISTS measurements(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,weight DOUBLE PRECISION,waist DOUBLE PRECISION,chest DOUBLE PRECISION,hips DOUBLE PRECISION)""")

        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS trainer_reviewed BOOLEAN DEFAULT FALSE")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS trainer_comment TEXT DEFAULT ''")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS program_snapshot TEXT DEFAULT ''")
        c.execute("""CREATE TABLE IF NOT EXISTS notifications(
            id SERIAL PRIMARY KEY, client_id INTEGER, recipient TEXT, kind TEXT,
            message TEXT, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS password_resets(
            id SERIAL PRIMARY KEY, client_id INTEGER, token_hash TEXT UNIQUE,
            expires_at TIMESTAMP, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS trainer_auth(
            id INTEGER PRIMARY KEY, password TEXT NOT NULL
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,program_id INTEGER DEFAULT 0,exercise TEXT DEFAULT '',author TEXT,body TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
        c.execute("""CREATE TABLE IF NOT EXISTS cardio_log(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,cardio_type TEXT DEFAULT '',minutes INTEGER DEFAULT 0,speed DOUBLE PRECISION DEFAULT 0,incline DOUBLE PRECISION DEFAULT 0,steps INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(client_id,day))""")
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
class ClientStatusIn(BaseModel): status:str
class ResetRequestIn(BaseModel): email:str
class ResetConfirmIn(BaseModel): token:str; password:str
class ClientIn(BaseModel):
    name:str; email:str; password:str="client123"; goal:str=""; weight:float=0; kcal:int=0; protein:int=0; fat:int=0; carbs:int=0
class ProgramIn(BaseModel):
    client_id:int; day_name:str; exercise:str; sets:int=3; reps:str="8-12"; target_rir:int=2; superset_group:str=""; superset_order:int=0; technique_url:str=""
class CardioIn(BaseModel):
    client_id:int; day:str=""; cardio_type:str=""; minutes:int=0; speed:float=0; incline:float=0; steps:int=0
class ProgramOrderIn(BaseModel):
    client_id:int
    day_name:str
    ordered_ids:list[int]
class ResultIn(BaseModel):
    client_id:int; exercise:str; weight:float; reps:int; sets:int; rir:int
class SupersetIn(BaseModel):
    superset_group:str=""
class SetIn(BaseModel):
    set_number:int; weight:float; reps:int; rir:int
class SetResultIn(BaseModel):
    client_id:int; program_id:int; exercise:str; sets:List[SetIn]
class NutIn(BaseModel):
    client_id:int; kcal:int; protein:int; fat:int; carbs:int
class MeasureIn(BaseModel):
    client_id:int; weight:float; waist:float=0; chest:float=0; hips:float=0
class NutritionTargetIn(BaseModel):
    kcal:int=0; protein:int=0; fat:int=0; carbs:int=0; meal_plan:str=""
class WorkoutStartIn(BaseModel):
    client_id:int; day_name:str
class WorkoutReviewIn(BaseModel):
    comment:str=""
class NotificationReadIn(BaseModel):
    recipient:str
class CommentIn(BaseModel):
    client_id:int; day:str; program_id:int=0; exercise:str=""; author:str; body:str
class HistoricalNutritionIn(BaseModel):
    client_id:int; day:str; kcal:int; protein:int; fat:int; carbs:int
class HistoricalSetIn(BaseModel):
    program_id:int; exercise:str; set_number:int; weight:float; reps:int; rir:int
class HistoricalWorkoutIn(BaseModel):
    client_id:int; day:str; day_name:str; sets:List[HistoricalSetIn]

@app.get("/")
def home(): return FileResponse(BASE/"static"/"index.html")
@app.get("/health")
def health(): return {"status":"online","version":"V3","database":"postgresql"}

@app.get("/api/debug/resend")
def debug_resend(to:str=""):
    key=os.getenv("RESEND_API_KEY","").strip()
    sender=os.getenv("RESET_FROM_EMAIL","Є ПЛАН <noreply@eplan.com.ua>").strip()
    result={
        "resend_api_key_present": bool(key),
        "resend_api_key_prefix_ok": key.startswith("re_"),
        "from": sender,
        "to": to or None,
    }
    if not to:
        result["ok"]=False
        result["message"]="Додай ?to=email@example.com для тестового листа"
        return result
    if "@" not in to:
        raise HTTPException(400,"Некоректний email")
    test_link=os.getenv("APP_BASE_URL","").rstrip("/") or "https://eplan.com.ua"
    ok=send_reset_email(to,test_link+"/?debug=resend")
    result["ok"]=ok
    result["message"]="Тестовий лист передано в Resend" if ok else "Resend відхилив лист. Перевір Render Logs."
    return result


@app.post("/api/login")
def login(x:Login):
    trainer_email=os.getenv("TRAINER_EMAIL","trainer@demo.local")
    trainer_password=os.getenv("TRAINER_PASSWORD","trainer123")
    if x.email.lower()==trainer_email.lower():
        ta=one("SELECT password FROM trainer_auth WHERE id=1")
        valid=check_password(x.password,ta["password"]) if ta else hmac.compare_digest(x.password,trainer_password)
        if valid:
            return {"role":"trainer","name":"Михайло","client_id":None}
    u=one("SELECT * FROM clients WHERE LOWER(email)=LOWER(?)",(x.email,))
    if u and check_password(x.password,u["password"]):
        if u["status"]=="Видалений": raise HTTPException(403,"Цей акаунт видалено. Зверніться до тренера.")
        # migrate legacy plaintext password on successful login
        if not str(u["password"] or "").startswith("pbkdf2$"):
            run("UPDATE clients SET password=? WHERE id=?",(hash_password(x.password),u["id"]))
        return {"role":"client","name":u["name"],"client_id":u["id"],"status":u["status"]}
    raise HTTPException(401,"Невірний email або пароль")

@app.post("/api/password-reset/request")
def password_reset_request(x:ResetRequestIn):
    email=x.email.strip()
    trainer_email=os.getenv("TRAINER_EMAIL","trainer@demo.local").strip()
    u=one("SELECT * FROM clients WHERE LOWER(email)=LOWER(?)",(email,))
    target_id=None
    target_email=None
    if email.lower()==trainer_email.lower():
        target_id=0  # reserved id for trainer password reset
        target_email=trainer_email
    elif u and u["status"]!="Видалений":
        target_id=u["id"]
        target_email=u["email"]
    # Always return same response to avoid revealing registered emails.
    if target_id is not None:
        token=secrets.token_urlsafe(32)
        token_hash=hashlib.sha256(token.encode()).hexdigest()
        run("UPDATE password_resets SET used=TRUE WHERE client_id=? AND used=FALSE",(target_id,))
        run("INSERT INTO password_resets(client_id,token_hash,expires_at) VALUES(?,?,?)",
            (target_id,token_hash,datetime.utcnow()+timedelta(minutes=30)))
        base=os.getenv("APP_BASE_URL","").rstrip("/")
        if base:
            sent=send_reset_email(target_email,base+"/?reset="+token)
            print(f"PASSWORD RESET: email={target_email} sent={sent}", flush=True)
        else:
            print("PASSWORD RESET ERROR: APP_BASE_URL is empty", flush=True)
    return {"ok":True,"message":"Якщо така пошта зареєстрована, на неї надіслано посилання для відновлення пароля."}

@app.post("/api/password-reset/confirm")
def password_reset_confirm(x:ResetConfirmIn):
    if len(x.password)<8: raise HTTPException(400,"Пароль має містити щонайменше 8 символів")
    th=hashlib.sha256(x.token.encode()).hexdigest()
    r=one("SELECT * FROM password_resets WHERE token_hash=? AND used=FALSE",(th,))
    if not r or r["expires_at"]<datetime.utcnow(): raise HTTPException(400,"Посилання недійсне або вже прострочене")
    if r["client_id"]==0:
        run("INSERT INTO trainer_auth(id,password) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET password=EXCLUDED.password",(hash_password(x.password),))
    else:
        c=one("SELECT * FROM clients WHERE id=?",(r["client_id"],))
        if not c or c["status"]=="Видалений": raise HTTPException(403,"Доступ до акаунта закрито")
        run("UPDATE clients SET password=? WHERE id=?",(hash_password(x.password),r["client_id"]))
    run("UPDATE password_resets SET used=TRUE WHERE id=?",(r["id"],))
    return {"ok":True}

@app.get("/api/clients")
def clients():
    return rows("""SELECT c.*, CASE WHEN EXISTS(
        SELECT 1 FROM workout_sessions w WHERE w.client_id=c.id AND w.status='training'
    ) THEN 'Тренується' ELSE c.status END AS live_status
    FROM clients c WHERE c.status<>'Видалений' ORDER BY c.id DESC""")
@app.post("/api/clients")
def add_client(x:ClientIn):
    email=x.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]: raise HTTPException(400,"Вкажи коректний email")
    # Trainer creates the client by real email. The client sets their own password from the invitation.
    initial_password=secrets.token_urlsafe(32)
    try:
        i=run("INSERT INTO clients(name,email,password,goal,weight,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?,?,?,?)",(x.name.strip(),email,hash_password(initial_password),x.goal,x.weight,x.kcal,x.protein,x.fat,x.carbs))
        if x.weight: run("INSERT INTO measurements(client_id,day,weight) VALUES(?,?,?)",(i,str(date.today()),x.weight))
        token=secrets.token_urlsafe(32)
        token_hash=hashlib.sha256(token.encode()).hexdigest()
        run("INSERT INTO password_resets(client_id,token_hash,expires_at) VALUES(?,?,?)",(i,token_hash,datetime.utcnow()+timedelta(hours=24)))
        base=os.getenv("APP_BASE_URL","").rstrip("/")
        sent=False
        if base:
            sent=send_reset_email(email,base+"/?reset="+token)
        c=one("SELECT * FROM clients WHERE id=?",(i,))
        return {"client":c,"invite_sent":sent}
    except psycopg.errors.UniqueViolation: raise HTTPException(400,"Email вже використовується")

@app.patch("/api/clients/{cid}/status")
def set_client_status(cid:int,x:ClientStatusIn):
    if x.status not in ("Активний","Заморожений","Видалений"): raise HTTPException(400,"Невірний статус")
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    run("UPDATE clients SET status=? WHERE id=?",(x.status,cid))
    if x.status!="Активний":
        run("UPDATE workout_sessions SET status='finished',finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP) WHERE client_id=? AND status='training'",(cid,))
    return {"ok":True,"status":x.status}

@app.delete("/api/clients/{cid}")
def del_client(cid:int):
    # Soft delete preserves training/nutrition history but closes account access.
    run("UPDATE clients SET status='Видалений' WHERE id=?",(cid,))
    run("UPDATE workout_sessions SET status='finished',finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP) WHERE client_id=? AND status='training'",(cid,))
    return {"ok":True}
@app.get("/api/client/{cid}")
def client(cid:int):
    c=one("SELECT * FROM clients WHERE id=?",(cid,))
    if not c: raise HTTPException(404)
    return {"client":c,
            "program":rows("SELECT * FROM program WHERE client_id=? ORDER BY day_name,sort,id",(cid,)),
            "results":rows("SELECT * FROM results WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),
            "result_sets":rows("SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number",(cid,)),
            "nutrition":rows("SELECT * FROM nutrition WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),
            "measurements":rows("SELECT * FROM measurements WHERE client_id=? ORDER BY day,id",(cid,)),
            "workout_sessions":rows("SELECT * FROM workout_sessions WHERE client_id=? ORDER BY id DESC",(cid,)),
            "comments":rows("SELECT * FROM comments WHERE client_id=? ORDER BY created_at DESC,id DESC",(cid,)),
            "cardio":rows("SELECT * FROM cardio_log WHERE client_id=? ORDER BY day DESC,id DESC",(cid,))}
@app.patch("/api/client/{cid}/nutrition")
def update_client_nutrition(cid:int,x:NutritionTargetIn):
    if not one("SELECT id FROM clients WHERE id=?",(cid,)):
        raise HTTPException(404,"Клієнта не знайдено")
    run("UPDATE clients SET kcal=?,protein=?,fat=?,carbs=?,meal_plan=? WHERE id=?",(x.kcal,x.protein,x.fat,x.carbs,x.meal_plan,cid))
    return one("SELECT * FROM clients WHERE id=?",(cid,))

@app.post("/api/cardio")
def save_cardio(x:CardioIn):
    require_active_client(x.client_id)
    d=x.day.strip() or str(date.today())
    if d>str(date.today()): raise HTTPException(400,"Майбутню дату заповнювати не можна")
    if x.cardio_type not in ("","Доріжка","Орбітрек","Велосипед"): raise HTTPException(400,"Невідомий тип кардіо")
    old=one("SELECT id FROM cardio_log WHERE client_id=? AND day=?",(x.client_id,d))
    vals=(x.cardio_type,max(0,x.minutes),max(0,x.speed),max(0,x.incline),max(0,x.steps))
    if old: run("UPDATE cardio_log SET cardio_type=?,minutes=?,speed=?,incline=?,steps=? WHERE id=?",vals+(old["id"],))
    else: run("INSERT INTO cardio_log(client_id,day,cardio_type,minutes,speed,incline,steps) VALUES(?,?,?,?,?,?,?)",(x.client_id,d)+vals)
    run("INSERT INTO notifications(client_id,recipient,kind,message) VALUES(?,?,?,?)",(x.client_id,"trainer","cardio","Клієнт оновив кардіо та активність за "+d))
    return {"ok":True}

@app.post("/api/program")
def add_program(x:ProgramIn):
    i=run("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url) VALUES(?,?,?,?,?,?,?,?,?)",(x.client_id,x.day_name,x.exercise,x.sets,x.reps,x.target_rir,x.superset_group,x.superset_order,x.technique_url.strip())); return {"id":i}
@app.put("/api/program/{pid}")
def edit_program(pid:int,x:ProgramIn):
    p=one("SELECT * FROM program WHERE id=?",(pid,))
    if not p: raise HTTPException(404,"Вправу не знайдено")
    run("""UPDATE program SET day_name=?,exercise=?,sets=?,reps=?,target_rir=?,technique_url=?
           WHERE id=?""",(x.day_name.strip(),x.exercise.strip(),x.sets,x.reps.strip(),x.target_rir,x.technique_url.strip(),pid))
    return {"ok":True}

@app.post("/api/program/reorder")
def reorder_program(x:ProgramOrderIn):
    current=rows("SELECT id FROM program WHERE client_id=? AND day_name=? ORDER BY id",(x.client_id,x.day_name))
    current_ids={r["id"] for r in current}
    ordered=[int(i) for i in x.ordered_ids]
    if len(ordered)!=len(set(ordered)) or set(ordered)!=current_ids:
        raise HTTPException(400,"Некоректний порядок вправ")
    with con() as c:
        for pos,item_id in enumerate(ordered,1):
            c.execute("UPDATE program SET sort=%s WHERE id=%s AND client_id=%s",(pos,item_id,x.client_id))
        c.commit()
    return {"ok":True}

@app.patch("/api/program/{pid}/superset")
def set_superset(pid:int,x:SupersetIn):
    run("UPDATE program SET superset_group=? WHERE id=?",(x.superset_group,pid))
    return {"ok":True}

@app.delete("/api/program/{pid}")
def del_program(pid:int): run("DELETE FROM program WHERE id=?",(pid,)); return {"ok":True}
@app.post("/api/results")
def add_result(x:ResultIn):
    i=run("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(?,?,?,?,?,?,?)",(x.client_id,x.exercise,str(date.today()),x.weight,x.reps,x.sets,x.rir)); return {"id":i}

@app.post("/api/result-sets")
def add_result_sets(x:SetResultIn):
    require_active_client(x.client_id)
    if not x.sets:
        raise HTTPException(400,"Додай хоча б один підхід")
    today=str(date.today())
    # A completed exercise is locked in the UI. Explicit editing re-saves and replaces today's sets.
    run("DELETE FROM result_sets WHERE client_id=? AND program_id=? AND day=?",(x.client_id,x.program_id,today))
    ids=[]
    for s in x.sets:
        ids.append(run("INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir) VALUES(?,?,?,?,?,?,?,?)",
                       (x.client_id,x.program_id,x.exercise,today,s.set_number,s.weight,s.reps,s.rir)))
    return {"ok":True,"ids":ids}

@app.get("/api/result-sets/{cid}")
def result_set_history(cid:int):
    return rows("SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number",(cid,))

@app.post("/api/workout/start")
def start_workout(x:WorkoutStartIn):
    require_active_client(x.client_id)
    today=str(date.today())
    active=one("SELECT * FROM workout_sessions WHERE client_id=? AND status='training' ORDER BY id DESC LIMIT 1",(x.client_id,))
    if active:return active
    existing=one("SELECT * FROM workout_sessions WHERE client_id=? AND CAST(started_at AS DATE)=? ORDER BY id DESC LIMIT 1",(x.client_id,today))
    if existing:
        raise HTTPException(400,"Сьогодні тренування вже було розпочато. Нове тренування буде доступне завтра.")
    snapshot=json.dumps(rows("SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url FROM program WHERE client_id=? AND day_name=? ORDER BY id",(x.client_id,x.day_name)),ensure_ascii=False)
    i=run("INSERT INTO workout_sessions(client_id,day_name,status,program_snapshot) VALUES(?,?,?,?)",(x.client_id,x.day_name,"training",snapshot))
    return one("SELECT * FROM workout_sessions WHERE id=?",(i,))

@app.post("/api/workout/{sid}/finish")
def finish_workout(sid:int):
    run("UPDATE workout_sessions SET status='finished',finished_at=CURRENT_TIMESTAMP WHERE id=?",(sid,))
    return one("SELECT * FROM workout_sessions WHERE id=?",(sid,))

@app.post("/api/history/nutrition")
def historical_nutrition(x:HistoricalNutritionIn):
    require_active_client(x.client_id)
    if x.day > str(date.today()):
        raise HTTPException(400,"Не можна додавати дані на майбутню дату")
    existing=one("SELECT id FROM nutrition WHERE client_id=? AND day=? ORDER BY id DESC LIMIT 1",(x.client_id,x.day))
    if existing:
        run("UPDATE nutrition SET kcal=?,protein=?,fat=?,carbs=? WHERE id=?",(x.kcal,x.protein,x.fat,x.carbs,existing["id"]))
        return one("SELECT * FROM nutrition WHERE id=?",(existing["id"],))
    i=run("INSERT INTO nutrition(client_id,day,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?)",(x.client_id,x.day,x.kcal,x.protein,x.fat,x.carbs))
    return one("SELECT * FROM nutrition WHERE id=?",(i,))

@app.post("/api/history/workout")
def historical_workout(x:HistoricalWorkoutIn):
    require_active_client(x.client_id)
    if x.day > str(date.today()):
        raise HTTPException(400,"Не можна додавати тренування на майбутню дату")
    existing=one("SELECT id FROM workout_sessions WHERE client_id=? AND CAST(started_at AS DATE)=? ORDER BY id DESC LIMIT 1",(x.client_id,x.day))
    if existing:
        raise HTTPException(400,"Тренування за цей день уже записано")
    for s in x.sets:
        run("INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir) VALUES(?,?,?,?,?,?,?,?)",
            (x.client_id,s.program_id,s.exercise,x.day,s.set_number,s.weight,s.reps,s.rir))
    # Noon avoids timezone/date rollover ambiguity for historical display.
    snapshot=json.dumps(rows("SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order FROM program WHERE client_id=? AND day_name=? ORDER BY id",(x.client_id,x.day_name)),ensure_ascii=False)
    run("INSERT INTO workout_sessions(client_id,day_name,started_at,finished_at,status,program_snapshot) VALUES(?,?,CAST(? AS TIMESTAMP),CAST(? AS TIMESTAMP),'finished',?)",
        (x.client_id,x.day_name,x.day+" 12:00:00",x.day+" 13:00:00",snapshot))
    return {"ok":True}

@app.post("/api/comments")
def add_comment(x:CommentIn):
    if not x.body.strip(): raise HTTPException(400,"Коментар порожній")
    i=run("INSERT INTO comments(client_id,day,program_id,exercise,author,body) VALUES(?,?,?,?,?,?)",
          (x.client_id,x.day,x.program_id,x.exercise,x.author,x.body.strip()))
    recipient="client" if x.author=="trainer" else "trainer"
    who="Тренер" if x.author=="trainer" else "Клієнт"
    target=(" до вправи «"+x.exercise+"»") if x.exercise else " до тренування"
    comment_text=(x.body or "").strip()
    message=who+" залишив коментар"+target+((": "+comment_text) if comment_text else "")
    run("INSERT INTO notifications(client_id,recipient,kind,message) VALUES(?,?,?,?)",(x.client_id,recipient,"comment",message))
    return one("SELECT * FROM comments WHERE id=?",(i,))

@app.patch("/api/workout/{sid}/review")
def review_workout(sid:int,x:WorkoutReviewIn):
    s=one("SELECT * FROM workout_sessions WHERE id=?",(sid,))
    if not s: raise HTTPException(404,"Тренування не знайдено")
    run("UPDATE workout_sessions SET trainer_reviewed=TRUE,trainer_comment=? WHERE id=?",(x.comment.strip(),sid))
    run("INSERT INTO notifications(client_id,recipient,kind,message) VALUES(?,?,?,?)",
        (s["client_id"],"client","workout_review","Тренер перевірив тренування "+s["day_name"]))
    return {"ok":True}

@app.get("/api/notifications/{cid}")
def get_notifications(cid:int,recipient:str):
    return rows("SELECT * FROM notifications WHERE client_id=? AND recipient=? ORDER BY created_at DESC,id DESC LIMIT 50",(cid,recipient))

@app.patch("/api/notifications/item/{nid}/read")
def read_notification_item(nid:int):
    n=one("SELECT * FROM notifications WHERE id=?",(nid,))
    if not n: raise HTTPException(404,"Сповіщення не знайдено")
    run("UPDATE notifications SET is_read=TRUE WHERE id=?",(nid,))
    return {"ok":True}

@app.patch("/api/notifications/{cid}/read")
def read_notifications(cid:int,x:NotificationReadIn):
    run("UPDATE notifications SET is_read=TRUE WHERE client_id=? AND recipient=?",(cid,x.recipient))
    return {"ok":True}

@app.post("/api/nutrition")
def add_nutrition(x:NutIn):
    require_active_client(x.client_id)
    i=run("INSERT INTO nutrition(client_id,day,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?)",(x.client_id,str(date.today()),x.kcal,x.protein,x.fat,x.carbs)); return {"id":i}
@app.patch("/api/nutrition/{nid}")
def edit_nutrition(nid:int,x:NutIn):
    if not one("SELECT id FROM nutrition WHERE id=?",(nid,)):
        raise HTTPException(404,"Запис не знайдено")
    run("UPDATE nutrition SET kcal=?,protein=?,fat=?,carbs=? WHERE id=?",(x.kcal,x.protein,x.fat,x.carbs,nid))
    return one("SELECT * FROM nutrition WHERE id=?",(nid,))

@app.patch("/api/nutrition/{nid}/check")
def check_nutrition(nid:int): run("UPDATE nutrition SET checked=1 WHERE id=?",(nid,)); return {"ok":True}
@app.post("/api/nutrition/{nid}/screenshot")
async def screenshot(nid:int,file:UploadFile=File(...)):
    ext=Path(file.filename or "image.jpg").suffix or ".jpg"; name=f"nutrition_{nid}_{int(__import__('time').time())}{ext}"
    with open(UPLOADS/name,"wb") as f: shutil.copyfileobj(file.file,f)
    run("UPDATE nutrition SET screenshot=? WHERE id=?",(name,nid)); return {"url":"/uploads/"+name}
@app.post("/api/measurements")
def measurement(x:MeasureIn):
    require_active_client(x.client_id)
    i=run("INSERT INTO measurements(client_id,day,weight,waist,chest,hips) VALUES(?,?,?,?,?,?)",(x.client_id,str(date.today()),x.weight,x.waist,x.chest,x.hips))
    run("UPDATE clients SET weight=? WHERE id=?",(x.weight,x.client_id)); return {"id":i}

@app.delete("/api/comments/{comment_id}")
def delete_comment(comment_id:int):
    comment=one("SELECT * FROM comments WHERE id=?",(comment_id,))
    if not comment: raise HTTPException(404,"Коментар не знайдено")
    run("DELETE FROM comments WHERE id=?",(comment_id,))
    return {"ok":True}
