// Client graphite regression: shared trainer palette and light-theme isolation.
// Static CSS browser smoke, no accounts, API calls, or production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const oldSheets=['css/base.css','css/components.css','css/refinements.css',
  'css/redesign.css','css/theme.css','css/trainer-avatars.css',
  'css/trainer-dark.css','css/trainer-program-overview.css','css/trainer-nav-parity.css'];
const fixtures=[
 'client-home-today-card','redesign-training-day','redesign-progress-kpi',
 'redesign-nutrition-day-row','nutrition-diary-meal','measurement-place-card',
 'activity-field-card','workout-timed-modal-card','redesign-more-item'
];
const cssBlock='<div class="wrap client-shell"><div class="client-top"><button class="notify-btn">!</button></div>'+
 fixtures.map(cls=>'<div class="'+cls+'"><h2>Тест графітної теми</h2><small>Другорядний підпис</small></div>').join('')+
 '<div class="workout-live-body"><div class="lyfta-set-wrap is-complete"><div class="lyfta-set-swipe-content">Виконано</div><div class="lyfta-set-row">3×10</div></div></div>'+
 '<div class="redesign-nutrition-page"><input value="123" placeholder="Додати продукт"></div>'+
 '<nav class="client-bottom-nav"><button class="active">Головна</button><button>Тренування</button></nav></div>';
const browser=await chromium.launch({headless:true});
const rgb=(a,b,c)=>`rgb(${a}, ${b}, ${c})`;
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
    '<body class="eplan-redesign client-ui" data-eplan-theme="light"><div id="app">'+cssBlock+'</div></body></html>');
  for(const p of oldSheets)await page.addStyleTag({content:fs.readFileSync(path.join(root,p),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const getStyles=()=>page.evaluate(()=>{
   let pick=(selector)=>{const e=document.querySelector(selector),s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundColor,border:s.borderTopColor,color:s.color,rect:[r.x,r.y,r.width,r.height]};};
   return {
    body:pick('body'),card:pick('.client-home-today-card'),nav:pick('.client-bottom-nav'),
    navActive:pick('.client-bottom-nav .active'),
    sections:Object.fromEntries(['client-home-today-card','redesign-training-day','redesign-progress-kpi','redesign-nutrition-day-row','nutrition-diary-meal','measurement-place-card','activity-field-card','workout-timed-modal-card','redesign-more-item'].map(x=>[x,pick('.'+x)])),
    input:pick('.redesign-nutrition-page input'),
    complete:pick('.lyfta-set-wrap.is-complete .lyfta-set-swipe-content'),
    setRow:pick('.lyfta-set-row'),
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2
   };
  });
  const oldLight=await getStyles();
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite.css'),'utf8')});
  const newLight=await getStyles();
  assert.deepEqual(newLight,oldLight,`light mode changed at ${width}px`);
  await page.locator('body').evaluate(e=>e.dataset.eplanTheme='dark');
  const dark=await getStyles();
  assert.equal(dark.body.background,rgb(16,17,20),'graphite page background');
  for(const [key,value] of Object.entries(dark.sections)){
   assert.equal(value.background,rgb(28,30,35),`${width}px graphite surface for ${key}`);
  }
  assert.equal(dark.input.background,rgb(40,43,49),'graphite form control');
  assert.equal(dark.nav.background,'rgba(28, 30, 35, 0.94)','nav matches trainer');
  assert.equal(dark.navActive.background,rgb(38,57,84),'active tab matches trainer');
  assert.equal(dark.setRow.background,'rgba(0, 0, 0, 0)','transparent workout set rows preserved');
  assert.notEqual(dark.complete.background,rgb(28,30,35),'completed sets retain success coloring');
  assert.equal(dark.horizontalOverflow,false,'graphite theme should not add horizontal scrolling');
  await page.close();
 }
 console.log('PASS: client graphite trainer palette, preserved completed sets, light untouched; 320/375/390/430px');
}finally{await browser.close()}
