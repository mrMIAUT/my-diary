"""Timed workouts: one/two-side timer behavior, edited program parameters and history."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PROGRAM=(ROOT/"backend/static/js/program.js").read_text(encoding="utf-8")
TIMED=(ROOT/"backend/static/js/timed-workout.js").read_text(encoding="utf-8")
PROGRESS=(ROOT/"backend/static/js/progress-redesign.js").read_text(encoding="utf-8")
APP=(ROOT/"backend/app.py").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class TimedPerSideContracts(unittest.TestCase):
    def test_existing_repeat_mode_field_is_preserved_by_backend_and_snapshot(self):
        self.assertIn("normalize_repeat_mode(x.repeat_mode)",APP)
        self.assertIn("repeat_mode,execution_mode,work_seconds",APP)
        self.assertIn('REPEAT_MODES=',APP)
        self.assertIn("['per_leg','per_arm','per_side']",PROGRAM)
        self.assertIn("timedSideMode(document.getElementById('editWorkSideMode')",PROGRAM)
        self.assertIn("timedSideMode(document.getElementById('workTimeSideMode')",PROGRAM)
        self.assertIn("timedSideMode(document.getElementById('ssWorkSideMode')",PROGRAM)
        self.assertIn("timedSideModeSuffix(x.planItem?.repeat_mode)",PROGRESS)
        self.assertNotIn("ALTER TABLE timed_result_sets ADD COLUMN",APP)

    def test_timer_pauses_between_sides_with_explicit_client_confirm(self):
        self.assertIn("s.sideIndex=2",TIMED)
        self.assertIn("setTimedExercisePhase('switch',s.work)",TIMED)
        self.assertIn("s.phase==='idle'||s.phase==='switch'",TIMED)
        self.assertIn("s.sideIndex=1",TIMED)
        self.assertIn("s.phase==='switch'",TIMED)
        self.assertIn("if(s.singleSet){await finishTimedExerciseTimer();return}",TIMED)
        self.assertIn("var sidesMode=timedSideMode(x.repeat_mode)",TIMED)

    def test_pwa_versions_synced(self):
        for text in (INDEX,SW):
            self.assertIn("/static/js/program.js?v=191",text)
            self.assertIn("/static/js/timed-workout.js?v=6",text)
            self.assertIn("/static/js/progress-redesign.js?v=169",text)
        self.assertIn("const VERSION='eplan-v211'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node.js required")
    def test_real_timer_state_transitions_for_leg_arm_side_single_and_superset(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const program=fs.readFileSync('backend/static/js/program.js','utf8');
const timed=fs.readFileSync('backend/static/js/timed-workout.js','utf8');
let finishCalls=0,confirmCalls=0,modalText='';
const node={remove(){},addEventListener(){}};
const d={program:[
 {id:1,client_id:11,exercise:'Випади',execution_mode:'time',work_seconds:30,sets:2,rest_seconds:40,repeat_mode:'per_leg'},
 {id:2,client_id:11,exercise:'Планка',execution_mode:'time',work_seconds:25,sets:1,rest_seconds:20,repeat_mode:'normal'},
 {id:3,client_id:11,exercise:'Бічна планка',execution_mode:'time',work_seconds:20,sets:3,rest_seconds:30,superset_group:'SS3',repeat_mode:'per_side'},
 {id:4,client_id:11,exercise:'Підйом руки',execution_mode:'time',work_seconds:30,sets:1,rest_seconds:0,repeat_mode:'per_arm'}
 ],timed_result_sets:[]};
const ctx={window:{currentClientData:d,workoutExerciseChoices:{}},
 esc:String,console,performance:{now:()=>0},
 requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},
 navigator:{vibrate:()=>{}},alert:()=>{},
 confirm:()=>{confirmCalls++;return false;},
 document:{body:{insertAdjacentHTML:(_where,html)=>{modalText=html}},
   getElementById:()=>node},
 workoutEffectiveExercise:x=>x,workoutExerciseName:x=>x.exercise,
 todayTimedSets:()=>[],workoutSupersetRestSeconds:()=>40,
 workoutSupersetIsLast:()=>true,
};
vm.createContext(ctx);vm.runInContext(program,ctx);vm.runInContext(timed,ctx);
ctx.renderTimedExerciseTimer=()=>{};
ctx.todayTimedSets=()=>[];
ctx.finishTimedExerciseTimer=async()=>{finishCalls++};
ctx.timedExerciseFrame=()=>{};
async function complete(){
  await ctx.advanceTimedExerciseTimer();
}
function start(pid){
  ctx.openTimedExerciseTimer(11,pid);
  return ctx.window.timedExerciseTimerState;
}
(async()=>{
  assert.equal(ctx.timedSideMode('per_leg'),'per_leg');
  assert.equal(ctx.timedSideMode('total'),'normal');
  assert(ctx.timedSideModeSelectHTML('id','per_arm').includes('value="per_arm" selected'));
  assert(ctx.programExecutionPlanText({execution_mode:'time',work_seconds:30,repeat_mode:'per_leg'}).includes('на кожну ногу'));
  let s=start(1);
  assert.equal(s.sides,2);assert.equal(s.sideIndex,1);
  assert.equal(s.singleSet,false);assert.equal(s.results.length,0);
  assert(modalText.includes('на кожну ногу'));
  ctx.toggleTimedExerciseTimer();assert.equal(s.phase,'work');
  await complete();assert.equal(s.phase,'switch');assert.equal(s.sideIndex,2);
  assert.equal(s.results.length,0);assert.equal(finishCalls,0);
  assert.equal(ctx.closeTimedExerciseTimer(false),false);assert.equal(confirmCalls,1);
  assert.equal(s.phase,'switch');
  ctx.toggleTimedExerciseTimer();assert.equal(s.phase,'work');
  await complete();assert.equal(s.phase,'rest');
  assert.equal(s.results.length,1);assert.equal(s.results[0].work_seconds,30);
  assert.equal(s.results[0].set_number,1);
  assert.equal(finishCalls,0);
  await complete();assert.equal(s.phase,'work');assert.equal(s.sideIndex,1);
  assert.equal(s.currentSet,2);assert.equal(s.results.length,1);
  await complete();assert.equal(s.phase,'switch');assert.equal(s.results.length,1);
  ctx.toggleTimedExerciseTimer();await complete();
  assert.equal(s.results.length,2);assert.equal(finishCalls,1);
  assert.equal(s.results[1].set_number,2);
  s=start(2);
  assert.equal(s.sides,1);
  ctx.toggleTimedExerciseTimer();await complete();
  assert.equal(finishCalls,2);assert.equal(s.results.length,1);
  assert.equal(s.results[0].work_seconds,25);
  s=start(3);
  assert.equal(s.sides,2);assert.equal(s.singleSet,true);
  assert.equal(s.currentSet,1);
  ctx.toggleTimedExerciseTimer();await complete();
  assert.equal(s.phase,'switch');assert.equal(finishCalls,2);
  assert.equal(s.results.length,0);
  ctx.toggleTimedExerciseTimer();await complete();
  assert.equal(finishCalls,3);assert.equal(s.results.length,1);
  assert.equal(s.results[0].rest_seconds,40);
  s=start(4);
  assert.equal(s.sides,2);assert.equal(s.sideMode,'per_arm');
  assert.equal(ctx.timedSideSwitchMessage('per_arm'),'ЗМІНИ РУКУ');
  ctx.toggleTimedExerciseTimer();await complete();
  assert.equal(s.phase,'switch');assert.equal(finishCalls,3);
  ctx.toggleTimedExerciseTimer();await complete();
  assert.equal(finishCalls,4);
  console.log('Timed bilateral timer for per-leg, per-arm, per-side, single and superset PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
