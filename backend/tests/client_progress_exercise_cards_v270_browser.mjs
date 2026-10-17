// Regression for dark client Progress > finished workout exercise frames.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const old=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css',
 'client-graphite-components-v253.css'];
const html='<div id="app"><div class="redesign-progress-workout-detail">'
 +'<div class="progress-workout-detail-section">'
 +'<div class="progress-workout-detail-section-head"><span>Вправи</span><strong>2</strong></div>'
 +'<div class="progress-workout-exercise timed">'
 +'<div class="progress-workout-exercise-head"><div><strong>Присідання з резинкою</strong><small>За часом</small></div><span>2 підходи</span></div>'
 +'<div class="progress-workout-sets">'
 +'<div class="progress-workout-set-group"><div class="calendar-workout-set timed progress-workout-timed-set"><span>Підхід 1</span><strong>30 сек</strong><div class="progress-workout-timed-meta"><span>План: 30 сек</span></div></div></div>'
 +'<div class="progress-workout-set-group"><div class="calendar-workout-set timed progress-workout-timed-set"><span>Підхід 2</span><strong>30 сек</strong><div class="progress-workout-timed-meta"><span>План: 30 сек</span></div></div></div>'
 +'</div></div>'
 +'<div class="progress-workout-exercise timed">'
 +'<div class="progress-workout-exercise-head"><div><strong>Жим арнольда стоячи</strong><small>За часом</small></div><span>2 підходи</span></div>'
 +'<div class="progress-workout-sets"><div class="progress-workout-set-group"><div class="calendar-workout-set timed progress-workout-timed-set"><span>Підхід 1</span><strong>30 сек</strong><div class="progress-workout-timed-meta"><span>План: 30 сек</span><span>Відпочинок: 30 сек</span></div></div></div></div>'
 +'</div></div></div></div>';
const bundle=old.map(n=>fs.readFileSync(path.join(root,'css',n),'utf8'));
const unified=fs.readFileSync(path.join(root,'css/client-unified-dark-v268.css'),'utf8');
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+html+'</body></html>');
  for(const sheet of bundle)await page.addStyleTag({content:sheet});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const read=()=>page.evaluate(()=>{
   const els=[...document.querySelectorAll('.progress-workout-exercise')];
   const [a,b]=els;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
   const head=a.querySelector('.progress-workout-exercise-head').getBoundingClientRect();
   const set=a.querySelector('.calendar-workout-set').getBoundingClientRect();
   const cs=getComputedStyle(a);const setStyle=getComputedStyle(a.querySelector('.calendar-workout-set'));
   const anyOverflow=document.documentElement.scrollWidth>innerWidth+2;
   return {background:cs.backgroundColor,border:cs.borderTopColor,radius:parseFloat(cs.borderTopLeftRadius),
    leftPad:parseFloat(cs.paddingLeft), gap:br.top-ar.bottom,
    headerInset:head.left-ar.left,setInset:set.left-ar.left,
    setBg:setStyle.backgroundColor,setRadius:parseFloat(setStyle.borderTopLeftRadius),
    overflow:anyOverflow};
  });
  const light=await read();
  await page.addStyleTag({content:unified});
  assert.deepEqual(await read(),light,'light untouched '+width);
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='dark');
  const dark=await read();
  assert.equal(dark.background,'rgb(37, 42, 49)','dark graphite exercise surface');
  assert.ok(dark.radius>=12,'rounded exercises '+width);
  assert.ok(dark.leftPad>=10,'content inset '+width);
  assert.ok(dark.gap>=11,'separate exercise cards '+width);
  assert.ok(dark.headerInset>=10,'head text not touching edge '+width);
  assert.ok(dark.setInset>=10,'set inset '+width);
  assert.ok(dark.setRadius>=10,'rounded sets '+width);
  assert.equal(dark.overflow,false,'no horizontal overflow '+width);
  await page.locator('body').evaluate(el=>el.classList.replace('client-ui','trainer-ui'));
  const trainer=await read();
  await page.addStyleTag({content:unified});
  assert.deepEqual(await read(),trainer,'trainer unchanged '+width);
  await page.close();
 }
 console.log('PASS: dark client progress exercise cards separated and readable on 320–430px; light/trainer unchanged');
}finally{await browser.close()}
