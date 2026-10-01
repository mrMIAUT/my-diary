from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Response, Depends, Query
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
import json, hashlib, hmac, secrets, urllib.request, urllib.error, urllib.parse
import io, logging, stat, warnings
import psycopg
from psycopg.rows import dict_row
from datetime import date, datetime, timedelta, timezone
from dataclasses import dataclass
from contextlib import contextmanager
from math import ceil
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
# M03B1: bound ordinary API request bodies before JSON/Pydantic parsing.
API_BODY_MAX_BYTES=512*1024
API_BODY_LIMIT_DETAIL="Запит завеликий. Максимальний розмір — 512 KiB."
# M03B2: every accumulated API collection is served in bounded pages.
API_PAGE_SIZE=50
API_PAGE_MAX=50
API_OFFSET_MAX=100_000
# M05: broad server-side sanity bounds. They intentionally stay well above
# normal fitness values while rejecting negative/non-finite/pathological input.
MAX_WEIGHT_KG=5_000.0
MAX_REPS=1_000
MAX_SET_COUNT=100
MAX_RIR=10
MAX_KCAL=100_000
MAX_MACRO_G=10_000
MAX_MEASUREMENT=10_000.0
MAX_CARDIO_MINUTES=1_440
MAX_CARDIO_SPEED=500.0
MAX_CARDIO_INCLINE=100.0
MAX_STEPS=2_000_000
Image.MAX_IMAGE_PIXELS=SCREENSHOT_MAX_PIXELS
warnings.filterwarnings("error",category=Image.DecompressionBombWarning)

# P2H3: production logs must not contain request credentials, recipient email,
# reset tokens, push endpoints, upstream response bodies, or exception strings.
# Keep only a small allowlist of operational fields whose values are not user
# content. Administrative mutation auditing is stored separately in PostgreSQL.
SECURITY_LOGGER=logging.getLogger("eplan.security")
SAFE_LOG_FIELDS={
    "status","error_type","sent","configured","count","constraint",
    "method","route","actor_role","actor_user_id","target_id","status_code",
    "account_type",
}
def safe_log(event:str,level:int=logging.INFO,**fields):
    payload={"event":str(event)[:96]}
    for key,value in fields.items():
        if key not in SAFE_LOG_FIELDS:continue
        if isinstance(value,(bool,int,float)) or value is None:
            payload[key]=value
        else:
            payload[key]=str(value)[:160]
    SECURITY_LOGGER.log(level,json.dumps(payload,ensure_ascii=True,separators=(",",":"),sort_keys=True))


class ApiBodyLimit:
    """Bound non-upload API mutation bodies before request parsing.

    The screenshot route keeps H04's dedicated 10 MiB multipart limiter.
    Other API mutation bodies are buffered only up to 512 KiB and replayed
    unchanged to FastAPI, so JSON contracts and C01 authentication stay intact.
    """
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        path=scope.get("path","")
        method=scope.get("method","")
        parts=path.rstrip("/").split("/")
        image_upload=(len(parts)==5 and parts[1:3]==["api","nutrition"] and parts[4]=="screenshot")
        if not (scope.get("type")=="http" and path.startswith("/api/") and
                method not in ("GET","HEAD","OPTIONS") and not image_upload):
            return await self.app(scope,receive,send)
        error=JSONResponse({"detail":API_BODY_LIMIT_DETAIL},status_code=413)
        for key,value in scope.get("headers",[]):
            if key.lower()==b"content-length":
                try:too_large=int(value)>API_BODY_MAX_BYTES
                except ValueError:too_large=False
                if too_large:return await error(scope,receive,send)
        messages=[];total=0
        while True:
            message=await receive()
            messages.append(message)
            if message.get("type")!="http.request":break
            total+=len(message.get("body",b""))
            if total>API_BODY_MAX_BYTES:
                return await error(scope,receive,send)
            if not message.get("more_body",False):break
        index=0
        async def replay_receive():
            nonlocal index
            if index<len(messages):
                message=messages[index];index+=1;return message
            return await receive()
        return await self.app(scope,replay_receive,send)

class ScreenshotBodyLimit:
    """Bound raw upload bytes before FastAPI's multipart spool, even chunked.

    MultiPartException also asks older Starlette parsers to close partial
    temporary files. Normalize that parser's 400 to the intended 413.
    Authentication/ownership still run in the existing C01 dependencies.
    """
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        parts=scope.get("path","").rstrip("/").split("/")
        image_upload=(len(parts)==5 and parts[1:3]==["api","nutrition"] and parts[4]=="screenshot")
        if not (scope["type"]=="http" and scope["method"]=="POST" and image_upload):
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


def normalize_avatar(data,content_type=None):
    """Validate like screenshots, then store a small metadata-free square avatar."""
    clean,_,_=normalize_screenshot(data,content_type)
    try:
        with Image.open(io.BytesIO(clean)) as decoded:
            decoded.load()
            rgb=decoded.convert("RGBA")
            canvas=Image.new("RGBA",rgb.size,(255,255,255,255))
            canvas.alpha_composite(rgb)
            square=ImageOps.fit(canvas.convert("RGB"),(512,512),method=Image.Resampling.LANCZOS)
            with ScreenshotBuffer() as encoded:
                square.save(encoded,format="JPEG",quality=88,optimize=True)
                return encoded.getvalue(),"image/jpeg",".jpg"
    except (OSError,ValueError,SyntaxError):
        raise HTTPException(400,"Зображення аватара не вдалося обробити") from None

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
    if request.method not in ("GET","HEAD","OPTIONS"):
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

# P2H1: response hardening that is compatible with the existing PWA.
# Inline event attributes still exist in the legacy UI, so CSP allows script
# attributes for compatibility while blocking inline <script> elements in
# modern CSP3 browsers. Removing all inline handlers is a separate frontend
# refactor; do not pretend this policy is a strict no-inline CSP.
CSP_APP = (
    "default-src 'self'; "
    "base-uri 'none'; "
    "object-src 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "script-src-elem 'self'; "
    "script-src-attr 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "worker-src 'self'; "
    "manifest-src 'self'; "
    "media-src 'self' blob:; "
    "frame-src 'none'"
)
SECURITY_RESPONSE_HEADERS = (
    (b"x-frame-options", b"DENY"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
)
CSP_EXEMPT_PATHS = {"/docs", "/redoc", "/docs/oauth2-redirect"}

# P2I1: HSTS stays opt-in until the external Render/custom-domain HTTPS
# redirect is verified. When enabled, require an explicit HTTPS APP_BASE_URL
# and deliberately avoid includeSubDomains/preload until every subdomain has
# been assessed. Private API responses are marked no-store at the HTTP-cache
# layer; M01's explicit owner/session-scoped IndexedDB cache remains separate.
def env_flag(name:str, default:bool=False)->bool:
    raw=os.getenv(name)
    if raw is None:return default
    value=raw.strip().lower()
    if value in {"1","true","yes","on"}:return True
    if value in {"0","false","no","off",""}:return False
    raise RuntimeError(f"Invalid boolean environment value for {name}")

HSTS_ENABLED=env_flag("EPLAN_HSTS_ENABLED",False)
HSTS_VALUE=b"max-age=31536000"
if HSTS_ENABLED:
    _hsts_base=urllib.parse.urlsplit(os.getenv("APP_BASE_URL","").strip())
    if _hsts_base.scheme.lower()!="https" or not _hsts_base.hostname:
        raise RuntimeError("EPLAN_HSTS_ENABLED requires an https APP_BASE_URL")
API_CACHE_CONTROL=b"no-store"

class AdminAudit:
    """Record successful authenticated trainer mutations without request content.

    This is defense-in-depth observability, not an authorization boundary. The
    audit write is intentionally best-effort: a logging-table outage must not
    turn an already successful business mutation into an ambiguous client error.
    """
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        if scope.get("type")!="http" or scope.get("method") in ("GET","HEAD","OPTIONS"):
            return await self.app(scope,receive,send)
        async def audited_send(message):
            if message.get("type")=="http.response.start":
                status=int(message.get("status",500))
                state=scope.get("state") or {}
                user=state.get("auth_user") if isinstance(state,dict) else None
                if user is not None and getattr(user,"role",None)=="trainer" and 200<=status<400:
                    route_obj=scope.get("route")
                    route=getattr(route_obj,"path",scope.get("path",""))
                    target_id=None
                    for value in (scope.get("path_params") or {}).values():
                        try:target_id=int(value);break
                        except (TypeError,ValueError):continue
                    try:
                        write_admin_audit(user,scope.get("method",""),route,target_id,status)
                    except Exception as e:
                        safe_log("admin_audit_write_failed",logging.ERROR,error_type=type(e).__name__)
            await send(message)
        return await self.app(scope,receive,audited_send)

class SecurityHeaders:
    """Attach browser security headers to application responses.

    FastAPI's built-in docs load CDN assets, so CSP is intentionally not
    attached to those three documentation HTML endpoints in this stage.
    Anti-framing/nosniff/referrer/permissions headers still apply there.
    HSTS is opt-in through EPLAN_HSTS_ENABLED and must only be enabled after
    the external Render/custom-domain HTTPS/redirect posture is verified.
    """
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        if scope.get("type")!="http":
            return await self.app(scope,receive,send)
        path=scope.get("path","")
        async def hardened_send(message):
            if message.get("type")=="http.response.start":
                headers=list(message.get("headers",[]))
                names={k.lower() for k,_ in headers}
                for key,value in SECURITY_RESPONSE_HEADERS:
                    if key not in names:headers.append((key,value))
                if path.startswith("/api/") and b"cache-control" not in names:
                    headers.append((b"cache-control",API_CACHE_CONTROL))
                if HSTS_ENABLED and b"strict-transport-security" not in names:
                    headers.append((b"strict-transport-security",HSTS_VALUE))
                if path not in CSP_EXEMPT_PATHS and b"content-security-policy" not in names:
                    headers.append((b"content-security-policy",CSP_APP.encode("ascii")))
                message["headers"]=headers
            await send(message)
        return await self.app(scope,receive,hardened_send)

app=FastAPI(title="Зроби себе зі мною V3",dependencies=[Depends(api_session_boundary)])
app.add_middleware(ScreenshotBodyLimit)
app.add_middleware(ApiBodyLimit)
# Added last so it wraps the body-limit middleware responses as well.
app.add_middleware(SecurityHeaders)
# Added last: sees the authenticated request.state after dependencies execute.
app.add_middleware(AdminAudit)
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

AUDIT_RETENTION_DAYS=180
def write_admin_audit(user,method:str,route:str,target_id:int|None,status_code:int):
    # Only the one authenticated trainer identity is eligible. Never accept actor
    # identity from request JSON/headers. Route is the internal route template.
    if getattr(user,"role",None)!="trainer" or getattr(user,"user_id",None)!=1:return
    method=(method or "")[:16].upper()
    route=(route or "")[:255]
    if not route.startswith("/api/"):return
    cutoff=datetime.now(timezone.utc)-timedelta(days=AUDIT_RETENTION_DAYS)
    with con() as c:
        c.execute("DELETE FROM security_admin_audit WHERE created_at<%s",(cutoff,))
        c.execute("""INSERT INTO security_admin_audit(actor_role,actor_user_id,method,route,target_id,status_code)
                     VALUES(%s,%s,%s,%s,%s,%s)""",
                  ("trainer",1,method,route,target_id,int(status_code)))
        c.commit()

def paged_rows_from(c,q,p,limit:int,offset:int):
    """Return at most limit rows plus a has-more bit without COUNT(*)."""
    sql=(q+" LIMIT ? OFFSET ?").replace('?', '%s')
    xs=[dict(x) for x in c.execute(sql,tuple(p)+(limit+1,offset)).fetchall()]
    return xs[:limit],len(xs)>limit

def paged_rows(q,p,limit:int,offset:int):
    # One extra row is enough to signal the next page; no unbounded COUNT/result.
    with con() as c:return paged_rows_from(c,q,p,limit,offset)

# M03A: shared PostgreSQL fixed-window counters, never per-process state.
RATE_LIMITS={
    "login.source":(60,5*60), "login.failure":(5,15*60),
    "reset_request.source":(30,30*60), "reset_request.email":(3,30*60),
    "reset_confirm.source":(30,15*60), "reset_confirm.token":(5,15*60),
    "invite.actor":(20,60*60), "upload.actor":(20,10*60),
}
RATE_LIMIT_DETAIL="Забагато запитів. Спробуйте пізніше."

def rate_limit_key(policy:str,identifier:str)->str:
    # Domain-separated digest only: no raw email/token/actor/address in the DB.
    return hashlib.sha256(("eplan-m03a\0"+policy+"\0"+identifier.strip()).encode()).hexdigest()

def rate_limit_source(request:Request)->str:
    # Best effort ASGI peer only. Never manually trust client-supplied proxy headers.
    return (request.client.host if request.client else "unknown").strip().lower()

@contextmanager
def rate_limit_bucket(policy:str,identifier:str):
    """Lock one bounded window until its admission/failure update is committed.

    PostgreSQL's upsert acquires the row lock, retained until transaction end.
    Login keeps this lock across password verification; side effects follow commit.
    """
    try:
        maximum,seconds=RATE_LIMITS[policy]
        key=rate_limit_key(policy,identifier)
        with con() as c:
            # Indexed, opportunistic TTL cleanup: one row per active bucket, no log.
            c.execute("DELETE FROM security_rate_limits WHERE expires_at<=CURRENT_TIMESTAMP")
            now=c.execute("SELECT CURRENT_TIMESTAMP AS rate_now").fetchone()["rate_now"]
            if now.tzinfo is None:now=now.replace(tzinfo=timezone.utc)
            # A no-op conflict UPDATE locks the existing row immediately: a
            # successful concurrent login cannot delete it between insert/select.
            c.execute("""INSERT INTO security_rate_limits(bucket_key,attempts,expires_at)
                         VALUES(%s,0,%s) ON CONFLICT(bucket_key) DO UPDATE
                         SET bucket_key=EXCLUDED.bucket_key""",(key,now+timedelta(seconds=seconds)))
            row=c.execute("SELECT attempts,expires_at FROM security_rate_limits WHERE bucket_key=%s FOR UPDATE",(key,)).fetchone()
            if row["attempts"]>=maximum:
                retry=max(1,ceil((row["expires_at"]-now).total_seconds()))
                raise HTTPException(429,RATE_LIMIT_DETAIL,headers={"Retry-After":str(retry)})
            yield c,key
            # Context manager commits before the caller proceeds to sensitive effects.
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503,"Сервіс тимчасово недоступний. Спробуйте пізніше.") from None

def consume_rate_limit(policy:str,identifier:str):
    with rate_limit_bucket(policy,identifier) as (c,key):
        c.execute("UPDATE security_rate_limits SET attempts=attempts+1 WHERE bucket_key=%s",(key,))

