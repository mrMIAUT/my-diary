"""Real PostgreSQL migration rehearsal on an isolated CI database.

This uses no production or Render credentials. CI first seeds the two tables in
their pre-RIR schema, then imports the actual application and runs its startup
migrations against that database.
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

DB = os.environ["DATABASE_URL"]
assert "127.0.0.1" in DB or "localhost" in DB, "Only localhost ephemeral CI DB is allowed"
os.environ.setdefault("TRAINER_EMAIL", "rir-ci@example.invalid")
os.environ.setdefault("TRAINER_PASSWORD", "Ephemeral-CI-Trainer-Password-2026")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with psycopg.connect(DB, row_factory=dict_row) as conn:
    # This deliberately resembles the two old CREATE TABLE definitions, before
    # show_rir existed. The real app init() will migrate these populated tables.
    conn.execute("""CREATE TABLE clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        password TEXT,
        goal TEXT,
        weight DOUBLE PRECISION,
        kcal INTEGER,
        protein INTEGER,
        fat INTEGER,
        carbs INTEGER,
        meal_plan TEXT DEFAULT '',
        status TEXT DEFAULT 'Активний',
        created_at TIMESTAMP
    )""")
    conn.execute("""CREATE TABLE program_templates(
        id BIGSERIAL PRIMARY KEY,
        trainer_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    legacy_id=conn.execute(
        "INSERT INTO clients(name,email,password) VALUES(%s,%s,%s) RETURNING id",
        ("Existing client", "legacy-ci@example.invalid", "")
    ).fetchone()["id"]
    template_id=conn.execute(
        "INSERT INTO program_templates(trainer_id,name) VALUES(1,'Old template') RETURNING id"
    ).fetchone()["id"]
    conn.commit()

# Import the real backend, running its full DDL + data migration.
import app

with app.con() as conn:
    old=conn.execute("SELECT show_rir FROM clients WHERE id=%s",(legacy_id,)).fetchone()
    old_template=conn.execute(
        "SELECT show_rir FROM program_templates WHERE id=%s",(template_id,)
    ).fetchone()
    assert old["show_rir"] is True, f"Existing client RIR changed unexpectedly: {old}"
    assert old_template["show_rir"] is True, old_template
    default=conn.execute("""
        SELECT column_default FROM information_schema.columns
        WHERE table_name='clients' AND column_name='show_rir'
    """).fetchone()["column_default"]
    assert default in ("false","false::boolean"), default
    new_id=conn.execute(
        "INSERT INTO clients(name,email,password) VALUES(%s,%s,%s) RETURNING id",
        ("New client", "new-ci@example.invalid", "")
    ).fetchone()["id"]
    assert conn.execute(
        "SELECT show_rir FROM clients WHERE id=%s",(new_id,)
    ).fetchone()["show_rir"] is False
    conn.commit()

user=app.AuthUser(
    role="trainer",user_id=1,client_id=None,session_id=0,
    expires_at=datetime.now(timezone.utc),name="CI Trainer"
)
# This writes only to the disposable CI database.
off=app.set_program_rir(legacy_id,app.ProgramRirVisibilityIn(show_rir=False),user)
assert off=={"ok":True,"show_rir":False},off
assert app.one("SELECT show_rir FROM clients WHERE id=?",(legacy_id,))["show_rir"] is False
on=app.set_program_rir(legacy_id,app.ProgramRirVisibilityIn(show_rir=True),user)
assert on["show_rir"] is True
assert app.one("SELECT show_rir FROM clients WHERE id=?",(legacy_id,))["show_rir"] is True

# Save and apply the same template OFF, then ON, verifying exercises are still
# assigned and RIR persists independently of the exercise rows.
def payload(show):
    return app.ProgramTemplateSaveIn(
        name="Test split",show_rir=show,
        days=[app.ProgramTemplateDaySaveIn(day_name="День 1",sort=1)],
        items=[app.ProgramTemplateItemSaveIn(
            day_name="День 1",exercise="Присідання зі штангою",
            sets=3,reps="8-12",target_rir=2,rir_by_set="2,1,1",sort=1
        )]
    )

for setting in (False, True):
    app.update_program_template(template_id,payload(setting),user)
    saved=app.one("SELECT show_rir FROM program_templates WHERE id=?",(template_id,))
    assert saved["show_rir"] is setting,saved
    app.apply_program_template(
        template_id,app.ProgramTemplateApplyIn(client_id=legacy_id),user
    )
    client=app.one("SELECT show_rir FROM clients WHERE id=?",(legacy_id,))
    assert client["show_rir"] is setting,client
    assigned=app.rows(
        "SELECT exercise,rir_by_set FROM program WHERE client_id=?",(legacy_id,)
    )
    assert len(assigned)==1 and assigned[0]["exercise"]=="Присідання зі штангою",assigned
    assert assigned[0]["rir_by_set"]=="2,1,1",assigned

# Repeated boot must not overwrite a trainer's OFF choice or old recorded values.
app.set_program_rir(legacy_id,app.ProgramRirVisibilityIn(show_rir=False),user)
app.init()
assert app.one("SELECT show_rir FROM clients WHERE id=?",(legacy_id,))["show_rir"] is False
assert app.one("SELECT show_rir FROM clients WHERE id=?",(new_id,))["show_rir"] is False
assert app.one("SELECT show_rir FROM program_templates WHERE id=?",(template_id,))["show_rir"] is True

print("POSTGRES 18 RIR: populated legacy migration, client defaults, trainer toggle, template ON/OFF assignment, idempotent startup PASS")
