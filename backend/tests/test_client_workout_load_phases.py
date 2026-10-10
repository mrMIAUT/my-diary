"""Client-only load-phase periodization: API schema, migration and real JS matching."""
import ast
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
APP=(ROOT/"backend/app.py").read_text(encoding="utf-8")
WORKOUT=(ROOT/"backend/static/js/workout.js").read_text(encoding="utf-8")
LYFTA=(ROOT/"backend/static/js/workout-lyfta.js").read_text(encoding="utf-8")
TIMED=(ROOT/"backend/static/js/timed-workout.js").read_text(encoding="utf-8")
PROGRESS=(ROOT/"backend/static/js/progress-redesign.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class ClientLoadPhaseContracts(unittest.TestCase):
    def test_api_uses_validated_phase_and_additive_session_column(self):
        ast.parse(APP)
        self.assertIn("class WorkoutStartIn(BaseModel):",APP)
        self.assertIn('load_phase:str=Field(default="",pattern="^(|heavy|medium|light)$")',APP)
        self.assertIn("ADD COLUMN IF NOT EXISTS load_phase TEXT NOT NULL DEFAULT ''",APP)
        self.assertIn("program_snapshot,workout_day,day_kind,load_phase)",APP)
        self.assertIn("today,day_kind,x.load_phase)",APP)
        self.assertIn("if active:\n                session=dict(active)",APP)
        # The existing SELECT * returns the saved phase to resumed sessions.
        self.assertIn("SELECT * FROM workout_sessions WHERE client_id=%s AND status='training'",APP)
        self.assertIn("SELECT workout_sessions.*,",APP)

    def test_client_explicitly_selects_phase_and_never_assigns_trainer(self):
        self.assertIn('name="workoutLoadPhase"',WORKOUT)
        self.assertIn("selectWorkoutLoadPhase(this)",WORKOUT)
        self.assertIn("if(!workoutLoadPhaseLabel(loadPhase))",WORKOUT)
        self.assertIn("day_name:day,load_phase:loadPhase",WORKOUT)
        self.assertIn('class="workout-current-phase"',WORKOUT)
        self.assertIn("workoutLoadPhaseLabel(s.load_phase)",PROGRESS)
        self.assertIn("workout-phase-option",CSS)
        self.assertIn("workout-confirm-primary:disabled",CSS)

    def test_inlined_prev_context_filters_both_modes_but_pr_and_graph_remain_global(self):
        self.assertIn("workoutSamePhasePreviousRows(d,lyftaHistoryRows",LYFTA)
        self.assertIn("workoutSamePhasePreviousRows(d,timedWorkoutHistoryRows",TIMED)
        self.assertIn("lyftaAllTimeBestWeight(d,pid,exerciseName",LYFTA)
        self.assertIn("return workoutHistoryRows(d,pid,name)",LYFTA)
        self.assertIn("status==='finished'&&s.load_phase===phase",WORKOUT)

    def test_pwa_cache_consistency(self):
        assets=[
          "/static/css/redesign.css?v=254",
          "/static/js/workout.js?v=184",
          "/static/js/workout-lyfta.js?v=171",
          "/static/js/timed-workout.js?v=6",
          "/static/js/progress-redesign.js?v=169",
          "/static/js/calendar.js?v=163",
        ]
        for source in (INDEX,SW):
            for asset in assets:self.assertIn(asset,source)
        self.assertIn("const VERSION='eplan-v211'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node required for browser-free JS regression")
    def test_legacy_and_phase_specific_comparisons(self):
        js = r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const w=fs.readFileSync('backend/static/js/workout.js','utf8');
const lyfta=fs.readFileSync('backend/static/js/workout-lyfta.js','utf8');
const timed=fs.readFileSync('backend/static/js/timed-workout.js','utf8');
const ctx={
 window:{workoutExerciseChoices:{}},console,
 setInterval:()=>1,document:{addEventListener:()=>{}},
 sessionDay:s=>s.workout_day,
 isoToday:()=> '2026-10-10',
 esc:v=>String(v)
};
vm.createContext(ctx);
vm.runInContext(w,ctx);
vm.runInContext(lyfta,ctx);
vm.runInContext(timed,ctx);
const d={
  program:[{id:25,exercise:'Жим лежачи'}, {id:52,exercise:'Планка'}],
  workout_sessions:[
    {id:10,status:'training',workout_day:'2026-10-10',load_phase:'heavy'},
    {id:9,status:'finished',workout_day:'2026-10-09',load_phase:'medium'},
    {id:8,status:'finished',workout_day:'2026-10-08',load_phase:'light'},
    {id:7,status:'finished',workout_day:'2026-10-02',load_phase:'heavy'},
    {id:6,status:'finished',workout_day:'2026-09-27',load_phase:''},
    {id:5,status:'canceled',workout_day:'2026-10-06',load_phase:'heavy'}
  ],
  result_sets:[
    {program_id:18,exercise:'Жим лежачи',day:'2026-09-27',set_number:1,weight:70,reps:10},
    {program_id:25,exercise:'Жим лежачи',day:'2026-10-02',set_number:1,weight:90,reps:6},
    {program_id:25,exercise:'Жим лежачи',day:'2026-10-02',set_number:2,weight:85,reps:6},
    {program_id:25,exercise:'Жим лежачи',day:'2026-10-06',set_number:1,weight:111,reps:4},
    {program_id:25,exercise:'Жим лежачи',day:'2026-10-08',set_number:1,weight:70,reps:12},
    {program_id:25,exercise:'Жим лежачи',day:'2026-10-09',set_number:1,weight:80,reps:10}
  ],
  timed_result_sets:[
    {program_id:52,exercise:'Планка',day:'2026-09-27',set_number:1,work_seconds:100},
    {program_id:52,exercise:'Планка',day:'2026-10-02',set_number:1,work_seconds:40},
    {program_id:52,exercise:'Планка',day:'2026-10-08',set_number:1,work_seconds:25},
    {program_id:52,exercise:'Планка',day:'2026-10-09',set_number:1,work_seconds:30}
  ]
};
assert.equal(ctx.workoutLoadPhaseLabel('heavy'),'Важкий тиждень');
assert.equal(ctx.workoutCurrentLoadPhase(d),'heavy');
assert.equal(ctx.lyftaPreviousDaySets(d,25,'Жим лежачи')[0].weight,90);
assert.equal(ctx.lyftaPreviousDaySets(d,25,'Жим лежачи').length,2);
assert.equal(ctx.lyftaHistoryRows(d,25,'Жим лежачи').length,6);
assert.equal(ctx.lyftaAllTimeBestWeight(d,25,'Жим лежачи'),111);
assert(ctx.timedExercisePreviousHTML({id:52,exercise:'Планка',work_seconds:45},d).includes('40 сек'));
assert(!ctx.timedExercisePreviousHTML({id:52,exercise:'Планка',work_seconds:45},d).includes('100 сек'));
d.workout_sessions[0].load_phase='medium';
assert.equal(ctx.lyftaPreviousDaySets(d,25,'Жим лежачи')[0].weight,80);
assert(ctx.timedExercisePreviousHTML({id:52,exercise:'Планка',work_seconds:45},d).includes('30 сек'));
d.workout_sessions[0].load_phase='light';
assert.equal(ctx.lyftaPreviousDaySets(d,25,'Жим лежачи')[0].weight,70);
assert(ctx.timedExercisePreviousHTML({id:52,exercise:'Планка',work_seconds:45},d).includes('25 сек'));
d.workout_sessions[0].load_phase='heavy';
d.workout_sessions[3].load_phase='';
assert.equal(ctx.lyftaPreviousDaySets(d,25,'Жим лежачи').length,0);
assert(ctx.timedExercisePreviousHTML({id:52,exercise:'Планка',work_seconds:45},d).includes('Попередньо'));
assert(ctx.timedExercisePreviousHTML({id:52,exercise:'Планка',work_seconds:45},d).includes('—'));
// All sessions without phase preserve old previous-result behavior.
d.workout_sessions[0].load_phase='';
assert.equal(ctx.lyftaPreviousDaySets(d,25,'Жим лежачи')[0].weight,80);
console.log('Phase-aware reps/timed history + legacy isolation PASS');
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
