// The dark active workout must be GRAPHITE, not navy; light stays untouched.
// Smoke test against the actual stylesheet cascade used by index.html.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static/css');
const files=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css',
 'client-graphite-components-v253.css','client-unified-dark-v268.css','client-training-v2.css',
 'client-training-v2-parity-v272.css','client-active-workout-graphite-v273.css'];
const html=`<div id="app"><main class="client-section-page redesign-training-page">
<h1>Тренування</h1><div class="redesign-active-workout eplan-training-v2-live">
<div class="redesign-active-workout-head"><span class="training-live">Тренування триває</span></div>
<div class="eplan-training-v2-live-summary"><div><h2>День 4</h2></div></div>
<div class="workout-current-phase" data-phase="heavy"><span class="workout-phase-dot"></span><div><strong>Важкий тиждень</strong></div></div>
<div class="workout-duration-strip">Тривалість тренування</div>
<section class="exercise workout-live-exercise"><button class="workout-live-toggle">
 <span class="eplan-v2-title-content"><span class="eplan-v2-exercise-index">1</span><span class="eplan-v2-exercise-icon">◼</span>
 <span class="eplan-v2-exercise-text"><strong>Жим гантелей лежачи</strong></span></span></button>
 <div class="exercise-body workout-live-body">
 <button class="swap-exercise-btn">Замінити вправу</button>
 <div class="lyfta-set-head no-rir"><span>Підхід</span><span>Вага</span><span>Повтори</span><span></span></div>
 <div class="lyfta-set-wrap"><div class="lyfta-set-swipe">
 <div class="lyfta-set-action-tray skip"><button>Пропустити</button></div>
 <div class="lyfta-set-swipe-content"><div class="lyfta-set-row no-rir"><span class="setnum">1</span>
 <input type="number" value="40"><input type="number" value="10"><button class="lyfta-set-done">✓</button></div></div></div></div>
 </div></section>
<div class="workout-live-superset eplan-training-v2-superset">
 <button class="workout-live-superset-head workout-live-superset-toggle"><span class="workout-live-superset-copy">
 <strong>Суперсет</strong><span>Виконати вправи по черзі</span></span></button>
 <button class="eplan-v2-superset-focus-open">↗ Відкрити суперсет</button>
 <div class="workout-live-superset-body">
 <div class="workout-live-exercise workout-live-exercise-inner"><div class="workout-live-toggle workout-live-grouped-exercise-head">
 <span class="eplan-v2-title-content"><span class="eplan-v2-exercise-index">A1</span>Відведення рук з гантелями</span></div>
 <div class="workout-live-grouped-body">3 x 8-12</div></div></div></div>
</div></main></div><nav class="client-bottom-nav"><button class="active"><span>Тренування</span></button></nav>`;
const browser=await chromium.launch({headless:true});
try{
 for(const theme of ['dark','light'])for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="'+theme+'">'+html+'</body></html>');
  for(const css of files)await page.addStyleTag({content:fs.readFileSync(path.join(base,css),'utf8')});
  const x=await page.evaluate(()=>{
   const color=s=>getComputedStyle(document.querySelector(s)).backgroundColor;
   const border=s=>getComputedStyle(document.querySelector(s)).borderTopColor;
   const text=s=>getComputedStyle(document.querySelector(s)).color;
   return {
    page:color('.redesign-training-page'),
    card:color('.workout-live-exercise:not(.workout-live-exercise-inner)'),
    button:color('.eplan-v2-superset-focus-open'),
    group:color('.eplan-training-v2-superset'),
    groupBorder:border('.eplan-training-v2-superset'),
    groupHead:color('.eplan-training-v2-superset .workout-live-superset-head'),
    index:color('.eplan-v2-exercise-index'),
    nav:color('.client-bottom-nav button.active'),
    green:text('.training-live'),
    title:text('.workout-live-superset-copy strong'),
    overflow:document.documentElement.scrollWidth>window.innerWidth+2
   };
  });
  const where=theme+' @'+width;
  if(theme==='dark'){
   assert.equal(x.page,'rgb(14, 16, 19)',where+' page should not be navy');
   assert.equal(x.card,'rgb(30, 33, 38)',where+' card');
   assert.equal(x.group,'rgb(30, 33, 38)',where+' superset');
   assert.equal(x.groupBorder,'rgb(81, 88, 98)',where+' border');
   assert.equal(x.groupHead,'rgb(41, 45, 52)',where+' superset header');
   assert.equal(x.index,'rgb(54, 60, 69)',where+' number');
   assert.equal(x.button,'rgb(48, 54, 62)',where+' focus button');
   assert.equal(x.nav,'rgb(53, 58, 66)',where+' active nav');
   assert.equal(x.title,'rgb(225, 231, 239)',where+' title');
   assert.match(x.green,/rgb\(/,where+' training live state');
  }else{
   assert.equal(x.card,'rgb(255, 255, 255)',where+' light card');
   assert.notEqual(x.nav,'rgb(53, 58, 66)',where+' light nav left unchanged');
  }
  assert.equal(x.overflow,false,where+' viewport overflow');
  await page.close();
 }
 console.log('PASS: client v273 graphite active workout, neutral superset and nav, preserved light, 320-430px');
}finally{await browser.close()}
