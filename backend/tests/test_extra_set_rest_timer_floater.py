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
    def test_add_remove_and_skip_all_preserve_same_timer_panel(self):
        self.assertIn("function refreshWorkoutRepSetBody(",WORKOUT)
        self.assertIn("body.prepend(panel);",WORKOUT)
        self.assertIn("panel.dataset.restFeaturedTotal=String(workoutExerciseSetCount(x,d))",WORKOUT)
        self.assertIn("syncFeaturedRestTimer(restTimerRemaining(),restTimerPausedSeconds())",WORKOUT)
        self.assertIn("body.insertAdjacentHTML('afterbegin',featuredRestTimerHTML(",WORKOUT)
        self.assertGreaterEqual(WORKOUT.count("refreshWorkoutRepSetBody(cid,pid,x,d);"),3)
        # Completing a newly added set still invokes existing tracked rest.
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
            for asset in ("/static/js/workout.js?v=187",
                          "/static/js/timer.js?v=168",
                          "/static/css/redesign.css?v=260"):
                self.assertIn(asset,src)
        self.assertIn("const VERSION='eplan-v217'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node required")
    def test_real_extra_set_refresh_preserves_live_panel_and_dynamic_total(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let w=fs.readFileSync('backend/static/js/workout.js','utf8');
let start=w.indexOf('function refreshWorkoutRepSetBody(');
let end=w.indexOf('function removeWorkoutExtraSet(',start);
assert(start>=0&&end>start);
let code=w.slice(start,end);
let panel={dataset:{restFeaturedPid:'25',restFeaturedTotal:'3'},trackKey:'unchanged'};
let completeCount=3,rerenders=0,created=0,synced=[],saved=[];
let body={
 classList:{remove(v){this.removed=v}},
 _panel:panel,_html:'',
 querySelector(selector){assert.equal(selector,'.workout-featured-rest');return this._panel},
 set innerHTML(v){this._html=v;this._panel=null;rerenders++},
 get innerHTML(){return this._html},
 prepend(p){this._panel=p},
 insertAdjacentHTML(where,text){assert.equal(where,'afterbegin');assert(text.includes('workout-featured-rest'));created++;this._panel={dataset:{}}}
};
let d={program:[{id:25,sets:3,exercise:'Жим гантелей'}]};
const ctx={window:{currentClientData:d},console,
 document:{getElementById(id){assert.equal(id,'exerciseBody25');return body}},
 workoutDraftSessionId:()=>7,
 workoutEffectiveExercise:x=>x,
 workoutExerciseSetCount:()=>completeCount,
 saveWorkoutDraftSetCount:(sid,pid,count)=>{saved.push([sid,pid,count]);completeCount=count},
 completedExerciseHTML:()=>'<div>SETS</div>',
 featuredRestTimerHTML:(pid,total)=>'<section class="workout-featured-rest" data-total="'+total+'"></section>',
 syncFeaturedRestTimer:(remaining,paused)=>synced.push([remaining,paused]),
 restTimerRemaining:()=>90,restTimerPausedSeconds:()=>0,
 alert:()=>{throw new Error('unexpected alert')}
};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.addWorkoutExtraSet(11,25);
assert.deepStrictEqual(saved[0],[7,25,4]);assert.strictEqual(body._panel,panel);
assert.equal(panel.dataset.restFeaturedTotal,'4');
assert.deepStrictEqual(synced[0],[90,0]);
assert.equal(rerenders,1);assert.equal(created,0);
ctx.addWorkoutExtraSet(11,25);
assert.deepStrictEqual(saved[1],[7,25,5]);assert.strictEqual(body._panel,panel);
assert.equal(panel.dataset.restFeaturedTotal,'5');assert.equal(created,0);
ctx.refreshWorkoutRepSetBody(11,25,d.program[0],d);
assert.strictEqual(body._panel,panel);assert.equal(synced.length,3);
// A legacy DOM already missing the card is repaired on its next set edit.
body._panel=null;
ctx.refreshWorkoutRepSetBody(11,25,d.program[0],d);
assert.equal(created,1);assert.equal(body._panel.dataset.restFeaturedTotal,'5');
console.log('Extra set keeps original panel, tracks total 3->4->5, repairs missing card PASS');
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)

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
