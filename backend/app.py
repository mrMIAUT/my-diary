from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Response, Depends
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.staticfiles import StaticFiles
from starlette.formparsers import MultiPartException
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from pathlib import Path
from typing import List
import os
import json, hashlib, hmac, secrets, urllib.request, urllib.error
import io, logging, stat, warnings
import psycopg
from psycopg.rows import dict_row
from datetime import date, datetime, timedelta, timezone
from dataclasses import dataclass
from zoneinfo import ZoneInfo
import base64
try:
    from pywebpush import webpush, WebPushException
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
except Exception:
    webpush=None; WebPushException=Exception; ec=None; serialization=None

BASE=Path(__file__).resolve().parent
DATABASE_URL=os.environ["DATABASE_URL"]
UPLOADS=BASE/"uploads"
UPLOADS.mkdir(exist_ok=True)

# H04 limits apply to this image flow only, including legacy image reads.
SCREENSHOT_MAX_BYTES=10*1024*1024
SCREENSHOT_BODY_MAX_BYTES=SCREENSHOT_MAX_BYTES+64*1024  # Multipart overhead.
SCREENSHOT_MAX_PIXELS=16_000_000
SCREENSHOT_MAX_EDGE=8192
SCREENSHOT_FORMATS={"JPEG":"image/jpeg","PNG":"image/png","WEBP":"image/webp"}
Image.MAX_IMAGE_PIXELS=SCREENSHOT_MAX_PIXELS
warnings.filterwarnings("error",category=Image.DecompressionBombWarning)

class ScreenshotBodyLimit:
    """Bound raw upload bytes before FastAPI's multipart spool, even chunked.

    MultiPartException also asks older Starlette parsers to close partial
    temporary files. Normalize that parser's 400 to the intended 413.
    Authentication/ownership still run in the existing C01 dependencies.
    """
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        parts=scope.get("path","").rstrip("/").split("/")
        if not (scope["type"]=="http" and scope["method"]=="POST" and
                len(parts)==5 and parts[1:3]==["api","nutrition"] and parts[4]=="screenshot"):
            return await self.app(scope,receive,send)
        error=JSONResponse({"detail":"Зображення завелике. Максимум 10 MiB."},status_code=413)
        for key,value in scope.get("headers",[]):
            if key.lower()==b"content-length":
                try:too_large=int(value)>SCREENSHOT_BODY_MAX_BYTES
                except ValueError:too_large=False
                if too_large:return await error(scope,receive,send)
        total=0;exceeded=False;replied=False
        async def limited_receive():
            nonlocal total,exceeded
            message=await receive()
            if message["type"]=="http.request":
                total+=len(message.get("body",b""))
                if total>SCREENSHOT_BODY_MAX_BYTES:
                    exceeded=True
                    raise MultiPartException("Screenshot body limit exceeded")
            return message
        async def limited_send(message):
            nonlocal replied
            if exceeded:
                if not replied:
                    replied=True
                    await error(scope,receive,send)
                return
            await send(message)
        await self.app(scope,limited_receive,limited_send)

class ScreenshotBuffer(io.BytesIO):
    """The re-encoded representation has the same hard byte ceiling."""
    def write(self,data):
        if self.tell()+len(data)>SCREENSHOT_MAX_BYTES:
            raise HTTPException(413,"Зображення завелике після обробки. Максимум 10 MiB.")
        return super().write(data)

def read_screenshot_bytes(stream):
    data=bytearray()
    while True:
        chunk=stream.read(min(64*1024,SCREENSHOT_MAX_BYTES+1-len(data)))
        if not chunk:break
        data.extend(chunk)
        if len(data)>SCREENSHOT_MAX_BYTES:
            raise HTTPException(413,"Зображення завелике. Максимум 10 MiB.")
    if not data:raise HTTPException(400,"Файл зображення порожній")
    return bytes(data)

def normalize_screenshot(data,content_type=None):
    """Only decoded pixels leave this function; never original file bytes.

    Filename/extension are deliberately not inputs. MIME is an extra upload
    consistency check, not proof of format. None is used for legacy disk reads.
    """
    if content_type is not None and content_type not in SCREENSHOT_FORMATS.values():
        raise HTTPException(415,"Підтримуються лише JPEG, PNG та статичний WebP")
    try:
        with Image.open(io.BytesIO(data),formats=list(SCREENSHOT_FORMATS)) as probe:
            fmt=probe.format
            if content_type is not None and SCREENSHOT_FORMATS[fmt]!=content_type:
                raise HTTPException(415,"Тип файлу не відповідає вмісту зображення")
            w,h=probe.size
            if w*h>SCREENSHOT_MAX_PIXELS or max(w,h)>SCREENSHOT_MAX_EDGE:
                raise HTTPException(413,"Зображення перевищує 16 MP або 8192 пікселі по стороні")
            if getattr(probe,"n_frames",1)!=1:
                raise HTTPException(415,"Анімовані зображення не підтримуються")
            probe.verify()
        with Image.open(io.BytesIO(data),formats=[fmt]) as decoded:
            decoded.load()  # verify() alone does not decode pixels.
            ImageOps.exif_transpose(decoded,in_place=True)
            alpha="A" in decoded.getbands() or "transparency" in decoded.info
            mode="RGBA" if alpha else "RGB"
            out_format="PNG" if fmt=="PNG" or alpha else "JPEG"
            # A fresh pixel-only image prevents inherited EXIF/XMP/text/ICC,
            # comments, appended content or original container data escaping.
            with decoded.convert(mode) as pixels, Image.new(mode,decoded.size) as clean:
                clean.paste(pixels)
                with ScreenshotBuffer() as encoded:
                    clean.save(encoded,format=out_format,**({"quality":90} if out_format=="JPEG" else {}))
                    result=encoded.getvalue()
        return result,SCREENSHOT_FORMATS[out_format],(".png" if out_format=="PNG" else ".jpg")
    except (Image.DecompressionBombWarning,Image.DecompressionBombError):
        raise HTTPException(413,"Зображення перевищує допустиму кількість пікселів") from None
    except UnidentifiedImageError:
        raise HTTPException(415,"Файл не є допустимим JPEG, PNG або WebP") from None
    except (OSError,ValueError,SyntaxError):
        raise HTTPException(400,"Зображення пошкоджене або не може бути прочитане") from None

# V93 C01: one trainer per installation, as in V92 (trainer_auth.id=1).
SESSION_COOKIE="__Host-eplan_session"
SESSION_TTL_SECONDS=7*24*60*60
PUBLIC_API_ROUTES={
    ("POST","/api/login"), ("POST","/api/logout"),
    ("POST","/api/password-reset/request"), ("POST","/api/password-reset/confirm"),
    ("GET","/api/push/public-key"),
}

def api_session_boundary(request:Request):
    """Private API is authenticated by default, including future API routes.

    The non-simple header is a cookie-auth CSRF prerequisite. There is no
    cross-origin CORS grant in this same-origin application. It is not a secret
    or proof of identity: every private request still needs a valid session.
    """
    path=request.url.path.rstrip("/")
    if not path.startswith("/api/"): return
    if request.method not in ("GET","HEAD","OPTIONS") or path=="/api/debug/resend":
        if request.headers.get("X-EPLAN-Request")!="1":
            raise HTTPException(403,"Запит має надходити із застосунку Є ПЛАН")
        if request.headers.get("Sec-Fetch-Site") in ("cross-site","same-site"):
            raise HTTPException(403,"Міжсайтовий запит заборонено")
    if (request.method,path) not in PUBLIC_API_ROUTES:
        user=current_user(request)
        expected=request.headers.get("X-EPLAN-Actor")
        # An optional frontend/queue precondition may only narrow access. It
        # cannot authenticate a caller or grant the identity named in it.
        if expected and expected!=f"{user.role}:{user.user_id}":
            raise HTTPException(401,"Акаунт змінився. Увійдіть знову")

app=FastAPI(title="Зроби себе зі мною V3",dependencies=[Depends(api_session_boundary)])
app.add_middleware(ScreenshotBodyLimit)
app.mount("/static",StaticFiles(directory=BASE/"static"),name="static")

@app.exception_handler(RequestValidationError)
async def api_validation_error(request:Request,exc:RequestValidationError):
    if not request.url.path.startswith("/api/"):
        return await request_validation_exception_handler(request,exc)
    # H01: validation errors can otherwise echo the whole request, including
    # a password/reset token/push credential. Keep diagnostics, never inputs.
    details=[{key:error[key] for key in ("type","loc","msg") if key in error}
             for error in exc.errors()]
    return JSONResponse(status_code=422,content={"detail":details})

KYIV_TZ=ZoneInfo("Europe/Kyiv")
def kyiv_today():
    return datetime.now(KYIV_TZ).date()

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

def is_password_hash(stored)->bool:
    # H05: the existing PBKDF2-SHA256 format (16-byte salt, 32-byte digest).
    if not isinstance(stored,str):return False
    parts=stored.split("$")
    return (len(parts)==3 and parts[0]=="pbkdf2" and len(parts[1])==32 and len(parts[2])==64
            and all(ch in "0123456789abcdefABCDEF" for ch in parts[1])
            and all(ch in "0123456789abcdef" for ch in parts[2]))

def check_password(password:str,stored:str)->bool:
    # Runtime credentials must already be hashes; only init() migrates legacy rows.
    if not is_password_hash(stored):return False
    try:
        _,salt,digest=stored.split("$")
        test=hashlib.pbkdf2_hmac("sha256",password.encode(),bytes.fromhex(salt),200000).hex()
        return hmac.compare_digest(test,digest)
    except Exception:return False

