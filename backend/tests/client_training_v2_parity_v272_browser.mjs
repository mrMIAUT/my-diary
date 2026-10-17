// v272 screenshots regression: compact set table, no orange swipe action bleeding,
// theme-specific training surfaces and iPhone geometry. No backend / client data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const cssFiles=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css',
 'client-graphite-components-v253.css','client-unified-dark-v268.css',
 'client-training-v2.css','client-training-v2-parity-v272.css'];
const exercise=(showRir)=>`<section class="exercise workout-live-exercise"><button class="workout-live-toggle open">
 <span class="eplan-v2-title-content"><span class="eplan-v2-exercise-index">1</span>
 <span class="eplan-v2-exercise-icon">◼</span><span class="eplan-v2-exercise-text">
 <span class="workout-exercise-title-line"><strong>Присідання зі штангою</strong></span></span></span></button>
 <div class="exercise-body workout-live-body">
 <button class="swap-exercise-btn">Замінити вправу</button>
 <div class="lyfta-workout-tools"><button>Історія та графік</button></div>
 <button class="lyfta-warmup-toggle">+ Додати розминочні підходи</button>
 <div class="lyfta-set-head ${showRir?'':'no-rir'}">
 <span>Підхід</span><span>Вага</span><span>Повтори</span>${showRir?'<span>RIR</span>':''}<span></span></div>
 ${[1,2,3].map(n=>`<div class="lyfta-set-wrap${n===1?' is-complete':''}">
  <div class="lyfta-set-swipe" data-set-action="skip">
  <div class="lyfta-set-action-tray skip"><button>Пропустити</button></div>
  <div class="lyfta-set-swipe-content">
   <div class="lyfta-prev-line"><span>Попередньо</span><strong>—</strong></div>
   <div class="lyfta-set-row ${showRir?'':'no-rir'}${n===1?' is-complete':''}">
    <div class="setnum">${n}</div>
    <div class="lyfta-input-wrap"><input type="number" value="${n===1?40:''}" placeholder="кг"></div>
    <input type="number" value="${n===1?10:''}" placeholder="8-12">
    ${showRir?'<input type="number" placeholder="2">':''}
    <button class="lyfta-set-done${n===1?' done':''}">✓</button>
   </div>${n===1?'<div class="lyfta-drop-zone is-visible"><button class="lyfta-add-drop">+ Додати дроп-сет</button></div>':''}
  </div></div></div>`).join('')}
 <div class="lyfta-extra-set-actions"><button class="lyfta-add-set">+ Додати підхід</button>
 <small>Свайп вліво: пропустити плановий підхід</small></div>
 </div></section>`;
const browser=await chromium.launch({headless:true});
try{
 for(const theme of ['light','dark'])for(const width of [320,375,390,430])for(const showRir of [false,true]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:2});
  const html='<div id="app"><main class="redesign-training-page"><div class="redesign-active-workout eplan-training-v2-live">'+exercise(showRir)+'</div></main></div>';
  await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="'+theme+'">'+html+'</body></html>');
  for(const name of cssFiles)await page.addStyleTag({content:fs.readFileSync(path.join(base,'css',name),'utf8')});
  const read=()=>page.evaluate(()=>{
    const one=q=>document.querySelector(q),data=q=>{const e=one(q),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {left:r.left,right:r.right,width:r.width,height:r.height,bg:s.backgroundColor,visible:s.visibility,borderLeft:s.borderLeftWidth,columns:s.gridTemplateColumns}};
    return {
      page:data('.redesign-training-page'),card:data('.workout-live-exercise'),body:data('.workout-live-body'),
      head:data('.lyfta-set-head'),row:data('.lyfta-set-row'),completed:data('.lyfta-set-wrap.is-complete'),
      pending:data('.lyfta-set-wrap:not(.is-complete)'),content:data('.lyfta-set-wrap:not(.is-complete) .lyfta-set-swipe-content'),
      tray:data('.lyfta-set-wrap:not(.is-complete) .lyfta-set-action-tray'),
      input:data('.lyfta-set-row input'),done:data('.lyfta-set-done.done'),
      fullWidth:document.documentElement.scrollWidth>window.innerWidth+2
    };
  });
  const v=await read();
  const prefix=theme+' '+width+'px rir='+showRir;
  const bg=theme==='dark'?'rgb(13, 32, 45)':'rgb(255, 255, 255)';
  assert.equal(v.card.bg,bg,prefix+' proper card background');
  assert.equal(v.content.bg,theme==='dark'?'rgb(12, 29, 42)':'rgb(255, 255, 255)',prefix+' opaque swipe content');
  assert.equal(v.tray.visible,'hidden',prefix+' concealed skip action');
  assert.ok(v.row.height<=50,prefix+' compact input row, got '+v.row.height);
  assert.ok(v.pending.height<=94,prefix+' compact pending set, got '+v.pending.height);
  assert.equal(v.input.height,38,prefix+' table input height');
  assert.ok(v.head.right<=v.body.right+1 && v.head.left>=v.body.left-1,prefix+' header fits card');
  assert.equal(v.fullWidth,false,prefix+' no viewport overflow');
  assert.ok(v.completed.borderLeft==='3px',prefix+' subtle green stripe');
  assert.equal(v.head.columns.trim().split(' ').length,showRir?5:4,prefix+' table columns match RIR setting');
  const swipe=page.locator('.lyfta-set-wrap:not(.is-complete) .lyfta-set-swipe').first();
  await swipe.evaluate(el=>el.classList.add('open'));
  assert.equal((await read()).tray.visible,'visible',prefix+' swipe action available once open');
  await swipe.evaluate(el=>el.classList.remove('open'));
  assert.equal((await read()).tray.visible,'hidden',prefix+' swipe action concealed on close');
  await page.close();
 }
 console.log('PASS: v272 light/dark compact sets, swipe action visibility, completed green stripe, RIR on/off, 320/375/390/430px');
}finally{await browser.close()}
