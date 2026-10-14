"""Final iPhone rest timer: Stop persists active rest excluding pause, compact controls."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
TIMER=(ROOT/"backend/static/js/timer.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
WORKOUT=(ROOT/"backend/static/js/workout.js").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class RestTimerFinalMobileTests(unittest.TestCase):
    def test_button_placement_and_workout_persistence_contract(self):
        start=TIMER.split("function featuredRestTimerHTML(",1)[1].split("\n// Reuse the existing",1)[0]
        self.assertIn('workout-featured-rest-pause',start)
        self.assertIn('workout-featured-rest-stop',start)
        self.assertIn('onclick="cancelRestTimer()"',start)
        self.assertIn("featuredRestTimerIcon('stop')",start)
        self.assertIn('workout-featured-rest-add',start)
        self.assertIn('extendFeaturedRestTimer(30)',start)
        self.assertLess(start.index('workout-featured-rest-stop'),
                        start.index('workout-featured-rest-add'))
        self.assertNotIn('Пропустити',start)
        self.assertIn("saveWorkoutDraft(+track.sid,+track.pid,+track.set_number,'rest_seconds',seconds)",TIMER)
        self.assertIn("finalizeTrackedRest(track?.end_at&&Date.now()>=+track.end_at?'finish':'cancel')",TIMER)
        self.assertNotIn("featuredRestTimerHTML(",WORKOUT)

    def test_mobile_grid_and_countdown_direction(self):
        css=CSS.split("/* v255 — final iPhone rest card:",1)[1]
        self.assertIn('grid-template-columns:repeat(2,minmax(0,1fr))!important',css)
        self.assertIn('grid-column:1/-1!important',css)
        self.assertIn('grid-template-rows:65px 41px!important',css)
        self.assertIn('@media(max-width:420px)',css)
        self.assertIn('@media(max-width:350px)',css)
        self.assertIn("transform:rotate(-90deg)",CSS)
        self.assertIn("circle.style.strokeDashoffset='0'",TIMER)
        self.assertIn("circle.style.strokeDasharray=String(circumference*Math.min(1,exact/baseline))",TIMER)

    def test_current_cache_refs(self):
        for src in (INDEX,SW):
            self.assertIn("/static/js/timer.js?v=169",src)
            self.assertIn("/static/css/redesign.css?v=263",src)
        self.assertIn("const VERSION='eplan-v222'",SW)

    @unittest.skipUnless(shutil.which("node"),"Requires node")
    def test_stop_saves_elapsed_only_not_pause_and_keeps_same_finished_set(self):
        script=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let src=fs.readFileSync('backend/static/js/timer.js','utf8');
let now=1_000_000,store={},saved=[];
const ctx={
 Date:{now:()=>now},Math,console,
 REST_TIMER_KEY:'restTest',restTimerInterval:null,
 localStorage:{
   getItem(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null},
   setItem(k,v){store[k]=String(v)},removeItem(k){delete store[k]}
 },
 document:{
   querySelectorAll(){return []},querySelector(){return null},
 },
 window:{currentClientData:{workout_sessions:[{id:7,status:'training'}]}},
 $:()=>null,
 setTimeout:()=>0,setInterval:()=>1,clearInterval:()=>{},
 navigator:{serviceWorker:{controller:{postMessage(){}},ready:Promise.resolve({})}},
 saveWorkoutDraft:(...args)=>saved.push(args)
};
vm.createContext(ctx);vm.runInContext(src,ctx);
ctx.renderFloatingRestTimer=()=>{};
ctx.syncRestTimerWorker=()=>{};
// Start, run 45 seconds, pause for 70 seconds, add 30 while paused, stop.
ctx.startRestTimerCore(120,null,{sid:7,pid:25,set_number:2});
now+=45_000;
ctx.pauseRestTimer();
assert.equal(ctx.restTimerPausedSeconds(),75);
const p=ctx.readTrackedRest();
assert.equal(p.paused,true);
assert.equal(p.paused_at,now);
now+=70_000;
ctx.extendFeaturedRestTimer(30);
assert.equal(ctx.restTimerPausedSeconds(),105);
assert.equal(ctx.restTimerRemaining(),0);
ctx.cancelRestTimer();
assert.equal(saved.length,1);
assert.equal(saved[0][0],7);assert.equal(saved[0][1],25);
assert.equal(saved[0][2],2);
assert.equal(saved[0][3],'rest_seconds');
assert.equal(saved[0][4],45);
assert.equal(ctx.readTrackedRest(),null);
// Resume after pause; count only actual running 20 + 15 seconds.
now=2_000_000;
ctx.startRestTimerCore(100,null,{sid:7,pid:26,set_number:1});
now+=20_000;ctx.pauseRestTimer();
now+=40_000;
ctx.startRestTimerCore(ctx.restTimerPausedSeconds());
assert.equal(ctx.readTrackedRest().paused_total_ms,40_000);
now+=15_000;ctx.cancelRestTimer();
assert.equal(saved[1][4],35);
assert.equal(saved[1][2],1);
// Extending a running rest must keep the same tracking context.
now=3_000_000;
ctx.startRestTimerCore(90,null,{sid:7,pid:27,set_number:3});
now+=10_000;
ctx.extendFeaturedRestTimer(30);
assert.equal(ctx.readTrackedRest().pid,27);
assert.equal(ctx.restTimerRemaining(),110);
now+=5_000;ctx.cancelRestTimer();
assert.equal(saved[2][4],15);
assert.equal(saved.length,3);
// Normal end clamps recorded duration at deadline, not delayed UI tick.
now=4_000_000;
ctx.startRestTimerCore(60,null,{sid:7,pid:28,set_number:1});
now+=75_000;
ctx.cancelRestTimer();
assert.equal(saved[3][4],60);
console.log('Final rest Stop + pause exclusion, resume, +30, deadline clamp PASS');
"""
        p=subprocess.run(["node","-e",script],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
