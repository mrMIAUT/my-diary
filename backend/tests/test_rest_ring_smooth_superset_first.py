"""iPhone regression: centered fluid rest dial and shared first-in-superset timer."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
WORKOUT=(ROOT/"backend/static/js/workout.js").read_text(encoding="utf-8")
TRAINING=(ROOT/"backend/static/js/training-redesign.js").read_text(encoding="utf-8")
TIMER=(ROOT/"backend/static/js/timer.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class SmoothSupersetRestTests(unittest.TestCase):
    def test_one_global_rest_card_above_all_exercises(self):
        self.assertIn("featuredRestTimerHTML(0,1,false,true)+activeExercisesHTML(",TRAINING)
        self.assertNotIn("featuredRestTimerHTML(",WORKOUT)
        self.assertIn("data-rest-featured-global",TIMER)
        self.assertIn("visible=global?",TIMER)
        self.assertIn("var total=context",TIMER)
        self.assertIn("data-rest-featured-superset",TIMER)

    def test_css_hands_centered_and_ring_no_step_transition(self):
        c=CSS.split("/* v259 — centered rest clock hands",1)[1]
        for item in ("left:50%!important","top:50%!important",
                     "transform-origin:50% 100%!important",
                     "translate(-50%,-100%)!important",
                     "translate(-50%,-100%) rotate(120deg)!important",
                     "transition:none!important"):
            self.assertIn(item,c)

    def test_pwa_versions(self):
        for doc in (INDEX,SW):
            for p in ("/static/js/workout.js?v=189","/static/js/timer.js?v=169",
                      "/static/css/redesign.css?v=263"):
                self.assertIn(p,doc)
        self.assertIn("const VERSION='eplan-v226'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node required")
    def test_single_global_panel_for_superset_solo_and_timed_rest(self):
        script=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let now=1000000,raf=null,store={};
const cells={};
for(const selector of ['.workout-featured-rest-value','.workout-featured-rest-next',
 '.workout-featured-rest-pause','.workout-featured-rest-pause .workout-rest-control-caption',
 '.workout-featured-rest-status','.workout-featured-rest-progress']){
 cells[selector]={textContent:'',style:{},setAttribute(){}};
}
const card={hidden:true,dataset:{restFeaturedGlobal:'1',restFeaturedPid:'0',restFeaturedTotal:'1',
 restFeaturedSuperset:'0'},classList:{toggle(){}},querySelector(sel){return cells[sel]}};
let active={id:7,status:'training'};
const program=[{id:11,sets:3,day_name:'День 1',superset_group:'group',superset_order:1},
{id:22,sets:3,day_name:'День 1',superset_group:'group',superset_order:2},
{id:44,sets:3,day_name:'День 1'}];
const ctx={
 console,Math,Date:{now:()=>now},REST_TIMER_KEY:'timer',window:{
 currentClientData:{workout_sessions:[active],program},
 requestAnimationFrame(fn){raf=fn;return 1}},
 localStorage:{getItem(k){return store[k]||null},setItem(k,v){store[k]=String(v)},
 removeItem(k){delete store[k]}},
 document:{querySelectorAll(sel){
 if(sel==='.workout-featured-rest')return [card];
 if(sel==='.workout-featured-rest.is-visible')return card.hidden?[]:[card];
 return []},
 querySelector(sel){return sel==='.workout-featured-rest.is-visible'&&!card.hidden?card:null}},
 setTimeout:()=>0
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('backend/static/js/timer.js','utf8'),ctx);
ctx.workoutSupersetPeers=x=>program.filter(p=>p.superset_group&&p.superset_group===x.superset_group);
ctx.workoutExerciseSetCount=x=>x.sets;
store.timer=String(now+90000);
store.eplanRestTrackV1=JSON.stringify({sid:7,pid:22,set_number:1,started_at:now,end_at:now+90000});
ctx.syncFeaturedRestTimer(90,0);
assert.equal(card.hidden,false);
assert.equal(cells['.workout-featured-rest-next'].textContent,'Наступне коло: 2 з 3');
assert.equal(ctx.readTrackedRest().pid,22,'saved rest stays on completed second exercise');
const before=parseFloat(cells['.workout-featured-rest-progress'].style.strokeDasharray);
now+=125;raf();
const after=parseFloat(cells['.workout-featured-rest-progress'].style.strokeDasharray);
assert(after<before&&after>0,'millisecond progress remains smooth in global card');
store.eplanRestTrackV1=JSON.stringify({sid:7,pid:44,set_number:1,started_at:now,end_at:now+90000});
store.timer=String(now+90000);
ctx.syncFeaturedRestTimer(90,0);
assert.equal(card.hidden,false);
assert.equal(cells['.workout-featured-rest-next'].textContent,'Наступний підхід: 2 з 3');
delete store.eplanRestTrackV1; // Timed/mixed superset rest may have no set tracking.
ctx.syncFeaturedRestTimer(90,0);
assert.equal(card.hidden,false,'untagged timed rest remains visible');
assert.equal(cells['.workout-featured-rest-next'].textContent,'Відпочинок перед наступним підходом');
store.eplanRestTrackV1=JSON.stringify({sid:7,pid:22,set_number:1,started_at:now,end_at:now+90000});
active.id=8;
ctx.syncFeaturedRestTimer(90,0);
assert.equal(card.hidden,true,'another workout session rest stays hidden');
console.log('One top-level timer: superset, solo, timed, smooth progress and session safety PASS');
"""
        p=subprocess.run(["node","-e",script],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+"\\n"+p.stderr)

    @unittest.skipUnless(shutil.which("node"),"Node required")
    def test_real_superset_target_and_subsecond_svg_animation(self):
        script=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let now=1000000,raf=null,store={};
