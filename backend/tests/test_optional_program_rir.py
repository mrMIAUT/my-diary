"""Optional RIR controls in assigned programs, templates, and client workouts."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
APP=(ROOT/"backend/app.py").read_text(encoding="utf-8")
PROGRAM=(ROOT/"backend/static/js/program.js").read_text(encoding="utf-8")
WORKOUT=(ROOT/"backend/static/js/workout.js").read_text(encoding="utf-8")
LYFTA=(ROOT/"backend/static/js/workout-lyfta.js").read_text(encoding="utf-8")
TRAINER=(ROOT/"backend/static/js/trainer.js").read_text(encoding="utf-8")
TRAINING=(ROOT/"backend/static/js/training-redesign.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class ProgramRirTests(unittest.TestCase):
    def test_legacy_safe_database_and_authorized_setting_endpoint(self):
        self.assertIn("ADD COLUMN IF NOT EXISTS show_rir BOOLEAN NOT NULL DEFAULT TRUE",APP)
        self.assertIn("ALTER TABLE clients ALTER COLUMN show_rir SET DEFAULT FALSE",APP)
        self.assertIn('"show_rir",',APP)
        self.assertIn('class ProgramRirVisibilityIn(BaseModel):',APP)
        self.assertIn('@app.patch("/api/client/{cid}/program-rir")',APP)
        setting=APP.split('def set_program_rir(',1)[1].split('\n@app.',1)[0]
        self.assertIn('authorize_client(user,cid)',setting)
        self.assertIn('require_trainer',APP.split('@app.patch("/api/client/{cid}/program-rir")',1)[1].split('\n@app.',1)[0])
        self.assertIn("UPDATE clients SET show_rir=?",setting)

    def test_program_and_template_visibility_are_persisted(self):
        self.assertIn("ALTER TABLE program_templates ADD COLUMN IF NOT EXISTS show_rir",APP)
        self.assertIn("INSERT INTO program_templates(trainer_id,name,description,show_rir)",APP)
        self.assertIn('bool(client["show_rir"])',APP)
        self.assertIn("show_rir:bool=True",APP)
        self.assertIn("x.show_rir,template_id",APP)
        self.assertIn('bool(t["show_rir"])',APP)
        self.assertIn('st.show_rir=t.show_rir',TRAINER.replace('show_rir:t.show_rir','st.show_rir=t.show_rir'))
        self.assertIn("show_rir:st.show_rir!==false",TRAINER)
        self.assertIn("function toggleClientProgramRir(",PROGRAM)
        self.assertIn("toggleClientProgramRir(this)",PROGRAM)
        self.assertIn("function updateProgramTemplateRir(",TRAINER)

    def test_removed_from_editor_and_active_workout(self):
        self.assertIn("program-rir-disabled",PROGRAM)
        self.assertIn("program-rir-field",TRAINER)
        self.assertIn("program-rir-disabled .program-rir-field",CSS)
        self.assertIn("lyfta-set-head'+(showRir?'':' no-rir')",LYFTA)
        self.assertIn("+(showRir?'<input id=",LYFTA)
        self.assertIn("if(!w||!r)continue;",WORKOUT)
        self.assertIn("rir=programRirEnabled(currentData)?",WORKOUT)
        self.assertIn("programRirEnabled()",TRAINING)
        self.assertIn("grid-template-columns:42px minmax(0,1fr) minmax(0,1fr) 38px!important",CSS)

    def test_pwa_versions(self):
        for source in (INDEX,SW):
            for asset in ('/static/js/program.js?v=192','/static/js/workout.js?v=188',
                          '/static/js/workout-lyfta.js?v=173','/static/js/trainer.js?v=314',
                          '/static/js/training-redesign.js?v=170','/static/css/redesign.css?v=262'):
                self.assertIn(asset,source)
        self.assertIn("const VERSION='eplan-v222'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node.js required")
    def test_client_set_html_disables_rir_without_breaking_rows(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const full=fs.readFileSync('backend/static/js/workout-lyfta.js','utf8');
const start=full.indexOf('function setRows(');
const end=full.length; // setRows is the final helper
assert(start>=0&&end>start);
const ctx={
 console,Math,window:{},
 rirPlan:()=>[2,1,0],workoutDraftSessionId:()=>7,readWorkoutDraft:()=>({}),
 workoutExerciseName:x=>x.exercise,normalizeRepeatMode:()=> 'normal',
 lyftaPreviousDaySets:()=>[],lyftaRestSeconds:()=>90,
 lyftaShouldStartRestAfterSet:()=>true,
 workoutExerciseSetCount:()=>3,workoutSkippedSetNumbers:()=>[],
 repeatModeShortLabel:()=>'',esc:s=>String(s),
 lyftaDropRowsHTML:()=>'',lyftaWarmupRowsHTML:()=>'',lyftaProgressionHintHTML:()=>''
};
ctx.programRirEnabled=d=>d.client?.show_rir!==false;
vm.createContext(ctx);
vm.runInContext(full.slice(start,end),ctx);
const x={id:101,sets:3,reps:'8-12',exercise:'Тяга'};
const off=ctx.setRows(x,{client:{show_rir:false}},11);
assert(off.includes('lyfta-set-head no-rir'));
assert(off.includes('lyfta-set-row no-rir'));
assert(!off.includes('<span>RIR</span>'));
assert(!off.includes('id="i101_1"'));
assert(off.includes('id="w101_1"')&&off.includes('id="r101_1"'));
assert(off.includes('lyfta-set-done'));
const on=ctx.setRows(x,{client:{show_rir:true}},11);
assert(on.includes('<span>RIR</span>'));
assert(on.includes('id="i101_1"'));
assert(on.includes('id="w101_1"'));
assert(ctx.setRows(x,{client:{}},11).includes('id="i101_1"'),'legacy fallback');
console.log('3 sets render with RIR OFF/ON, legacy visible, weight/reps and actions intact PASS');
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
