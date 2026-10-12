"""Rest auto-scroll UX: only when a new rest starts and never against super-set navigation."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
TIMER=(ROOT/"backend/static/js/timer.js").read_text(encoding="utf-8")
LYFTA=(ROOT/"backend/static/js/workout-lyfta.js").read_text(encoding="utf-8")
TIMED=(ROOT/"backend/static/js/timed-workout.js").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class RestAutoScrollTests(unittest.TestCase):
    def test_one_scroll_location_and_competing_superset_focus_removed(self):
        self.assertIn("function scrollToActiveWorkoutRestTimer()",TIMER)
        self.assertIn("'.redesign-active-workout > .workout-featured-rest'",TIMER)
        self.assertIn("setTimeout(scrollToActiveWorkoutRestTimer,50)",TIMER)
        self.assertIn("if(!resuming&&tracking!==false&&seconds>0)",TIMER)
        self.assertIn("block:'center'",TIMER)
        self.assertIn("prefers-reduced-motion: reduce",TIMER)
        self.assertIn("}else if(inSuperset&&isLast&&n<total){",LYFTA)
        self.assertIn("if(hasNextRound&&!autoRestStarted)",TIMED)
        self.assertIn("setTimeout(function(){scrollToActiveWorkoutRestTimer()},80)",TIMED)

    def test_pwa_revisions(self):
        for shell in (INDEX,SW):
            for ref in ("/static/js/timer.js?v=169",
                        "/static/js/workout-lyfta.js?v=173",
                        "/static/js/timed-workout.js?v=7"):
                self.assertIn(ref,shell)
        self.assertIn("const VERSION='eplan-v222'",SW)

    @unittest.skipUnless(shutil.which("node"),"Requires Node.js")
    def test_real_start_scroll_once_with_no_automatic_jumps(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let now=1_000_000,store={},timeouts=[],scrolls=[],mounted=true;
const elements={};
for(const selector of ['.workout-featured-rest-value','.workout-featured-rest-next',
 '.workout-featured-rest-pause','.workout-featured-rest-pause .workout-rest-control-caption',
 '.workout-featured-rest-status','.workout-featured-rest-progress']){
 elements[selector]={textContent:'',style:{},setAttribute(){}};
}
const panel={hidden:true,dataset:{restFeaturedGlobal:'1',restFeaturedPid:'0',
  restFeaturedTotal:'1',restFeaturedSuperset:'0'},
  classList:{toggle(){}},querySelector(sel){return elements[sel]},
  scrollIntoView(opts){scrolls.push(opts)}
};
const ctx={console,Math,Date:{now:()=>now},REST_TIMER_KEY:'restTest',restTimerInterval:null,
  window:{currentClientData:{workout_sessions:[{id:7,status:'training'}],
      program:[{id:25,sets:3}]},
    matchMedia(){return {matches:false}}},
  localStorage:{getItem(k){return store[k]||null},setItem(k,v){store[k]=String(v)},
    removeItem(k){delete store[k]}},
  document:{querySelectorAll(sel){
    if(sel==='.workout-featured-rest')return mounted?[panel]:[];
    return [];
  },querySelector(sel){
    if(sel==='.redesign-active-workout > .workout-featured-rest')
       return mounted?panel:null;
    return null;
  }},
  $:()=>null,setTimeout:(fn,delay)=>{timeouts.push({fn,delay});return timeouts.length},
  setInterval:()=>1,clearInterval:()=>{},
  navigator:{serviceWorker:{controller:{postMessage(){}},ready:Promise.resolve({})}},
  saveWorkoutDraft:()=>{}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('backend/static/js/timer.js','utf8'),ctx);
ctx.renderFloatingRestTimer=()=>{};
ctx.syncRestTimerWorker=()=>{};
timeouts.length=0; // timer.js schedules a one-time recovery on script import.
ctx.startRestTimerCore(90,null,{sid:7,pid:25,set_number:1});
assert.equal(timeouts.length,1,'new tracked rest queues precisely one scroll');
assert.equal(timeouts[0].delay,50);
assert.equal(scrolls.length,0);
timeouts.shift().fn();
assert.equal(scrolls.length,1);
assert.equal(scrolls[0].behavior,'smooth');
assert.equal(scrolls[0].block,'center');
ctx.updateRestTimerUI(ctx.restTimerRemaining());
ctx.addRestTimer(30);
assert.equal(scrolls.length,1);
assert.equal(timeouts.length,0,'ticker and +30 add no new scroll');
now+=2500;
ctx.pauseRestTimer();
assert.equal(scrolls.length,1);
ctx.startRestTimerCore(ctx.restTimerPausedSeconds());
assert.equal(timeouts.length,0,'resume never queues another scroll');
ctx.cancelRestTimer();
ctx.startAutomaticRestTimer(60,false);
assert.equal(timeouts.length,0,'timed modal defers scroll until UI has rerendered');
assert(ctx.scrollToActiveWorkoutRestTimer(),'post-rerender timed rest can scroll');
assert.equal(scrolls.length,2);
ctx.window.matchMedia=()=>({matches:true});
ctx.scrollToActiveWorkoutRestTimer();
assert.equal(scrolls[2].behavior,'auto','accessibility: reduced motion');
mounted=false;
assert.equal(ctx.scrollToActiveWorkoutRestTimer(),false);
assert.equal(scrolls.length,3,'navigating away must not scroll');
console.log('New rest scroll, timer ticks, +30, pause/resume, timed rest and reduced motion PASS');
"""
        result=subprocess.run(["node","-e",js],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)


if __name__=="__main__":
    unittest.main()
