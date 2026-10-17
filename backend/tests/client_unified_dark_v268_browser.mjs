// Client unified dark v268: four iPhone viewport style checks; synthetic DOM only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const old=['base.css','components.css','refinements.css','redesign.css','theme.css','trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css','client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css','client-graphite-inner-panels.css','client-graphite-semantic-accents.css','client-graphite-active-diary.css','client-graphite-finishing-v252.css','client-graphite-components-v253.css'];
const markup=[
'<div id="app"><div class="wrap client-shell"><nav class="client-bottom-nav"><button class="active">Головна</button></nav>',
'<div class="client-home-today-card">Сьогодні</div><div class="client-home-metric">82 кг</div>',
'<div class="redesign-training-day">День 1</div><div class="redesign-training-day is-done"><div class="redesign-training-day-main">Виконано</div></div>',
'<button class="redesign-start-workout">Почати</button>',
'<div class="redesign-nutrition-page"><div class="redesign-calorie-card">2500</div><div class="nutrition-diary-meal">Щоденник</div></div>',
'<div class="redesign-progress-kpi redesign-progress-kpi-weight">Прогрес</div>',
'<div class="measurement-history-calendar-card"><button class="measurement-calendar-day has-data">17</button></div>',
'<div class="activity-field-card">Кроки</div><div class="redesign-more-item">Більше</div>',
'<div class="redesign-client-library"><div class="redesign-library-group">Вправи</div></div><input value="20"></div></div>'
].join('');
const rgb=(r,g,b)=>'rgb('+r+', '+g+', '+b+')';
const sheets=old.map(n=>fs.readFileSync(path.join(root,'css',n),'utf8'));
const unified=fs.readFileSync(path.join(root,'css/client-unified-dark-v268.css'),'utf8');
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+markup+'</body></html>');
  for(const sheet of sheets)await page.addStyleTag({content:sheet});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const inspect=()=>page.evaluate(()=>{
   const s=q=>getComputedStyle(document.querySelector(q)).backgroundColor;
   return {body:s('body'),card:s('.client-home-today-card'),training:s('.redesign-training-day'),done:s('.redesign-training-day.is-done'),
    action:s('.redesign-start-workout'),diary:s('.nutrition-diary-meal'),metric:s('.redesign-progress-kpi'),
    date:s('.measurement-calendar-day'),activity:s('.activity-field-card'),more:s('.redesign-more-item'),
    library:s('.redesign-library-group'),input:s('input'),overflow:document.documentElement.scrollWidth>innerWidth+2};
  });
  const light=await inspect();
  await page.addStyleTag({content:unified});
  assert.deepEqual(await inspect(),light,'light unchanged at '+width);
  await page.locator('body').evaluate(e=>e.dataset.eplanTheme='dark');
  const dark=await inspect();
  assert.equal(dark.body,rgb(0,0,0),'black canvas');
  assert.equal(dark.card,rgb(29,32,37),'graphite card');
  assert.equal(dark.action,rgb(38,118,211),'blue CTA');
  assert.notEqual(dark.done,dark.training,'completed state stays distinct');
  assert.notEqual(dark.date,dark.body,'calendar visible');
  assert.notEqual(dark.activity,dark.body,'activity visible');
  assert.notEqual(dark.library,dark.body,'library visible');
  assert.equal(dark.overflow,false,'no horizontal overflow');
  await page.locator('body').evaluate(e=>e.classList.replace('client-ui','trainer-ui'));
  const trainer=await inspect();
  await page.addStyleTag({content:unified});
  assert.deepEqual(await inspect(),trainer,'no trainer theme bleed');
  await page.close();
 }
 console.log('PASS: client dark v268 tabs, states, light/trainer isolation; 320-430px');
}finally{await browser.close()}