# P2H2: self-describing PBKDF2 format. Existing H05 hashes remain valid and
# are upgraded only after a successful login, when the plaintext password is
# legitimately available. The upper bound prevents malformed DB values from
# forcing unbounded PBKDF2 work.
PASSWORD_SCHEME="pbkdf2_sha256"
PASSWORD_ITERATIONS=600_000
PASSWORD_LEGACY_ITERATIONS=200_000
PASSWORD_MIN_ACCEPTED_ITERATIONS=100_000
PASSWORD_MAX_ACCEPTED_ITERATIONS=2_000_000
PASSWORD_SALT_BYTES=16
PASSWORD_DIGEST_BYTES=32

def _parse_password_hash(stored):
    if not isinstance(stored,str):return None
    parts=stored.split("$")
    legacy=False
    if len(parts)==3 and parts[0]=="pbkdf2":
        legacy=True;iterations=PASSWORD_LEGACY_ITERATIONS;salt_hex,digest_hex=parts[1],parts[2]
    elif len(parts)==4 and parts[0]==PASSWORD_SCHEME:
        if not parts[1].isdigit():return None
        iterations=int(parts[1]);salt_hex,digest_hex=parts[2],parts[3]
        if not (PASSWORD_MIN_ACCEPTED_ITERATIONS<=iterations<=PASSWORD_MAX_ACCEPTED_ITERATIONS):return None
    else:return None
    try:
        salt=bytes.fromhex(salt_hex);digest=bytes.fromhex(digest_hex)
    except (TypeError,ValueError):return None
    if len(salt)!=PASSWORD_SALT_BYTES or len(digest)!=PASSWORD_DIGEST_BYTES:return None
    return {"iterations":iterations,"salt":salt,"digest":digest,"legacy":legacy}

def hash_password(password:str)->str:
    salt=secrets.token_bytes(PASSWORD_SALT_BYTES)
    digest=hashlib.pbkdf2_hmac("sha256",password.encode(),salt,PASSWORD_ITERATIONS)
    return f"{PASSWORD_SCHEME}${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"

def is_password_hash(stored)->bool:
    return _parse_password_hash(stored) is not None

def password_needs_rehash(stored)->bool:
    parsed=_parse_password_hash(stored)
    return bool(parsed and (parsed["legacy"] or parsed["iterations"]<PASSWORD_ITERATIONS))

def check_password(password:str,stored:str)->bool:
    # Runtime credentials must already be hashes; only init() migrates plaintext.
    parsed=_parse_password_hash(stored)
    if not parsed:return False
    try:
        test=hashlib.pbkdf2_hmac("sha256",password.encode(),parsed["salt"],parsed["iterations"])
        return hmac.compare_digest(test,parsed["digest"])
    except Exception:return False

def rehash_authenticated_password(c,role:str,user_id:int,password:str,stored:str)->str:
    """Upgrade a verified legacy/lower-cost hash while its account row is locked.

    Changing the credential invalidates older C01 session fingerprints. Marking
    them revoked as well keeps session state explicit rather than leaving stale
    rows that can only fail the fingerprint check later.
    """
    if not password_needs_rehash(stored):return stored
    upgraded=hash_password(password)
    if role=="trainer":
        c.execute("UPDATE trainer_auth SET password=%s WHERE id=1",(upgraded,))
    else:
        c.execute("UPDATE clients SET password=%s WHERE id=%s",(upgraded,user_id))
    c.execute("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE role=%s AND user_id=%s AND revoked_at IS NULL",
              (role,user_id))
    return upgraded

def configured_trainer_email()->str:
    email=os.getenv("TRAINER_EMAIL","").strip()
    if email.count("@")!=1 or not all(email.split("@")) or any(ch.isspace() for ch in email):
        raise RuntimeError("H05 configuration error: set a valid TRAINER_EMAIL before startup")
    return email

def migrate_password_value(stored)->str:
    if is_password_hash(stored):return stored
    # Empty/malformed hashes cannot authenticate; password reset can recover them.
    if not isinstance(stored,str) or not stored or stored.startswith("pbkdf2$") or stored.startswith(PASSWORD_SCHEME+"$"):return ""
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
        safe_log("telegram_not_configured",logging.WARNING,configured=False)
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
            safe_log("telegram_send_result",status=int(r.status))
            return ok
    except Exception as e:
        safe_log("telegram_send_error",logging.WARNING,error_type=type(e).__name__)
        return False

def send_reset_email(email:str,link:str):
    key=os.getenv("RESEND_API_KEY","").strip()
    sender=os.getenv("RESET_FROM_EMAIL","Є ПЛАН <noreply@eplan.com.ua>").strip()
    if not key:
        safe_log("resend_not_configured",logging.WARNING,configured=False)
        return False
    data=json.dumps({"from":sender,"to":[email],"subject":"Доступ до Є ПЛАН",
                     "html":f"<h2>Є ПЛАН</h2><p>Щоб створити або відновити пароль до кабінету, відкрийте посилання:</p><p><a href='{link}'>Встановити пароль</a></p><p>Якщо ви не очікували цей лист, просто проігноруйте його.</p>"}).encode()
    req=urllib.request.Request("https://api.resend.com/emails",data=data,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json","Accept":"application/json","User-Agent":"eplan.com.ua/1.0"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            ok=200<=r.status<300
            safe_log("resend_send_result",status=int(r.status))
            return ok
    except urllib.error.HTTPError as e:
        # Do not log recipient, Reason/body, Authorization header, or reset URL.
        safe_log("resend_send_error",logging.WARNING,status=int(e.code),error_type=type(e).__name__)
        return False
    except Exception as e:
        safe_log("resend_send_error",logging.WARNING,error_type=type(e).__name__)
        return False

# M06: enforce V92 catalogue relationships for new writes while remaining safe
# on an existing database that may contain legacy orphan rows. Fresh databases get
# validated named FKs directly in CREATE TABLE. Existing tables receive NOT VALID
# FKs (which still enforce/cascade all future DML); they are validated automatically
# only when the legacy rows are already clean.
def ensure_v92_fk_constraints(c):
    specs=(
        ("exercise_library","fk_exercise_library_group","group_id","exercise_groups"),
        ("exercise_muscles","fk_exercise_muscles_exercise","exercise_id","exercise_library"),
        ("exercise_muscles","fk_exercise_muscles_muscle","muscle_id","muscles"),
    )
    for table,name,column,parent in specs:
        existing=c.execute("SELECT convalidated FROM pg_constraint WHERE conname=%s AND conrelid=%s::regclass",(name,table)).fetchone()
        validated=bool(existing and existing.get("convalidated"))
        if not existing:
            c.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} FOREIGN KEY({column}) REFERENCES {parent}(id) ON DELETE CASCADE NOT VALID")
        orphan_count=c.execute(
            f"SELECT COUNT(*) AS n FROM {table} child LEFT JOIN {parent} parent ON parent.id=child.{column} WHERE parent.id IS NULL"
        ).fetchone()["n"]
        if not orphan_count and not validated:
            c.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")
        elif orphan_count:
            safe_log("m06_fk_not_validated",logging.WARNING,constraint=name,count=int(orphan_count))

