// v274 mobile regression: real superset focus JS, native scroll, no border frame.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const staticDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const files=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css',
 'client-graphite-components-v253.css','client-unified-dark-v268.css',
 'client-training-v2.css','client-training-v2-parity-v272.css',
 'client-active-workout-graphite-v273.css','client-superset-scroll-v274.css'];
const row=n=>`<div class="lyfta-set-wrap"><div class="lyfta-set-swipe"><div class="lyfta-set-swipe-content">
 <div class="lyfta-prev-line"><span>Попередньо</span><strong>—</strong></div>
 <div class="lyfta-set-row no-rir"><span class="setnum">${n}</span><input placeholder="кг"><input placeholder="8-12">
 <button class="lyfta-set-done">✓</button></div></div></div></div>`;
const exercise=n=>`<div class="workout-live-exercise workout-live-exercise-inner">
 <div class="workout-live-toggle workout-live-grouped-exercise-head">
 <span class="eplan-v2-title-content"><span class="eplan-v2-exercise-index">A${n}</span>
 <span class="eplan-v2-exercise-icon">◼</span><span class="eplan-v2-exercise-text">
 <strong>${n===1?'Відведення рук з гантелями лежачи':'Тяга вертикального блока широкою рукояткою'}</strong></span></span></div>
 <div class="exercise-body workout-live-body workout-live-grouped-body">
 <div class="lyfta-workout-tools"><button>Історія та графік</button></div>
 <button class="lyfta-warmup-toggle">+ Додати розминочні підходи</button>
 <div class="lyfta-set-head no-rir"><span>Підхід</span><span>Вага</span><span>Повтори</span><span></span></div>
 ${[1,2,3,4].map(row).join('')}
 <div class="lyfta-extra-set-actions"><button class="lyfta-add-set">+ Додати підхід</button></div>
 <button class="workout-finish-exercise">Закінчити вправу</button>
 </div></div>`;
const html=`<div id="app"><div class="wrap client-shell"><main class="client-section-page redesign-training-page">
<h1>Тренування</h1><div class="redesign-active-workout eplan-training-v2-live">
<div class="redesign-active-workout-head"><span class="training-live">Тренування триває</span></div>
<div class="eplan-training-v2-live-summary"><h2>День 4</h2></div>
<div class="workout-live-superset eplan-training-v2-superset" data-superset-group="A">
<button type="button" class="workout-live-superset-head workout-live-superset-toggle">
<span class="workout-live-superset-copy"><strong>Суперсет</strong><span>Виконати по черзі</span></span></button>
<div class="eplan-v2-superset-focus-bar"><button type="button">‹ Назад</button><strong>Суперсет A</strong></div>
<button type="button" class="eplan-v2-superset-focus-open">↗ Відкрити суперсет</button>
<div id="supersetBodyTest" class="workout-live-superset-body hidden">${exercise(1)}
<div class="workout-live-superset-divider"></div>${exercise(2)}</div>
</div></div></main></div></div>`;
const browser=await chromium.launch({headless:true});
try{
 for(const theme of ['dark','light'])for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:700},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await page.setContent(`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
 <body class="eplan-redesign client-ui" data-eplan-theme="${theme}">${html}</body></html>`);
  for(const css of files)await page.addStyleTag({content:fs.readFileSync(path.join(staticDir,'css',css),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  await page.addScriptTag({path:path.join(staticDir,'js','workout.js')});
  await page.evaluate(()=>openEplanSupersetFocus('supersetBodyTest'));
  const get=()=>page.evaluate(()=>{
   const group=document.querySelector('.eplan-training-v2-superset'),
         body=document.querySelector('.workout-live-superset-body'),
         head=group.querySelector('.workout-live-superset-head'),
         page=document.querySelector('.redesign-training-page'),
         s=getComputedStyle(group), bs=getComputedStyle(body), rect=group.getBoundingClientRect();
   return {top:rect.top,width:rect.width,position:s.position,overflowY:s.overflowY,
     clientHeight:group.clientHeight,scrollHeight:group.scrollHeight,scrollTop:group.scrollTop,
     border:s.borderTopWidth,radius:s.borderTopLeftRadius,borderBody:bs.borderTopWidth,
     overflowBody:bs.overflowY,headerDisplay:getComputedStyle(head).display,
     pageBg:getComputedStyle(page).backgroundColor,
     open:group.classList.contains('eplan-superset-focus'),bodyHidden:body.classList.contains('hidden'),
     viewportOverflow:document.documentElement.scrollWidth>innerWidth+2};
  });
  const loc=theme+' @'+width+'px';
  let x=await get();
  assert.equal(x.open,true,loc+' focus class added by workout.js');
  assert.equal(x.bodyHidden,false,loc+' content opened');
  assert.equal(x.position,'fixed',loc+' overlay fixed');
  assert.equal(x.overflowY,'auto',loc+' scrollable viewport');
  assert.equal(x.border,'0px',loc+' no outer rectangle');
  assert.equal(x.radius,'0px',loc+' no rounded clipping frame');
  assert.equal(x.borderBody,'0px',loc+' no nested bordered frame');
  assert.equal(x.overflowBody,'visible',loc+' content feeds outer scroll');
  assert.equal(x.headerDisplay,'none',loc+' no duplicate accordion header in focus');
  assert.equal(x.top,0,loc+' aligned with viewport');
  assert.ok(x.scrollHeight>x.clientHeight+250,loc+' enough scrollable content');
  assert.equal(x.viewportOverflow,false,loc+' no horizontal page spill');
  if(theme==='dark')assert.equal(x.pageBg,'rgb(0, 0, 0)',loc+' continuous black, no rectangular page backdrop');
  await page.evaluate(()=>document.querySelector('.eplan-superset-focus').scrollTo(0,320));
  x=await get();assert.ok(x.scrollTop>=280,loc+' programmatic scroll works');
  await page.evaluate(()=>document.querySelector('.eplan-superset-focus').scrollTo(0,0));
  await page.mouse.move(width/2,470);
  await page.mouse.wheel(0,455);
  await page.waitForTimeout(150);
  x=await get();assert.ok(x.scrollTop>80,loc+' finger/wheel scroll reaches next exercise');
  await page.evaluate(()=>closeEplanSupersetFocus());
  x=await get();assert.equal(x.open,false,loc+' close restores normal group');
  assert.notEqual(x.overflowY,'auto',loc+' regular accordion remains clipped');
  await page.close();
 }
 console.log('PASS: v274 focused superset scrolls, borderless dark/light iPhone 320/375/390/430px, return to training');
}finally{await browser.close()}
