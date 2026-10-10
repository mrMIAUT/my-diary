"""One-time historical periodization baseline: label only old unclassified completed sessions."""
import ast
import contextlib
import io
from pathlib import Path
import sqlite3
import unittest

ROOT=Path(__file__).resolve().parents[2]
APP=(ROOT/"backend/app.py").read_text(encoding="utf-8")


class PgStyleSqliteConnection:
    """PostgreSQL %s parameter style shim for the portable migration SQL."""
    def __init__(self):
        self.db=sqlite3.connect(":memory:")
        self.queries=[]
    def execute(self,query,params=()):
        self.queries.append((query,params))
        return self.db.execute(query.replace("%s","?"),params)


def actual_backfill():
    fn=next(node for node in ast.parse(APP).body
            if isinstance(node,ast.FunctionDef) and node.name=="backfill_legacy_workout_load_phases")
    code=compile(ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[])),"backend/app.py","exec")
    ns={"json":__import__("json")}
    exec(code,ns)
    return ns["backfill_legacy_workout_load_phases"]


class LegacyHeavyPhaseMigrationTests(unittest.TestCase):
    def setUp(self):
        self.c=PgStyleSqliteConnection()
        self.c.execute("""CREATE TABLE workout_sessions(
            id INTEGER PRIMARY KEY,status TEXT,load_phase TEXT
        )""")
        self.c.execute("""CREATE TABLE result_sets(
            program_id INTEGER,day TEXT,weight REAL,reps INTEGER
        )""")
        self.c.db.executemany(
            "INSERT INTO workout_sessions(id,status,load_phase) VALUES(?,?,?)",[
                (1,"finished",""),(2,"finished",""),
                (3,"finished","medium"),(4,"finished","light"),
                (5,"finished","heavy"),(6,"training",""),
                (7,"canceled",""),(8,"finished",None),
            ])
        self.c.execute("INSERT INTO result_sets VALUES (25,'2026-10-08',90,6)")
        self.before_sets=self.c.execute("SELECT * FROM result_sets").fetchall()

    def test_classifies_only_finished_unclassified_records(self):
        fn=actual_backfill()
        with contextlib.redirect_stdout(io.StringIO()):
            count=fn(self.c)
        self.assertEqual(count,3)
        actual=dict(self.c.execute("SELECT id,load_phase FROM workout_sessions").fetchall())
        self.assertEqual(actual,{1:"heavy",2:"heavy",3:"medium",4:"light",
                                 5:"heavy",6:"",7:"",8:"heavy"})
        self.assertEqual(self.c.execute("SELECT * FROM result_sets").fetchall(),self.before_sets)

    def test_migration_is_exactly_once_not_a_default_for_future_manual_history(self):
        fn=actual_backfill()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(fn(self.c),3)
        self.c.execute("INSERT INTO workout_sessions VALUES(9,'finished','')")
        # A later startup must NOT implicitly change new, unclassified entries.
        self.assertEqual(fn(self.c),0)
        self.assertEqual(self.c.execute(
            "SELECT load_phase FROM workout_sessions WHERE id=9").fetchone()[0],"")
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM eplan_data_migrations").fetchone()[0],1)

    def test_part_of_existing_atomic_database_initialization(self):
        self.assertIn('backfill_legacy_workout_load_phases(c)',APP)
        init=APP.split("def init():",1)[1].split("\ninit()",1)[0]
        self.assertIn("with con() as c:",init)
        self.assertLess(init.index('ADD COLUMN IF NOT EXISTS load_phase'),
                        init.index('backfill_legacy_workout_load_phases(c)'))
        self.assertLess(init.index('backfill_legacy_workout_load_phases(c)'),init.index('c.commit()'))
        helper=APP.split("def backfill_legacy_workout_load_phases(c):",1)[1].split("\ndef init():",1)[0]
        self.assertIn("ON CONFLICT(migration_key) DO NOTHING",helper)
        self.assertIn("WHERE status='finished'",helper)
        self.assertIn("COALESCE(load_phase,'')=''",helper)
        self.assertNotIn("UPDATE result_sets",helper)


if __name__=="__main__":
    unittest.main()
