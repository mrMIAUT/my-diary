// v253 screenshot regression: dark-only graphite exercise replacement,
// notifications, library counter, added food and calm completed workout sets.
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
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css'].map(x=>'css/'+x);
const html=`<div id="app">
 <div class="redesign-active-workout">
  <section class="workout-live-exercise"><button class="workout-live-toggle open">Розгинання рук</button>
   <div class="workout-live-body"><div class="lyfta-set-wrap is-complete">
    <div class="lyfta-set-swipe"><div class="lyfta-set-swipe-content">
     <div class="lyfta-prev-line">Попередньо 25 кг</div>
     <div class="lyfta-set-row"><input value="30" /><button class="lyfta-set-done done">✓</button></div>
     <div class="lyfta-drop-zone"><button class="lyfta-add-drop">+ Додати дроп-сет</button></div>
    </div></div></div></div>
  </section>
  <section class="workout-live-exercise"><button class="workout-live-toggle">Жим</button></section>
 </div>
 <div class="nutrition-diary-meal"><div class="nutrition-diary-meal-body"><button class="nutrition-diary-add">+ Додати продукт</button></div></div>
 <div class="redesign-client-library"><section class="redesign-library-group">
  <button class="redesign-library-group-head"><strong>Спина</strong>
   <span class="redesign-library-group-meta"><b>17</b><i>⌄</i></span></button>
 </section></div>
 </div>
 <div id="alternativeExerciseModal" class="modal">
  <div class="card swap-choice-card">
   <div class="edit-exercise-head"><div><h2>Замінити вправу</h2><p class="muted">Обери один із варіантів</p></div>
    <button class="edit-exercise-close">×</button></div>
   <div class="alternative-modal-list"><button class="alternative-current"><strong>За планом</strong><small>3 x 12</small></button>
   <button><strong>Альтернатива</strong><small>3 x 12</small></button></div>
   <div class="swap-scope-actions"><button><strong>Тільки сьогодні</strong><span>Один раз</span></button></div>
  </div>
 </div>
 <div id="notificationModal" class="modal notification-modal"><div class="card notification-modal-card">
  <button class="notification-close">×</button><div class="notification-empty"><span class="ui-icon">♧</span>
  <strong>Сповіщень немає</strong><span>Нові події з’являться тут.</span></div>
  <div class="notification-swipe"><div class="notification-item unread">Тест</div></div>
 </div></div>
 `;
const sels={
 workout:'.redesign-active-workout .workout-live-exercise:not(.workout-live-exercise-inner)',
 set:'.redesign-active-workout .lyfta-set-wrap.is-complete',
 setInner:'.redesign-active-workout .lyfta-set-wrap.is-complete .lyfta-set-swipe-content',
 input:'.redesign-active-workout .lyfta-set-wrap.is-complete input',
 done:'.redesign-active-workout .lyfta-set-wrap.is-complete .lyfta-set-done.done',
 drop:'.redesign-active-workout .lyfta-set-wrap.is-complete .lyfta-drop-zone',
 add:'.nutrition-diary-meal .nutrition-diary-add',
 lib:'.redesign-library-group-meta',
 count:'.redesign-library-group-meta b',
 chevron:'.redesign-library-group-meta i',
 swap:'#alternativeExerciseModal>.swap-choice-card',
 swapHeading:'#alternativeExerciseModal .edit-exercise-head h2',
 swapClose:'#alternativeExerciseModal .edit-exercise-close',
 swapCurrent:'#alternativeExerciseModal .alternative-modal-list>button.alternative-current',
 swapOther:'#alternativeExerciseModal .alternative-modal-list>button:not(.alternative-current)',
 swapScope:'#alternativeExerciseModal .swap-scope-actions>button',
 note:'#notificationModal .notification-modal-card',
 noteClose:'#notificationModal .notification-close',
 noteEmpty:'#notificationModal .notification-empty',
 noteUnread:'#notificationModal .notification-item.unread'
};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+html+'</body></html>');
  for(const f of sheets)await page.addStyleTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const inspect=()=>page.evaluate(q=>Object.fromEntries(Object.entries(q).map(([k,selector])=>{
   const el=document.querySelector(selector);if(!el)throw Error('Missing '+selector);
   const s=getComputedStyle(el);
   return [k,{bg:s.backgroundColor,color:s.color,border:s.borderTopColor,left:s.borderLeftColor,
     leftWidth:s.borderLeftWidth,radius:s.borderTopLeftRadius,shadow:s.boxShadow}];
  })),sels);
  const lightBefore=await inspect();
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-components-v253.css'),'utf8')});
  assert.deepEqual(await inspect(),lightBefore,'light must stay unchanged at '+width);
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='dark');
  const d=await inspect();
  const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
  const eq=(k,f,v)=>assert.equal(d[k][f],v,`${width}px ${k}.${f}`);
  eq('workout','bg',rgb(34,37,43));
  eq('set','bg',rgb(43,47,54));
  eq('set','leftWidth','3px');
  eq('setInner','bg',rgb(43,47,54));
  eq('drop','bg',rgb(43,47,54));
  eq('input','bg',rgb(41,45,51));
  eq('done','bg',rgb(41,82,65));
  eq('add','bg',rgb(52,66,80));
  eq('lib','bg','rgba(0, 0, 0, 0)');
  eq('count','bg',rgb(51,58,67));
  eq('chevron','bg','rgba(0, 0, 0, 0)');
  eq('swap','bg',rgb(34,38,44));
  eq('swapHeading','color',rgb(241,245,250));
  eq('swapClose','bg',rgb(48,55,66));
  eq('swapCurrent','bg',rgb(41,59,77));
  eq('swapOther','bg',rgb(44,50,58));
  eq('swapScope','bg',rgb(44,50,58));
  eq('note','bg',rgb(35,38,44));
  eq('noteClose','bg',rgb(50,56,65));
  eq('noteEmpty','bg',rgb(42,46,53));
  eq('noteUnread','bg',rgb(43,57,71));
  await page.close();
 }
 console.log('PASS: graphite completed set, substitution modal and push notifications, no library count square, food action; light untouched; 320/375/390/430px');
}finally{await browser.close()}