def configured_trainer_email()->str:
    email=os.getenv("TRAINER_EMAIL","").strip()
    if email.count("@")!=1 or not all(email.split("@")) or any(ch.isspace() for ch in email):
        raise RuntimeError("H05 configuration error: set a valid TRAINER_EMAIL before startup")
    return email

def migrate_password_value(stored)->str:
    if is_password_hash(stored):return stored
    # Empty/malformed hashes cannot authenticate; password reset can recover them.
    if not isinstance(stored,str) or not stored or stored.startswith("pbkdf2$"):return ""
    return hash_password(stored)

def migrate_credentials(c):
    # Runs within init()'s transaction, after its table locks/DDL. Do not commit here.
    trainers=c.execute("SELECT id,password FROM trainer_auth ORDER BY id FOR UPDATE").fetchall()
    if not any(row["id"]==1 for row in trainers):
        bootstrap=os.getenv("TRAINER_PASSWORD","")
        if not bootstrap:
            raise RuntimeError("H05 configuration error: TRAINER_PASSWORD is required to bootstrap missing trainer_auth")
    try:
        if not any(row["id"]==1 for row in trainers):
            c.execute("INSERT INTO trainer_auth(id,password) VALUES(1,%s)",(hash_password(bootstrap),))
        for table,records in (("trainer_auth",trainers),
                              ("clients",c.execute("SELECT id,password FROM clients ORDER BY id FOR UPDATE").fetchall())):
            for row in records:
                migrated=migrate_password_value(row["password"])
                if migrated!=row["password"]:
                    c.execute("UPDATE "+table+" SET password=%s WHERE id=%s",(migrated,row["id"]))
    except Exception:
        # Never include credentials or database error details in startup diagnostics.
        raise RuntimeError("H05 credential migration failed; startup aborted and transaction will be rolled back") from None

PLAN_FEATURES={
 "coaching":{"workouts":True,"nutrition":True,"measurements":True,"cardio":True,"trainer_review":True,"meal_plan":True},
 "workout_plan":{"workouts":True,"nutrition":False,"measurements":True,"cardio":True,"trainer_review":False,"meal_plan":False},
 "workout_nutrition":{"workouts":True,"nutrition":True,"measurements":True,"cardio":True,"trainer_review":False,"meal_plan":True},
 "self":{"workouts":True,"nutrition":False,"measurements":True,"cardio":True,"trainer_review":False,"meal_plan":False},
 "free":{"workouts":False,"nutrition":False,"measurements":False,"cardio":False,"trainer_review":False,"meal_plan":False}}
PLAN_NAMES={"coaching":"Онлайн-ведення","workout_plan":"План тренувань","workout_nutrition":"План тренувань + План харчування","self":"Самостійно","free":"Free"}

def client_state(cid:int):
    return one("SELECT id,status,plan_code,access_until FROM clients WHERE id=?",(cid,))

def access_info(c:dict):
    code=str(c.get("plan_code") or "coaching")
    if code not in PLAN_FEATURES: code="coaching"
    until=c.get("access_until"); expired=False; days_left=None
    if until:
        try:
            ud=until if isinstance(until,date) else date.fromisoformat(str(until)[:10])
            days_left=(ud-kyiv_today()).days; expired=days_left<0
        except Exception: pass
    frozen=c.get("status")=="Заморожений"
    effective="free" if expired or frozen else code
    return {"plan_code":code,"plan_name":PLAN_NAMES[code],"effective_plan":effective,
      "access_until":str(until)[:10] if until else "","expired":expired,"manually_frozen":frozen,
      "days_left":days_left,"features":PLAN_FEATURES[effective]}

def require_active_client(cid:int,feature:str|None=None):
    c=client_state(cid)
    if not c: raise HTTPException(404,"Клієнта не знайдено")
    if c["status"]=="Видалений": raise HTTPException(403,"Доступ до акаунта закрито")
    a=access_info(c)
    if a["manually_frozen"]: raise HTTPException(403,"Акаунт заморожено. Доступний лише перегляд історії.")
    if a["expired"]: raise HTTPException(403,"Термін доступу закінчився. Історія збережена у режимі перегляду.")
    if feature and not a["features"].get(feature,False): raise HTTPException(403,"Ця функція недоступна у вашому тарифі.")
    return a

