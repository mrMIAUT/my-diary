"""Regression: trainer superset editor PUT succeeds, preserves peer guard and layout."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT=Path(__file__).resolve().parents[2]
APP=(ROOT/"backend/app.py").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class FakeHttpException(Exception):
    def __init__(self,status_code,detail):
        super().__init__(detail)
        self.status_code=status_code


def isolate_edit_handler(peer_rows):
    """Compile only the real endpoint body using fake reads and writes."""
    tree=ast.parse(APP)
    func=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="edit_program")
    func.decorator_list=[]
    func.args.defaults=[ast.Constant(value=None)]
    ns={
      "ProgramIn": object,"AuthUser":object,
      "owned_record":lambda user,table,pid:{"client_id":8},
      "one":lambda query,args:{"id":38,"client_id":8,"day_name":"День 6","superset_group":"SS12"},
      "require_technique_url":lambda value:value,
      "normalize_repeat_mode":lambda value:value,
      "normalize_execution_mode":lambda value:value or "reps",
      "normalize_program_alternatives":lambda text,fallback:text,
      "HTTPException":FakeHttpException,
    }
    calls={"reads":[],"writes":[]}
    def read_rows(query,args):
        calls["reads"].append((query,args))
        return peer_rows
    def write(query,args):
        calls["writes"].append((query,args))
    ns["rows"]=read_rows
    ns["run"]=write
    compiled=compile(ast.fix_missing_locations(ast.Module(body=[func],type_ignores=[])),"backend/app.py","exec")
    exec(compiled,ns)
    return ns["edit_program"],calls


def make_payload(**overrides):
    x={
     "client_id":8,"day_name":"День 6","exercise":"Віджимання","sets":3,
     "reps":"8-12","repeat_mode":"normal","execution_mode":"reps",
     "work_seconds":0,"target_rir":2,"technique_url":"","rest_seconds":0,
     "rest_text":"2","rir_by_set":"2,2,2","alternatives_json":"[]"
    }
    x.update(overrides)
    return SimpleNamespace(**x)


class TrainerSupersetRegression(unittest.TestCase):
    def test_edit_superset_executes_database_query_not_builtin_all(self):
        fn,calls=isolate_edit_handler([{"id":39,"sets":3,"execution_mode":"reps"}])
        result=fn(38,make_payload(),None)
        self.assertEqual(result,{"ok":True})
        self.assertEqual(len(calls["reads"]),1)
        self.assertEqual(calls["reads"][0][1],(8,"День 6","SS12",38))
        self.assertEqual(len(calls["writes"]),1)

    def test_timed_peer_still_rejects_round_count_mismatch_without_update(self):
        fn,calls=isolate_edit_handler([{"id":39,"sets":3,"execution_mode":"time"}])
        with self.assertRaises(FakeHttpException) as err:
            fn(38,make_payload(sets=4),None)
        self.assertEqual(err.exception.status_code,400)
        self.assertEqual(calls["writes"],[])

    def test_equal_round_count_in_mixed_superset_can_save(self):
        fn,calls=isolate_edit_handler([{"id":39,"sets":3,"execution_mode":"time"}])
        self.assertEqual(fn(38,make_payload(sets=3),None),{"ok":True})
        self.assertEqual(len(calls["writes"]),1)

    def test_inline_superset_has_full_width_and_stacked_mobile_picker(self):
        part=CSS.split("/* v249 — trainer inline superset:",1)[1]
        outer=part.split(".trainer-program-editor-grid>.trainer-inline-superset-builder{",1)[1].split("}",1)[0]
        self.assertIn("grid-column:1/-1!important",outer)
        self.assertIn("width:100%!important",outer)
        self.assertIn("@media(max-width:520px)",part)
        self.assertIn(".trainer-inline-superset-grid .trainer-program-exercise-field",part)
        self.assertIn("grid-template-columns:minmax(0,1fr)!important",part)

    def test_mobile_css_cache_updated_on_both_shells(self):
        for source in (INDEX,SW):
            self.assertIn("/static/css/redesign.css?v=250",source)
        self.assertIn("const VERSION='eplan-v206'",SW)


if __name__=="__main__":
    unittest.main()
