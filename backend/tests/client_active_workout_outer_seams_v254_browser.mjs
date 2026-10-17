// Active-workout outer seam screenshot regression, dark-only v254.
// Mirrors the actual client Training active-session markup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const sheets=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css'].map(f=>'css/'+f);
const html=`<div id="app"><div class="client-section-page redesign-training-page">
 <h1>Тренування</h1><div class="redesign-active-workout">
  <div class="redesign-active-workout-head"><div class="training-live">Тренування триває</div>
   <button class="redesign-rest-timer-icon running">01:41</button></div>
  <h2>День 2</h2>
  <div class="workout-featured-rest"><div class="workout-featured-rest-heading">Таймер відпочинку</div></div>
  <div class="workout-current-phase"><strong>Важкий тиждень</strong></div>
  <section class="exercise workout-live-exercise">
   <button class="exercise-toggle workout-live-toggle open"><strong>Згинання гантелей сидячи</strong></button>
   <div class="exercise-body workout-live-body"><div class="lyfta-set-wrap">
    <div class="lyfta-set-swipe-content"><strong>1</strong></div>
   </div></div>
  </section>
  <section class="exercise workout-live-exercise">
   <button class="exercise-toggle workout-live-toggle">Розгинання рук</button></section>
  <div class="finish-workout-wrap"><button class="finish-workout-btn">Завершити тренування</button></div>
 </div></div></div>`;
const selectors={
 page:'.redesign-training-page',
 panel:'.redesign-training-page>.redesign-active-workout',
 head:'.redesign-active-workout>.redesign-active-workout-head',
 title:'.redesign-active-workout>h2',
 live:'.redesign-active-workout .training-live',
 rest:'.redesign-active-workout>.workout-featured-rest',
 exercise:'.redesign-active-workout>.workout-live-exercise',
 exerciseBody:'.redesign-active-workout .workout-live-body',
 finish:'.redesign-active-workout>.finish-workout-wrap'
};
const actualMarkup=fs.readFileSync(path.join(root,'js/training-redesign.js'),'utf8');
assert.ok(actualMarkup.includes('<div class="redesign-active-workout"><div class="redesign-active-workout-head">'),
 'live workout must NOT be emitted as a generic .card — the nested card caused the seam');
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+html+'</body></html>');
  for(const sheet of sheets)await page.addStyleTag({content:fs.readFileSync(path.join(root,sheet),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const read=()=>page.evaluate(selectors=>Object.fromEntries(Object.entries(selectors).map(([key,query])=>{
   const element=document.querySelector(query);if(!element)throw Error('missing '+query);
   const s=getComputedStyle(element);
   return [key,{background:s.backgroundColor,backgroundImage:s.backgroundImage,border:s.borderTopWidth,
    borderColor:s.borderTopColor,outline:s.outlineStyle,shadow:s.boxShadow,
    radius:s.borderTopLeftRadius,padding:s.padding,overflow:s.overflow,color:s.color}];
  })),selectors);
  const oldLight=await read();
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-components-v253.css'),'utf8')});
  // The existing v253 rules remain active in light theme but the v254
  // additions must not affect it.
  const actualLight=await read();
  assert.deepEqual(actualLight,oldLight,'light-mode untouched at '+width);
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='dark');
  const dark=await read();
  const eq=(key,prop,value)=>assert.equal(dark[key][prop],value,`${width}px ${key}.${prop}`);
  for(const key of ['panel','head','title']){
    eq(key,'background','rgba(0, 0, 0, 0)');
    eq(key,'border','0px');
    eq(key,'shadow','none');
  }
  eq('panel','outline','none');
  eq('panel','padding','0px');
  eq('panel','overflow','visible');
  eq('finish','border','0px');
  eq('rest','background','rgb(37, 41, 48)');
  eq('exercise','background','rgb(34, 37, 43)');
  eq('exerciseBody','background','rgb(34, 37, 43)');
  assert.notEqual(dark.live.color,'rgb(241, 245, 250)','live green status must stay distinct');
  await page.close();
 }
 console.log('PASS: active day header and session panel transparent with zero borders; timer and exercise cards intact; light unchanged at 320/375/390/430px');
}finally{await browser.close()}