def send_telegram(text:str):
    token=os.getenv("TELEGRAM_BOT_TOKEN","").strip()
    chat_id=os.getenv("TELEGRAM_CHAT_ID","").strip()
    if not token or not chat_id:
        print("TELEGRAM: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is empty", flush=True)
        return False
    data=json.dumps({
        "chat_id":chat_id,
        "text":text
    },ensure_ascii=False).encode("utf-8")
    req=urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=data,
        headers={"Content-Type":"application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            ok=200<=r.status<300
            print(f"TELEGRAM: status={r.status}", flush=True)
            return ok
    except Exception as e:
        print(f"TELEGRAM ERROR: {type(e).__name__}: {e}", flush=True)
        return False

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
    configured_trainer_email()
    with con() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS clients(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE,password TEXT,goal TEXT,weight DOUBLE PRECISION,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,meal_plan TEXT DEFAULT '',status TEXT DEFAULT 'Активний')""")
        c.execute("ALTER TABLE clients ALTER COLUMN password DROP DEFAULT")
        c.execute("""CREATE TABLE IF NOT EXISTS program(id SERIAL PRIMARY KEY,client_id INTEGER,day_name TEXT,exercise TEXT,sets INTEGER,reps TEXT,target_rir INTEGER,sort INTEGER DEFAULT 0)""")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS superset_group TEXT DEFAULT ''")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS superset_order INTEGER DEFAULT 0")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS technique_url TEXT DEFAULT ''")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS rest_seconds INTEGER DEFAULT 0")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS rest_text TEXT DEFAULT ''")
        c.execute("""CREATE TABLE IF NOT EXISTS exercise_groups(
            id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort INTEGER DEFAULT 0
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS exercise_library(
            id SERIAL PRIMARY KEY, group_id INTEGER NOT NULL, name TEXT NOT NULL,
            technique_url TEXT DEFAULT '', UNIQUE(group_id,name)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS muscles(
            id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort INTEGER DEFAULT 0
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS exercise_muscles(
            exercise_id INTEGER NOT NULL, muscle_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'primary',
            PRIMARY KEY(exercise_id,muscle_id)
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_exercise_muscles_muscle ON exercise_muscles(muscle_id)")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS rir_by_set TEXT DEFAULT ''")
        c.execute("ALTER TABLE program ADD COLUMN IF NOT EXISTS alternatives_json TEXT DEFAULT '[]'")
        c.execute("""CREATE TABLE IF NOT EXISTS program_days(
            client_id INTEGER NOT NULL,
            day_name TEXT NOT NULL,
            title TEXT DEFAULT '',
            PRIMARY KEY(client_id,day_name)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS results(id SERIAL PRIMARY KEY,client_id INTEGER,exercise TEXT,day TEXT,weight DOUBLE PRECISION,reps INTEGER,sets INTEGER,rir INTEGER)""")
        c.execute("""CREATE TABLE IF NOT EXISTS result_sets(id SERIAL PRIMARY KEY,client_id INTEGER,program_id INTEGER,exercise TEXT,day TEXT,set_number INTEGER,weight DOUBLE PRECISION,reps INTEGER,rir INTEGER)""")
        # A program exercise can have only one saved value for a given set number on a given day.
        # Clean legacy duplicate rows first, then prevent them from being created again.
        c.execute("""DELETE FROM result_sets a USING result_sets b
                     WHERE a.id>b.id
                       AND a.client_id=b.client_id
                       AND a.program_id=b.program_id
                       AND a.day=b.day
                       AND a.set_number=b.set_number""")
        c.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_result_sets_client_program_day_set
                     ON result_sets(client_id,program_id,day,set_number)""")
        c.execute("""CREATE TABLE IF NOT EXISTS workout_sessions(id SERIAL PRIMARY KEY,client_id INTEGER,day_name TEXT,started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,finished_at TIMESTAMP,status TEXT DEFAULT 'training')""")
        c.execute("""CREATE TABLE IF NOT EXISTS nutrition(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,kcal INTEGER,protein INTEGER,fat INTEGER,carbs INTEGER,checked INTEGER DEFAULT 0,screenshot TEXT)""")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS meal_plan TEXT DEFAULT ''")
        c.execute("""CREATE TABLE IF NOT EXISTS nutrition_plan_items(
            id SERIAL PRIMARY KEY, client_id INTEGER, meal_number INTEGER, variant_number INTEGER,
            content TEXT DEFAULT '', sort INTEGER DEFAULT 0
        )""")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 0")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS sex TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS contraindications TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS injuries TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan_code TEXT DEFAULT 'coaching'")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS access_until DATE")
        c.execute("UPDATE clients SET plan_code='coaching' WHERE plan_code IS NULL OR plan_code=''")

        c.execute("""CREATE TABLE IF NOT EXISTS measurements(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,weight DOUBLE PRECISION,waist DOUBLE PRECISION,chest DOUBLE PRECISION,hips DOUBLE PRECISION)""")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS thighs DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS arms DOUBLE PRECISION DEFAULT 0")

        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS trainer_reviewed BOOLEAN DEFAULT FALSE")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS trainer_comment TEXT DEFAULT ''")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS program_snapshot TEXT DEFAULT ''")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS workout_day DATE")
        # Legacy live sessions used PostgreSQL CURRENT_TIMESTAMP in a timezone-naive column (UTC wall time).
        # Convert that timestamp to the Kyiv calendar day once; manual daytime history remains on the same date.
        c.execute("""UPDATE workout_sessions SET workout_day=((started_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kyiv')::date WHERE workout_day IS NULL AND started_at IS NOT NULL""")
        c.execute("""CREATE TABLE IF NOT EXISTS notifications(
            id SERIAL PRIMARY KEY, client_id INTEGER, recipient TEXT, kind TEXT,
            message TEXT, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_tab TEXT DEFAULT ''")
        c.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_day TEXT DEFAULT ''")
        c.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_program_id INTEGER DEFAULT 0")
        c.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_session_id INTEGER DEFAULT 0")
        c.execute("""UPDATE notifications n SET target_day=s.workout_day::text FROM workout_sessions s WHERE n.target_session_id=s.id AND s.workout_day IS NOT NULL AND COALESCE(n.target_day,'')<>s.workout_day::text""")
        c.execute("""CREATE TABLE IF NOT EXISTS push_subscriptions(
            id SERIAL PRIMARY KEY, client_id INTEGER DEFAULT 0, recipient TEXT,
            endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS app_settings(
            key TEXT PRIMARY KEY, value TEXT
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS password_resets(
            id SERIAL PRIMARY KEY, client_id INTEGER, token_hash TEXT UNIQUE,
            expires_at TIMESTAMP, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS trainer_auth(
            id INTEGER PRIMARY KEY, password TEXT NOT NULL
        )""")
        # Additive C01 migration. No V92 account/data tables are rewritten.
        c.execute("""CREATE TABLE IF NOT EXISTS auth_sessions(
            id BIGSERIAL PRIMARY KEY,
            token_hash TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL CHECK(role IN ('trainer','client')),
            user_id INTEGER NOT NULL,
            client_id INTEGER REFERENCES clients(id),
            credential_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            CHECK((role='trainer' AND user_id=1 AND client_id IS NULL)
               OR (role='client' AND client_id IS NOT NULL AND user_id=client_id))
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_auth_sessions_user ON auth_sessions(role,user_id)")
        c.execute("""CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,program_id INTEGER DEFAULT 0,exercise TEXT DEFAULT '',author TEXT,body TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
        c.execute("""CREATE TABLE IF NOT EXISTS cardio_log(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,cardio_type TEXT DEFAULT '',minutes INTEGER DEFAULT 0,speed DOUBLE PRECISION DEFAULT 0,incline DOUBLE PRECISION DEFAULT 0,steps INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(client_id,day))""")
        migrate_credentials(c)
        c.commit()
init()

def password_input_schema(schema:dict):
    # Compatibility-only input: add_client() uses its own random initial secret.
    # Keep the H01 write-only schema and omit the unused default from OpenAPI.
    schema.pop("default",None)
    schema["writeOnly"]=True

class Login(BaseModel): email:str; password:str
class ClientStatusIn(BaseModel): status:str
class ClientAccessIn(BaseModel):
    plan_code:str="coaching"; access_until:str="" 
class ResetRequestIn(BaseModel): email:str
class ResetConfirmIn(BaseModel): token:str; password:str
class ClientIn(BaseModel):
    name:str; email:str; password:str=Field(default="",json_schema_extra=password_input_schema); goal:str=""; weight:float=0; kcal:int=0; protein:int=0; fat:int=0; carbs:int=0
class ProgramIn(BaseModel):
    client_id:int; day_name:str; exercise:str; sets:int=3; reps:str="8-12"; target_rir:int=2; superset_group:str=""; superset_order:int=0; technique_url:str=""; rest_seconds:int=0; rest_text:str=""; rir_by_set:str=""; alternatives_json:str="[]"
class ExerciseGroupIn(BaseModel): name:str
class MuscleIn(BaseModel): name:str
class ExerciseLibraryIn(BaseModel):
    group_id:int; name:str; technique_url:str=""; primary_muscle_ids:List[int]=[]; secondary_muscle_ids:List[int]=[]
class CardioIn(BaseModel):
    client_id:int; day:str=""; cardio_type:str=""; minutes:int=0; speed:float=0; incline:float=0; steps:int=0
class ProgramOrderIn(BaseModel):
    client_id:int
    day_name:str
    ordered_ids:list[int]
class ProgramDayTitleIn(BaseModel):
    client_id:int
    day_name:str
    title:str=""
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
    client_id:int; weight:float=0; waist:float=0; chest:float=0; hips:float=0; thighs:float=0; arms:float=0
class ClientProfileIn(BaseModel):
    first_name:str=""; last_name:str=""; age:int=0; sex:str=""; contraindications:str=""; injuries:str=""; contact:str=""; instagram:str=""; telegram:str=""; tiktok:str=""
class NutritionPlanItemIn(BaseModel):
    meal_number:int; variant_number:int=1; content:str=""; sort:int=0
class NutritionTargetIn(BaseModel):
    kcal:int=0; protein:int=0; fat:int=0; carbs:int=0; meal_plan:str=""; meals:List[NutritionPlanItemIn]=[]
class WorkoutStartIn(BaseModel):
    client_id:int; day_name:str
class WorkoutReviewIn(BaseModel):
    comment:str=""
class NotificationReadIn(BaseModel):
    recipient:str
class PushSubscriptionIn(BaseModel):
    client_id:int=0
    recipient:str
    endpoint:str
    p256dh:str
    auth:str
class CommentIn(BaseModel):
    client_id:int; day:str; program_id:int=0; exercise:str=""; author:str; body:str
class HistoricalNutritionIn(BaseModel):
    client_id:int; day:str; kcal:int; protein:int; fat:int; carbs:int
class HistoricalSetIn(BaseModel):
    program_id:int; exercise:str; set_number:int; weight:float; reps:int; rir:int
class HistoricalWorkoutIn(BaseModel):
    client_id:int; day:str; day_name:str; sets:List[HistoricalSetIn]

@dataclass(frozen=True)
class AuthUser:
    role:str
    user_id:int
    client_id:int|None
    session_id:int
    expires_at:datetime
    name:str
    status:str=""

def trainer_credential():
    row=one("SELECT password FROM trainer_auth WHERE id=1")
    return row["password"] if row else ""

def credential_fingerprint(role:str,credential:str):
    # Invalidate sessions on password/config changes, even if a login overlaps
    # a reset. This does not change V92 password hashing or reset-token logic.
    account=configured_trainer_email().lower() if role=="trainer" else ""
    return hashlib.sha256((role+"\0"+account+"\0"+str(credential)).encode()).hexdigest()

def cookie_token_hash(request:Request):
    token=request.cookies.get(SESSION_COOKIE,"")
    if len(token)!=43 or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in token):
        return None
    return hashlib.sha256(token.encode()).hexdigest()

def current_user(request:Request):
    cached=getattr(request.state,"auth_user",None)
    if cached is not None:return cached
    th=cookie_token_hash(request)
    s=one("SELECT * FROM auth_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP",(th,)) if th else None
    if not s:raise HTTPException(401,"Увійдіть у свій акаунт")
    if s["role"]=="trainer" and s["user_id"]==1 and s["client_id"] is None:
        credential=trainer_credential();name="Михайло";status=""
    elif s["role"]=="client" and s["client_id"]==s["user_id"]:
        c=one("SELECT id,name,password,status FROM clients WHERE id=?",(s["client_id"],))
        if not c or c["status"]=="Видалений":raise HTTPException(401,"Увійдіть у свій акаунт")
        credential=c["password"];name=c["name"];status=c["status"]
    else:raise HTTPException(401,"Увійдіть у свій акаунт")
    if not hmac.compare_digest(s["credential_hash"],credential_fingerprint(s["role"],credential)):
        raise HTTPException(401,"Увійдіть у свій акаунт")
    user=AuthUser(s["role"],s["user_id"],s["client_id"],s["id"],s["expires_at"],name,status)
    request.state.auth_user=user
    return user

def require_trainer(user:AuthUser=Depends(current_user)):
    if user.role!="trainer":raise HTTPException(403,"Ця дія доступна лише тренеру")
    return user

def require_client(user:AuthUser=Depends(current_user)):
    if user.role!="client":raise HTTPException(403,"Ця дія доступна у кабінеті клієнта")
    return user

def authorize_client(user:AuthUser,cid:int):
    if user.role=="client" and user.client_id!=cid:
        raise HTTPException(403,"Немає доступу до даних цього клієнта")
    # V92 has no other trainer accounts or trainer_id relationship: every row
    # belongs to the single trainer of this installation. Do not infer tenants.
    c=client_state(cid)
    if not c:raise HTTPException(404,"Клієнта не знайдено")
    return c

def owned_record(user:AuthUser,table:str,object_id:int):
    # Table names are a closed internal mapping, never values from a request.
    queries={
        "program":"SELECT * FROM program WHERE id=?",
        "nutrition":"SELECT * FROM nutrition WHERE id=?",
        "comments":"SELECT * FROM comments WHERE id=?",
        "notifications":"SELECT * FROM notifications WHERE id=?",
    }
    rec=one(queries[table],(object_id,))
    if not rec:raise HTTPException(404,"Запис не знайдено")
    authorize_client(user,rec["client_id"])
    return rec

def authorize_program(user:AuthUser,pid:int,cid:int):
    authorize_client(user,cid)
    p=one("SELECT id,client_id FROM program WHERE id=?",(pid,))
    if p:
        if p["client_id"]!=cid:raise HTTPException(403,"Вправа належить іншому клієнту")
        return
    if one("SELECT id FROM result_sets WHERE client_id=? AND program_id=? LIMIT 1",(cid,pid)):return
    # V92 active/history workouts retain a server-created program snapshot.
    # A removed exercise may still be saved from its owner's snapshot.
    for s in rows("SELECT program_snapshot FROM workout_sessions WHERE client_id=?",(cid,)):
        try:snapshot=json.loads(s["program_snapshot"] or "[]")
        except (TypeError,ValueError):continue
        if isinstance(snapshot,list) and any(isinstance(p,dict) and p.get("id")==pid for p in snapshot):return
    raise HTTPException(404,"Вправу не знайдено у програмі клієнта")

def authorize_recipient(user:AuthUser,cid:int,recipient:str):
    if recipient!=user.role:raise HTTPException(403,"Немає доступу до цих сповіщень")
    authorize_client(user,cid)

def session_payload(user:AuthUser):
    result={"role":user.role,"name":user.name,"client_id":user.client_id,
            "user_id":user.user_id,"session_expires_at":user.expires_at.isoformat(),"auth_version":93}
    if user.role=="client":result["status"]=user.status
    return result

def revoke_cookie_session(request:Request):
    th=cookie_token_hash(request)
    if th:run("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=? AND revoked_at IS NULL",(th,))

def revoke_user_sessions(role:str,user_id:int):
    run("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE role=? AND user_id=? AND revoked_at IS NULL",(role,user_id))

def create_session(request:Request,response:Response,role:str,credential:str,client:dict|None=None):
    # Always issue a fresh random credential; never upgrade a supplied token.
    revoke_cookie_session(request)
    token=secrets.token_urlsafe(32)
    expires=datetime.now(timezone.utc)+timedelta(seconds=SESSION_TTL_SECONDS)
    uid=client["id"] if client else 1
    cid=client["id"] if client else None
    sid=run("INSERT INTO auth_sessions(token_hash,role,user_id,client_id,credential_hash,expires_at) VALUES(?,?,?,?,?,?)",
            (hashlib.sha256(token.encode()).hexdigest(),role,uid,cid,credential_fingerprint(role,credential),expires))
    response.set_cookie(SESSION_COOKIE,token,max_age=SESSION_TTL_SECONDS,expires=expires,
                        path="/",secure=True,httponly=True,samesite="strict")
    response.headers["Cache-Control"]="no-store"
    return session_payload(AuthUser(role,uid,cid,sid,expires,client["name"] if client else "Михайло",client["status"] if client else ""))

@app.get("/api/session")
def session_info(response:Response,user:AuthUser=Depends(current_user)):
    response.headers["Cache-Control"]="no-store"
    return session_payload(user)

@app.post("/api/logout")
def logout_session(request:Request,response:Response):
    # Idempotent even for expired/unknown cookies, so a client can always exit.
    revoke_cookie_session(request)
    response.delete_cookie(SESSION_COOKIE,path="/",secure=True,httponly=True,samesite="strict")
    response.headers["Cache-Control"]="no-store"
    return {"ok":True}

@app.api_route("/uploads/{filename:path}",methods=["GET","HEAD"])
def private_upload(filename:str,request:Request,user:AuthUser=Depends(current_user)):
    if not filename or Path(filename).name!=filename or "\\" in filename:
        raise HTTPException(404,"Файл не знайдено")
    rec=one("SELECT client_id FROM nutrition WHERE screenshot=?",(filename,))
    if not rec:raise HTTPException(404,"Файл не знайдено")
    authorize_client(user,rec["client_id"])
    file=UPLOADS/filename
    try:
        if file.is_symlink():raise HTTPException(404,"Файл не знайдено")
        fd=os.open(file,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0)|getattr(os,"O_NONBLOCK",0))
        with os.fdopen(fd,"rb") as source:
            if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                raise HTTPException(404,"Файл не знайдено")
            data=read_screenshot_bytes(source)
    except (OSError,ValueError):
        raise HTTPException(404,"Файл не знайдено") from None
    # Revalidate even a new-looking name: old rows/files are not proof of safety.
    # Legacy originals remain untouched; only a clean raster is served.
    content,media_type,extension=normalize_screenshot(data)
    return Response(content=b"" if request.method=="HEAD" else content,media_type=media_type,headers={
        "Content-Length":str(len(content)),"X-Content-Type-Options":"nosniff",
        "Content-Disposition":'inline; filename="nutrition'+extension+'"',
        "Cache-Control":"private, no-store"
    })

def _app_index():
    return FileResponse(BASE/"static"/"index.html", headers={
        "Cache-Control":"no-store, no-cache, must-revalidate",
        "Pragma":"no-cache", "Expires":"0"
    })

@app.get("/")
def home(): return _app_index()

@app.get("/app")
def pwa_app(): return _app_index()

@app.get("/pwa-reset")
def pwa_reset():
    return HTMLResponse(r"""<!doctype html><html lang="uk"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080909"><title>Є ПЛАН · PWA RESET</title>
<style>body{margin:0;background:#080909;color:#f4f4f5;font:16px system-ui,-apple-system;padding:32px}main{max-width:620px;margin:10vh auto;border:2px solid #ffd000;border-radius:24px;padding:24px}.y{color:#ffd000}pre{white-space:pre-wrap;color:#aaa}button{width:100%;padding:16px;border:0;border-radius:14px;background:#ffd000;color:#080909;font-weight:800;font-size:17px}</style></head><body><main><h1><span class="y">Є ПЛАН</span> · RESET</h1><p id="status">Очищаю стару PWA-конфігурацію…</p><pre id="log"></pre><button id="go" hidden>Відкрити чистий застосунок</button></main>
<script>
(async()=>{const log=document.getElementById('log'),status=document.getElementById('status'),go=document.getElementById('go');const say=x=>log.textContent+=x+'\n';
try{if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();say('Service workers: '+regs.length);for(const r of regs){say('unregister '+r.scope+' → '+await r.unregister())}}else say('Service Worker API: unavailable');}catch(e){say('SW error: '+e)}
try{if('caches'in window){const keys=await caches.keys();say('Caches: '+keys.length);for(const k of keys){say('delete '+k+' → '+await caches.delete(k))}}}catch(e){say('Cache error: '+e)}
status.textContent='Готово. Старі Service Worker та кеші очищено.';go.hidden=false;go.onclick=()=>location.replace('/app?clean=57');
})();</script></body></html>""",headers={"Cache-Control":"no-store, no-cache, must-revalidate","Clear-Site-Data":"\"cache\""})

@app.get("/sw.js")
def service_worker(): return FileResponse(BASE/"static"/"sw.js",media_type="application/javascript",headers={"Service-Worker-Allowed":"/","Cache-Control":"no-cache"})
@app.get("/manifest.webmanifest")
def web_manifest(): return FileResponse(BASE/"static"/"manifest.webmanifest",media_type="application/manifest+json")
@app.get("/health")
def health(): return {"status":"online","version":"V3","database":"postgresql"}

@app.get("/api/debug/resend")
def debug_resend(to:str="",user:AuthUser=Depends(require_trainer)):
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
def login(x:Login,request:Request,response:Response):
    if x.email.lower()==configured_trainer_email().lower():
        credential=trainer_credential()
        if check_password(x.password,credential):
            return create_session(request,response,"trainer",credential)
    u=one("SELECT * FROM clients WHERE LOWER(email)=LOWER(?)",(x.email,))
    if u and check_password(x.password,u["password"]):
        if u["status"]=="Видалений": raise HTTPException(403,"Цей акаунт видалено. Зверніться до тренера.")
        return create_session(request,response,"client",u["password"],u)
    raise HTTPException(401,"Невірний email або пароль")

@app.post("/api/password-reset/request")
def password_reset_request(x:ResetRequestIn):
    email=x.email.strip()
    trainer_email=configured_trainer_email()
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
def password_reset_confirm(x:ResetConfirmIn,request:Request,response:Response):
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
    revoke_user_sessions("trainer" if r["client_id"]==0 else "client",1 if r["client_id"]==0 else r["client_id"])
    revoke_cookie_session(request)
    response.delete_cookie(SESSION_COOKIE,path="/",secure=True,httponly=True,samesite="strict")
    response.headers["Cache-Control"]="no-store"
    return {"ok":True}

# H01: explicit response allowlist. Do not sanitize rows()/one() globally:
# authentication/reset still need credential columns internally. New DB columns
# are private until deliberately added here; existing business values/types stay
# unchanged, including optional NULLs and endpoint-specific derived fields.
CLIENT_RESPONSE_FIELDS=(
    "id","name","email","goal","weight","kcal","protein","fat","carbs",
    "meal_plan","status","first_name","last_name","age","sex",
    "contraindications","injuries","contact","instagram","telegram","tiktok",
    "plan_code","access_until","access","live_status","needs_review_count",
    "finished_workout_count","last_finished_at","review_state",
)

def client_response(record:dict|None):
    if record is None:return None
    return {key:record[key] for key in CLIENT_RESPONSE_FIELDS if key in record}

@app.get("/api/clients")
def clients(user:AuthUser=Depends(require_trainer)):
    xs=rows("""SELECT c.*, CASE WHEN EXISTS(
        SELECT 1 FROM workout_sessions w WHERE w.client_id=c.id AND w.status='training'
    ) THEN 'Тренується' ELSE c.status END AS live_status
    FROM clients c WHERE c.status<>'Видалений' ORDER BY c.id DESC""")
    for c in xs:
        c["access"]=access_info(c)
        review=one("""SELECT
            COUNT(*) FILTER (WHERE status='finished' AND COALESCE(trainer_reviewed,FALSE)=FALSE) AS needs_review_count,
            COUNT(*) FILTER (WHERE status='finished') AS finished_count,
            MAX(finished_at) FILTER (WHERE status='finished') AS last_finished_at
            FROM workout_sessions WHERE client_id=?""",(c["id"],)) or {}
        c["needs_review_count"]=int(review.get("needs_review_count") or 0)
        c["finished_workout_count"]=int(review.get("finished_count") or 0)
        c["last_finished_at"]=review.get("last_finished_at")
        c["review_state"]="needs_review" if c["needs_review_count"]>0 else ("reviewed" if c["finished_workout_count"]>0 else "none")
    return [client_response(c) for c in xs]
@app.post("/api/clients")
def add_client(x:ClientIn,user:AuthUser=Depends(require_trainer)):
    email=x.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]: raise HTTPException(400,"Вкажи коректний email")
    # Trainer creates the client by real email. The client sets their own password from the invitation.
    initial_password=secrets.token_urlsafe(32)
    try:
        i=run("INSERT INTO clients(name,email,password,goal,weight,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?,?,?,?)",(x.name.strip(),email,hash_password(initial_password),x.goal,x.weight,x.kcal,x.protein,x.fat,x.carbs))
        if x.weight: run("INSERT INTO measurements(client_id,day,weight) VALUES(?,?,?)",(i,str(kyiv_today()),x.weight))
        token=secrets.token_urlsafe(32)
        token_hash=hashlib.sha256(token.encode()).hexdigest()
        run("INSERT INTO password_resets(client_id,token_hash,expires_at) VALUES(?,?,?)",(i,token_hash,datetime.utcnow()+timedelta(hours=24)))
        base=os.getenv("APP_BASE_URL","").rstrip("/")
        sent=False
        if base:
            sent=send_reset_email(email,base+"/?reset="+token)
        c=one("SELECT * FROM clients WHERE id=?",(i,))
        return {"client":client_response(c),"invite_sent":sent}
    except psycopg.errors.UniqueViolation: raise HTTPException(400,"Email вже використовується")

@app.patch("/api/clients/{cid}/status")
def set_client_status(cid:int,x:ClientStatusIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    if x.status not in ("Активний","Заморожений","Видалений"): raise HTTPException(400,"Невірний статус")
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    run("UPDATE clients SET status=? WHERE id=?",(x.status,cid))
    if x.status=="Видалений":revoke_user_sessions("client",cid)
    if x.status!="Активний":
        run("UPDATE workout_sessions SET status='finished',finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP) WHERE client_id=? AND status='training'",(cid,))
    return {"ok":True,"status":x.status}

@app.patch("/api/clients/{cid}/access")
def set_client_access(cid:int,x:ClientAccessIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    if x.plan_code not in PLAN_FEATURES: raise HTTPException(400,"Невідомий тариф")
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    until=None
    if x.access_until.strip():
        try: until=date.fromisoformat(x.access_until.strip())
        except Exception: raise HTTPException(400,"Некоректна дата доступу")
    run("UPDATE clients SET plan_code=?,access_until=?,status=CASE WHEN status='Видалений' THEN status ELSE 'Активний' END WHERE id=?",(x.plan_code,until,cid))
    return {"ok":True,"access":access_info(one("SELECT * FROM clients WHERE id=?",(cid,)))}

@app.delete("/api/clients/{cid}")
def del_client(cid:int,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    # Soft delete preserves training/nutrition history but closes account access.
    run("UPDATE clients SET status='Видалений' WHERE id=?",(cid,))
    revoke_user_sessions("client",cid)
    run("UPDATE workout_sessions SET status='finished',finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP) WHERE client_id=? AND status='training'",(cid,))
    return {"ok":True}
@app.get("/api/client/{cid}")
def client(cid:int,user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    c=one("SELECT * FROM clients WHERE id=?",(cid,))
    if not c: raise HTTPException(404)
    c["access"]=access_info(c)
    return {"client":client_response(c),
            "program":rows("SELECT * FROM program WHERE client_id=? ORDER BY day_name,sort,id",(cid,)),
            "program_days":rows("SELECT * FROM program_days WHERE client_id=? ORDER BY day_name",(cid,)),
            "results":rows("SELECT * FROM results WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),
            "result_sets":rows("SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number",(cid,)),
            "nutrition":rows("SELECT * FROM nutrition WHERE client_id=? ORDER BY day DESC,id DESC",(cid,)),
            "nutrition_plan":rows("SELECT * FROM nutrition_plan_items WHERE client_id=? ORDER BY meal_number,variant_number,sort,id",(cid,)),
            "measurements":rows("SELECT * FROM measurements WHERE client_id=? ORDER BY day,id",(cid,)),
            "workout_sessions":rows("SELECT * FROM workout_sessions WHERE client_id=? ORDER BY id DESC",(cid,)),
            "comments":rows("SELECT * FROM comments WHERE client_id=? ORDER BY created_at DESC,id DESC",(cid,)),
            "cardio":rows("SELECT * FROM cardio_log WHERE client_id=? ORDER BY day DESC,id DESC",(cid,))}
@app.patch("/api/client/{cid}/profile")
def update_client_profile(cid:int,x:ClientProfileIn,user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    display=(x.first_name.strip()+" "+x.last_name.strip()).strip()
    run("UPDATE clients SET first_name=?,last_name=?,age=?,sex=?,contraindications=?,injuries=?,contact=?,instagram=?,telegram=?,tiktok=?,name=CASE WHEN ?<>'' THEN ? ELSE name END WHERE id=?",(x.first_name.strip(),x.last_name.strip(),max(0,x.age),x.sex.strip(),x.contraindications.strip(),x.injuries.strip(),x.contact.strip(),x.instagram.strip(),x.telegram.strip(),x.tiktok.strip(),display,display,cid))
    return client_response(one("SELECT * FROM clients WHERE id=?",(cid,)))

@app.patch("/api/client/{cid}/nutrition")
def update_client_nutrition(cid:int,x:NutritionTargetIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    if not one("SELECT id FROM clients WHERE id=?",(cid,)):
        raise HTTPException(404,"Клієнта не знайдено")
    legacy=x.meal_plan.strip()
    if x.meals:
        parts=[]
        for item in x.meals:
            txt=item.content.strip()
            if txt: parts.append(f"Прийом їжі {item.meal_number}, варіант {item.variant_number}: {txt}")
        legacy="\n\n".join(parts)
    with con() as c:
        c.execute("UPDATE clients SET kcal=%s,protein=%s,fat=%s,carbs=%s,meal_plan=%s WHERE id=%s",(x.kcal,x.protein,x.fat,x.carbs,legacy,cid))
        c.execute("DELETE FROM nutrition_plan_items WHERE client_id=%s",(cid,))
        if x.meals:
            for item in x.meals:
                if item.content.strip():
                    c.execute("INSERT INTO nutrition_plan_items(client_id,meal_number,variant_number,content,sort) VALUES(%s,%s,%s,%s,%s)",(cid,max(1,item.meal_number),max(1,item.variant_number),item.content.strip(),item.sort))
        c.commit()
    return client_response(one("SELECT * FROM clients WHERE id=?",(cid,)))

@app.post("/api/cardio")
def save_cardio(x:CardioIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'cardio')
    d=x.day.strip() or str(kyiv_today())
    if d>str(kyiv_today()): raise HTTPException(400,"Майбутню дату заповнювати не можна")
    if x.cardio_type not in ("","Доріжка","Орбітрек","Велосипед"): raise HTTPException(400,"Невідомий тип кардіо")
    old=one("SELECT id FROM cardio_log WHERE client_id=? AND day=?",(x.client_id,d))
    vals=(x.cardio_type,max(0,x.minutes),max(0,x.speed),max(0,x.incline),max(0,x.steps))
    if old: run("UPDATE cardio_log SET cardio_type=?,minutes=?,speed=?,incline=?,steps=? WHERE id=?",vals+(old["id"],))
    else: run("INSERT INTO cardio_log(client_id,day,cardio_type,minutes,speed,incline,steps) VALUES(?,?,?,?,?,?,?)",(x.client_id,d)+vals)
    run("INSERT INTO notifications(client_id,recipient,kind,message,target_tab,target_day) VALUES(?,?,?,?,?,?)",(x.client_id,"trainer","cardio","Клієнт оновив кардіо та активність за "+d,"cardio",d))
    return {"ok":True}


@app.get("/api/exercise-library")
def get_exercise_library(user:AuthUser=Depends(current_user)):
    groups=rows("SELECT * FROM exercise_groups ORDER BY sort,id")
    muscles=rows("SELECT * FROM muscles ORDER BY sort,name,id")
    exercises=rows("""SELECT e.*,g.name AS group_name FROM exercise_library e
                      JOIN exercise_groups g ON g.id=e.group_id
                      ORDER BY g.sort,g.id,e.name""")
    links=rows("SELECT exercise_id,muscle_id,role FROM exercise_muscles ORDER BY exercise_id,muscle_id")
    by_exercise={}
    for link in links:
        by_exercise.setdefault(link["exercise_id"],[]).append(link)
    for exercise in exercises:
        rel=by_exercise.get(exercise["id"],[])
        exercise["primary_muscle_ids"]=[x["muscle_id"] for x in rel if x["role"]=="primary"]
        exercise["secondary_muscle_ids"]=[x["muscle_id"] for x in rel if x["role"]=="secondary"]
    return {"groups":groups,"muscles":muscles,"exercises":exercises}

@app.post("/api/exercise-library/groups")
def add_exercise_group(x:ExerciseGroupIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву групи")
    old=one("SELECT id FROM exercise_groups WHERE lower(name)=lower(?)",(name,))
    if old: return {"id":old["id"]}
    return {"id":run("INSERT INTO exercise_groups(name) VALUES(?)",(name,))}

@app.delete("/api/exercise-library/groups/{gid}")
def delete_exercise_group(gid:int,user:AuthUser=Depends(require_trainer)):
    ids=rows("SELECT id FROM exercise_library WHERE group_id=?",(gid,))
    with con() as c:
        for item in ids:
            c.execute("DELETE FROM exercise_muscles WHERE exercise_id=%s",(item["id"],))
        c.execute("DELETE FROM exercise_library WHERE group_id=%s",(gid,))
        c.execute("DELETE FROM exercise_groups WHERE id=%s",(gid,))
        c.commit()
    return {"ok":True}

@app.post("/api/exercise-library/muscles")
def add_muscle(x:MuscleIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву м’яза")
    old=one("SELECT id FROM muscles WHERE lower(name)=lower(?)",(name,))
    if old: return {"id":old["id"]}
    return {"id":run("INSERT INTO muscles(name) VALUES(?)",(name,))}

@app.delete("/api/exercise-library/muscles/{mid}")
def delete_muscle(mid:int,user:AuthUser=Depends(require_trainer)):
    with con() as c:
        c.execute("DELETE FROM exercise_muscles WHERE muscle_id=%s",(mid,))
        c.execute("DELETE FROM muscles WHERE id=%s",(mid,))
        c.commit()
    return {"ok":True}

def save_exercise_muscles(c,eid:int,x:ExerciseLibraryIn):
    primary=[]
    secondary=[]
    for mid in x.primary_muscle_ids:
        if mid not in primary: primary.append(mid)
    for mid in x.secondary_muscle_ids:
        if mid not in primary and mid not in secondary: secondary.append(mid)
    all_ids=primary+secondary
    if all_ids:
        found={r["id"] for r in c.execute("SELECT id FROM muscles WHERE id = ANY(%s)",(all_ids,)).fetchall()}
        if found!=set(all_ids): raise HTTPException(400,"Один із вибраних м’язів не знайдено")
    c.execute("DELETE FROM exercise_muscles WHERE exercise_id=%s",(eid,))
    for mid in primary: c.execute("INSERT INTO exercise_muscles(exercise_id,muscle_id,role) VALUES(%s,%s,'primary')",(eid,mid))
    for mid in secondary: c.execute("INSERT INTO exercise_muscles(exercise_id,muscle_id,role) VALUES(%s,%s,'secondary')",(eid,mid))

@app.post("/api/exercise-library/exercises")
def add_library_exercise(x:ExerciseLibraryIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву вправи")
    with con() as c:
        if not c.execute("SELECT id FROM exercise_groups WHERE id=%s",(x.group_id,)).fetchone(): raise HTTPException(404,"Групу не знайдено")
        old=c.execute("SELECT id FROM exercise_library WHERE group_id=%s AND lower(name)=lower(%s)",(x.group_id,name)).fetchone()
        if old:
            eid=old["id"]
            c.execute("UPDATE exercise_library SET technique_url=%s WHERE id=%s",(x.technique_url.strip(),eid))
        else:
            eid=c.execute("INSERT INTO exercise_library(group_id,name,technique_url) VALUES(%s,%s,%s) RETURNING id",(x.group_id,name,x.technique_url.strip())).fetchone()["id"]
        save_exercise_muscles(c,eid,x)
        c.commit()
    return {"id":eid}

@app.put("/api/exercise-library/exercises/{eid}")
def edit_library_exercise(eid:int,x:ExerciseLibraryIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву вправи")
    with con() as c:
        if not c.execute("SELECT id FROM exercise_library WHERE id=%s",(eid,)).fetchone(): raise HTTPException(404,"Вправу не знайдено")
        if not c.execute("SELECT id FROM exercise_groups WHERE id=%s",(x.group_id,)).fetchone(): raise HTTPException(404,"Групу не знайдено")
        duplicate=c.execute("SELECT id FROM exercise_library WHERE group_id=%s AND lower(name)=lower(%s) AND id<>%s",(x.group_id,name,eid)).fetchone()
        if duplicate: raise HTTPException(400,"Вправа з такою назвою вже є в цій групі")
        c.execute("UPDATE exercise_library SET group_id=%s,name=%s,technique_url=%s WHERE id=%s",(x.group_id,name,x.technique_url.strip(),eid))
        save_exercise_muscles(c,eid,x)
        c.commit()
    return {"ok":True}

@app.delete("/api/exercise-library/exercises/{eid}")
def delete_library_exercise(eid:int,user:AuthUser=Depends(require_trainer)):
    with con() as c:
        c.execute("DELETE FROM exercise_muscles WHERE exercise_id=%s",(eid,))
        c.execute("DELETE FROM exercise_library WHERE id=%s",(eid,))
        c.commit()
    return {"ok":True}

@app.post("/api/program")
def add_program(x:ProgramIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,x.client_id)
    i=run("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url,rest_seconds,rest_text,rir_by_set,alternatives_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(x.client_id,x.day_name,x.exercise,x.sets,x.reps,x.target_rir,x.superset_group,x.superset_order,x.technique_url.strip(),x.rest_seconds,x.rest_text.strip(),x.rir_by_set.strip(),x.alternatives_json.strip() or "[]")); return {"id":i}
@app.put("/api/program/{pid}")
def edit_program(pid:int,x:ProgramIn,user:AuthUser=Depends(require_trainer)):
    p=owned_record(user,"program",pid)
    if x.client_id!=p["client_id"]:raise HTTPException(403,"Вправа належить іншому клієнту")
    p=one("SELECT * FROM program WHERE id=?",(pid,))
    if not p: raise HTTPException(404,"Вправу не знайдено")
    run("""UPDATE program SET day_name=?,exercise=?,sets=?,reps=?,target_rir=?,technique_url=?,rest_seconds=?,rest_text=?,rir_by_set=?,alternatives_json=?
           WHERE id=?""",(x.day_name.strip(),x.exercise.strip(),x.sets,x.reps.strip(),x.target_rir,x.technique_url.strip(),x.rest_seconds,x.rest_text.strip(),x.rir_by_set.strip(),x.alternatives_json.strip() or "[]",pid))
    return {"ok":True}

@app.put("/api/program-day-title")
def save_program_day_title(x:ProgramDayTitleIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,x.client_id)
    day=x.day_name.strip()
    if not day: raise HTTPException(400,"Вкажіть день")
    title=x.title.strip()
    with con() as c:
        c.execute("""INSERT INTO program_days(client_id,day_name,title) VALUES(%s,%s,%s)
                     ON CONFLICT(client_id,day_name) DO UPDATE SET title=EXCLUDED.title""",
                  (x.client_id,day,title))
        c.commit()
    return {"ok":True}

@app.post("/api/program/reorder")
def reorder_program(x:ProgramOrderIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,x.client_id)
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
def set_superset(pid:int,x:SupersetIn,user:AuthUser=Depends(require_trainer)):
    owned_record(user,"program",pid)
    run("UPDATE program SET superset_group=? WHERE id=?",(x.superset_group,pid))
    return {"ok":True}

@app.delete("/api/program/{pid}")
def del_program(pid:int,user:AuthUser=Depends(require_trainer)):
    owned_record(user,"program",pid)
    run("DELETE FROM program WHERE id=?",(pid,)); return {"ok":True}
@app.post("/api/results")
def add_result(x:ResultIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    i=run("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(?,?,?,?,?,?,?)",(x.client_id,x.exercise,str(kyiv_today()),x.weight,x.reps,x.sets,x.rir)); return {"id":i}

@app.post("/api/result-sets")
def add_result_sets(x:SetResultIn,user:AuthUser=Depends(require_client)):
    authorize_program(user,x.program_id,x.client_id)
    require_active_client(x.client_id,'workouts')
    if not x.sets:
        raise HTTPException(400,"Додай хоча б один підхід")
    today=str(kyiv_today())
    # A completed exercise is locked in the UI. Explicit editing re-saves and replaces today's sets.
    run("DELETE FROM result_sets WHERE client_id=? AND program_id=? AND day=?",(x.client_id,x.program_id,today))
    ids=[]
    for s in x.sets:
        ids.append(run("INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir) VALUES(?,?,?,?,?,?,?,?)",
                       (x.client_id,x.program_id,x.exercise,today,s.set_number,s.weight,s.reps,s.rir)))
    return {"ok":True,"ids":ids}

@app.get("/api/result-sets/{cid}")
def result_set_history(cid:int,user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    return rows("SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number",(cid,))


def _b64url(data:bytes)->str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

def vapid_keys():
    if not ec or not serialization:
        return None,None
    priv=one("SELECT value FROM app_settings WHERE key='vapid_private'")
    pub=one("SELECT value FROM app_settings WHERE key='vapid_public'")
    if priv and pub:return priv["value"],pub["value"]
    key=ec.generate_private_key(ec.SECP256R1())
    private_pem=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()).decode()
    nums=key.public_key().public_numbers()
    public_raw=b"\x04"+nums.x.to_bytes(32,"big")+nums.y.to_bytes(32,"big")
    public_key=_b64url(public_raw)
    with con() as c:
        c.execute("INSERT INTO app_settings(key,value) VALUES(%s,%s) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",("vapid_private",private_pem))
        c.execute("INSERT INTO app_settings(key,value) VALUES(%s,%s) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",("vapid_public",public_key))
        c.commit()
    return private_pem,public_key

def send_push(client_id:int,recipient:str,title:str,body:str,url:str="/"):
    if not webpush:return False
    private_key,_=vapid_keys()
    if not private_key:return False
    subs=rows("SELECT * FROM push_subscriptions WHERE client_id=? AND recipient=?",(client_id,recipient))
    payload=json.dumps({"title":title,"body":body,"url":url},ensure_ascii=False)
    ok=False
    for s in subs:
        try:
            webpush(subscription_info={"endpoint":s["endpoint"],"keys":{"p256dh":s["p256dh"],"auth":s["auth"]}},
                    data=payload,vapid_private_key=private_key,
                    vapid_claims={"sub":os.getenv("VAPID_SUBJECT","mailto:trainer@eplan.com.ua")})
            ok=True
        except Exception as e:
            status=getattr(getattr(e,"response",None),"status_code",None)
            if status in (404,410):
                run("DELETE FROM push_subscriptions WHERE endpoint=?",(s["endpoint"],))
            else:
                print("WEB PUSH ERROR:",type(e).__name__,str(e)[:200],flush=True)
    return ok

def add_notification(client_id:int,recipient:str,kind:str,message:str,target_tab:str="",target_day:str="",target_program_id:int=0,target_session_id:int=0,push_title:str="Є ПЛАН"):
    nid=run("""INSERT INTO notifications(client_id,recipient,kind,message,target_tab,target_day,target_program_id,target_session_id)
               VALUES(?,?,?,?,?,?,?,?)""",(client_id,recipient,kind,message,target_tab,target_day,target_program_id,target_session_id))
    send_push(client_id,recipient,push_title,message,
              f"/?notify={nid}&recipient={recipient}&client={client_id}")
    return nid

@app.get("/api/push/public-key")
def push_public_key():
    _,public=vapid_keys()
    return {"public_key":public or ""}

@app.post("/api/push/subscribe")
def push_subscribe(x:PushSubscriptionIn,user:AuthUser=Depends(current_user)):
    if x.recipient!=user.role:raise HTTPException(403,"Невірний отримувач підписки")
    if user.role=="client" or x.client_id!=0:authorize_client(user,x.client_id)
    if x.recipient not in ("client","trainer"): raise HTTPException(400,"Невірний отримувач")
    if not x.endpoint or not x.p256dh or not x.auth: raise HTTPException(400,"Неповна push-підписка")
    with con() as c:
        saved=c.execute("""INSERT INTO push_subscriptions(client_id,recipient,endpoint,p256dh,auth)
           VALUES(%s,%s,%s,%s,%s) ON CONFLICT(endpoint) DO UPDATE SET client_id=EXCLUDED.client_id,recipient=EXCLUDED.recipient,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth
           WHERE push_subscriptions.recipient=EXCLUDED.recipient
             AND (EXCLUDED.recipient='trainer' OR push_subscriptions.client_id=EXCLUDED.client_id)
           RETURNING id""",(x.client_id,x.recipient,x.endpoint,x.p256dh,x.auth)).fetchone()
        if not saved:raise HTTPException(409,"Потрібна нова push-підписка для цього акаунта")
        c.commit()
    return {"ok":True}

@app.post("/api/workout/start")
def start_workout(x:WorkoutStartIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'workouts')
    today=str(kyiv_today())
    active=one("SELECT * FROM workout_sessions WHERE client_id=? AND status='training' ORDER BY id DESC LIMIT 1",(x.client_id,))
    if active:return active
    existing=one("SELECT * FROM workout_sessions WHERE client_id=? AND COALESCE(workout_day,CAST(started_at AS DATE))=? ORDER BY id DESC LIMIT 1",(x.client_id,today))
    if existing:
        raise HTTPException(400,"Сьогодні тренування вже було розпочато. Нове тренування буде доступне завтра.")
    snapshot=json.dumps(rows("SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url,rest_seconds,rest_text,rir_by_set,alternatives_json FROM program WHERE client_id=? AND day_name=? ORDER BY id",(x.client_id,x.day_name)),ensure_ascii=False)
    i=run("INSERT INTO workout_sessions(client_id,day_name,status,program_snapshot,workout_day) VALUES(?,?,?,?,CAST(? AS DATE))",(x.client_id,x.day_name,"training",snapshot,today))
    session=one("SELECT * FROM workout_sessions WHERE id=?",(i,))
    client_info=one("SELECT name,first_name,last_name FROM clients WHERE id=?",(x.client_id,))
    if client_info:
        full_name=((client_info.get("first_name") or "")+" "+(client_info.get("last_name") or "")).strip()
        client_name=full_name or client_info.get("name") or "Клієнт"
        send_telegram(f"🏋️ {client_name} почав тренування\n{x.day_name}\n{today}")
    return session

@app.post("/api/workout/{sid}/finish")
def finish_workout(sid:int,user:AuthUser=Depends(require_client)):
    # Lock this workout row in one DB transaction. This makes finish idempotent:
    # simultaneous taps/retries cannot finish it twice or create duplicate notifications.
    with con() as c:
        row=c.execute("SELECT * FROM workout_sessions WHERE id=%s FOR UPDATE",(sid,)).fetchone()
        if not row:
            raise HTTPException(404,"Тренування не знайдено")
        authorize_client(user,row["client_id"])
        session=dict(row)
        was_finished=session.get("status")=="finished"
        if not was_finished:
            row=c.execute("""UPDATE workout_sessions
                             SET status='finished',finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP)
                             WHERE id=%s RETURNING *""",(sid,)).fetchone()
            finished=dict(row)
        else:
            finished=session
        c.commit()
    if not was_finished:
        client_info=one("SELECT name,first_name,last_name FROM clients WHERE id=?",(session["client_id"],))
        if client_info:
            full_name=((client_info.get("first_name") or "")+" "+(client_info.get("last_name") or "")).strip()
            client_name=full_name or client_info.get("name") or "Клієнт"
            workout_day=str(session.get("day_name") or "Тренування")
            workout_date=str(session.get("workout_day") or "")[:10] or str(kyiv_today())
            send_telegram(f"✅ {client_name} завершив тренування\n{workout_day}\n{workout_date}")
            add_notification(session["client_id"],"trainer","workout_finished",
                f"{client_name} завершив тренування «{workout_day}». Потрібно перевірити.",
                "results",workout_date,0,sid,"Є ПЛАН · Тренування завершено")
    return finished

@app.post("/api/history/nutrition")
def historical_nutrition(x:HistoricalNutritionIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'nutrition')
    if x.day > str(kyiv_today()):
        raise HTTPException(400,"Не можна додавати дані на майбутню дату")
    existing=one("SELECT id FROM nutrition WHERE client_id=? AND day=? ORDER BY id DESC LIMIT 1",(x.client_id,x.day))
    if existing:
        run("UPDATE nutrition SET kcal=?,protein=?,fat=?,carbs=? WHERE id=?",(x.kcal,x.protein,x.fat,x.carbs,existing["id"]))
        return one("SELECT * FROM nutrition WHERE id=?",(existing["id"],))
    i=run("INSERT INTO nutrition(client_id,day,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?)",(x.client_id,x.day,x.kcal,x.protein,x.fat,x.carbs))
    return one("SELECT * FROM nutrition WHERE id=?",(i,))

@app.post("/api/history/workout")
def historical_workout(x:HistoricalWorkoutIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    for s in x.sets:authorize_program(user,s.program_id,x.client_id)
    require_active_client(x.client_id,'workouts')
    if x.day > str(kyiv_today()):
        raise HTTPException(400,"Не можна додавати тренування на майбутню дату")
    existing=one("SELECT id FROM workout_sessions WHERE client_id=? AND COALESCE(workout_day,CAST(started_at AS DATE))=? ORDER BY id DESC LIMIT 1",(x.client_id,x.day))
    if existing:
        raise HTTPException(400,"Тренування за цей день уже записано")
    for s in x.sets:
        run("INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir) VALUES(?,?,?,?,?,?,?,?)",
            (x.client_id,s.program_id,s.exercise,x.day,s.set_number,s.weight,s.reps,s.rir))
    # Noon avoids timezone/date rollover ambiguity for historical display.
    snapshot=json.dumps(rows("SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order FROM program WHERE client_id=? AND day_name=? ORDER BY id",(x.client_id,x.day_name)),ensure_ascii=False)
    run("INSERT INTO workout_sessions(client_id,day_name,started_at,finished_at,status,program_snapshot,workout_day) VALUES(?,?,CAST(? AS TIMESTAMP),CAST(? AS TIMESTAMP),'finished',?,CAST(? AS DATE))",
        (x.client_id,x.day_name,x.day+" 12:00:00",x.day+" 13:00:00",snapshot,x.day))
    return {"ok":True}

@app.post("/api/comments")
def add_comment(x:CommentIn,user:AuthUser=Depends(current_user)):
    authorize_client(user,x.client_id)
    if x.program_id:authorize_program(user,x.program_id,x.client_id)
    x.author=user.role
    if not x.body.strip(): raise HTTPException(400,"Коментар порожній")
    i=run("INSERT INTO comments(client_id,day,program_id,exercise,author,body) VALUES(?,?,?,?,?,?)",
          (x.client_id,x.day,x.program_id,x.exercise,x.author,x.body.strip()))
    recipient="client" if x.author=="trainer" else "trainer"
    who="Тренер" if x.author=="trainer" else "Клієнт"
    target=(" до вправи «"+x.exercise+"»") if x.exercise else " до тренування"
    comment_text=(x.body or "").strip()
    message=who+" залишив коментар"+target+((": "+comment_text) if comment_text else "")
    run("INSERT INTO notifications(client_id,recipient,kind,message,target_tab,target_day,target_program_id) VALUES(?,?,?,?,?,?,?)",(x.client_id,recipient,"comment",message,"comments",x.day,x.program_id))
    return one("SELECT * FROM comments WHERE id=?",(i,))

@app.patch("/api/workout/{sid}/review")
def review_workout(sid:int,x:WorkoutReviewIn,user:AuthUser=Depends(require_trainer)):
    s=one("SELECT * FROM workout_sessions WHERE id=?",(sid,))
    if not s: raise HTTPException(404,"Тренування не знайдено")
    authorize_client(user,s["client_id"])
    comment=x.comment.strip()
    run("UPDATE workout_sessions SET trainer_reviewed=TRUE,trainer_comment=? WHERE id=?",(comment,sid))
    workout_day=str(s.get("day_name") or "Тренування")
    workout_date=str(s.get("workout_day") or s.get("started_at") or "")[:10]
    message=(f"Тренер перевірив тренування «{workout_day}» і залишив коментар: {comment}"
             if comment else f"Тренер перевірив тренування «{workout_day}».")
    add_notification(s["client_id"],"client","workout_review",message,
                     "progress",workout_date,0,sid,"Є ПЛАН · Тренер перевірив тренування")
    return {"ok":True}

@app.get("/api/notifications/trainer/all")
def get_all_trainer_notifications(user:AuthUser=Depends(require_trainer)):
    run("""DELETE FROM notifications n
           WHERE n.recipient='trainer'
             AND (COALESCE(n.client_id,0)=0 OR NOT EXISTS (
                 SELECT 1 FROM clients c WHERE c.id=n.client_id AND c.status<>'Видалений'
             ))""")

    xs=rows("""SELECT n.*,c.name AS client_name FROM notifications n
               JOIN clients c ON c.id=n.client_id
               WHERE n.recipient='trainer' AND COALESCE(n.client_id,0)>0 AND c.status<>'Видалений'
               ORDER BY n.created_at DESC,n.id DESC LIMIT 200""")
    # Backfill a bell item for finished workouts that still need review and were
    # completed before workout-finished notifications were introduced.
    pending=rows("""SELECT s.id AS sid,s.client_id,s.day_name,s.started_at,s.finished_at,c.name AS client_name
                    FROM workout_sessions s JOIN clients c ON c.id=s.client_id
                    WHERE c.status<>'Видалений' AND s.status='finished' AND COALESCE(s.trainer_reviewed,FALSE)=FALSE
                    ORDER BY COALESCE(s.finished_at,s.started_at) DESC""")
    existing={int(x.get("target_session_id") or 0) for x in xs}
    for s in pending:
        if not s.get("client_name"): continue
        if int(s["sid"]) in existing: continue
        dt=s.get("finished_at") or s.get("started_at")
        xs.append({"id":-int(s["sid"]),"client_id":s["client_id"],"recipient":"trainer",
                   "kind":"workout_finished","message":f"{s['client_name']} завершив тренування «{s['day_name']}». Потрібно перевірити.",
                   "is_read":False,"created_at":dt,"client_name":s["client_name"],
                   "target_tab":"results","target_day":str(s.get("workout_day") or s.get("started_at") or "")[:10],
                   "target_program_id":0,"target_session_id":s["sid"]})
    xs.sort(key=lambda x:str(x.get("created_at") or ""),reverse=True)
    return xs[:200]

@app.get("/api/notifications/{cid}")
def get_notifications(cid:int,recipient:str,user:AuthUser=Depends(current_user)):
    authorize_recipient(user,cid,recipient)
    return rows("SELECT * FROM notifications WHERE client_id=? AND recipient=? AND kind IN ('workout_review','comment') ORDER BY created_at DESC,id DESC LIMIT 50",(cid,recipient))

@app.delete("/api/notifications/item/{nid}")
def delete_notification_item(nid:int,user:AuthUser=Depends(require_trainer)):
    n=one("SELECT * FROM notifications WHERE id=?",(nid,))
    if not n: raise HTTPException(404,"Сповіщення не знайдено")
    authorize_recipient(user,n["client_id"],n["recipient"])
    run("DELETE FROM notifications WHERE id=?",(nid,))
    return {"ok":True}

@app.patch("/api/notifications/item/{nid}/read")
def read_notification_item(nid:int,user:AuthUser=Depends(current_user)):
    n=one("SELECT * FROM notifications WHERE id=?",(nid,))
    if not n: raise HTTPException(404,"Сповіщення не знайдено")
    authorize_recipient(user,n["client_id"],n["recipient"])
    run("UPDATE notifications SET is_read=TRUE WHERE id=?",(nid,))
    return {"ok":True}

@app.patch("/api/notifications/{cid}/read")
def read_notifications(cid:int,x:NotificationReadIn,user:AuthUser=Depends(current_user)):
    authorize_recipient(user,cid,x.recipient)
    run("UPDATE notifications SET is_read=TRUE WHERE client_id=? AND recipient=?",(cid,x.recipient))
    return {"ok":True}

@app.post("/api/nutrition")
def add_nutrition(x:NutIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'nutrition')
    i=run("INSERT INTO nutrition(client_id,day,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?)",(x.client_id,str(kyiv_today()),x.kcal,x.protein,x.fat,x.carbs)); return {"id":i}
@app.patch("/api/nutrition/{nid}")
def edit_nutrition(nid:int,x:NutIn,user:AuthUser=Depends(require_client)):
    rec=owned_record(user,"nutrition",nid)
    if x.client_id!=rec["client_id"]:raise HTTPException(403,"Запис належить іншому клієнту")
    rec=one("SELECT id,client_id FROM nutrition WHERE id=?",(nid,))
    if not rec: raise HTTPException(404,"Запис не знайдено")
    require_active_client(rec["client_id"],'nutrition')
    run("UPDATE nutrition SET kcal=?,protein=?,fat=?,carbs=? WHERE id=?",(x.kcal,x.protein,x.fat,x.carbs,nid))
    return one("SELECT * FROM nutrition WHERE id=?",(nid,))

@app.patch("/api/nutrition/{nid}/check")
def check_nutrition(nid:int,user:AuthUser=Depends(require_trainer)):
    owned_record(user,"nutrition",nid)
    run("UPDATE nutrition SET checked=1 WHERE id=?",(nid,)); return {"ok":True}
@app.post("/api/nutrition/{nid}/screenshot")
def screenshot(nid:int,file:UploadFile=File(...),user:AuthUser=Depends(require_client)):
    owned_record(user,"nutrition",nid)
    content_type=(file.content_type or "").split(";",1)[0].strip().lower()
    content,media_type,extension=normalize_screenshot(read_screenshot_bytes(file.file),content_type)
    name=None;committed=False;commit_started=False;commit_unknown=False
    try:
        with con() as c:
            # Recheck the object under a row lock before writing/linking a file.
            rec=c.execute("SELECT id,client_id FROM nutrition WHERE id=%s FOR UPDATE",(nid,)).fetchone()
            if not rec:raise HTTPException(404,"Запис не знайдено")
            authorize_client(user,rec["client_id"])
            for attempt in range(8):
                candidate="nutrition_"+secrets.token_hex(24)+extension
                try:fd=os.open(UPLOADS/candidate,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                except FileExistsError:continue
                name=candidate
                break
            else:raise OSError("Unable to reserve screenshot name")
            # Only validated, fully encoded bytes are written. Until commit no
            # nutrition row references this name, so /uploads cannot serve it.
            with os.fdopen(fd,"wb") as target:
                if target.write(content)!=len(content):raise OSError("Incomplete screenshot write")
                target.flush();os.fsync(target.fileno())
            c.execute("UPDATE nutrition SET screenshot=%s WHERE id=%s",(name,nid))
            commit_started=True
        committed=True
        return {"url":"/uploads/"+name}
    except HTTPException:raise
    except Exception:
        if commit_started:
            # A lost COMMIT acknowledgement is not proof of rollback. Never
            # delete a file that PostgreSQL may already have linked to the row.
            try:state=one("SELECT screenshot FROM nutrition WHERE id=?",(nid,))
            except Exception:
                commit_unknown=True
                logging.getLogger(__name__).error("H04 screenshot commit outcome unknown; retained validated file")
            else:
                if state and state["screenshot"]==name:
                    committed=True
                    return {"url":"/uploads/"+name}
        raise HTTPException(500,"Не вдалося зберегти зображення. Спробуйте ще раз.") from None
    finally:
        if name and not committed and not commit_unknown:
            try:(UPLOADS/name).unlink(missing_ok=True)
            except OSError:logging.getLogger(__name__).exception("H04 screenshot cleanup failed")
@app.post("/api/measurements")
def measurement(x:MeasureIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'measurements')
    i=run("INSERT INTO measurements(client_id,day,weight,waist,chest,hips,thighs,arms) VALUES(?,?,?,?,?,?,?,?)",(x.client_id,str(kyiv_today()),x.weight,x.waist,x.chest,x.hips,x.thighs,x.arms))
    if x.weight>0: run("UPDATE clients SET weight=? WHERE id=?",(x.weight,x.client_id))
    return {"id":i}

@app.put("/api/comments/{comment_id}")
def edit_comment(comment_id:int,x:CommentIn,user:AuthUser=Depends(current_user)):
    c=one("SELECT * FROM comments WHERE id=?",(comment_id,))
    if not c: raise HTTPException(404,"Коментар не знайдено")
    authorize_client(user,c["client_id"])
    if x.client_id!=c["client_id"] or c["author"]!=user.role:
        raise HTTPException(403,"Можна редагувати лише власний коментар")
    run("UPDATE comments SET body=? WHERE id=?",(x.body.strip(),comment_id))
    return {"ok":True}

@app.delete("/api/comments/{comment_id}")
def delete_comment(comment_id:int,user:AuthUser=Depends(current_user)):
    comment=one("SELECT * FROM comments WHERE id=?",(comment_id,))
    if not comment: raise HTTPException(404,"Коментар не знайдено")
    authorize_client(user,comment["client_id"])
    if user.role=="client" and comment["author"]!="client":raise HTTPException(403,"Можна видалити лише власний коментар")
    run("DELETE FROM comments WHERE id=?",(comment_id,))
    return {"ok":True}
