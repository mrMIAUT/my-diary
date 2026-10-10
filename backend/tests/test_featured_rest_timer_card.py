"""Prominent in-card rest timer UI: no new countdown or changes to save logic."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
TIMER=(ROOT/"backend/static/js/timer.js").read_text(encoding="utf-8")
WORKOUT=(ROOT/"backend/static/js/workout.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class FeaturedRestTimerTests(unittest.TestCase):
    def test_only_standard_repetition_exercises_get_timer_card(self):
        self.assertIn("if(!timed)content=featuredRestTimerHTML(x.id,effective.sets,!!x.superset_group)+content",WORKOUT)
        self.assertIn("content=timed?timedExerciseHTML(effective,d,cid):completedExerciseHTML(effective,d,cid)",WORKOUT)
        self.assertIn("data-rest-featured-pid",TIMER)
        self.assertIn("workout-featured-rest-next",TIMER)
        self.assertIn("onclick=\"toggleRestTimerPlayback()\"",TIMER)
        self.assertIn("onclick=\"cancelRestTimer()\"",TIMER)
        self.assertIn("syncFeaturedRestTimer(s,paused)",TIMER)
        self.assertIn("function renderFloatingRestTimer()",TIMER)
        self.assertIn("if(s<=0){clearInterval(restTimerInterval);restTimerInterval=null;finishRestTimer()}",TIMER)

    def test_large_card_hidden_without_active_rest_and_phone_friendly(self):
        c=CSS.split("/* v253 — prominent rest timer",1)[1]
        self.assertIn(".workout-featured-rest[hidden]",c)
        self.assertIn("display:none!important",c)
        self.assertIn(".workout-featured-rest-value",c)
        self.assertIn("font-variant-numeric:tabular-nums",c)
        self.assertIn("@media(max-width:375px)",c)
        self.assertIn("min-height:44px!important",c)

    def test_pwa_assets(self):
        for source in (INDEX,SW):
            for asset in ("/static/js/timer.js?v=163",
                          "/static/js/workout.js?v=184",
                          "/static/css/redesign.css?v=254"):
                self.assertIn(asset,source)
        self.assertIn("const VERSION='eplan-v211'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node required for rest timer behavior regression")
    def test_real_timer_ui_tracks_only_current_session_and_existing_controls(self):
        script=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const timer=fs.readFileSync('backend/static/js/timer.js','utf8');
let store={},saved=[];
function makePanel(pid,total,superset='0'){
  const pieces={};
  for(const s of ['.workout-featured-rest-value','.workout-featured-rest-next',
     '.workout-featured-rest-pause','.workout-featured-rest-pause .workout-rest-control-caption','.workout-featured-rest-status',
     '.workout-featured-rest-progress']){
    pieces[s]={textContent:'',style:{},attrs:{},
      setAttribute(k,v){this.attrs[k]=v}};
  }
  return {dataset:{restFeaturedPid:String(pid),restFeaturedTotal:String(total),restFeaturedSuperset:superset},
    hidden:true,classes:{},classList:{toggle(c,v){this.owner.classes[c]=!!v}},
    querySelector(s){return pieces[s]||null},pieces};
}
const a=makePanel(25,4),b=makePanel(99,3,'1');
a.classList.owner=a;b.classList.owner=b;
let active={id:7,status:'training'};
const ctx={
  console,Date,Math,REST_TIMER_KEY:'testRestEnd',restTimerInterval:null,
  localStorage:{
    getItem(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null},
    setItem(k,v){store[k]=String(v)},
    removeItem(k){delete store[k]}
  },
  window:{currentClientData:{workout_sessions:[active]}},
  document:{querySelectorAll(sel){return sel==='.workout-featured-rest'?[a,b]:[]},
    querySelector(){return null}},
  $:()=>null,
  navigator:{serviceWorker:{controller:{postMessage(){}},ready:Promise.resolve({})}},
  setTimeout:()=>0,setInterval:()=>1,clearInterval:()=>{},performance:{now:()=>0},
  saveWorkoutDraft:(...args)=>saved.push(args)
};
vm.createContext(ctx);vm.runInContext(timer,ctx);
ctx.renderFloatingRestTimer=()=>{};
ctx.syncRestTimerWorker=()=>{};
let template=ctx.featuredRestTimerHTML(25,4,false);
assert(template.includes('data-rest-featured-pid="25"'));
assert(template.includes('onclick="toggleRestTimerPlayback()"'));
assert(template.includes('onclick="cancelRestTimer()"'));
assert(template.includes('Пропустити'));
assert(template.includes('onclick="extendFeaturedRestTimer(30)"'));
assert(template.includes('Налаштувати'));
assert(!template.includes('⏭'));
assert(!template.includes('⚙'));
assert(template.includes('<svg'));

assert(template.includes('hidden'));
ctx.startRestTimerCore(90,null,{sid:7,pid:25,set_number:2});
assert.equal(a.hidden,false);assert.equal(b.hidden,true);
assert.equal(a.pieces['.workout-featured-rest-next'].textContent,'Наступний підхід: 3 з 4');
assert.match(a.pieces['.workout-featured-rest-value'].textContent,/01:3[01]/);
assert.equal(a.pieces['.workout-featured-rest-pause'].attrs['aria-label'],'Призупинити відпочинок');
assert.equal(a.pieces['.workout-featured-rest-pause .workout-rest-control-caption'].textContent,'Пауза');
ctx.extendFeaturedRestTimer(30);
assert(ctx.restTimerRemaining()>=119);
assert(Number.isFinite(+a.pieces['.workout-featured-rest-progress'].style.strokeDashoffset));
ctx.pauseRestTimer();
assert.equal(a.hidden,false);
assert.equal(a.classes['is-paused'],true);
assert.equal(a.pieces['.workout-featured-rest-pause'].attrs['aria-label'],'Продовжити відпочинок');
assert.equal(a.pieces['.workout-featured-rest-pause .workout-rest-control-caption'].textContent,'Старт');
const beforeExtension=ctx.restTimerPausedSeconds();
ctx.extendFeaturedRestTimer(30);
assert.equal(ctx.restTimerPausedSeconds(),beforeExtension+30);
assert.equal(ctx.restTimerRemaining(),0);
assert.equal(a.pieces['.workout-featured-rest-value'].textContent,ctx.formatRestTimer(beforeExtension+30));
assert.equal(ctx.restTimerRemaining(),0);
ctx.startRestTimerCore(ctx.restTimerPausedSeconds());
assert.equal(a.hidden,false);
assert.equal(a.classes['is-paused'],false);
assert(ctx.restTimerRemaining()>=148);
ctx.cancelRestTimer();
assert.equal(a.hidden,true);assert.equal(b.hidden,true);
assert.equal(ctx.readTrackedRest(),null);
ctx.startRestTimerCore(60,null,{sid:7,pid:99,set_number:2});
assert.equal(a.hidden,true);assert.equal(b.hidden,false);
assert.equal(b.pieces['.workout-featured-rest-next'].textContent,'Наступне коло: 3 з 3');
active.id=55;ctx.updateRestTimerUI(ctx.restTimerRemaining());
assert.equal(b.hidden,true);
ctx.cancelRestTimer();
console.log('Rest timer: large UI, pause/resume, skip, same session, superset context PASS');
"""
        p=subprocess.run(["node","-e",script],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
