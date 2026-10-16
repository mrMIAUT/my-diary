// Client deep graphite QA based on actual iPhone screenshots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const files=['css/base.css','css/components.css','css/refinements.css','css/redesign.css',
 'css/theme.css','css/trainer-avatars.css','css/trainer-dark.css','css/trainer-program-overview.css',
 'css/trainer-nav-parity.css','css/client-graphite.css','css/client-graphite-polish.css'];
const sample=`<div id="app" class="wrap client-shell">
<div class="redesign-training-day is-next"><div class="redesign-training-day-body">
<div class="redesign-training-exercises"><div class="redesign-training-exercise">
<span>1</span><div class="redesign-training-main-title-row"><strong>Жим гантелей</strong>
<div class="redesign-training-technique"><a class="redesign-training-tech-link">Техніка</a></div></div></div>
<div class="redesign-training-superset"><div class="redesign-training-superset-label"><span>СУПЕРСЕТ</span><small>Відпочинок 2 хв</small></div>
<div class="redesign-training-exercise"><span>2</span><div><strong>Тяга</strong><div class="redesign-training-alt-chip"><i>Заміна</i><a class="redesign-training-alt-tech">Техніка</a></div></div></div></div></div></div></div>
<div class="redesign-progress-workout-detail"><div class="progress-workout-sets"><div class="progress-workout-set-group">
<div class="calendar-workout-set progress-workout-timed-set"><span>Підхід 1</span><strong>30 сек</strong><div class="progress-workout-timed-meta">План: 30 сек</div></div></div></div></div>
<div class="redesign-nutrition-page"><div class="meal-plan-card"><button class="meal-plan-head"><strong>Мій план харчування</strong></button>
<div class="meal-plan-body"><div class="client-ration-tabs"><button class="active">Раціон 1</button></div>
<div class="client-ration-page"><div class="nutrition-menu-total-v6"><div class="nutrition-menu-total-heading"><span>Разом</span><strong>2492</strong></div>
<div class="nutrition-total-chip protein">Білки</div><div class="nutrition-total-chip fat">Жири</div><div class="nutrition-total-chip carbs">Вуглеводи</div></div>
<div class="nutrition-menu-meal-v2"><div class="nutrition-menu-v2-layout"><div class="nutrition-menu-number">01</div><div class="nutrition-menu-ingredient">Вівсянка</div></div></div>
</div></div></div></div></div>
<div id="completedWorkoutEditModal" class="modal completed-workout-edit-modal"><div class="completed-workout-edit-card">
<div class="completed-workout-edit-head"><div><small>14 жовт.</small><h2>Редагувати тренування</h2><p>Історія тренувань</p></div><button>×</button></div>
<div class="completed-workout-edit-list"><div class="completed-workout-edit-exercise timed-readonly">
<div class="completed-workout-edit-exercise-head"><div><strong>Присідання з резинкою</strong><small>Вправа за часом</small></div><span>2 підх.</span></div>
<div class="completed-workout-timed-readonly"><div><span>Підхід 1</span><strong>30 сек</strong><small>план 30 сек</small></div></div></div>
<div class="completed-workout-edit-exercise"><div class="completed-workout-edit-aux-section">
<div class="completed-workout-edit-aux-title"><span>Розминка</span><small>необов'язково</small></div>
<div class="completed-workout-edit-aux-row"><span>1</span><input value="10"><input value="12"><button>×</button></div></div>
<div class="completed-workout-edit-set"><span class="completed-workout-edit-set-number">1</span><input value="10"><input value="12"><input value="2"></div></div></div></div></div>
<div class="modal" id="weeklyCheckinModal"><div class="card weekly-checkin-modal">
<div class="weekly-checkin-scale"><label><input type="radio" checked name="feel"><span>3</span></label></div>
<textarea class="weekly-checkin-comment">Все добре</textarea></div></div>`;
const sel={
 superset:'.redesign-training-superset',
 supersetHead:'.redesign-training-superset-label',
 exercise:'.redesign-training-superset .redesign-training-exercise',
 technique:'.redesign-training-tech-link',
 alternative:'.redesign-training-alt-chip',
 alternativeTech:'.redesign-training-alt-tech',
 history:'.progress-workout-set-group',
 timedHistory:'.progress-workout-timed-set',
 editor:'.completed-workout-edit-card',
 editExercise:'.completed-workout-edit-exercise.timed-readonly',
 editSet:'.completed-workout-timed-readonly>div',
 editInput:'.completed-workout-edit-set input',
 editAuxInput:'.completed-workout-edit-aux-row input',
 meal:'.meal-plan-card',
 mealBody:'.meal-plan-body',
 ration:'.client-ration-tabs',
 rationTotal:'.nutrition-menu-total-v6',
 rationMeal:'.nutrition-menu-meal-v2',
 protein:'.nutrition-total-chip.protein',
 fat:'.nutrition-total-chip.fat',
 carbs:'.nutrition-total-chip.carbs',
 weekly:'.weekly-checkin-modal'
};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [375,430]){
 const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
 await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+sample+'</body></html>');
 for(const f of files)await page.addStyleTag({content:fs.readFileSync(path.join(root,f),'utf8')});
 await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
 const measure=()=>page.evaluate(map=>Object.fromEntries(Object.entries(map).map(([k,s])=>{
  const e=document.querySelector(s),c=getComputedStyle(e);return [k,{bg:c.backgroundColor,color:c.color,border:c.borderTopColor}];
 })),sel);
 const light=await measure();
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-deep-qa.css'),'utf8')});
 assert.deepEqual(await measure(),light,'light-mode must remain untouched');
 await page.locator('body').evaluate(e=>e.dataset.eplanTheme='dark');
 const dark=await measure();
 const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
 const checks={
  superset:rgb(41,44,50),supersetHead:rgb(49,57,67),
  exercise:rgb(32,34,39),alternative:rgb(48,57,66),
  history:'rgba(0, 0, 0, 0)',timedHistory:rgb(41,50,61),
  editor:rgb(29,31,36),editExercise:rgb(36,39,45),
  editSet:rgb(43,47,55),editInput:rgb(52,57,65),
  editAuxInput:rgb(52,57,65),meal:rgb(34,37,43),mealBody:rgb(34,37,43),
  ration:rgb(43,48,56),rationTotal:rgb(40,44,51),rationMeal:rgb(32,35,41),
  weekly:rgb(34,37,43)
 };
 for(const [key,expected] of Object.entries(checks))assert.equal(dark[key].bg,expected,`${key} background at ${width}px`);
 assert.equal(dark.technique.color,rgb(166,201,255),'technique blue not orange');
 assert.equal(dark.alternativeTech.color,rgb(166,201,255),'alternative technique blue');
 assert.notEqual(dark.protein.bg,dark.fat.bg,'BJU colors remain distinct');
 assert.notEqual(dark.fat.bg,dark.carbs.bg,'BJU colors remain distinct');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
 assert.equal(overflow,false,'no horizontal overflow');
 await page.close();
 }
 console.log('PASS: deep client graphite detail, modal, meal plan and weekly card; light unchanged');
} finally{await browser.close()}
