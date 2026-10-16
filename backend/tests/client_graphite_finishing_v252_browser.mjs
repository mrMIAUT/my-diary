// Client graphite v252: ensure outer backings are transparent, timer graphite,
// timed workout history is neutral, and 0% macro rings keep semantic color.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const files=['base.css','components.css','refinements.css','redesign.css','theme.css',
'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
'client-graphite-active-diary.css'].map(x=>'css/'+x);
const markup=`<div id="app">
 <div class="redesign-progress-page"><div class="redesign-progress-achievements">
   <div><span class="achievement-icon trophy">★</span><strong>10</strong><small>тренувань виконано</small></div>
   <div><span class="achievement-icon fire">◎</span><strong>2</strong><small>активних днів</small></div>
   <div><span class="achievement-icon green">✓</span><strong>1</strong><small>замірів</small></div>
 </div></div>
 <div class="redesign-progress-workout-detail">
 <div class="progress-workout-muscles"><div class="progress-workout-muscles-head"><span>Обсяг за м'язами</span></div>
 <div class="progress-workout-muscle-row"><div><span>Без групи</span><strong>1520 кг</strong></div>
 <i><b style="width:100%"></b></i></div></div>
 <div class="progress-workout-sets"><div class="progress-workout-set-group">
  <div class="calendar-workout-set timed progress-workout-timed-set">
   <span>Підхід 1</span><strong>30 сек</strong><div class="progress-workout-timed-meta">План: 30 сек</div>
  </div></div></div>
 </div>
 <div class="redesign-more-page">
 <div class="redesign-more-list"><button class="redesign-more-item">
 <span class="redesign-more-icon">↗</span><span class="redesign-more-copy"><strong>Мій профіль</strong><small>Особисті дані</small></span></button>
 <button class="redesign-more-item">Історія</button>
 </div></div>
 <div class="redesign-nutrition-page"><div class="redesign-bju-detail-grid">
  <div class="redesign-macro-ring-card"><div class="redesign-macro-ring blue" style="--pct:0"><span>0%</span></div><strong>Білки</strong></div>
  <div class="redesign-macro-ring-card"><div class="redesign-macro-ring orange" style="--pct:0"><span>0%</span></div><strong>Жири</strong></div>
  <div class="redesign-macro-ring-card"><div class="redesign-macro-ring green" style="--pct:0"><span>0%</span></div><strong>Вуглеводи</strong></div>
 </div></div>
 <div class="redesign-active-workout">
   <div class="workout-featured-rest">
    <div class="workout-featured-rest-heading">Таймер відпочинку</div>
    <div class="workout-featured-rest-ring"><svg><circle class="workout-featured-rest-track"/>
      <circle class="workout-featured-rest-progress"/></svg></div>
    <div class="workout-featured-rest-value">01:58</div>
    <div class="workout-featured-rest-actions">
     <button class="workout-featured-rest-pause">Пауза</button>
     <button class="workout-featured-rest-stop">Стоп</button></div>
   </div>
   <button class="redesign-rest-timer-icon running">Таймер</button>
 </div>
 <button class="redesign-floating-rest-timer">
  <span class="redesign-floating-rest-timer-icon"><svg viewBox="0 0 24 24"><path d="M2 2L10 10"/></svg></span>
  <span class="redesign-floating-rest-timer-copy"><strong id="floatingRestTimerValue">01:58</strong><small>Відпочинок</small></span></button>
 </div>`;
const selectors={
 achievements:'.redesign-progress-achievements',
 achievementCard:'.redesign-progress-achievements>div',
 muscles:'.progress-workout-muscles',
 muscleRow:'.progress-workout-muscle-row',
 more:'.redesign-more-page .redesign-more-list',
 moreRow:'.redesign-more-page .redesign-more-item',
 timed:'.progress-workout-sets .progress-workout-timed-set',
 timer:'.redesign-active-workout .workout-featured-rest',
 timerPause:'.workout-featured-rest-actions .workout-featured-rest-pause',
 timerTrack:'.redesign-active-workout .workout-featured-rest-track',
 timerProgress:'.redesign-active-workout .workout-featured-rest-progress',
 timerButton:'.redesign-active-workout .redesign-rest-timer-icon.running',
 floating:'.redesign-floating-rest-timer',
 floatingValue:'.redesign-floating-rest-timer #floatingRestTimerValue',
 blue:'.redesign-macro-ring.blue',
 orange:'.redesign-macro-ring.orange',
 green:'.redesign-macro-ring.green'
};
const browser=await chromium.launch({headless:true});
try {
for(const width of [320,375,390,430]){
 const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
 await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+markup+'</body></html>');
 for(const name of files)await page.addStyleTag({content:fs.readFileSync(path.join(root,name),'utf8')});
 await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
 const inspect=()=>page.evaluate(q=>Object.fromEntries(Object.entries(q).map(([k,s])=>{
  const e=document.querySelector(s);if(!e)throw Error('missing '+s);
  const css=getComputedStyle(e);
  return [k,{bg:css.backgroundColor,image:css.backgroundImage,
   border:css.borderTopColor,borderWidth:css.borderTopWidth,shadow:css.boxShadow,
   color:css.color,stroke:css.stroke,ring:css.getPropertyValue('--ring').trim(),
   track:css.getPropertyValue('--ring-track').trim()}];
 })),selectors);
 const before=await inspect();
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-finishing-v252.css'),'utf8')});
 assert.deepEqual(await inspect(),before,'light theme change at '+width);
 await page.locator('body').evaluate(e=>e.dataset.eplanTheme='dark');
 const d=await inspect();
 const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
 const eq=(k,f,value)=>assert.equal(d[k][f],value,`${width}px ${k}.${f}`);
 eq('achievements','bg','rgba(0, 0, 0, 0)');
 eq('achievementCard','bg',rgb(34,37,43));
 eq('muscleRow','bg','rgba(0, 0, 0, 0)');
 eq('more','bg','rgba(0, 0, 0, 0)');
 eq('moreRow','bg',rgb(33,36,42));
 eq('timed','bg',rgb(44,48,54));
 eq('timer','bg',rgb(37,41,48));
 eq('timerPause','bg',rgb(51,68,89));
 eq('timerTrack','stroke',rgb(74,81,91));
 eq('timerProgress','stroke',rgb(100,158,236));
 eq('timerButton','bg',rgb(52,69,90));
 eq('floating','bg','rgba(40, 44, 51, 0.97)');
 eq('floatingValue','color',rgb(240,244,250));
 const expected={
  blue:{ring:'#5c9feb',track:'#2b435f'},
  orange:{ring:'#e9b351',track:'#534632'},
  green:{ring:'#74cfa3',track:'#2c4e40'}
 };
 for(const [k,x] of Object.entries(expected)){
  eq(k,'ring',x.ring);
  eq(k,'track',x.track);
  assert.ok(d[k].image.includes('conic-gradient'),'semantic ring gradient '+k);
  assert.ok(d[k].image.includes('0%'),'zero ring '+k);
 }
 assert.notEqual(d.blue.image,d.orange.image,'blue and orange rings must differ even at zero');
 assert.notEqual(d.orange.image,d.green.image,'orange and green rings must differ even at zero');
 await page.close();
}
console.log('PASS: client graphite rest, timed history, achievement/muscle/more backings, 0% BJU ring tones; light unchanged, 320/375/390/430px');
}finally{await browser.close()}
