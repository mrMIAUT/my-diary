"""Regression: adding a workout set never removes the running timer card."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
WORKOUT=(ROOT/"backend/static/js/workout.js").read_text(encoding="utf-8")
TIMER=(ROOT/"backend/static/js/timer.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class ExtraSetRestTimerTests(unittest.TestCase):
    def test_extra_set_edit_only_rebuilds_its_own_exercise(self):
        self.assertIn("function refreshWorkoutRepSetBody(",WORKOUT)
        self.assertIn("body.innerHTML=completedExerciseHTML(x,d,cid)",WORKOUT)
        self.assertIn("body.classList.remove('hidden')",WORKOUT)
        self.assertNotIn("featuredRestTimerHTML(",WORKOUT)
        self.assertNotIn("body.prepend(panel)",WORKOUT)
        self.assertGreaterEqual(WORKOUT.count("refreshWorkoutRepSetBody(cid,pid,x,d);"),3)
        self.assertIn("await startRestTimer(restSeconds,null,tracking);",
                      (ROOT/"backend/static/js/workout-lyfta.js").read_text(encoding="utf-8"))
        self.assertIn("let tracking={sid,pid,set_number:n};",
                      (ROOT/"backend/static/js/workout-lyfta.js").read_text(encoding="utf-8"))

    def test_refined_icon_and_floating_timer_size(self):
        self.assertIn("stopwatch:'<path",TIMER)
        self.assertIn("featuredRestTimerIcon('stopwatch')",TIMER)
        self.assertIn('redesign-floating-rest-timer-copy',TIMER)
        self.assertIn('Відпочинок</small>',TIMER)
        css=CSS.split("/* v256 — iPhone timer polish:",1)[1]
        self.assertIn("width:148px!important",css)
        self.assertIn("width:146px!important",css)
        self.assertIn("flex-direction:row!important",css)
        self.assertIn("font-size:20px!important",css)
        self.assertIn("workout-featured-rest-ring>span svg",css)
        self.assertIn("stroke-width:1.75!important",css)

    def test_pwa_asset_refresh(self):
        for src in (INDEX,SW):
            for asset in ("/static/js/workout.js?v=189",
                          "/static/js/timer.js?v=169",
                          "/static/css/redesign.css?v=263"):
                self.assertIn(asset,src)
        self.assertIn("const VERSION='eplan-v226'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node required")
    def test_real_extra_set_refresh_never_recreates_global_timer(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const w=fs.readFileSync('backend/static/js/workout.js','utf8');
const start=w.indexOf('function refreshWorkoutRepSetBody(');
const end=w.indexOf('function removeWorkoutExtraSet(',start);
assert(start>=0&&end>start);
const code=w.slice(start,end);
let count=3,rerenders=0,saved=[],globalTimer={alive:true};
const body={
 classList:{remove(v){this.removed=v}},
 set innerHTML(v){assert(v.includes('SETS'));rerenders++},
 get innerHTML(){return 'SETS'}
};
const d={program:[{id:25,sets:3,exercise:'Жим гантелей'}]};
const ctx={window:{currentClientData:d},console,
 document:{getElementById(id){assert.equal(id,'exerciseBody25');return body}},
 workoutDraftSessionId:()=>7,workoutEffectiveExercise:x=>x,
 workoutExerciseSetCount:()=>count,
 saveWorkoutDraftSetCount:(sid,pid,total)=>{saved.push([sid,pid,total]);count=total},
 completedExerciseHTML:()=>'<div>SETS</div>',
 featuredRestTimerHTML:()=>{throw Error('per exercise timer must never be added')},
 syncFeaturedRestTimer:()=>{throw Error('must not reset global timer')},
 alert:()=>{throw Error('unexpected alert')}
};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.addWorkoutExtraSet(11,25);
ctx.addWorkoutExtraSet(11,25);
ctx.refreshWorkoutRepSetBody(11,25,d.program[0],d);
assert.deepStrictEqual(saved,[[7,25,4],[7,25,5]]);
assert.equal(rerenders,3);
assert.equal(globalTimer.alive,true);
assert.equal(body.classList.removed,'hidden');
console.log('Additional sets repaint locally; single global rest timer untouched PASS');
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\\n"+p.stderr)

    @unittest.skipUnless(shutil.which("node"),"Node required")
    def test_floating_timer_uses_outline_icon_with_same_running_countdown(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('backend/static/js/timer.js','utf8');
let html='',remaining=90;
const ctx={
 console,Math,REST_TIMER_KEY:'timer',setTimeout:()=>0,
 localStorage:{getItem(k){if(k==='timer')return String(Date.now()+remaining*1000);return null}},
 window:{},
 document:{body:{classList:{contains(n){return ['eplan-redesign','client-ui'].includes(n)}},
 insertAdjacentHTML(p,x){assert.equal(p,'beforeend');html=x}},
 querySelector(){return null}},
 $:()=>null
};
vm.createContext(ctx);vm.runInContext(src,ctx);
ctx.renderFloatingRestTimer();
assert(html.includes('redesign-floating-rest-timer'));
assert(html.includes('redesign-floating-rest-timer-copy'));
assert(html.includes('<svg'));
assert(html.includes('01:30'));
assert(html.includes('Відпочинок'));
assert(!html.includes('>⏱</span>'));
console.log('Floating timer SVG + horizontal data layout PASS');
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
