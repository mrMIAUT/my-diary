// Client dark graphite polish: training hierarchy and low-chroma surfaces.
// Browser styling smoke; never loads real user data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const styles=['css/base.css','css/components.css','css/refinements.css',
 'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css',
 'css/trainer-program-overview.css','css/trainer-nav-parity.css','css/client-graphite.css'];
const markup=`<div id="app"><div class="wrap client-shell">
 <section class="redesign-training-page">
  <div class="redesign-training-summary"><span>Поточний цикл</span><strong>2 з 6</strong><div class="redesign-training-cycle"><i style="width:33%"></i></div></div>
  <div class="redesign-training-help"><button>Розминка та правила</button><div class="redesign-training-help-body">Допомога</div></div>
  <div class="redesign-training-day-list">
   <article class="redesign-training-day"><button class="redesign-training-day-main"><span class="redesign-training-day-index">2</span><span class="redesign-training-day-copy"><strong>День 2</strong><small>Руки + Плечі</small><em>6 вправ · Руки + Плечі</em></span><span class="redesign-training-day-status">За планом</span><span class="redesign-training-chevron">⌄</span></button></article>
   <article class="redesign-training-day is-next"><button class="redesign-training-day-main"><span class="redesign-training-day-index">3</span><span class="redesign-training-day-copy"><strong>День 3</strong><small>Ноги</small></span><span class="redesign-training-day-status">Наступне</span></button></article>
   <article class="redesign-training-day is-done"><button class="redesign-training-day-main"><span class="redesign-training-day-index">1</span><span class="redesign-training-day-copy"><strong>День 1</strong><small>Груди + Спина</small></span><span class="redesign-training-day-status">Виконано</span></button></article>
  </div>
  <div class="redesign-training-stat-grid"><div><span><svg class="ui-icon" viewBox="0 0 24 24"></svg></span><strong>10</strong><small>тренувань</small></div></div>
  <div class="card cardio-activity-card"><div class="activity-field-card activity-steps-card"><span class="activity-field-icon"><img class="activity-approved-icon" alt=""></span><div><label>Кроки</label><input type="number" value="0"></div></div>
  <div class="cardio-entry-cards"><div class="cardio-entry-wrap"><button class="cardio-entry-card selected"><span class="cardio-entry-icon"><img class="activity-approved-icon" alt=""></span><span><strong>Доріжка</strong><small>Швидкість · час</small></span></button></div></div>
  <div class="cardio-metric-inputs"><div class="activity-field-card"><input value="30"></div></div><button class="cardio-save-neutral">Зберегти активність</button></div>
 </section>
 <div class="card measurement-history-calendar-card"><button class="measurement-history-calendar-toggle">Історія замірів</button><div class="measurement-history-calendar-body">
  <div class="measurement-calendar-head"><button>‹</button><strong>Вересень 2026</strong></div>
  <div class="measurement-calendar-weekdays"><span>Пн</span></div><div class="measurement-calendar-grid">
  <button class="measurement-calendar-day">12</button><button class="measurement-calendar-day has-data active">24</button></div>
  <div class="measurement-calendar-hint">Обери дату із замірами</div></div></div>
 <div class="nutrition-diary-card"><div class="nutrition-diary-meal">
  <div class="nutrition-diary-meal-title"><strong>Сніданок</strong></div><div class="nutrition-diary-meal-body"><button class="nutrition-diary-add">+ Додати продукт</button></div>
 </div></div><nav class="client-bottom-nav"><button class="active">Головна</button></nav>
 </div></div>`;
const br=await chromium.launch({headless:true});
const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
try{
 for(const width of [320,375,390,430]){
  const page=await br.newPage({viewport:{width,height:852}});
  await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+markup+'</body></html>');
  for(const p of styles)await page.addStyleTag({content:fs.readFileSync(path.join(root,p),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'}); 
  const measure=()=>page.evaluate(()=>{
   const read=selector=>{const e=document.querySelector(selector); if(!e)throw Error('missing '+selector);
    const s=getComputedStyle(e),r=e.getBoundingClientRect();
    return {background:s.backgroundColor,color:s.color,border:s.borderTopColor,filter:s.filter,rect:[r.x,r.y,r.width,r.height]};};
   return {
    regular:read('.redesign-training-day:not(.is-done):not(.is-next)'),
    regularName:read('.redesign-training-day:not(.is-done):not(.is-next) .redesign-training-day-copy strong'),
    next:read('.redesign-training-day.is-next'),nextStatus:read('.is-next .redesign-training-day-status'),
    done:read('.redesign-training-day.is-done'),doneStatus:read('.is-done .redesign-training-day-status'),
    cardio:read('.cardio-entry-card'),icon:read('.activity-approved-icon'),save:read('.cardio-save-neutral'),
    statIcon:read('.redesign-training-stat-grid>div>span'),
    calendar:read('.measurement-history-calendar-card'),date:read('.measurement-calendar-day:not(.active)'),
    activeDate:read('.measurement-calendar-day.active'),
    meal:read('.nutrition-diary-meal'),add:read('.nutrition-diary-add'),
    steps:read('.activity-steps-card input'),
    overflow:document.documentElement.scrollWidth>innerWidth+2
   };
  });
  const before=await measure();
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-polish.css'),'utf8')});
  const afterLight=await measure();
  assert.deepEqual(afterLight,before,'light theme was modified at '+width);
  await page.locator('body').evaluate(e=>e.dataset.eplanTheme='dark');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const dark=await measure();
  const eq=(actual,expected,label)=>assert.equal(actual,expected,`${width}px ${label}`);
  eq(dark.regular.background,rgb(34,37,43),'ordinary day graphite');
  eq(dark.next.background,rgb(34,44,58),'next day muted blue');
  eq(dark.done.background,rgb(27,43,35),'completed day green');
  eq(dark.regularName.color,rgb(246,247,250),'day label readable');
  eq(dark.nextStatus.background,rgb(48,69,99),'next status blue');
  eq(dark.statIcon.background,rgb(48,59,75),'stat icon tile');
  eq(dark.cardio.background,rgb(43,56,73),'selected cardio palette');
  assert.ok(dark.icon.filter!=='none','approved icon receives contrast filter');
  eq(dark.save.background,rgb(49,95,157),'activity save primary blue');
  eq(dark.date.background,rgb(48,52,60),'calendar graphite');
  eq(dark.activeDate.background,rgb(52,79,112),'selected calendar');
  eq(dark.meal.background,rgb(34,37,43),'nutrition surface');
  eq(dark.add.background,rgb(50,66,89),'nutrition muted CTA');
  eq(dark.steps.background,'rgba(0, 0, 0, 0)','steps entry seamless');
  assert.equal(dark.overflow,false,'horizontal overflow');
  await page.close();
 }
 console.log('PASS: client graphite contrast polish, light untouched, 320/375/390/430px');
} finally {await br.close()}