# M06: PostgreSQL row locks in the writers are authoritative for application
# concurrency. When legacy data is already consistent, partial unique indexes add
# a second DB-level guard. We deliberately do not delete/merge old workouts during
# startup merely to make an index fit; such data must be reviewed first.
def ensure_workout_start_indexes(c):
    active_dups=c.execute("""SELECT COUNT(*) AS n FROM (
        SELECT client_id FROM workout_sessions WHERE status='training'
        GROUP BY client_id HAVING COUNT(*)>1
    ) q""").fetchone()["n"]
    if not active_dups:
        c.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_workout_sessions_one_active
                     ON workout_sessions(client_id) WHERE status='training'""")
    else:
        safe_log("m06_active_index_skipped",logging.WARNING,count=int(active_dups))
    day_dups=c.execute("""SELECT COUNT(*) AS n FROM (
        SELECT client_id,workout_day FROM workout_sessions WHERE workout_day IS NOT NULL
        GROUP BY client_id,workout_day HAVING COUNT(*)>1
    ) q""").fetchone()["n"]
    if not day_dups:
        c.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_workout_sessions_client_day
                     ON workout_sessions(client_id,workout_day) WHERE workout_day IS NOT NULL""")
    else:
        safe_log("m06_day_index_skipped",logging.WARNING,count=int(day_dups))

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
            technique_url TEXT DEFAULT '', UNIQUE(group_id,name),
            CONSTRAINT fk_exercise_library_group FOREIGN KEY(group_id) REFERENCES exercise_groups(id) ON DELETE CASCADE
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS muscles(
            id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort INTEGER DEFAULT 0
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS exercise_muscles(
            exercise_id INTEGER NOT NULL, muscle_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'primary',
            PRIMARY KEY(exercise_id,muscle_id),
            CONSTRAINT fk_exercise_muscles_exercise FOREIGN KEY(exercise_id) REFERENCES exercise_library(id) ON DELETE CASCADE,
            CONSTRAINT fk_exercise_muscles_muscle FOREIGN KEY(muscle_id) REFERENCES muscles(id) ON DELETE CASCADE
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_exercise_muscles_muscle ON exercise_muscles(muscle_id)")
        ensure_v92_fk_constraints(c)
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
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT ''")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan_code TEXT DEFAULT 'coaching'")
        c.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS access_until DATE")
        c.execute("UPDATE clients SET plan_code='coaching' WHERE plan_code IS NULL OR plan_code=''")

        c.execute("""CREATE TABLE IF NOT EXISTS measurements(id SERIAL PRIMARY KEY,client_id INTEGER,day TEXT,weight DOUBLE PRECISION,waist DOUBLE PRECISION,chest DOUBLE PRECISION,hips DOUBLE PRECISION)""")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS thighs DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS arms DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS shoulders DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS neck DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS calves DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS forearms DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS thighs_left DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS thighs_right DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS calves_left DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS calves_right DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS arms_left DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS arms_right DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS forearms_left DOUBLE PRECISION DEFAULT 0")
        c.execute("ALTER TABLE measurements ADD COLUMN IF NOT EXISTS forearms_right DOUBLE PRECISION DEFAULT 0")

        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS trainer_reviewed BOOLEAN DEFAULT FALSE")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS trainer_comment TEXT DEFAULT ''")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS program_snapshot TEXT DEFAULT ''")
        c.execute("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS workout_day DATE")
        # Legacy live sessions used PostgreSQL CURRENT_TIMESTAMP in a timezone-naive column (UTC wall time).
        # Convert that timestamp to the Kyiv calendar day once; manual daytime history remains on the same date.
        c.execute("""UPDATE workout_sessions SET workout_day=((started_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kyiv')::date WHERE workout_day IS NULL AND started_at IS NOT NULL""")
        ensure_workout_start_indexes(c)
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
            endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT,
            owner_role TEXT, owner_user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS owner_role TEXT")
        c.execute("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS owner_user_id INTEGER")
        c.execute("CREATE INDEX IF NOT EXISTS ix_push_subscriptions_owner ON push_subscriptions(owner_role,owner_user_id)")
        # R01 cannot safely attribute pre-R01 rows to a verified server identity.
        # Remove only unowned legacy bindings once the additive columns exist;
        # browsers with permission re-register under the current authenticated user.
        c.execute("DELETE FROM push_subscriptions WHERE owner_role IS NULL OR owner_user_id IS NULL")
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
        c.execute("""CREATE TABLE IF NOT EXISTS trainer_notes(
            client_id INTEGER PRIMARY KEY REFERENCES clients(id),
            body TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS weekly_checkins(
            id BIGSERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            week_start DATE NOT NULL,
            mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
            sleep INTEGER NOT NULL CHECK(sleep BETWEEN 1 AND 5),
            hunger INTEGER NOT NULL CHECK(hunger BETWEEN 1 AND 5),
            energy INTEGER NOT NULL CHECK(energy BETWEEN 1 AND 5),
            difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
            comment TEXT NOT NULL DEFAULT '',
            reviewed BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(client_id,week_start)
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_weekly_checkins_client_week ON weekly_checkins(client_id,week_start DESC)")

        # M03A additive migration: business tables and H05 migration are unchanged.
        c.execute("""CREATE TABLE IF NOT EXISTS security_rate_limits(
            bucket_key TEXT PRIMARY KEY,
            attempts INTEGER NOT NULL CHECK(attempts>=0),
            expires_at TIMESTAMPTZ NOT NULL
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_security_rate_limits_expires ON security_rate_limits(expires_at)")
        c.execute("DELETE FROM security_rate_limits WHERE expires_at<=CURRENT_TIMESTAMP")
        # P2H3: minimal trainer administrative audit. No request body, email,
        # token, push endpoint, free-text content or credential data is stored.
        c.execute("""CREATE TABLE IF NOT EXISTS security_admin_audit(
            id BIGSERIAL PRIMARY KEY,
            actor_role TEXT NOT NULL,
            actor_user_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            route TEXT NOT NULL,
            target_id BIGINT,
            status_code INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS ix_security_admin_audit_created ON security_admin_audit(created_at)")
        c.execute("CREATE INDEX IF NOT EXISTS ix_security_admin_audit_actor ON security_admin_audit(actor_role,actor_user_id,created_at)")
        c.execute("DELETE FROM security_admin_audit WHERE created_at<%s",(datetime.now(timezone.utc)-timedelta(days=180),))
        migrate_credentials(c)
        c.commit()
init()

def password_input_schema(schema:dict):
    # Compatibility-only input: add_client() uses its own random initial secret.
    # Keep the H01 write-only schema and omit the unused default from OpenAPI.
    schema.pop("default",None)
    schema["writeOnly"]=True

class Login(BaseModel):
    email:str=Field(max_length=254); password:str=Field(max_length=256)
class ClientStatusIn(BaseModel): status:str=Field(max_length=32)
class ClientAccessIn(BaseModel):
    plan_code:str=Field(default="coaching",max_length=64); access_until:str=Field(default="",max_length=32)
class ResetRequestIn(BaseModel): email:str=Field(max_length=254)
class ResetConfirmIn(BaseModel):
    token:str=Field(max_length=128); password:str=Field(max_length=256)
class ClientIn(BaseModel):
    name:str=Field(max_length=200); email:str=Field(max_length=254); password:str=Field(default="",max_length=256,json_schema_extra=password_input_schema); goal:str=Field(default="",max_length=2000); weight:float=Field(default=0,ge=0,le=MAX_WEIGHT_KG,allow_inf_nan=False); kcal:int=Field(default=0,ge=0,le=MAX_KCAL); protein:int=Field(default=0,ge=0,le=MAX_MACRO_G); fat:int=Field(default=0,ge=0,le=MAX_MACRO_G); carbs:int=Field(default=0,ge=0,le=MAX_MACRO_G)
class ProgramIn(BaseModel):
    client_id:int; day_name:str=Field(max_length=128); exercise:str=Field(max_length=255); sets:int=Field(default=3,ge=1,le=MAX_SET_COUNT); reps:str=Field(default="8-12",max_length=64); target_rir:int=Field(default=2,ge=0,le=MAX_RIR); superset_group:str=Field(default="",max_length=64); superset_order:int=Field(default=0,ge=0,le=MAX_SET_COUNT); technique_url:str=Field(default="",max_length=2048); rest_seconds:int=Field(default=0,ge=0,le=3600); rest_text:str=Field(default="",max_length=1000); rir_by_set:str=Field(default="",max_length=512); alternatives_json:str=Field(default="[]",max_length=65536)
class ClientProgramExerciseSwapIn(BaseModel):
    exercise:str=Field(max_length=255)
class ExerciseGroupIn(BaseModel): name:str=Field(max_length=120)
class MuscleIn(BaseModel): name:str=Field(max_length=120)
class ExerciseLibraryIn(BaseModel):
    group_id:int; name:str=Field(max_length=255); technique_url:str=Field(default="",max_length=2048); primary_muscle_ids:List[int]=Field(default_factory=list,max_length=64); secondary_muscle_ids:List[int]=Field(default_factory=list,max_length=64)
class CardioIn(BaseModel):
    client_id:int; day:date|None=None; cardio_type:str=Field(default="",max_length=32); minutes:int=Field(default=0,ge=0,le=MAX_CARDIO_MINUTES); speed:float=Field(default=0,ge=0,le=MAX_CARDIO_SPEED,allow_inf_nan=False); incline:float=Field(default=0,ge=0,le=MAX_CARDIO_INCLINE,allow_inf_nan=False); steps:int=Field(default=0,ge=0,le=MAX_STEPS)
class ProgramOrderIn(BaseModel):
    client_id:int
    day_name:str=Field(max_length=128)
    ordered_ids:list[int]=Field(max_length=300)
class ProgramDayTitleIn(BaseModel):
    client_id:int
    day_name:str=Field(max_length=128)
    title:str=Field(default="",max_length=255)
class ResultIn(BaseModel):
    client_id:int; exercise:str=Field(max_length=255); weight:float=Field(ge=0,le=MAX_WEIGHT_KG,allow_inf_nan=False); reps:int=Field(ge=1,le=MAX_REPS); sets:int=Field(ge=1,le=MAX_SET_COUNT); rir:int=Field(ge=0,le=MAX_RIR)
class SupersetIn(BaseModel):
    superset_group:str=Field(default="",max_length=64)
class SetIn(BaseModel):
    set_number:int=Field(ge=1,le=MAX_SET_COUNT); weight:float=Field(ge=0,le=MAX_WEIGHT_KG,allow_inf_nan=False); reps:int=Field(ge=1,le=MAX_REPS); rir:int=Field(ge=0,le=MAX_RIR)
class SetResultIn(BaseModel):
    client_id:int; program_id:int; exercise:str=Field(max_length=255); sets:List[SetIn]=Field(max_length=100)
class NutIn(BaseModel):
    client_id:int; kcal:int=Field(ge=0,le=MAX_KCAL); protein:int=Field(ge=0,le=MAX_MACRO_G); fat:int=Field(ge=0,le=MAX_MACRO_G); carbs:int=Field(ge=0,le=MAX_MACRO_G)
class MeasureIn(BaseModel):
    client_id:int
    day:date|None=None
    weight:float=Field(default=0,ge=0,le=MAX_WEIGHT_KG,allow_inf_nan=False)
    waist:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    chest:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    hips:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    thighs:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    arms:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    shoulders:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    neck:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    calves:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    forearms:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    thighs_left:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    thighs_right:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    calves_left:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    calves_right:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    arms_left:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    arms_right:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    forearms_left:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
    forearms_right:float=Field(default=0,ge=0,le=MAX_MEASUREMENT,allow_inf_nan=False)
class ClientProfileIn(BaseModel):
    first_name:str=Field(default="",max_length=120); last_name:str=Field(default="",max_length=120); age:int=Field(default=0,ge=0,le=150); sex:str=Field(default="",max_length=32); goal:str=Field(default="",max_length=2000); contraindications:str=Field(default="",max_length=10000); injuries:str=Field(default="",max_length=10000); contact:str=Field(default="",max_length=512); instagram:str=Field(default="",max_length=512); telegram:str=Field(default="",max_length=512); tiktok:str=Field(default="",max_length=512)
class TrainerNoteIn(BaseModel):
    body:str=Field(default="",max_length=10000)
class WeeklyCheckinIn(BaseModel):
    mood:int=Field(ge=1,le=5)
    sleep:int=Field(ge=1,le=5)
    hunger:int=Field(ge=1,le=5)
    energy:int=Field(ge=1,le=5)
    difficulty:int=Field(ge=1,le=5)
    comment:str=Field(default="",max_length=5000)
class CheckinReviewIn(BaseModel):
    reviewed:bool=True

class NutritionPlanItemIn(BaseModel):
    meal_number:int=Field(ge=1,le=100); variant_number:int=Field(default=1,ge=1,le=100); content:str=Field(default="",max_length=5000); sort:int=Field(default=0,ge=0,le=10_000)
class NutritionTargetIn(BaseModel):
    kcal:int=Field(default=0,ge=0,le=MAX_KCAL); protein:int=Field(default=0,ge=0,le=MAX_MACRO_G); fat:int=Field(default=0,ge=0,le=MAX_MACRO_G); carbs:int=Field(default=0,ge=0,le=MAX_MACRO_G); meal_plan:str=Field(default="",max_length=50000); meals:List[NutritionPlanItemIn]=Field(default_factory=list,max_length=100)
class WorkoutStartIn(BaseModel):
    client_id:int; day_name:str=Field(max_length=128)
class WorkoutReviewIn(BaseModel):
    comment:str=Field(default="",max_length=5000)
class NotificationReadIn(BaseModel):
    recipient:str=Field(max_length=16)
class PushSubscriptionIn(BaseModel):
    client_id:int=0
    recipient:str=Field(max_length=16)
    endpoint:str=Field(max_length=4096)
    p256dh:str=Field(max_length=512)
    auth:str=Field(max_length=512)
class PushUnsubscribeIn(BaseModel):
    endpoint:str=Field(max_length=4096)
class CommentIn(BaseModel):
    client_id:int; day:date; program_id:int=0; exercise:str=Field(default="",max_length=255); author:str=Field(max_length=16); body:str=Field(max_length=5000)
class HistoricalNutritionIn(BaseModel):
    client_id:int; day:date; kcal:int=Field(ge=0,le=MAX_KCAL); protein:int=Field(ge=0,le=MAX_MACRO_G); fat:int=Field(ge=0,le=MAX_MACRO_G); carbs:int=Field(ge=0,le=MAX_MACRO_G)
class HistoricalSetIn(BaseModel):
    program_id:int; exercise:str=Field(max_length=255); set_number:int=Field(ge=1,le=MAX_SET_COUNT); weight:float=Field(ge=0,le=MAX_WEIGHT_KG,allow_inf_nan=False); reps:int=Field(ge=1,le=MAX_REPS); rir:int=Field(ge=0,le=MAX_RIR)
class HistoricalWorkoutIn(BaseModel):
    client_id:int; day:date; day_name:str=Field(max_length=128); sets:List[HistoricalSetIn]=Field(max_length=200)

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
    if len(filename)>255 or not filename or Path(filename).name!=filename or "\\" in filename:
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
<link rel="stylesheet" href="/static/css/pwa-reset.css"></head><body><main><h1><span class="y">Є ПЛАН</span> · RESET</h1><p id="status">Очищаю стару PWA-конфігурацію…</p><pre id="log"></pre><button id="go" hidden>Відкрити чистий застосунок</button></main>
<script src="/static/js/pwa-reset.js"></script></body></html>""",headers={"Cache-Control":"no-store, no-cache, must-revalidate","Clear-Site-Data":"\"cache\""})

@app.get("/sw.js")
def service_worker(): return FileResponse(BASE/"static"/"sw.js",media_type="application/javascript",headers={"Service-Worker-Allowed":"/","Cache-Control":"no-cache"})
@app.get("/apple-touch-icon.png")
def apple_touch_icon():
    return FileResponse(STATIC_DIR / "icons" / "apple-touch-icon-v62.png", media_type="image/png", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

@app.get("/manifest.webmanifest")
def web_manifest(): return FileResponse(BASE/"static"/"manifest.webmanifest",media_type="application/manifest+json")
@app.get("/health")
def health(): return {"status":"online","version":"V3","database":"postgresql"}

@app.post("/api/login")
def login(x:Login,request:Request,response:Response):
    consume_rate_limit("login.source",rate_limit_source(request))
    role=None;u=None;credential=None
    with rate_limit_bucket("login.failure",x.email.strip().lower()) as (c,key):
        # Exhaustion is checked under the limiter row lock before any PBKDF2 work.
        # The account row is then locked so two successful logins cannot race the
        # lazy hash upgrade and invalidate each other's newly-created sessions.
        if x.email.lower()==configured_trainer_email().lower():
            trainer=c.execute("SELECT id,password FROM trainer_auth WHERE id=1 FOR UPDATE").fetchone()
            if trainer and check_password(x.password,trainer["password"]):
                role="trainer";credential=rehash_authenticated_password(c,"trainer",1,x.password,trainer["password"])
        if role is None:
            u=c.execute("SELECT * FROM clients WHERE LOWER(email)=LOWER(%s) FOR UPDATE",(x.email,)).fetchone()
            if u and check_password(x.password,u["password"]):
                role="client";credential=u["password"]
                if u["status"]!="Видалений":
                    credential=rehash_authenticated_password(c,"client",u["id"],x.password,credential)
        if role:
            c.execute("DELETE FROM security_rate_limits WHERE bucket_key=%s",(key,))
        else:
            c.execute("UPDATE security_rate_limits SET attempts=attempts+1 WHERE bucket_key=%s",(key,))
    if role=="trainer":return create_session(request,response,"trainer",credential)
    if role=="client":
        if u["status"]=="Видалений": raise HTTPException(403,"Цей акаунт видалено. Зверніться до тренера.")
        return create_session(request,response,"client",credential,u)
    raise HTTPException(401,"Невірний email або пароль")

def issue_password_reset_token(client_id:int,ttl:timedelta):
    """Create exactly one live reset/invitation token for an account.

    M04: every issuer locks the account row first, then invalidates older links
    and inserts the replacement in the same transaction. Confirm uses the same
    account-first lock order, so issuance and consumption serialize per account.
    """
    token=secrets.token_urlsafe(32)
    token_hash=hashlib.sha256(token.encode()).hexdigest()
    expires_at=datetime.utcnow()+ttl
    with con() as c:
        if client_id==0:
            account=c.execute("SELECT id FROM trainer_auth WHERE id=1 FOR UPDATE").fetchone()
        else:
            account=c.execute("SELECT id,status FROM clients WHERE id=%s FOR UPDATE",(client_id,)).fetchone()
            if account and account["status"]=="Видалений":account=None
        if not account:return None
        c.execute("UPDATE password_resets SET used=TRUE WHERE client_id=%s AND used=FALSE",(client_id,))
        c.execute("INSERT INTO password_resets(client_id,token_hash,expires_at) VALUES(%s,%s,%s)",
                  (client_id,token_hash,expires_at))
    return token

@app.post("/api/password-reset/request")
def password_reset_request(x:ResetRequestIn,request:Request):
    consume_rate_limit("reset_request.source",rate_limit_source(request))
    consume_rate_limit("reset_request.email",x.email.strip().lower())
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
    # Always return the same response to avoid revealing registered emails.
    if target_id is not None:
        token=issue_password_reset_token(target_id,timedelta(minutes=30))
        if token:
            base=os.getenv("APP_BASE_URL","").rstrip("/")
            if base:
                sent=send_reset_email(target_email,base+"/?reset="+token)
                safe_log("password_reset_delivery",sent=bool(sent),account_type=("trainer" if target_id==0 else "client"))
            else:
                safe_log("password_reset_base_url_missing",logging.ERROR,configured=False)
    return {"ok":True,"message":"Якщо така пошта зареєстрована, на неї надіслано посилання для відновлення пароля."}

@app.post("/api/password-reset/confirm")
def password_reset_confirm(x:ResetConfirmIn,request:Request,response:Response):
    consume_rate_limit("reset_confirm.source",rate_limit_source(request))
    consume_rate_limit("reset_confirm.token",x.token)
    if len(x.password)<8: raise HTTPException(400,"Пароль має містити щонайменше 8 символів")
    th=hashlib.sha256(x.token.encode()).hexdigest()
    current_cookie_hash=cookie_token_hash(request)
    now=datetime.utcnow()
    with con() as c:
        # First discover the target without claiming the token. We then lock the
        # account before the token and re-check it under lock. That single lock
        # order serializes different legacy tokens for the same account too.
        candidate=c.execute("SELECT id,client_id,expires_at,used FROM password_resets WHERE token_hash=%s",(th,)).fetchone()
        if not candidate or candidate["used"] or candidate["expires_at"]<now:
            raise HTTPException(400,"Посилання недійсне або вже прострочене")
        client_id=candidate["client_id"]
        if client_id==0:
            account=c.execute("SELECT id FROM trainer_auth WHERE id=1 FOR UPDATE").fetchone()
            if not account:raise HTTPException(400,"Посилання недійсне або вже прострочене")
        else:
            account=c.execute("SELECT id,status FROM clients WHERE id=%s FOR UPDATE",(client_id,)).fetchone()
            if not account or account["status"]=="Видалений":raise HTTPException(403,"Доступ до акаунта закрито")
        r=c.execute("SELECT id,client_id,expires_at,used FROM password_resets WHERE id=%s AND token_hash=%s FOR UPDATE",
                    (candidate["id"],th)).fetchone()
        if not r or r["used"] or r["expires_at"]<datetime.utcnow():
            raise HTTPException(400,"Посилання недійсне або вже прострочене")
        new_password_hash=hash_password(x.password)
        if client_id==0:
            c.execute("UPDATE trainer_auth SET password=%s WHERE id=1",(new_password_hash,))
            role,user_id="trainer",1
        else:
            c.execute("UPDATE clients SET password=%s WHERE id=%s",(new_password_hash,client_id))
            role,user_id="client",client_id
        # A successful reset closes every still-unused legacy link for this account.
        c.execute("UPDATE password_resets SET used=TRUE WHERE client_id=%s AND used=FALSE",(client_id,))
        c.execute("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE role=%s AND user_id=%s AND revoked_at IS NULL",
                  (role,user_id))
        # Preserve C01 behaviour: if this browser also has any current session,
        # revoke it inside the same transaction before deleting the cookie.
        if current_cookie_hash:
            c.execute("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=%s AND revoked_at IS NULL",
                      (current_cookie_hash,))
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
    "contraindications","injuries","contact","instagram","telegram","tiktok","avatar",
    "plan_code","access_until","access","live_status","needs_review_count",
    "finished_workout_count","last_finished_at","review_state",
    "workouts_28d","program_days_count","nutrition_days_7d","checkin_pending_count","last_checkin_at",
)

def client_response(record:dict|None):
    if record is None:return None
    return {key:record[key] for key in CLIENT_RESPONSE_FIELDS if key in record}

@app.get("/api/clients")
def clients(limit:int=Query(API_PAGE_SIZE,ge=1,le=API_PAGE_MAX),
            offset:int=Query(0,ge=0,le=API_OFFSET_MAX),
            user:AuthUser=Depends(require_trainer)):
    # M03B2: one bounded query replaces the former per-client review N+1.
    xs=rows("""SELECT c.*, CASE WHEN EXISTS(
        SELECT 1 FROM workout_sessions active
        WHERE active.client_id=c.id AND active.status='training'
    ) THEN 'Тренується' ELSE c.status END AS live_status,
        COALESCE(w.needs_review_count,0) AS needs_review_count,
        COALESCE(w.finished_count,0) AS finished_count,
        COALESCE(w.workouts_28d,0) AS workouts_28d,
        COALESCE(pd.program_days_count,0) AS program_days_count,
        w.last_finished_at AS last_finished_at,
        COALESCE(n.nutrition_days_7d,0) AS nutrition_days_7d,
        COALESCE(ch.checkin_pending_count,0) AS checkin_pending_count,
        ch.last_checkin_at AS last_checkin_at
    FROM clients c
    LEFT JOIN (
        SELECT client_id,
          COUNT(*) FILTER (WHERE status='finished' AND COALESCE(trainer_reviewed,FALSE)=FALSE) AS needs_review_count,
          COUNT(*) FILTER (WHERE status='finished') AS finished_count,
          COUNT(*) FILTER (
            WHERE status='finished'
              AND COALESCE(finished_at,started_at)>=CURRENT_TIMESTAMP-INTERVAL '28 days'
          ) AS workouts_28d,
          MAX(finished_at) FILTER (WHERE status='finished') AS last_finished_at
        FROM workout_sessions
        GROUP BY client_id
    ) w ON w.client_id=c.id
    LEFT JOIN (
        SELECT client_id,COUNT(DISTINCT day_name) AS program_days_count
        FROM program
        GROUP BY client_id
    ) pd ON pd.client_id=c.id
    LEFT JOIN (
        SELECT client_id,
          COUNT(DISTINCT day) FILTER (
            WHERE day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND day >= TO_CHAR(CURRENT_DATE-6,'YYYY-MM-DD')
          ) AS nutrition_days_7d
        FROM nutrition
        GROUP BY client_id
    ) n ON n.client_id=c.id
    LEFT JOIN (
        SELECT client_id,
          COUNT(*) FILTER (WHERE reviewed=FALSE) AS checkin_pending_count,
          MAX(created_at) AS last_checkin_at
        FROM weekly_checkins
        GROUP BY client_id
    ) ch ON ch.client_id=c.id
    WHERE c.status<>'Видалений'
    ORDER BY c.id DESC
    LIMIT ? OFFSET ?""",(limit,offset))
    for c in xs:
        c["access"]=access_info(c)
        c["needs_review_count"]=int(c.get("needs_review_count") or 0)
        c["finished_workout_count"]=int(c.get("finished_count") or 0)
        c["workouts_28d"]=int(c.get("workouts_28d") or 0)
        c["program_days_count"]=int(c.get("program_days_count") or 0)
        c["nutrition_days_7d"]=int(c.get("nutrition_days_7d") or 0)
        c["checkin_pending_count"]=int(c.get("checkin_pending_count") or 0)
        c["last_finished_at"]=c.get("last_finished_at")
        c["review_state"]="needs_review" if c["needs_review_count"]>0 else ("reviewed" if c["finished_workout_count"]>0 else "none")
    return [client_response(c) for c in xs]

@app.post("/api/clients")
def add_client(x:ClientIn,user:AuthUser=Depends(require_trainer)):
    consume_rate_limit("invite.actor",f"{user.role}:{user.user_id}")
    email=x.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]: raise HTTPException(400,"Вкажи коректний email")
    # Trainer creates the client by real email. The client sets their own password from the invitation.
    initial_password=secrets.token_urlsafe(32)
    try:
        i=run("INSERT INTO clients(name,email,password,goal,weight,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?,?,?,?)",(x.name.strip(),email,hash_password(initial_password),x.goal,x.weight,x.kcal,x.protein,x.fat,x.carbs))
        if x.weight: run("INSERT INTO measurements(client_id,day,weight) VALUES(?,?,?)",(i,str(kyiv_today()),x.weight))
        token=issue_password_reset_token(i,timedelta(hours=24))
        base=os.getenv("APP_BASE_URL","").rstrip("/")
        sent=False
        if base and token:
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
def client(cid:int,limit:int=Query(API_PAGE_SIZE,ge=1,le=API_PAGE_MAX),
           offset:int=Query(0,ge=0,le=API_OFFSET_MAX),
           user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    queries={
        "program":"SELECT * FROM program WHERE client_id=? ORDER BY day_name,sort,id",
        "program_days":"SELECT * FROM program_days WHERE client_id=? ORDER BY day_name",
        "results":"SELECT * FROM results WHERE client_id=? ORDER BY day DESC,id DESC",
        "result_sets":"SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number,id",
        "nutrition":"SELECT * FROM nutrition WHERE client_id=? ORDER BY day DESC,id DESC",
        "nutrition_plan":"SELECT * FROM nutrition_plan_items WHERE client_id=? ORDER BY meal_number,variant_number,sort,id",
        "measurements":"SELECT * FROM measurements WHERE client_id=? ORDER BY day,id",
        "workout_sessions":"""SELECT workout_sessions.*,
            GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (COALESCE(finished_at,CURRENT_TIMESTAMP)-started_at))))::BIGINT AS duration_seconds
          FROM workout_sessions WHERE client_id=? ORDER BY id DESC""",
        "comments":"SELECT * FROM comments WHERE client_id=? ORDER BY created_at DESC,id DESC",
        "cardio":"SELECT * FROM cardio_log WHERE client_id=? ORDER BY day DESC,id DESC",
        "checkins":"SELECT * FROM weekly_checkins WHERE client_id=? ORDER BY week_start DESC,id DESC",
    }
    # Keep the whole page on one DB connection. M03B2 removes the old helper
    # pattern of opening a fresh connection for each collection in this card.
    with con() as db:
        row=db.execute("SELECT * FROM clients WHERE id=%s",(cid,)).fetchone()
        if not row: raise HTTPException(404)
        c=dict(row);c["access"]=access_info(c)
        data={"client":client_response(c)}
        more=False
        for key,q in queries.items():
            page,has_more=paged_rows_from(db,q,(cid,),limit,offset)
            if key=="program":
                for item in page:item["technique_url"]=safe_technique_url(item.get("technique_url") or "")
            elif key=="workout_sessions":
                for item in page:item["program_snapshot"]=sanitize_program_snapshot(item.get("program_snapshot") or "")
            data[key]=page
            more=more or has_more
    if user.role=="trainer":
        note=db_note=one("SELECT body,updated_at FROM trainer_notes WHERE client_id=?",(cid,))
        data["trainer_note"]=note or {"body":"","updated_at":None}
    data["pagination"]={"limit":limit,"offset":offset,"has_more":more}
    return data
@app.patch("/api/client/{cid}/profile")
def update_client_profile(cid:int,x:ClientProfileIn,user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    display=(x.first_name.strip()+" "+x.last_name.strip()).strip()
    run("UPDATE clients SET first_name=?,last_name=?,age=?,sex=?,goal=?,contraindications=?,injuries=?,contact=?,instagram=?,telegram=?,tiktok=?,name=CASE WHEN ?<>'' THEN ? ELSE name END WHERE id=?",(x.first_name.strip(),x.last_name.strip(),max(0,x.age),x.sex.strip(),x.goal.strip(),x.contraindications.strip(),x.injuries.strip(),x.contact.strip(),x.instagram.strip(),x.telegram.strip(),x.tiktok.strip(),display,display,cid))
    return client_response(one("SELECT * FROM clients WHERE id=?",(cid,)))

@app.put("/api/client/{cid}/trainer-note")
def save_trainer_note(cid:int,x:TrainerNoteIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    with con() as c:
        c.execute("""INSERT INTO trainer_notes(client_id,body,updated_at)
                     VALUES(%s,%s,CURRENT_TIMESTAMP)
                     ON CONFLICT(client_id) DO UPDATE SET body=EXCLUDED.body,updated_at=CURRENT_TIMESTAMP""",(cid,x.body.strip()))
        c.commit()
    return {"ok":True}

@app.post("/api/client/{cid}/checkin")
def save_weekly_checkin(cid:int,x:WeeklyCheckinIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,cid)
    require_active_client(cid)
    today=kyiv_today()
    week=today-timedelta(days=today.weekday())
    with con() as c:
        c.execute("""INSERT INTO weekly_checkins(client_id,week_start,mood,sleep,hunger,energy,difficulty,comment,reviewed)
                     VALUES(%s,%s,%s,%s,%s,%s,%s,%s,FALSE)
                     ON CONFLICT(client_id,week_start) DO UPDATE SET
                       mood=EXCLUDED.mood,sleep=EXCLUDED.sleep,hunger=EXCLUDED.hunger,
                       energy=EXCLUDED.energy,difficulty=EXCLUDED.difficulty,
                       comment=EXCLUDED.comment,reviewed=FALSE,created_at=CURRENT_TIMESTAMP""",
                  (cid,week,x.mood,x.sleep,x.hunger,x.energy,x.difficulty,x.comment.strip()))
        c.execute("INSERT INTO notifications(client_id,recipient,kind,message,target_tab,target_day) VALUES(%s,%s,%s,%s,%s,%s)",
                  (cid,"trainer","checkin","Клієнт заповнив щотижневий звіт","profile",str(today)))
        c.commit()
    return {"ok":True,"week_start":str(week)}

@app.patch("/api/client/{cid}/checkin/{checkin_id}/review")
def review_weekly_checkin(cid:int,checkin_id:int,x:CheckinReviewIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    with con() as c:
        row=c.execute("SELECT id FROM weekly_checkins WHERE id=%s AND client_id=%s FOR UPDATE",(checkin_id,cid)).fetchone()
        if not row:raise HTTPException(404,"Щотижневий звіт не знайдено")
        c.execute("UPDATE weekly_checkins SET reviewed=%s WHERE id=%s",(x.reviewed,checkin_id))
        c.commit()
    return {"ok":True}

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
    cardio_day=x.day or kyiv_today()
    d=str(cardio_day)
    if cardio_day>kyiv_today(): raise HTTPException(400,"Майбутню дату заповнювати не можна")
    if x.cardio_type not in ("","Доріжка","Орбітрек","Велосипед"): raise HTTPException(400,"Невідомий тип кардіо")
    old=one("SELECT id FROM cardio_log WHERE client_id=? AND day=?",(x.client_id,d))
    vals=(x.cardio_type,x.minutes,x.speed,x.incline,x.steps)
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
        exercise["technique_url"]=safe_technique_url(exercise.get("technique_url") or "")
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
    # M06: lock the parent row; ON DELETE CASCADE handles exercises and links in
    # the same transaction. Concurrent add/edit must lock the same group first.
    with con() as c:
        group=c.execute("SELECT id FROM exercise_groups WHERE id=%s FOR UPDATE",(gid,)).fetchone()
        if group:c.execute("DELETE FROM exercise_groups WHERE id=%s",(gid,))
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
        muscle=c.execute("SELECT id FROM muscles WHERE id=%s FOR UPDATE",(mid,)).fetchone()
        if muscle:c.execute("DELETE FROM muscles WHERE id=%s",(mid,))
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
        # Lock parents in deterministic order so a concurrent muscle deletion
        # cannot pass between validation and relation inserts.
        wanted=sorted(set(all_ids))
        found={r["id"] for r in c.execute("SELECT id FROM muscles WHERE id = ANY(%s) ORDER BY id FOR UPDATE",(wanted,)).fetchall()}
        if found!=set(wanted): raise HTTPException(400,"Один із вибраних м’язів не знайдено")
    c.execute("DELETE FROM exercise_muscles WHERE exercise_id=%s",(eid,))
    for mid in primary: c.execute("INSERT INTO exercise_muscles(exercise_id,muscle_id,role) VALUES(%s,%s,'primary')",(eid,mid))
    for mid in secondary: c.execute("INSERT INTO exercise_muscles(exercise_id,muscle_id,role) VALUES(%s,%s,'secondary')",(eid,mid))

@app.post("/api/exercise-library/exercises")
def add_library_exercise(x:ExerciseLibraryIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву вправи")
    technique_url=require_technique_url(x.technique_url)
    with con() as c:
        if not c.execute("SELECT id FROM exercise_groups WHERE id=%s FOR UPDATE",(x.group_id,)).fetchone(): raise HTTPException(404,"Групу не знайдено")
        old=c.execute("SELECT id FROM exercise_library WHERE group_id=%s AND lower(name)=lower(%s) FOR UPDATE",(x.group_id,name)).fetchone()
        if old:
            eid=old["id"]
            c.execute("UPDATE exercise_library SET technique_url=%s WHERE id=%s",(technique_url,eid))
        else:
            eid=c.execute("INSERT INTO exercise_library(group_id,name,technique_url) VALUES(%s,%s,%s) RETURNING id",(x.group_id,name,technique_url)).fetchone()["id"]
        save_exercise_muscles(c,eid,x)
        c.commit()
    return {"id":eid}

@app.put("/api/exercise-library/exercises/{eid}")
def edit_library_exercise(eid:int,x:ExerciseLibraryIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву вправи")
    technique_url=require_technique_url(x.technique_url)
    with con() as c:
        if not c.execute("SELECT id FROM exercise_library WHERE id=%s FOR UPDATE",(eid,)).fetchone(): raise HTTPException(404,"Вправу не знайдено")
        if not c.execute("SELECT id FROM exercise_groups WHERE id=%s FOR UPDATE",(x.group_id,)).fetchone(): raise HTTPException(404,"Групу не знайдено")
        duplicate=c.execute("SELECT id FROM exercise_library WHERE group_id=%s AND lower(name)=lower(%s) AND id<>%s",(x.group_id,name,eid)).fetchone()
        if duplicate: raise HTTPException(400,"Вправа з такою назвою вже є в цій групі")
        c.execute("UPDATE exercise_library SET group_id=%s,name=%s,technique_url=%s WHERE id=%s",(x.group_id,name,technique_url,eid))
        save_exercise_muscles(c,eid,x)
        c.commit()
    return {"ok":True}

@app.delete("/api/exercise-library/exercises/{eid}")
def delete_library_exercise(eid:int,user:AuthUser=Depends(require_trainer)):
    with con() as c:
        exercise=c.execute("SELECT id FROM exercise_library WHERE id=%s FOR UPDATE",(eid,)).fetchone()
        if exercise:c.execute("DELETE FROM exercise_library WHERE id=%s",(eid,))
        c.commit()
    return {"ok":True}

@app.post("/api/program")
def add_program(x:ProgramIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,x.client_id)
    technique_url=require_technique_url(x.technique_url)
    i=run("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url,rest_seconds,rest_text,rir_by_set,alternatives_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(x.client_id,x.day_name,x.exercise,x.sets,x.reps,x.target_rir,x.superset_group,x.superset_order,technique_url,x.rest_seconds,x.rest_text.strip(),x.rir_by_set.strip(),x.alternatives_json.strip() or "[]")); return {"id":i}
@app.put("/api/program/{pid}")
def edit_program(pid:int,x:ProgramIn,user:AuthUser=Depends(require_trainer)):
    p=owned_record(user,"program",pid)
    if x.client_id!=p["client_id"]:raise HTTPException(403,"Вправа належить іншому клієнту")
    p=one("SELECT * FROM program WHERE id=?",(pid,))
    if not p: raise HTTPException(404,"Вправу не знайдено")
    technique_url=require_technique_url(x.technique_url)
    run("""UPDATE program SET day_name=?,exercise=?,sets=?,reps=?,target_rir=?,technique_url=?,rest_seconds=?,rest_text=?,rir_by_set=?,alternatives_json=?
           WHERE id=?""",(x.day_name.strip(),x.exercise.strip(),x.sets,x.reps.strip(),x.target_rir,technique_url,x.rest_seconds,x.rest_text.strip(),x.rir_by_set.strip(),x.alternatives_json.strip() or "[]",pid))
    return {"ok":True}

@app.patch("/api/program/{pid}/client-exercise")
def client_replace_program_exercise(pid:int,x:ClientProgramExerciseSwapIn,user:AuthUser=Depends(require_client)):
    selected=x.exercise.strip()
    if not selected:raise HTTPException(400,"Оберіть вправу")
    require_active_client(user.client_id,'workouts')
    with con() as c:
        row=c.execute("SELECT * FROM program WHERE id=%s FOR UPDATE",(pid,)).fetchone()
        if not row:raise HTTPException(404,"Вправу не знайдено")
        p=dict(row)
        authorize_client(user,p["client_id"])
        if p["client_id"]!=user.client_id:raise HTTPException(403,"Немає доступу до цієї вправи")
        try:
            alternatives=json.loads(p.get("alternatives_json") or "[]")
        except (TypeError,ValueError):
            alternatives=[]
        if not isinstance(alternatives,list):alternatives=[]
        alternatives=[str(v).strip() for v in alternatives if str(v).strip()]
        allowed=[str(p.get("exercise") or "").strip(),*alternatives]
        if selected not in allowed:
            raise HTTPException(400,"Цю вправу не дозволено як заміну")
        current=str(p.get("exercise") or "").strip()
        if selected!=current:
            new_alts=[]
            for name in [current,*alternatives]:
                if name and name!=selected and name not in new_alts:new_alts.append(name)
            lib=c.execute("SELECT technique_url FROM exercise_library WHERE lower(name)=lower(%s) ORDER BY id LIMIT 1",(selected,)).fetchone()
            technique_url=safe_technique_url((lib["technique_url"] if lib else "") or "")
            c.execute("UPDATE program SET exercise=%s,alternatives_json=%s,technique_url=%s WHERE id=%s",
                      (selected,json.dumps(new_alts,ensure_ascii=False),technique_url,pid))
        c.commit()
    return {"ok":True,"exercise":selected}

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
    require_active_client(x.client_id,'workouts')
    i=run("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(?,?,?,?,?,?,?)",(x.client_id,x.exercise,str(kyiv_today()),x.weight,x.reps,x.sets,x.rir)); return {"id":i}

@app.post("/api/result-sets")
def add_result_sets(x:SetResultIn,user:AuthUser=Depends(require_client)):
    authorize_program(user,x.program_id,x.client_id)
    require_active_client(x.client_id,'workouts')
    if not x.sets:
        raise HTTPException(400,"Додай хоча б один підхід")
    numbers=[s.set_number for s in x.sets]
    if len(numbers)!=len(set(numbers)):
        raise HTTPException(400,"Номери підходів не мають повторюватися")
    today=str(kyiv_today())
    ids=[]
    # Explicit editing remains allowed, but replacement is all-or-nothing.
    with con() as c:
        c.execute("DELETE FROM result_sets WHERE client_id=%s AND program_id=%s AND day=%s",(x.client_id,x.program_id,today))
        for item in x.sets:
            row=c.execute("""INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir)
                             VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                          (x.client_id,x.program_id,x.exercise,today,item.set_number,item.weight,item.reps,item.rir)).fetchone()
            ids.append(row["id"])
        c.commit()
    return {"ok":True,"ids":ids}

@app.get("/api/result-sets/{cid}")
def result_set_history(cid:int,limit:int=Query(API_PAGE_SIZE,ge=1,le=API_PAGE_MAX),
                       offset:int=Query(0,ge=0,le=API_OFFSET_MAX),
                       user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    page,_=paged_rows("SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number,id",(cid,),limit,offset)
    return page


def _b64url(data:bytes)->str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

# R01: browser push is an outbound server request. Only the three providers
# used by the supported Chrome/Firefox/Safari Web Push stacks are accepted.
# This deliberately avoids accepting arbitrary HTTPS destinations from users.
PUSH_ENDPOINT_HOSTS={
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
}
# Microsoft Edge/Web Push may use WNS hosts such as wns2-*.notify.windows.com.
# The suffix is provider-owned, not an arbitrary user-controlled hostname.
PUSH_ENDPOINT_SUFFIXES=(".notify.windows.com",)
PUSH_SEND_TIMEOUT_SECONDS=10


def _decode_push_b64url(value:str)->bytes:
    value=(value or "").strip()
    if not value or len(value)>512:
        raise ValueError("invalid push key")
    # Browser PushSubscription.toJSON() emits URL-safe base64. Reject other
    # alphabets/embedded padding instead of handing surprising data downstream.
    allowed="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    if any(ch not in allowed for ch in value):
        raise ValueError("invalid push key")
    try:
        return base64.urlsafe_b64decode(value+"="*((4-len(value)%4)%4))
    except Exception as e:
        raise ValueError("invalid push key") from e


def validate_push_subscription(endpoint:str,p256dh:str,auth:str)->tuple[str,str,str]:
    endpoint=(endpoint or "").strip()
    if not endpoint or len(endpoint)>4096 or any(ord(ch)<32 or ch=="\\" for ch in endpoint):
        raise ValueError("invalid push endpoint")
    try:
        u=urllib.parse.urlsplit(endpoint)
        host=(u.hostname or "").rstrip(".").lower()
        port=u.port
    except ValueError as e:
        raise ValueError("invalid push endpoint") from e
    provider_ok=host in PUSH_ENDPOINT_HOSTS or any(host.endswith(suffix) for suffix in PUSH_ENDPOINT_SUFFIXES)
    if (u.scheme.lower()!="https" or not host or not provider_ok or
        u.username is not None or u.password is not None or u.fragment or
        port not in (None,443) or not u.path or u.path=="/"):
        raise ValueError("invalid push endpoint")
    key=_decode_push_b64url(p256dh)
    secret=_decode_push_b64url(auth)
    # Web Push uses an uncompressed P-256 public key and a 16-byte auth secret.
    if len(key)!=65 or key[0]!=4 or len(secret)!=16:
        raise ValueError("invalid push key")
    return endpoint,p256dh.strip(),auth.strip()


def safe_technique_url(value:str)->str:
    """Return only a safe external technique/video URL for browser navigation.

    Existing legacy DB rows are not deleted. Unsafe historical values are simply
    not exposed as clickable links; new writes are rejected by require_technique_url().
    """
    value=(value or "").strip()
    if not value or len(value)>2048 or any(ord(ch)<32 or ch=="\\" for ch in value):
        return ""
    try:
        u=urllib.parse.urlsplit(value)
        _=u.port  # validates malformed ports without restricting valid HTTPS ports.
    except ValueError:
        return ""
    if u.scheme.lower()!="https" or not u.hostname or u.username is not None or u.password is not None:
        return ""
    return value


def require_technique_url(value:str)->str:
    raw=(value or "").strip()
    if not raw:return ""
    safe=safe_technique_url(raw)
    if not safe:
        raise HTTPException(400,"Посилання на техніку має бути коректною HTTPS-адресою")
    return safe


def sanitize_program_snapshot(value:str)->str:
    if not value:return value or ""
    try:data=json.loads(value)
    except (TypeError,ValueError):return value
    if not isinstance(data,list):return value
    changed=False
    for item in data:
        if isinstance(item,dict) and "technique_url" in item:
            safe=safe_technique_url(item.get("technique_url") or "")
            if safe!=item.get("technique_url"):
                item["technique_url"]=safe;changed=True
    return json.dumps(data,ensure_ascii=False) if changed else value

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
    if recipient=="trainer":
        # One trainer exists in this installation. R01 binds trainer push rows to
        # that authenticated account rather than to the client that caused an event.
        subs=rows("SELECT * FROM push_subscriptions WHERE recipient='trainer' AND owner_role='trainer' AND owner_user_id=1")
    elif recipient=="client":
        subs=rows("SELECT * FROM push_subscriptions WHERE client_id=? AND recipient='client' AND owner_role='client' AND owner_user_id=?",(client_id,client_id))
    else:
        return False
    payload=json.dumps({"title":title,"body":body,"url":url},ensure_ascii=False)
    ok=False
    for s in subs:
        try:
            endpoint,p256dh,auth=validate_push_subscription(s["endpoint"],s["p256dh"],s["auth"])
        except ValueError:
            # Never perform an outbound request for legacy/corrupt/forbidden rows.
            run("DELETE FROM push_subscriptions WHERE id=?",(s["id"],))
            continue
        try:
            webpush(subscription_info={"endpoint":endpoint,"keys":{"p256dh":p256dh,"auth":auth}},
                    data=payload,vapid_private_key=private_key,
                    vapid_claims={"sub":os.getenv("VAPID_SUBJECT","mailto:trainer@eplan.com.ua")},
                    timeout=PUSH_SEND_TIMEOUT_SECONDS)
            ok=True
        except Exception as e:
            status=getattr(getattr(e,"response",None),"status_code",None)
            if status in (404,410):
                run("DELETE FROM push_subscriptions WHERE id=?",(s["id"],))
            else:
                safe_log("web_push_send_error",logging.WARNING,error_type=type(e).__name__,status=(int(status) if status is not None else None))
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
    if user.role=="trainer":
        if x.client_id!=0:raise HTTPException(403,"Невірний власник push-підписки")
        owner_id=user.user_id
    else:
        if x.client_id!=user.client_id:raise HTTPException(403,"Невірний власник push-підписки")
        authorize_client(user,x.client_id)
        owner_id=user.user_id
    try:
        endpoint,p256dh,auth=validate_push_subscription(x.endpoint,x.p256dh,x.auth)
    except ValueError:
        raise HTTPException(400,"Некоректна push-підписка") from None
    with con() as c:
        saved=c.execute("""INSERT INTO push_subscriptions(client_id,recipient,endpoint,p256dh,auth,owner_role,owner_user_id)
           VALUES(%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT(endpoint) DO UPDATE SET
             client_id=EXCLUDED.client_id,recipient=EXCLUDED.recipient,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,
             owner_role=EXCLUDED.owner_role,owner_user_id=EXCLUDED.owner_user_id
           WHERE push_subscriptions.owner_role=EXCLUDED.owner_role
             AND push_subscriptions.owner_user_id=EXCLUDED.owner_user_id
           RETURNING id""",(x.client_id,x.recipient,endpoint,p256dh,auth,user.role,owner_id)).fetchone()
        if not saved:raise HTTPException(409,"Потрібна нова push-підписка для цього акаунта")
        c.commit()
    return {"ok":True}

@app.delete("/api/push/subscribe")
def push_unsubscribe(x:PushUnsubscribeIn,user:AuthUser=Depends(current_user)):
    endpoint=(x.endpoint or "").strip()
    if not endpoint:raise HTTPException(400,"Неповна push-підписка")
    with con() as c:
        c.execute("DELETE FROM push_subscriptions WHERE endpoint=%s AND owner_role=%s AND owner_user_id=%s",
                  (endpoint,user.role,user.user_id))
        c.commit()
    return {"ok":True}

@app.post("/api/workout/start")
def start_workout(x:WorkoutStartIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'workouts')
    today=str(kyiv_today())
    created=False
    try:
        # M06: every workout-session writer locks the client row first. This
        # serializes concurrent starts/history inserts across workers using the
        # shared PostgreSQL database. Optional unique indexes add defence in depth.
        with con() as c:
            if not c.execute("SELECT id FROM clients WHERE id=%s FOR UPDATE",(x.client_id,)).fetchone():
                raise HTTPException(404,"Клієнта не знайдено")
            active=c.execute("SELECT * FROM workout_sessions WHERE client_id=%s AND status='training' ORDER BY id DESC LIMIT 1",(x.client_id,)).fetchone()
            if active:
                session=dict(active)
            else:
                existing=c.execute("""SELECT * FROM workout_sessions
                                      WHERE client_id=%s AND COALESCE(workout_day,CAST(started_at AS DATE))=%s
                                      ORDER BY id DESC LIMIT 1""",(x.client_id,today)).fetchone()
                if existing:
                    raise HTTPException(400,"Сьогодні тренування вже було розпочато. Нове тренування буде доступне завтра.")
                snapshot_rows=[dict(r) for r in c.execute("""SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url,rest_seconds,rest_text,rir_by_set,alternatives_json
                                                                  FROM program WHERE client_id=%s AND day_name=%s ORDER BY id""",(x.client_id,x.day_name)).fetchall()]
                for item in snapshot_rows:item["technique_url"]=safe_technique_url(item.get("technique_url") or "")
                snapshot=json.dumps(snapshot_rows,ensure_ascii=False)
                row=c.execute("""INSERT INTO workout_sessions(client_id,day_name,status,program_snapshot,workout_day)
                                 VALUES(%s,%s,%s,%s,CAST(%s AS DATE)) RETURNING *""",
                              (x.client_id,x.day_name,"training",snapshot,today)).fetchone()
                session=dict(row)
                created=True
            c.commit()
    except psycopg.errors.UniqueViolation:
        # A DB-level guard may win before this transaction after a concurrent
        # request. Preserve the public contract: reuse the active session, or
        # report that today's workout already exists.
        active=one("SELECT * FROM workout_sessions WHERE client_id=? AND status='training' ORDER BY id DESC LIMIT 1",(x.client_id,))
        if active:return active
        raise HTTPException(400,"Сьогодні тренування вже було розпочато. Нове тренування буде доступне завтра.") from None
    if session.get("status")!="training":
        return session
    # Only the request that inserted a new row emits the start telegram.
    client_info=one("SELECT name,first_name,last_name FROM clients WHERE id=?",(x.client_id,)) if created else None
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
    if x.day > kyiv_today():
        raise HTTPException(400,"Не можна додавати дані на майбутню дату")
    day=str(x.day)
    existing=one("SELECT id FROM nutrition WHERE client_id=? AND day=? ORDER BY id DESC LIMIT 1",(x.client_id,day))
    if existing:
        run("UPDATE nutrition SET kcal=?,protein=?,fat=?,carbs=? WHERE id=?",(x.kcal,x.protein,x.fat,x.carbs,existing["id"]))
        return one("SELECT * FROM nutrition WHERE id=?",(existing["id"],))
    i=run("INSERT INTO nutrition(client_id,day,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?)",(x.client_id,day,x.kcal,x.protein,x.fat,x.carbs))
    return one("SELECT * FROM nutrition WHERE id=?",(i,))

@app.post("/api/history/workout")
def historical_workout(x:HistoricalWorkoutIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    for item in x.sets:authorize_program(user,item.program_id,x.client_id)
    require_active_client(x.client_id,'workouts')
    if x.day > kyiv_today():
        raise HTTPException(400,"Не можна додавати тренування на майбутню дату")
    if not x.sets:
        raise HTTPException(400,"Додай хоча б один підхід")
    keys=[(item.program_id,item.set_number) for item in x.sets]
    if len(keys)!=len(set(keys)):
        raise HTTPException(400,"Номери підходів однієї вправи не мають повторюватися")
    day=str(x.day)
    try:
        # M05 keeps session+sets atomic. M06 additionally takes the same client
        # row lock as live start, so concurrent writers cannot both pass the
        # "one workout per client/day" check.
        with con() as c:
            if not c.execute("SELECT id FROM clients WHERE id=%s FOR UPDATE",(x.client_id,)).fetchone():
                raise HTTPException(404,"Клієнта не знайдено")
            existing=c.execute("""SELECT id FROM workout_sessions
                                  WHERE client_id=%s AND COALESCE(workout_day,CAST(started_at AS DATE))=%s
                                  ORDER BY id DESC LIMIT 1""",(x.client_id,day)).fetchone()
            if existing:
                raise HTTPException(400,"Тренування за цей день уже записано")
            for item in x.sets:
                c.execute("""INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir)
                             VALUES(%s,%s,%s,%s,%s,%s,%s,%s)""",
                          (x.client_id,item.program_id,item.exercise,day,item.set_number,item.weight,item.reps,item.rir))
            snapshot=[dict(row) for row in c.execute("""SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order
                                                         FROM program WHERE client_id=%s AND day_name=%s ORDER BY id""",
                                                      (x.client_id,x.day_name)).fetchall()]
            snapshot_json=json.dumps(snapshot,ensure_ascii=False)
            c.execute("""INSERT INTO workout_sessions(client_id,day_name,started_at,finished_at,status,program_snapshot,workout_day)
                         VALUES(%s,%s,CAST(%s AS TIMESTAMP),CAST(%s AS TIMESTAMP),'finished',%s,CAST(%s AS DATE))""",
                      (x.client_id,x.day_name,day+" 12:00:00",day+" 13:00:00",snapshot_json,day))
            c.commit()
    except psycopg.errors.UniqueViolation:
        if one("SELECT id FROM workout_sessions WHERE client_id=? AND workout_day=CAST(? AS DATE) LIMIT 1",(x.client_id,day)):
            raise HTTPException(400,"Тренування за цей день уже записано") from None
        raise HTTPException(409,"Підходи за цей день уже збережені") from None
    return {"ok":True}

@app.post("/api/comments")
def add_comment(x:CommentIn,user:AuthUser=Depends(current_user)):
    authorize_client(user,x.client_id)
    if x.program_id:authorize_program(user,x.program_id,x.client_id)
    x.author=user.role
    if not x.body.strip(): raise HTTPException(400,"Коментар порожній")
    day=str(x.day)
    i=run("INSERT INTO comments(client_id,day,program_id,exercise,author,body) VALUES(?,?,?,?,?,?)",
          (x.client_id,day,x.program_id,x.exercise,x.author,x.body.strip()))
    recipient="client" if x.author=="trainer" else "trainer"
    who="Тренер" if x.author=="trainer" else "Клієнт"
    target=(" до вправи «"+x.exercise+"»") if x.exercise else " до тренування"
    comment_text=(x.body or "").strip()
    message=who+" залишив коментар"+target+((": "+comment_text) if comment_text else "")
    run("INSERT INTO notifications(client_id,recipient,kind,message,target_tab,target_day,target_program_id) VALUES(?,?,?,?,?,?,?)",(x.client_id,recipient,"comment",message,"comments",day,x.program_id))
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
def get_notifications(cid:int,recipient:str=Query(max_length=16),user:AuthUser=Depends(current_user)):
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
    consume_rate_limit("upload.actor",f"{user.role}:{user.user_id}")
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
                safe_log("h04_commit_outcome_unknown",logging.ERROR)
            else:
                if state and state["screenshot"]==name:
                    committed=True
                    return {"url":"/uploads/"+name}
        raise HTTPException(500,"Не вдалося зберегти зображення. Спробуйте ще раз.") from None
    finally:
        if name and not committed and not commit_unknown:
            try:(UPLOADS/name).unlink(missing_ok=True)
            except OSError as e:safe_log("h04_cleanup_failed",logging.ERROR,error_type=type(e).__name__)
def refresh_client_weight_from_measurements(cid:int):
    latest=one("SELECT weight FROM measurements WHERE client_id=? AND weight>0 ORDER BY day DESC,id DESC LIMIT 1",(cid,))
    if latest: run("UPDATE clients SET weight=? WHERE id=?",(latest["weight"],cid))

def measurement_values(x:MeasureIn):
    return (x.weight,x.waist,x.chest,x.hips,x.thighs,x.arms,x.shoulders,x.neck,x.calves,x.forearms,
            x.thighs_left,x.thighs_right,x.calves_left,x.calves_right,x.arms_left,x.arms_right,x.forearms_left,x.forearms_right)

@app.post("/api/measurements")
def measurement(x:MeasureIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'measurements')
    measurement_day=x.day or kyiv_today()
    if measurement_day>kyiv_today(): raise HTTPException(400,"Майбутню дату для замірів вказувати не можна")
    vals=measurement_values(x)
    i=run("INSERT INTO measurements(client_id,day,weight,waist,chest,hips,thighs,arms,shoulders,neck,calves,forearms,thighs_left,thighs_right,calves_left,calves_right,arms_left,arms_right,forearms_left,forearms_right) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          (x.client_id,str(measurement_day))+vals)
    refresh_client_weight_from_measurements(x.client_id)
    return {"id":i,"day":str(measurement_day)}

@app.patch("/api/measurements/{mid}")
def edit_measurement(mid:int,x:MeasureIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'measurements')
    old=one("SELECT id,client_id FROM measurements WHERE id=?",(mid,))
    if not old: raise HTTPException(404,"Замір не знайдено")
    if old["client_id"]!=x.client_id: raise HTTPException(403,"Немає доступу до цього заміру")
    measurement_day=x.day or kyiv_today()
    if measurement_day>kyiv_today(): raise HTTPException(400,"Майбутню дату для замірів вказувати не можна")
    vals=measurement_values(x)
    run("""UPDATE measurements SET day=?,weight=?,waist=?,chest=?,hips=?,thighs=?,arms=?,shoulders=?,neck=?,calves=?,forearms=?,
           thighs_left=?,thighs_right=?,calves_left=?,calves_right=?,arms_left=?,arms_right=?,forearms_left=?,forearms_right=?
           WHERE id=?""",(str(measurement_day),)+vals+(mid,))
    refresh_client_weight_from_measurements(x.client_id)
    return {"ok":True,"id":mid,"day":str(measurement_day)}

@app.delete("/api/measurements/{mid}")
def delete_measurement(mid:int,client_id:int,user:AuthUser=Depends(require_client)):
    authorize_client(user,client_id)
    require_active_client(client_id,'measurements')
    old=one("SELECT id,client_id FROM measurements WHERE id=?",(mid,))
    if not old: raise HTTPException(404,"Замір не знайдено")
    if old["client_id"]!=client_id: raise HTTPException(403,"Немає доступу до цього заміру")
    run("DELETE FROM measurements WHERE id=?",(mid,))
    refresh_client_weight_from_measurements(client_id)
    return {"ok":True}

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

@app.post("/api/clients")
def add_client(x:ClientIn,user:AuthUser=Depends(require_trainer)):
    consume_rate_limit("invite.actor",f"{user.role}:{user.user_id}")
    email=x.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]: raise HTTPException(400,"Вкажи коректний email")
    # Trainer creates the client by real email. The client sets their own password from the invitation.
    initial_password=secrets.token_urlsafe(32)
    try:
        i=run("INSERT INTO clients(name,email,password,goal,weight,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?,?,?,?)",(x.name.strip(),email,hash_password(initial_password),x.goal,x.weight,x.kcal,x.protein,x.fat,x.carbs))
        if x.weight: run("INSERT INTO measurements(client_id,day,weight) VALUES(?,?,?)",(i,str(kyiv_today()),x.weight))
        token=issue_password_reset_token(i,timedelta(hours=24))
        base=os.getenv("APP_BASE_URL","").rstrip("/")
        sent=False
        if base and token:
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
def client(cid:int,limit:int=Query(API_PAGE_SIZE,ge=1,le=API_PAGE_MAX),
           offset:int=Query(0,ge=0,le=API_OFFSET_MAX),
           user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    queries={
        "program":"SELECT * FROM program WHERE client_id=? ORDER BY day_name,sort,id",
        "program_days":"SELECT * FROM program_days WHERE client_id=? ORDER BY day_name",
        "results":"SELECT * FROM results WHERE client_id=? ORDER BY day DESC,id DESC",
        "result_sets":"SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number,id",
        "nutrition":"SELECT * FROM nutrition WHERE client_id=? ORDER BY day DESC,id DESC",
        "nutrition_plan":"SELECT * FROM nutrition_plan_items WHERE client_id=? ORDER BY meal_number,variant_number,sort,id",
        "measurements":"SELECT * FROM measurements WHERE client_id=? ORDER BY day,id",
        "workout_sessions":"SELECT * FROM workout_sessions WHERE client_id=? ORDER BY id DESC",
        "comments":"SELECT * FROM comments WHERE client_id=? ORDER BY created_at DESC,id DESC",
        "cardio":"SELECT * FROM cardio_log WHERE client_id=? ORDER BY day DESC,id DESC",
        "checkins":"SELECT * FROM weekly_checkins WHERE client_id=? ORDER BY week_start DESC,id DESC",
    }
    # Keep the whole page on one DB connection. M03B2 removes the old helper
    # pattern of opening a fresh connection for each collection in this card.
    with con() as db:
        row=db.execute("SELECT * FROM clients WHERE id=%s",(cid,)).fetchone()
        if not row: raise HTTPException(404)
        c=dict(row);c["access"]=access_info(c)
        data={"client":client_response(c)}
        more=False
        for key,q in queries.items():
            page,has_more=paged_rows_from(db,q,(cid,),limit,offset)
            if key=="program":
                for item in page:item["technique_url"]=safe_technique_url(item.get("technique_url") or "")
            elif key=="workout_sessions":
                for item in page:item["program_snapshot"]=sanitize_program_snapshot(item.get("program_snapshot") or "")
            data[key]=page
            more=more or has_more
    if user.role=="trainer":
        note=db_note=one("SELECT body,updated_at FROM trainer_notes WHERE client_id=?",(cid,))
        data["trainer_note"]=note or {"body":"","updated_at":None}
    data["pagination"]={"limit":limit,"offset":offset,"has_more":more}
    return data
@app.patch("/api/client/{cid}/profile")
def update_client_profile(cid:int,x:ClientProfileIn,user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    display=(x.first_name.strip()+" "+x.last_name.strip()).strip()
    run("UPDATE clients SET first_name=?,last_name=?,age=?,sex=?,goal=?,contraindications=?,injuries=?,contact=?,instagram=?,telegram=?,tiktok=?,name=CASE WHEN ?<>'' THEN ? ELSE name END WHERE id=?",(x.first_name.strip(),x.last_name.strip(),max(0,x.age),x.sex.strip(),x.goal.strip(),x.contraindications.strip(),x.injuries.strip(),x.contact.strip(),x.instagram.strip(),x.telegram.strip(),x.tiktok.strip(),display,display,cid))
    return client_response(one("SELECT * FROM clients WHERE id=?",(cid,)))

@app.put("/api/client/{cid}/trainer-note")
def save_trainer_note(cid:int,x:TrainerNoteIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    if not one("SELECT id FROM clients WHERE id=?",(cid,)): raise HTTPException(404,"Клієнта не знайдено")
    with con() as c:
        c.execute("""INSERT INTO trainer_notes(client_id,body,updated_at)
                     VALUES(%s,%s,CURRENT_TIMESTAMP)
                     ON CONFLICT(client_id) DO UPDATE SET body=EXCLUDED.body,updated_at=CURRENT_TIMESTAMP""",(cid,x.body.strip()))
        c.commit()
    return {"ok":True}

@app.post("/api/client/{cid}/checkin")
def save_weekly_checkin(cid:int,x:WeeklyCheckinIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,cid)
    require_active_client(cid)
    today=kyiv_today()
    week=today-timedelta(days=today.weekday())
    with con() as c:
        c.execute("""INSERT INTO weekly_checkins(client_id,week_start,mood,sleep,hunger,energy,difficulty,comment,reviewed)
                     VALUES(%s,%s,%s,%s,%s,%s,%s,%s,FALSE)
                     ON CONFLICT(client_id,week_start) DO UPDATE SET
                       mood=EXCLUDED.mood,sleep=EXCLUDED.sleep,hunger=EXCLUDED.hunger,
                       energy=EXCLUDED.energy,difficulty=EXCLUDED.difficulty,
                       comment=EXCLUDED.comment,reviewed=FALSE,created_at=CURRENT_TIMESTAMP""",
                  (cid,week,x.mood,x.sleep,x.hunger,x.energy,x.difficulty,x.comment.strip()))
        c.execute("INSERT INTO notifications(client_id,recipient,kind,message,target_tab,target_day) VALUES(%s,%s,%s,%s,%s,%s)",
                  (cid,"trainer","checkin","Клієнт заповнив щотижневий звіт","profile",str(today)))
        c.commit()
    return {"ok":True,"week_start":str(week)}

@app.patch("/api/client/{cid}/checkin/{checkin_id}/review")
def review_weekly_checkin(cid:int,checkin_id:int,x:CheckinReviewIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,cid)
    with con() as c:
        row=c.execute("SELECT id FROM weekly_checkins WHERE id=%s AND client_id=%s FOR UPDATE",(checkin_id,cid)).fetchone()
        if not row:raise HTTPException(404,"Щотижневий звіт не знайдено")
        c.execute("UPDATE weekly_checkins SET reviewed=%s WHERE id=%s",(x.reviewed,checkin_id))
        c.commit()
    return {"ok":True}

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
    cardio_day=x.day or kyiv_today()
    d=str(cardio_day)
    if cardio_day>kyiv_today(): raise HTTPException(400,"Майбутню дату заповнювати не можна")
    if x.cardio_type not in ("","Доріжка","Орбітрек","Велосипед"): raise HTTPException(400,"Невідомий тип кардіо")
    old=one("SELECT id FROM cardio_log WHERE client_id=? AND day=?",(x.client_id,d))
    vals=(x.cardio_type,x.minutes,x.speed,x.incline,x.steps)
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
        exercise["technique_url"]=safe_technique_url(exercise.get("technique_url") or "")
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
    # M06: lock the parent row; ON DELETE CASCADE handles exercises and links in
    # the same transaction. Concurrent add/edit must lock the same group first.
    with con() as c:
        group=c.execute("SELECT id FROM exercise_groups WHERE id=%s FOR UPDATE",(gid,)).fetchone()
        if group:c.execute("DELETE FROM exercise_groups WHERE id=%s",(gid,))
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
        muscle=c.execute("SELECT id FROM muscles WHERE id=%s FOR UPDATE",(mid,)).fetchone()
        if muscle:c.execute("DELETE FROM muscles WHERE id=%s",(mid,))
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
        # Lock parents in deterministic order so a concurrent muscle deletion
        # cannot pass between validation and relation inserts.
        wanted=sorted(set(all_ids))
        found={r["id"] for r in c.execute("SELECT id FROM muscles WHERE id = ANY(%s) ORDER BY id FOR UPDATE",(wanted,)).fetchall()}
        if found!=set(wanted): raise HTTPException(400,"Один із вибраних м’язів не знайдено")
    c.execute("DELETE FROM exercise_muscles WHERE exercise_id=%s",(eid,))
    for mid in primary: c.execute("INSERT INTO exercise_muscles(exercise_id,muscle_id,role) VALUES(%s,%s,'primary')",(eid,mid))
    for mid in secondary: c.execute("INSERT INTO exercise_muscles(exercise_id,muscle_id,role) VALUES(%s,%s,'secondary')",(eid,mid))

@app.post("/api/exercise-library/exercises")
def add_library_exercise(x:ExerciseLibraryIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву вправи")
    technique_url=require_technique_url(x.technique_url)
    with con() as c:
        if not c.execute("SELECT id FROM exercise_groups WHERE id=%s FOR UPDATE",(x.group_id,)).fetchone(): raise HTTPException(404,"Групу не знайдено")
        old=c.execute("SELECT id FROM exercise_library WHERE group_id=%s AND lower(name)=lower(%s) FOR UPDATE",(x.group_id,name)).fetchone()
        if old:
            eid=old["id"]
            c.execute("UPDATE exercise_library SET technique_url=%s WHERE id=%s",(technique_url,eid))
        else:
            eid=c.execute("INSERT INTO exercise_library(group_id,name,technique_url) VALUES(%s,%s,%s) RETURNING id",(x.group_id,name,technique_url)).fetchone()["id"]
        save_exercise_muscles(c,eid,x)
        c.commit()
    return {"id":eid}

@app.put("/api/exercise-library/exercises/{eid}")
def edit_library_exercise(eid:int,x:ExerciseLibraryIn,user:AuthUser=Depends(require_trainer)):
    name=x.name.strip()
    if not name: raise HTTPException(400,"Вкажіть назву вправи")
    technique_url=require_technique_url(x.technique_url)
    with con() as c:
        if not c.execute("SELECT id FROM exercise_library WHERE id=%s FOR UPDATE",(eid,)).fetchone(): raise HTTPException(404,"Вправу не знайдено")
        if not c.execute("SELECT id FROM exercise_groups WHERE id=%s FOR UPDATE",(x.group_id,)).fetchone(): raise HTTPException(404,"Групу не знайдено")
        duplicate=c.execute("SELECT id FROM exercise_library WHERE group_id=%s AND lower(name)=lower(%s) AND id<>%s",(x.group_id,name,eid)).fetchone()
        if duplicate: raise HTTPException(400,"Вправа з такою назвою вже є в цій групі")
        c.execute("UPDATE exercise_library SET group_id=%s,name=%s,technique_url=%s WHERE id=%s",(x.group_id,name,technique_url,eid))
        save_exercise_muscles(c,eid,x)
        c.commit()
    return {"ok":True}

@app.delete("/api/exercise-library/exercises/{eid}")
def delete_library_exercise(eid:int,user:AuthUser=Depends(require_trainer)):
    with con() as c:
        exercise=c.execute("SELECT id FROM exercise_library WHERE id=%s FOR UPDATE",(eid,)).fetchone()
        if exercise:c.execute("DELETE FROM exercise_library WHERE id=%s",(eid,))
        c.commit()
    return {"ok":True}

@app.post("/api/program")
def add_program(x:ProgramIn,user:AuthUser=Depends(require_trainer)):
    authorize_client(user,x.client_id)
    technique_url=require_technique_url(x.technique_url)
    i=run("INSERT INTO program(client_id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url,rest_seconds,rest_text,rir_by_set,alternatives_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(x.client_id,x.day_name,x.exercise,x.sets,x.reps,x.target_rir,x.superset_group,x.superset_order,technique_url,x.rest_seconds,x.rest_text.strip(),x.rir_by_set.strip(),x.alternatives_json.strip() or "[]")); return {"id":i}
@app.put("/api/program/{pid}")
def edit_program(pid:int,x:ProgramIn,user:AuthUser=Depends(require_trainer)):
    p=owned_record(user,"program",pid)
    if x.client_id!=p["client_id"]:raise HTTPException(403,"Вправа належить іншому клієнту")
    p=one("SELECT * FROM program WHERE id=?",(pid,))
    if not p: raise HTTPException(404,"Вправу не знайдено")
    technique_url=require_technique_url(x.technique_url)
    run("""UPDATE program SET day_name=?,exercise=?,sets=?,reps=?,target_rir=?,technique_url=?,rest_seconds=?,rest_text=?,rir_by_set=?,alternatives_json=?
           WHERE id=?""",(x.day_name.strip(),x.exercise.strip(),x.sets,x.reps.strip(),x.target_rir,technique_url,x.rest_seconds,x.rest_text.strip(),x.rir_by_set.strip(),x.alternatives_json.strip() or "[]",pid))
    return {"ok":True}

@app.patch("/api/program/{pid}/client-exercise")
def client_replace_program_exercise(pid:int,x:ClientProgramExerciseSwapIn,user:AuthUser=Depends(require_client)):
    selected=x.exercise.strip()
    if not selected:raise HTTPException(400,"Оберіть вправу")
    require_active_client(user.client_id,'workouts')
    with con() as c:
        row=c.execute("SELECT * FROM program WHERE id=%s FOR UPDATE",(pid,)).fetchone()
        if not row:raise HTTPException(404,"Вправу не знайдено")
        p=dict(row)
        authorize_client(user,p["client_id"])
        if p["client_id"]!=user.client_id:raise HTTPException(403,"Немає доступу до цієї вправи")
        try:
            alternatives=json.loads(p.get("alternatives_json") or "[]")
        except (TypeError,ValueError):
            alternatives=[]
        if not isinstance(alternatives,list):alternatives=[]
        alternatives=[str(v).strip() for v in alternatives if str(v).strip()]
        allowed=[str(p.get("exercise") or "").strip(),*alternatives]
        if selected not in allowed:
            raise HTTPException(400,"Цю вправу не дозволено як заміну")
        current=str(p.get("exercise") or "").strip()
        if selected!=current:
            new_alts=[]
            for name in [current,*alternatives]:
                if name and name!=selected and name not in new_alts:new_alts.append(name)
            lib=c.execute("SELECT technique_url FROM exercise_library WHERE lower(name)=lower(%s) ORDER BY id LIMIT 1",(selected,)).fetchone()
            technique_url=safe_technique_url((lib["technique_url"] if lib else "") or "")
            c.execute("UPDATE program SET exercise=%s,alternatives_json=%s,technique_url=%s WHERE id=%s",
                      (selected,json.dumps(new_alts,ensure_ascii=False),technique_url,pid))
        c.commit()
    return {"ok":True,"exercise":selected}

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
    require_active_client(x.client_id,'workouts')
    i=run("INSERT INTO results(client_id,exercise,day,weight,reps,sets,rir) VALUES(?,?,?,?,?,?,?)",(x.client_id,x.exercise,str(kyiv_today()),x.weight,x.reps,x.sets,x.rir)); return {"id":i}

@app.post("/api/result-sets")
def add_result_sets(x:SetResultIn,user:AuthUser=Depends(require_client)):
    authorize_program(user,x.program_id,x.client_id)
    require_active_client(x.client_id,'workouts')
    if not x.sets:
        raise HTTPException(400,"Додай хоча б один підхід")
    numbers=[s.set_number for s in x.sets]
    if len(numbers)!=len(set(numbers)):
        raise HTTPException(400,"Номери підходів не мають повторюватися")
    today=str(kyiv_today())
    ids=[]
    # Explicit editing remains allowed, but replacement is all-or-nothing.
    with con() as c:
        c.execute("DELETE FROM result_sets WHERE client_id=%s AND program_id=%s AND day=%s",(x.client_id,x.program_id,today))
        for item in x.sets:
            row=c.execute("""INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir)
                             VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                          (x.client_id,x.program_id,x.exercise,today,item.set_number,item.weight,item.reps,item.rir)).fetchone()
            ids.append(row["id"])
        c.commit()
    return {"ok":True,"ids":ids}

@app.get("/api/result-sets/{cid}")
def result_set_history(cid:int,limit:int=Query(API_PAGE_SIZE,ge=1,le=API_PAGE_MAX),
                       offset:int=Query(0,ge=0,le=API_OFFSET_MAX),
                       user:AuthUser=Depends(current_user)):
    authorize_client(user,cid)
    page,_=paged_rows("SELECT * FROM result_sets WHERE client_id=? ORDER BY day DESC,program_id,set_number,id",(cid,),limit,offset)
    return page


def _b64url(data:bytes)->str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

# R01: browser push is an outbound server request. Only the three providers
# used by the supported Chrome/Firefox/Safari Web Push stacks are accepted.
# This deliberately avoids accepting arbitrary HTTPS destinations from users.
PUSH_ENDPOINT_HOSTS={
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
}
# Microsoft Edge/Web Push may use WNS hosts such as wns2-*.notify.windows.com.
# The suffix is provider-owned, not an arbitrary user-controlled hostname.
PUSH_ENDPOINT_SUFFIXES=(".notify.windows.com",)
PUSH_SEND_TIMEOUT_SECONDS=10


def _decode_push_b64url(value:str)->bytes:
    value=(value or "").strip()
    if not value or len(value)>512:
        raise ValueError("invalid push key")
    # Browser PushSubscription.toJSON() emits URL-safe base64. Reject other
    # alphabets/embedded padding instead of handing surprising data downstream.
    allowed="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    if any(ch not in allowed for ch in value):
        raise ValueError("invalid push key")
    try:
        return base64.urlsafe_b64decode(value+"="*((4-len(value)%4)%4))
    except Exception as e:
        raise ValueError("invalid push key") from e


def validate_push_subscription(endpoint:str,p256dh:str,auth:str)->tuple[str,str,str]:
    endpoint=(endpoint or "").strip()
    if not endpoint or len(endpoint)>4096 or any(ord(ch)<32 or ch=="\\" for ch in endpoint):
        raise ValueError("invalid push endpoint")
    try:
        u=urllib.parse.urlsplit(endpoint)
        host=(u.hostname or "").rstrip(".").lower()
        port=u.port
    except ValueError as e:
        raise ValueError("invalid push endpoint") from e
    provider_ok=host in PUSH_ENDPOINT_HOSTS or any(host.endswith(suffix) for suffix in PUSH_ENDPOINT_SUFFIXES)
    if (u.scheme.lower()!="https" or not host or not provider_ok or
        u.username is not None or u.password is not None or u.fragment or
        port not in (None,443) or not u.path or u.path=="/"):
        raise ValueError("invalid push endpoint")
    key=_decode_push_b64url(p256dh)
    secret=_decode_push_b64url(auth)
    # Web Push uses an uncompressed P-256 public key and a 16-byte auth secret.
    if len(key)!=65 or key[0]!=4 or len(secret)!=16:
        raise ValueError("invalid push key")
    return endpoint,p256dh.strip(),auth.strip()


def safe_technique_url(value:str)->str:
    """Return only a safe external technique/video URL for browser navigation.

    Existing legacy DB rows are not deleted. Unsafe historical values are simply
    not exposed as clickable links; new writes are rejected by require_technique_url().
    """
    value=(value or "").strip()
    if not value or len(value)>2048 or any(ord(ch)<32 or ch=="\\" for ch in value):
        return ""
    try:
        u=urllib.parse.urlsplit(value)
        _=u.port  # validates malformed ports without restricting valid HTTPS ports.
    except ValueError:
        return ""
    if u.scheme.lower()!="https" or not u.hostname or u.username is not None or u.password is not None:
        return ""
    return value


def require_technique_url(value:str)->str:
    raw=(value or "").strip()
    if not raw:return ""
    safe=safe_technique_url(raw)
    if not safe:
        raise HTTPException(400,"Посилання на техніку має бути коректною HTTPS-адресою")
    return safe


def sanitize_program_snapshot(value:str)->str:
    if not value:return value or ""
    try:data=json.loads(value)
    except (TypeError,ValueError):return value
    if not isinstance(data,list):return value
    changed=False
    for item in data:
        if isinstance(item,dict) and "technique_url" in item:
            safe=safe_technique_url(item.get("technique_url") or "")
            if safe!=item.get("technique_url"):
                item["technique_url"]=safe;changed=True
    return json.dumps(data,ensure_ascii=False) if changed else value

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
    if recipient=="trainer":
        # One trainer exists in this installation. R01 binds trainer push rows to
        # that authenticated account rather than to the client that caused an event.
        subs=rows("SELECT * FROM push_subscriptions WHERE recipient='trainer' AND owner_role='trainer' AND owner_user_id=1")
    elif recipient=="client":
        subs=rows("SELECT * FROM push_subscriptions WHERE client_id=? AND recipient='client' AND owner_role='client' AND owner_user_id=?",(client_id,client_id))
    else:
        return False
    payload=json.dumps({"title":title,"body":body,"url":url},ensure_ascii=False)
    ok=False
    for s in subs:
        try:
            endpoint,p256dh,auth=validate_push_subscription(s["endpoint"],s["p256dh"],s["auth"])
        except ValueError:
            # Never perform an outbound request for legacy/corrupt/forbidden rows.
            run("DELETE FROM push_subscriptions WHERE id=?",(s["id"],))
            continue
        try:
            webpush(subscription_info={"endpoint":endpoint,"keys":{"p256dh":p256dh,"auth":auth}},
                    data=payload,vapid_private_key=private_key,
                    vapid_claims={"sub":os.getenv("VAPID_SUBJECT","mailto:trainer@eplan.com.ua")},
                    timeout=PUSH_SEND_TIMEOUT_SECONDS)
            ok=True
        except Exception as e:
            status=getattr(getattr(e,"response",None),"status_code",None)
            if status in (404,410):
                run("DELETE FROM push_subscriptions WHERE id=?",(s["id"],))
            else:
                safe_log("web_push_send_error",logging.WARNING,error_type=type(e).__name__,status=(int(status) if status is not None else None))
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
    if user.role=="trainer":
        if x.client_id!=0:raise HTTPException(403,"Невірний власник push-підписки")
        owner_id=user.user_id
    else:
        if x.client_id!=user.client_id:raise HTTPException(403,"Невірний власник push-підписки")
        authorize_client(user,x.client_id)
        owner_id=user.user_id
    try:
        endpoint,p256dh,auth=validate_push_subscription(x.endpoint,x.p256dh,x.auth)
    except ValueError:
        raise HTTPException(400,"Некоректна push-підписка") from None
    with con() as c:
        saved=c.execute("""INSERT INTO push_subscriptions(client_id,recipient,endpoint,p256dh,auth,owner_role,owner_user_id)
           VALUES(%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT(endpoint) DO UPDATE SET
             client_id=EXCLUDED.client_id,recipient=EXCLUDED.recipient,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,
             owner_role=EXCLUDED.owner_role,owner_user_id=EXCLUDED.owner_user_id
           WHERE push_subscriptions.owner_role=EXCLUDED.owner_role
             AND push_subscriptions.owner_user_id=EXCLUDED.owner_user_id
           RETURNING id""",(x.client_id,x.recipient,endpoint,p256dh,auth,user.role,owner_id)).fetchone()
        if not saved:raise HTTPException(409,"Потрібна нова push-підписка для цього акаунта")
        c.commit()
    return {"ok":True}

@app.delete("/api/push/subscribe")
def push_unsubscribe(x:PushUnsubscribeIn,user:AuthUser=Depends(current_user)):
    endpoint=(x.endpoint or "").strip()
    if not endpoint:raise HTTPException(400,"Неповна push-підписка")
    with con() as c:
        c.execute("DELETE FROM push_subscriptions WHERE endpoint=%s AND owner_role=%s AND owner_user_id=%s",
                  (endpoint,user.role,user.user_id))
        c.commit()
    return {"ok":True}

@app.post("/api/workout/start")
def start_workout(x:WorkoutStartIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'workouts')
    today=str(kyiv_today())
    created=False
    try:
        # M06: every workout-session writer locks the client row first. This
        # serializes concurrent starts/history inserts across workers using the
        # shared PostgreSQL database. Optional unique indexes add defence in depth.
        with con() as c:
            if not c.execute("SELECT id FROM clients WHERE id=%s FOR UPDATE",(x.client_id,)).fetchone():
                raise HTTPException(404,"Клієнта не знайдено")
            active=c.execute("SELECT * FROM workout_sessions WHERE client_id=%s AND status='training' ORDER BY id DESC LIMIT 1",(x.client_id,)).fetchone()
            if active:
                session=dict(active)
            else:
                existing=c.execute("""SELECT * FROM workout_sessions
                                      WHERE client_id=%s AND COALESCE(workout_day,CAST(started_at AS DATE))=%s
                                      ORDER BY id DESC LIMIT 1""",(x.client_id,today)).fetchone()
                if existing:
                    raise HTTPException(400,"Сьогодні тренування вже було розпочато. Нове тренування буде доступне завтра.")
                snapshot_rows=[dict(r) for r in c.execute("""SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order,technique_url,rest_seconds,rest_text,rir_by_set,alternatives_json
                                                                  FROM program WHERE client_id=%s AND day_name=%s ORDER BY id""",(x.client_id,x.day_name)).fetchall()]
                for item in snapshot_rows:item["technique_url"]=safe_technique_url(item.get("technique_url") or "")
                snapshot=json.dumps(snapshot_rows,ensure_ascii=False)
                row=c.execute("""INSERT INTO workout_sessions(client_id,day_name,status,program_snapshot,workout_day)
                                 VALUES(%s,%s,%s,%s,CAST(%s AS DATE)) RETURNING *""",
                              (x.client_id,x.day_name,"training",snapshot,today)).fetchone()
                session=dict(row)
                created=True
            c.commit()
    except psycopg.errors.UniqueViolation:
        # A DB-level guard may win before this transaction after a concurrent
        # request. Preserve the public contract: reuse the active session, or
        # report that today's workout already exists.
        active=one("SELECT * FROM workout_sessions WHERE client_id=? AND status='training' ORDER BY id DESC LIMIT 1",(x.client_id,))
        if active:return active
        raise HTTPException(400,"Сьогодні тренування вже було розпочато. Нове тренування буде доступне завтра.") from None
    if session.get("status")!="training":
        return session
    # Only the request that inserted a new row emits the start telegram.
    client_info=one("SELECT name,first_name,last_name FROM clients WHERE id=?",(x.client_id,)) if created else None
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
    if x.day > kyiv_today():
        raise HTTPException(400,"Не можна додавати дані на майбутню дату")
    day=str(x.day)
    existing=one("SELECT id FROM nutrition WHERE client_id=? AND day=? ORDER BY id DESC LIMIT 1",(x.client_id,day))
    if existing:
        run("UPDATE nutrition SET kcal=?,protein=?,fat=?,carbs=? WHERE id=?",(x.kcal,x.protein,x.fat,x.carbs,existing["id"]))
        return one("SELECT * FROM nutrition WHERE id=?",(existing["id"],))
    i=run("INSERT INTO nutrition(client_id,day,kcal,protein,fat,carbs) VALUES(?,?,?,?,?,?)",(x.client_id,day,x.kcal,x.protein,x.fat,x.carbs))
    return one("SELECT * FROM nutrition WHERE id=?",(i,))

@app.post("/api/history/workout")
def historical_workout(x:HistoricalWorkoutIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    for item in x.sets:authorize_program(user,item.program_id,x.client_id)
    require_active_client(x.client_id,'workouts')
    if x.day > kyiv_today():
        raise HTTPException(400,"Не можна додавати тренування на майбутню дату")
    if not x.sets:
        raise HTTPException(400,"Додай хоча б один підхід")
    keys=[(item.program_id,item.set_number) for item in x.sets]
    if len(keys)!=len(set(keys)):
        raise HTTPException(400,"Номери підходів однієї вправи не мають повторюватися")
    day=str(x.day)
    try:
        # M05 keeps session+sets atomic. M06 additionally takes the same client
        # row lock as live start, so concurrent writers cannot both pass the
        # "one workout per client/day" check.
        with con() as c:
            if not c.execute("SELECT id FROM clients WHERE id=%s FOR UPDATE",(x.client_id,)).fetchone():
                raise HTTPException(404,"Клієнта не знайдено")
            existing=c.execute("""SELECT id FROM workout_sessions
                                  WHERE client_id=%s AND COALESCE(workout_day,CAST(started_at AS DATE))=%s
                                  ORDER BY id DESC LIMIT 1""",(x.client_id,day)).fetchone()
            if existing:
                raise HTTPException(400,"Тренування за цей день уже записано")
            for item in x.sets:
                c.execute("""INSERT INTO result_sets(client_id,program_id,exercise,day,set_number,weight,reps,rir)
                             VALUES(%s,%s,%s,%s,%s,%s,%s,%s)""",
                          (x.client_id,item.program_id,item.exercise,day,item.set_number,item.weight,item.reps,item.rir))
            snapshot=[dict(row) for row in c.execute("""SELECT id,day_name,exercise,sets,reps,target_rir,superset_group,superset_order
                                                         FROM program WHERE client_id=%s AND day_name=%s ORDER BY id""",
                                                      (x.client_id,x.day_name)).fetchall()]
            snapshot_json=json.dumps(snapshot,ensure_ascii=False)
            c.execute("""INSERT INTO workout_sessions(client_id,day_name,started_at,finished_at,status,program_snapshot,workout_day)
                         VALUES(%s,%s,CAST(%s AS TIMESTAMP),CAST(%s AS TIMESTAMP),'finished',%s,CAST(%s AS DATE))""",
                      (x.client_id,x.day_name,day+" 12:00:00",day+" 13:00:00",snapshot_json,day))
            c.commit()
    except psycopg.errors.UniqueViolation:
        if one("SELECT id FROM workout_sessions WHERE client_id=? AND workout_day=CAST(? AS DATE) LIMIT 1",(x.client_id,day)):
            raise HTTPException(400,"Тренування за цей день уже записано") from None
        raise HTTPException(409,"Підходи за цей день уже збережені") from None
    return {"ok":True}

@app.post("/api/comments")
def add_comment(x:CommentIn,user:AuthUser=Depends(current_user)):
    authorize_client(user,x.client_id)
    if x.program_id:authorize_program(user,x.program_id,x.client_id)
    x.author=user.role
    if not x.body.strip(): raise HTTPException(400,"Коментар порожній")
    day=str(x.day)
    i=run("INSERT INTO comments(client_id,day,program_id,exercise,author,body) VALUES(?,?,?,?,?,?)",
          (x.client_id,day,x.program_id,x.exercise,x.author,x.body.strip()))
    recipient="client" if x.author=="trainer" else "trainer"
    who="Тренер" if x.author=="trainer" else "Клієнт"
    target=(" до вправи «"+x.exercise+"»") if x.exercise else " до тренування"
    comment_text=(x.body or "").strip()
    message=who+" залишив коментар"+target+((": "+comment_text) if comment_text else "")
    run("INSERT INTO notifications(client_id,recipient,kind,message,target_tab,target_day,target_program_id) VALUES(?,?,?,?,?,?,?)",(x.client_id,recipient,"comment",message,"comments",day,x.program_id))
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
def get_notifications(cid:int,recipient:str=Query(max_length=16),user:AuthUser=Depends(current_user)):
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
    consume_rate_limit("upload.actor",f"{user.role}:{user.user_id}")
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
                safe_log("h04_commit_outcome_unknown",logging.ERROR)
            else:
                if state and state["screenshot"]==name:
                    committed=True
                    return {"url":"/uploads/"+name}
        raise HTTPException(500,"Не вдалося зберегти зображення. Спробуйте ще раз.") from None
    finally:
        if name and not committed and not commit_unknown:
            try:(UPLOADS/name).unlink(missing_ok=True)
            except OSError as e:safe_log("h04_cleanup_failed",logging.ERROR,error_type=type(e).__name__)
def refresh_client_weight_from_measurements(cid:int):
    latest=one("SELECT weight FROM measurements WHERE client_id=? AND weight>0 ORDER BY day DESC,id DESC LIMIT 1",(cid,))
    if latest: run("UPDATE clients SET weight=? WHERE id=?",(latest["weight"],cid))

def measurement_values(x:MeasureIn):
    return (x.weight,x.waist,x.chest,x.hips,x.thighs,x.arms,x.shoulders,x.neck,x.calves,x.forearms,
            x.thighs_left,x.thighs_right,x.calves_left,x.calves_right,x.arms_left,x.arms_right,x.forearms_left,x.forearms_right)

@app.post("/api/measurements")
def measurement(x:MeasureIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'measurements')
    measurement_day=x.day or kyiv_today()
    if measurement_day>kyiv_today(): raise HTTPException(400,"Майбутню дату для замірів вказувати не можна")
    vals=measurement_values(x)
    i=run("INSERT INTO measurements(client_id,day,weight,waist,chest,hips,thighs,arms,shoulders,neck,calves,forearms,thighs_left,thighs_right,calves_left,calves_right,arms_left,arms_right,forearms_left,forearms_right) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          (x.client_id,str(measurement_day))+vals)
    refresh_client_weight_from_measurements(x.client_id)
    return {"id":i,"day":str(measurement_day)}

@app.patch("/api/measurements/{mid}")
def edit_measurement(mid:int,x:MeasureIn,user:AuthUser=Depends(require_client)):
    authorize_client(user,x.client_id)
    require_active_client(x.client_id,'measurements')
    old=one("SELECT id,client_id FROM measurements WHERE id=?",(mid,))
    if not old: raise HTTPException(404,"Замір не знайдено")
    if old["client_id"]!=x.client_id: raise HTTPException(403,"Немає доступу до цього заміру")
    measurement_day=x.day or kyiv_today()
    if measurement_day>kyiv_today(): raise HTTPException(400,"Майбутню дату для замірів вказувати не можна")
    vals=measurement_values(x)
    run("""UPDATE measurements SET day=?,weight=?,waist=?,chest=?,hips=?,thighs=?,arms=?,shoulders=?,neck=?,calves=?,forearms=?,
           thighs_left=?,thighs_right=?,calves_left=?,calves_right=?,arms_left=?,arms_right=?,forearms_left=?,forearms_right=?
           WHERE id=?""",(str(measurement_day),)+vals+(mid,))
    refresh_client_weight_from_measurements(x.client_id)
    return {"ok":True,"id":mid,"day":str(measurement_day)}

@app.delete("/api/measurements/{mid}")
def delete_measurement(mid:int,client_id:int,user:AuthUser=Depends(require_client)):
    authorize_client(user,client_id)
    require_active_client(client_id,'measurements')
    old=one("SELECT id,client_id FROM measurements WHERE id=?",(mid,))
    if not old: raise HTTPException(404,"Замір не знайдено")
    if old["client_id"]!=client_id: raise HTTPException(403,"Немає доступу до цього заміру")
    run("DELETE FROM measurements WHERE id=?",(mid,))
    refresh_client_weight_from_measurements(client_id)
    return {"ok":True}

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
