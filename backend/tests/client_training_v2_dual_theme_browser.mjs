// Real render-function smoke + mobile CSS parity for client training v2.
// Assertions target existing, data-backed HTML rather than a mockup only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const trainingSource=fs.readFileSync(path.join(root,'js/training-redesign.js'),'utf8');
const workoutSource=fs.readFileSync(path.join(root,'js/workout.js'),'utf8');
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const context={
 window:{addEventListener(){},clientTrainingTab:'program',workoutExerciseChoices:{},exerciseLibrary:{exercises:[],muscles:[]}},
 esc,uiIcon:()=>'<svg class="ui-icon" viewBox="0 0 24 24"><path d="M3 3L20 20"></path></svg>',
 programRirEnabled:()=>false,isTimedWorkoutExercise:()=>false,uniqueResultSets:xs=>xs,
 timedRestLabel:()=>'',restLabel:()=> '2 хв',rirPlan:()=>[2],exerciseAlternativeConfigs:()=>[],
 exerciseTechniqueUrl:()=>'',techniqueLinkHTML:()=>'',repeatPlanText:x=>x.reps,
 exerciseAlternatives:()=>[],workoutEffectiveExercise:x=>x,
 lyftaRestSeconds:()=>60,orderedSupersetItems:xs=>xs.sort((a,b)=>(a.superset_order||0)-(b.superset_order||0)),
 supersetRestLabel:()=> '60 сек',setRows:()=>'<div class="lyfta-set-head"><span>Вага</span></div><div class="lyfta-set-wrap"><div class="lyfta-set-swipe-content"><div class="lyfta-set-row"><input type="number"><button class="lyfta-set-done">✓</button></div></div></div>',
 formatSetRest:()=> '60 сек',formatWorkoutDuration:()=> '01:00',
 programDayTitle:()=> 'Руки + Плечі',workoutCycleState:()=>({done:[],next:'День 2'}),
 isoToday:()=> '2026-10-18',programDayIsExtra:()=>false,programDayIsAvailable:()=>true,
 sessionDay:x=>x.workout_day||'',formatProgressDate:()=> '18 жовт.',uniqueResultSets:xs=>xs,
 loadExerciseLibrary:async()=>{},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,requestAnimationFrame:()=>0,
 document:{addEventListener:()=>{},removeEventListener:()=>{},querySelector:()=>null,getElementById:()=>null,body:{classList:{add(){},remove(){}}}},
};
vm.createContext(context);
vm.runInContext(workoutSource,context,{filename:'workout.js'});
vm.runInContext(trainingSource,context,{filename:'training-redesign.js'});
// The active-card layout is under test here; legacy set persistence has dedicated tests.
context.completedExerciseHTML=()=>context.setRows();
context.timedExerciseHTML=()=>context.setRows();
const xs=[
 {id:1,exercise:'Згинання гантелей сидячи на лаві',sets:3,reps:'8-12',day_name:'День 2'},
 {id:2,exercise:'Підйом гантелей в сторони',sets:3,reps:'12-15',superset_group:'A',superset_order:1,day_name:'День 2'},
 {id:3,exercise:'Підйом гантелей перед собою',sets:3,reps:'12-15',superset_group:'A',superset_order:2,day_name:'День 2'}
];
const data={program:xs,workout_sessions:[{id:5,status:'training',workout_day:'2026-10-18',load_phase:'heavy',duration_seconds:60}],result_sets:[]};
const plan=context.redesignTrainingDayCard(data,1,{ 'День 2':xs},'День 2',1,{done:[],next:'День 2'});
const overview=context.redesignTrainingProgramHTML({...data,workout_sessions:[]},1,{'День 2':xs});
const active=context.activeExercisesHTML(xs,data,1);
assert.match(plan,/eplan-training-v2-day/);
assert.match(plan,/eplan-training-v2-thumb/);
assert.match(plan,/toggleRedesignTrainingDay/);
assert.match(plan,/startWorkout/);
assert.match(overview,/eplan-training-v2-hero/);
assert.match(active,/eplan-v2-exercise-index/);
assert.match(active,/eplan-training-v2-superset/);
assert.match(active,/eplan-v2-superset-focus-open/);
assert.match(active,/openEplanSupersetFocus/);
assert.match(active,/eplan-v2-exercise-index">A1</);
assert.match(active,/eplan-v2-exercise-index">A2</);
assert.match(active,/lyfta-set-wrap/);
assert.match(active,/workout-live-body hidden/);
assert.match(workoutSource,/eplanWorkoutFinishMuscleRows/);
assert.match(workoutSource,/eplan-v2-finish-metrics/);
assert.match(workoutSource,/saveFinishWorkoutComment/);
assert.match(workoutSource,/reopenCompletedWorkout/);
assert.match(workoutSource,/editCompletedExercise/);
assert.match(trainingSource,/if\(window.eplanV2SupersetFocusId\)requestAnimationFrame/);
// Do not create false muscle stats when the library is absent.
assert.equal(context.eplanWorkoutFinishMuscleRows([],{program:[]}),'');

const cssFiles=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css',
 'client-graphite-components-v253.css','client-unified-dark-v268.css','client-training-v2.css','client-training-v2-parity-v272.css'];
const browser=await chromium.launch({headless:true});
try{
 for(const theme of ['light','dark']){
  for(const width of [320,375,390,430]){
   const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
   const markup='<div id="app"><div class="redesign-training-page"><div class="eplan-training-v2-overview">'+overview+'</div><div class="redesign-active-workout eplan-training-v2-live"><div class="eplan-training-v2-live-summary"><div><h2>День 2</h2><small>Руки + Плечі</small></div><span>3 вправи</span></div>'+active+'</div></div></div>'
    +'<div class="modal" id="finishSummaryModal"><div class="card finish-summary eplan-training-v2-finish"><div class="eplan-v2-finish-title"><h2>Тренування завершено!</h2></div><div class="eplan-v2-finish-metrics"><div class="eplan-v2-finish-metric"><span>Тривалість</span><strong>42:18</strong></div></div></div></div>';
   await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="'+theme+'">'+markup+'</body></html>');
   for(const name of cssFiles)await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/'+name),'utf8')});
   const result=await page.evaluate(()=>{
    const s=q=>getComputedStyle(document.querySelector(q));
    const bg=s('.eplan-training-v2-hero').backgroundColor;
    const day=s('.eplan-training-v2-day').backgroundColor;
    const card=s('.eplan-training-v2-live .workout-live-exercise:not(.workout-live-exercise-inner)').backgroundColor;
    const superset=s('.eplan-training-v2-superset').borderLeftWidth;
    const grid=s('.eplan-v2-title-content').gridTemplateColumns;
    const summaryCols=s('.eplan-v2-finish-metrics').gridTemplateColumns;
    return {bg,day,card,superset,grid,summaryCols,
      overflow:document.documentElement.scrollWidth>window.innerWidth+2};
   });
   const bg=theme==='dark'?'rgb(13, 32, 45)':'rgb(255, 255, 255)';
   assert.equal(result.bg,bg,width+'px '+theme+' hero');
   const rgb=result.card.match(/\d+/g)?.map(Number)||[];
   assert.ok(rgb.length===3&&(theme==='dark'?rgb.every(v=>v<85):rgb.every(v=>v>228)),width+'px '+theme+' exercise');
   assert.ok(['1px','3px'].includes(result.superset),width+'px superset outlined accent');
   assert.equal(result.summaryCols.split(' ').length,2,width+'px finish metrics two-column');
   assert.equal(result.overflow,false,width+'px '+theme+' must not overflow viewport');
   // Dedicated superset state is reversible with existing inputs intact.
   await page.addScriptTag({content:workoutSource});
   const groupId=await page.locator('.eplan-training-v2-superset>.workout-live-superset-body').getAttribute('id');
   await page.evaluate(id=>openEplanSupersetFocus(id),groupId);
   assert.equal(await page.locator('.eplan-training-v2-superset').evaluate(e=>e.classList.contains('eplan-superset-focus')),true);
   assert.equal(await page.locator('.eplan-training-v2-superset .lyfta-set-wrap').count(),2);
   await page.evaluate(()=>closeEplanSupersetFocus());
   assert.equal(await page.locator('.eplan-training-v2-superset').evaluate(e=>e.classList.contains('eplan-superset-focus')),false);
   await page.close();
  }
 }
 console.log('PASS: v2 real HTML, linked superset focus, light/dark cards and finish metrics; 320/375/390/430px');
}finally{await browser.close()}