const piece=()=>({textContent:'',style:{},setAttribute(){}});
function panel(pid,superSet){
 const els={};
 for(const sel of ['.workout-featured-rest-value','.workout-featured-rest-next',
 '.workout-featured-rest-pause','.workout-featured-rest-pause .workout-rest-control-caption',
 '.workout-featured-rest-status','.workout-featured-rest-progress'])els[sel]=piece();
 const p={hidden:true,dataset:{restFeaturedPid:String(pid),restFeaturedTotal:'3',
 restFeaturedSuperset:superSet?'1':'0'},classList:{toggle(){}},
 querySelector(sel){return els[sel]||null},els};
 return p;
}
const first=panel(11,true),last=panel(22,true),solo=panel(44,false);
const panels=[first,last,solo],active={id:7,status:'training'};
const ctx={
 console,Math,Date:{now:()=>now},REST_TIMER_KEY:'restEnd',window:{
 currentClientData:{workout_sessions:[active],program:[
 {id:11,day_name:'День 1',superset_group:'group',superset_order:1},
 {id:22,day_name:'День 1',superset_group:'group',superset_order:2},
 {id:44,day_name:'День 1'}]},
 requestAnimationFrame(fn){raf=fn;return 1}},
 localStorage:{getItem(k){return store[k]||null},setItem(k,v){store[k]=String(v)},
 removeItem(k){delete store[k]}},
 document:{querySelectorAll(sel){
 if(sel==='.workout-featured-rest')return panels;
 if(sel==='.workout-featured-rest.is-visible')return panels.filter(p=>!p.hidden);
 return [];},
 querySelector(sel){return sel==='.workout-featured-rest.is-visible'?panels.find(p=>!p.hidden):null}},
 setTimeout:()=>0
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('backend/static/js/timer.js','utf8'),ctx);
ctx.workoutSupersetPeers=x=>ctx.window.currentClientData.program.filter(p=>p.superset_group&&p.superset_group===x.superset_group);
store.restEnd=String(now+90000);
store.eplanRestTrackV1=JSON.stringify({sid:7,pid:22,set_number:1,started_at:now,end_at:now+90000});
ctx.syncFeaturedRestTimer(90,0);
assert.equal(first.hidden,false,'first superset exercise owns the card');
assert.equal(last.hidden,true,'last superset exercise must not own a visible card');
assert.equal(solo.hidden,true);
assert.equal(ctx.readTrackedRest().pid,22,'rest is still tracked against completed last exercise');
assert(typeof raf==='function','animation scheduled');
const before=parseFloat(first.els['.workout-featured-rest-progress'].style.strokeDasharray);
now+=125;
assert.equal(ctx.restTimerRemaining(),90,'text still shows the same whole second');
const frame=raf;frame();
const after=parseFloat(first.els['.workout-featured-rest-progress'].style.strokeDasharray);
assert(after<before,'arc moved within one 125ms fraction');
assert(after>0);
store.eplanRestTrackV1=JSON.stringify({sid:7,pid:44,set_number:1,started_at:now,end_at:now+90000});
store.restEnd=String(now+90000);
ctx.syncFeaturedRestTimer(90,0);
assert.equal(first.hidden,true,'old group panel hides when rest belongs to standalone');
assert.equal(solo.hidden,false,'standalone exercise stays unchanged');
console.log('Shared superset first, standalone routing, smooth 125ms arc PASS');
"""
        p=subprocess.run(["node","-e",script],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
