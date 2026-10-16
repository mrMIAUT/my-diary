// Client graphite v251 regression: live workout, emphasized supersets, seamless diary.
// DOM fixtures mirror the client markup; do not open real user workouts or modify data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const sheets=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css'].map(x=>'css/'+x);
const html=`<div id="app"><section class="redesign-active-workout card">
 <div class="workout-live-exercise"><button class="workout-live-toggle open"><strong>Згинання гантелей</strong></button>
 <div class="workout-live-body">
 <div class="lyfta-set-wrap"><div class="lyfta-set-swipe-content"><div class="lyfta-set-row"><input value="12"></div></div></div>
 <div class="lyfta-set-wrap is-complete"><div class="lyfta-set-swipe-content"><div class="lyfta-set-row"><input value="12"></div></div></div>
 <button class="lyfta-add-set">+ Додати підхід</button>
 </div></div>
 <div class="workout-live-superset">
 <div class="workout-live-superset-head"><button class="workout-live-superset-toggle">
 <span class="workout-live-superset-copy"><strong>Суперсет</strong><span>Відпочинок 60 сек</span></span></button></div>
 <div class="workout-live-superset-body">
 <div class="workout-live-exercise-inner"><button class="workout-live-grouped-exercise-head"><strong>Жим</strong></button></div>
 <div class="workout-live-superset-divider"></div>
 <div class="workout-live-exercise-inner"><strong>Махи</strong></div>
 </div></div>
 <div class="workout-duration-strip"><strong>Тривалість тренування</strong></div>
 </section>
 <div class="client-home-today-grid"><button class="client-home-today-card"><span class="client-home-today-icon"><svg><path d="M0 0L10 10"/></svg></span>Тренування</button>
 <button class="client-home-today-card"><span class="client-home-today-icon"><svg><path d="M0 0L10 10"/></svg></span>Харчування</button></div>
 <div class="client-home-metrics"><button class="client-home-metric"><span class="client-home-metric-icon"><svg><path d="M0 0L10 10"/></svg></span>Вага</button>
 <button class="client-home-metric"><span class="client-home-metric-icon"><svg><path d="M0 0L10 10"/></svg></span>Талія</button>
 <button class="client-home-metric"><span class="client-home-metric-icon"><svg><path d="M0 0L10 10"/></svg></span>Тренування</button></div>
 <div class="nutrition-diary-card">
 <section class="nutrition-diary-meal"><div class="nutrition-diary-meal-head">Сніданок</div>
 <div class="nutrition-diary-meal-body">
 <div class="nutrition-diary-item"><div><strong>Гречка</strong></div><div class="nutrition-diary-item-actions"><button>×</button></div></div>
 <button class="nutrition-diary-save-recipe">Зберегти як мій рецепт</button>
 <button class="nutrition-diary-add">+ Додати продукт</button>
 </div></section>
 <section class="nutrition-diary-meal"><div class="nutrition-diary-meal-head">Обід</div>
 <div class="nutrition-diary-meal-body"><button class="nutrition-diary-add">+ Додати продукт</button></div></section>
 </div></div>
 <div id="workoutStartConfirmModal" class="modal"><div class="workout-start-confirm"><label class="workout-phase-option">
 <input type="radio" name="phase" checked><span class="workout-phase-check"></span><strong>Важкий тиждень</strong>
 </label></div></div>`;
const selectors={
 card:'.redesign-active-workout .workout-live-exercise:not(.is-exercise-complete)',
 toggle:'.redesign-active-workout .workout-live-exercise>.workout-live-toggle.open',
 set:'.redesign-active-workout .lyfta-set-wrap:not(.is-complete) .lyfta-set-swipe-content',
 done:'.redesign-active-workout .lyfta-set-wrap.is-complete .lyfta-set-swipe-content',
 input:'.redesign-active-workout .lyfta-set-row input',
 superset:'.redesign-active-workout .workout-live-superset',
 supersetHead:'.redesign-active-workout .workout-live-superset-head',
 supersetButton:'.redesign-active-workout .workout-live-superset-toggle',
 supersetName:'.redesign-active-workout .workout-live-superset-copy strong',
 supersetBody:'.redesign-active-workout .workout-live-superset-body',
 duration:'.redesign-active-workout .workout-duration-strip',
 meal:'.nutrition-diary-meal',
 mealHead:'.nutrition-diary-meal-head',
 mealBody:'.nutrition-diary-meal-body',
 mealItem:'.nutrition-diary-item',
 mealAdd:'.nutrition-diary-meal .nutrition-diary-add',
 mealRecipe:'.nutrition-diary-save-recipe',
 homeBlue:'.client-home-today-card:first-child .client-home-today-icon',
 homeBlueSVG:'.client-home-today-card:first-child .client-home-today-icon svg',
 weightBlue:'.client-home-metric:first-child .client-home-metric-icon',
 weightBlueSVG:'.client-home-metric:first-child .client-home-metric-icon svg',
 waistGreen:'.client-home-metric:nth-child(2) .client-home-metric-icon',
 sessionsOrange:'.client-home-metric:nth-child(3) .client-home-metric-icon',
 phase:'.workout-phase-option'
};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+html+'</body></html>');
  for(const p of sheets)await page.addStyleTag({content:fs.readFileSync(path.join(root,p),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'}); 
  const measure=()=>page.evaluate(sels=>Object.fromEntries(Object.entries(sels).map(([k,q])=>{
   const el=document.querySelector(q);if(!el)throw Error('selector absent: '+q);
   const s=getComputedStyle(el);
   return [k,{bg:s.backgroundColor,border:s.borderTopColor,left:s.borderLeftColor,
     leftWidth:s.borderLeftWidth,stroke:s.stroke,color:s.color,
     shadow:s.boxShadow}];
  })),selectors);
  const priorLight=await measure();
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-active-diary.css'),'utf8')});
  assert.deepEqual(await measure(),priorLight,'light mode untouched at '+width);
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='dark');
  const dark=await measure();
  const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
  const eq=(key,field,value)=>assert.equal(dark[key][field],value,`${width}px ${key} ${field}`);
  eq('card','bg',rgb(34,37,43));
  eq('toggle','bg',rgb(34,37,43));
  eq('set','bg',rgb(45,49,56));
  eq('done','bg',rgb(36,60,49));
  eq('duration','bg',rgb(34,37,43));
  eq('superset','bg',rgb(37,42,48));
  eq('superset','leftWidth','3px');
  eq('superset','left',rgb(117,174,233));
  eq('supersetHead','bg',rgb(48,54,62));
  eq('supersetBody','bg',rgb(37,42,48));
  eq('supersetName','color',rgb(172,212,255));
  eq('meal','bg',rgb(34,37,43));
  eq('mealHead','bg',rgb(34,37,43));
  eq('mealBody','bg',rgb(34,37,43));
  eq('mealItem','bg','rgba(0, 0, 0, 0)');
  eq('mealAdd','bg',rgb(48,53,60));
  eq('mealRecipe','bg',rgb(41,47,54));
  eq('homeBlue','bg',rgb(40,61,89));
  eq('homeBlueSVG','stroke',rgb(148,190,255));
  eq('weightBlue','bg',rgb(40,61,89));
  eq('weightBlueSVG','stroke',rgb(148,190,255));
  eq('waistGreen','bg',rgb(37,64,57));
  eq('sessionsOrange','bg',rgb(69,56,41));
  eq('phase','bg',rgb(48,53,62));
  await page.close();
 }
 console.log('PASS: client active workout graphite, blue-accent supersets, seamless diary, home 3-color palette; light untouched, 320/375/390/430px');
}finally{await browser.close()}
