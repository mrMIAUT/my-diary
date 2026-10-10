"""Regression coverage for workout completion, additive program edits and iOS UI."""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKOUT = (ROOT / "backend/static/js/workout.js").read_text(encoding="utf-8")
PROGRAM = (ROOT / "backend/static/js/program.js").read_text(encoding="utf-8")
CSS = (ROOT / "backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX = (ROOT / "backend/static/index.html").read_text(encoding="utf-8")
SW = (ROOT / "backend/static/sw.js").read_text(encoding="utf-8")


class CompletionUiContracts(unittest.TestCase):
    def test_superset_group_check_is_dependent_on_all_exercises(self):
        self.assertIn("groupDone=workoutSupersetAllExercisesDone(pair,d,activeDay)", WORKOUT)
        self.assertIn("groupDone?' is-superset-complete':''", WORKOUT)
        self.assertIn('title="Суперсет завершено"', WORKOUT)
        self.assertIn("workout-live-superset-arrow", WORKOUT)

    def test_collapsed_completed_card_neutral_but_set_feedback_preserved(self):
        rules=CSS.split("/* v248 — completed workout headers remain neutral;",1)[1]
        self.assertIn(".workout-live-exercise.is-exercise-complete:not(.workout-live-exercise-inner)",rules)
        self.assertIn("background:#fff!important",rules)
        self.assertIn(".workout-live-superset-status .exercise-done-badge.compact",rules)
        self.assertIn("background:#e6f6ec!important",rules)
        self.assertIn(".lyfta-set-wrap.is-complete",CSS)

    def test_ios_caret_and_no_forced_mobile_focus(self):
        self.assertIn("#supersetModal #ssex{",CSS)
        scoped=CSS.rsplit("#supersetModal #ssex{",1)[1].split("}",1)[0]
        self.assertIn("line-height:22px!important",scoped)
        self.assertIn("padding:0 13px!important",scoped)
        self.assertIn("font-size:16px!important",scoped)
        self.assertIn("window.matchMedia?.('(pointer:coarse)').matches",PROGRAM)
        self.assertIn("oninput=\"autofillTechnique(this.value,'sstech')\"",PROGRAM)

    def test_cache_consistency(self):
        for source in (INDEX,SW):
            for name in ("/static/css/redesign.css?v=251", "/static/js/workout.js?v=182",
                         "/static/js/program.js?v=190"):
                self.assertIn(name,source)
        self.assertIn("const VERSION='eplan-v207'",SW)

    @unittest.skipUnless(shutil.which("node"), "Node is needed for JS behavior tests")
    def test_cycle_subset_and_mixed_superset_behavior(self):
        # Execute production JS with synthetic records: no production DB writes.
        js = r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('backend/static/js/workout.js','utf8');
const ctx={
  window:{},console,
  setInterval:()=>1,
  document:{addEventListener:()=>{}},
  programDayIsExtra:()=>false,
  workoutWeekStartISO:()=> '2026-10-05',
  isoToday:()=> '2026-10-10',
  sessionDay:x=>x.workout_day,
  workoutEffectiveExercise:x=>x,
  isTimedWorkoutExercise:x=>x.execution_mode==='time'
};
vm.createContext(ctx);
vm.runInContext(src,ctx);
// The live workout file also declares this function: override it in the sandbox
// to exercise only the group completion contract without loading the UI stack.
ctx.workoutEffectiveExercise=x=>x;
let s={day_name:'День 6',day_kind:'standard',status:'finished',
       workout_day:'2026-10-10',program_snapshot:JSON.stringify([{id:12},{id:13}])};
let d={program:[{id:12,day_name:'День 6'},{id:13,day_name:'День 6'},
                {id:14,day_name:'День 6'}],workout_sessions:[s]};
assert.equal(ctx.workoutSessionMatchesCurrentProgram(d,s),true);
assert.equal(ctx.workoutCycleState(d,{'День 6':d.program}).done[0],'День 6');
// Removing or replacing a snapshotted exercise does not count the old workout.
d.program=[{id:12,day_name:'День 6'},{id:14,day_name:'День 6'}];
assert.equal(ctx.workoutSessionMatchesCurrentProgram(d,s),false);
assert.equal(ctx.workoutCycleState(d,{'День 6':d.program}).done.length,0);
// A mixed superset is only complete once every actual round is stored per peer.
const pair=[{id:12,sets:2,execution_mode:'reps'},{id:13,sets:2,execution_mode:'time'}];
const results={result_sets:[{program_id:12,day:'2026-10-10',set_number:1}],
 timed_result_sets:[{program_id:13,day:'2026-10-10',set_number:1},
                    {program_id:13,day:'2026-10-10',set_number:2}]};
assert.equal(ctx.workoutSupersetAllExercisesDone(pair,results,'2026-10-10'),false);
results.result_sets.push({program_id:12,day:'2026-10-10',set_number:1});
assert.equal(ctx.workoutSupersetAllExercisesDone(pair,results,'2026-10-10'),false);
results.result_sets.push({program_id:12,day:'2026-10-10',set_number:2});
assert.equal(ctx.workoutSupersetAllExercisesDone(pair,results,'2026-10-10'),true);
assert.equal(ctx.workoutSupersetAllExercisesDone(pair,results,'2026-10-09'),false);
assert.equal(ctx.workoutSupersetAllExercisesDone([pair[0]],results,'2026-10-10'),false);
console.log('cycle and mixed supersets PASS');
"""
        result=subprocess.run(["node","-e",js],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)


if __name__=="__main__":
    unittest.main()
