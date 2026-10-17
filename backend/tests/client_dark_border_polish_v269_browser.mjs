// Client dark v269: screen-specific frame and secondary-button regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const names=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css',
 'client-graphite-inner-panels.css','client-graphite-semantic-accents.css',
 'client-graphite-active-diary.css','client-graphite-finishing-v252.css',
 'client-graphite-components-v253.css'];
const css=fs.readFileSync(path.join(root,'css/client-unified-dark-v268.css'),'utf8');
const html='<div id="app"><div class="wrap client-shell">'
 +'<nav class="client-bottom-nav"><button class="active">Прогрес</button></nav>'
 +'<div class="redesign-progress-workout-detail"><div class="progress-workout-detail-hero">День 2</div>'
 +'<div class="completed-workout-actions"><button class="completed-workout-edit-btn">Редагувати</button>'
 +'<button class="completed-workout-reopen-btn">Скасувати завершення</button></div>'
 +'<div class="progress-workout-detail-section"><div class="redesign-empty-panel"><strong>Результати не записані</strong><span>Немає підходів</span></div></div></div>'
 +'<div class="redesign-more-subpage"><div class="redesign-settings-panel">'
 +'<div class="eplan-theme-options"><button class="eplan-theme-option" aria-checked="false">Світла</button>'
 +'<button class="eplan-theme-option" aria-checked="true">Темна</button>'
 +'<button class="eplan-theme-option" aria-checked="false">Як на пристрої</button></div></div></div>'
 +'<div class="redesign-training-day is-next"><button class="redesign-training-day-main">День 3</button>'
 +'<div class="redesign-training-day-body"><div class="redesign-training-exercises">'
 +'<div class="redesign-training-exercise">Присідання</div><div class="redesign-training-exercise">Жим ногами</div></div></div></div>'
 +'<div class="redesign-training-day is-done"><button class="redesign-training-day-main">День 1</button></div>'
 +'</div></div>';
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+html+'</body></html>');
  for(const name of names)await page.addStyleTag({content:fs.readFileSync(path.join(root,'css',name),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const get=()=>page.evaluate(()=>{
   const cs=selector=>getComputedStyle(document.querySelector(selector));
   const b=cs('.completed-workout-reopen-btn'),empty=cs('.redesign-empty-panel'),
    inner=cs('.redesign-training-day-body'),row=cs('.redesign-training-exercise'),
    opts=cs('.eplan-theme-options'),nav=cs('.client-bottom-nav'),
    next=cs('.redesign-training-day.is-next'),done=cs('.redesign-training-day.is-done');
   return {reopen:b.backgroundColor,reopenBorder:b.borderTopColor,empty:empty.backgroundColor,
    emptyStyle:empty.borderTopStyle,emptyBorder:empty.borderTopColor,inner:inner.borderLeftWidth,
    innerTop:inner.borderTopColor,row:row.backgroundColor,rowLine:row.borderBottomColor,
    opts:opts.backgroundColor,nav:nav.borderTopColor,next:next.borderTopColor,done:done.borderTopColor,
    overflow:document.documentElement.scrollWidth>innerWidth+2};
  });
  const light=await get();
  await page.addStyleTag({content:css});
  assert.deepEqual(await get(),light,'light unaffected '+width);
  await page.locator('body').evaluate(e=>e.dataset.eplanTheme='dark');
  const dark=await get();
  assert.equal(dark.reopen,'rgb(37, 45, 56)','secondary button must be graphite');
  assert.equal(dark.emptyStyle,'dashed','empty panel retains quiet dashed border');
  assert.equal(dark.inner,'0px','nested outer left line removed');
  assert.equal(dark.opts,'rgba(0, 0, 0, 0)','theme options have no rectangular backing');
  assert.notEqual(dark.next,dark.done,'next/completed semantic edge colors retained');
  assert.equal(dark.overflow,false,'no horizontal overflow '+width);
  await page.locator('body').evaluate(e=>e.classList.replace('client-ui','trainer-ui'));
  const trainer=await get();
  await page.addStyleTag({content:css});
  assert.deepEqual(await get(),trainer,'trainer unaffected '+width);
  await page.close();
 }
 console.log('PASS: client v269 graphite actions/frames, semantic states, light/trainer isolation on 4 widths');
}finally{await browser.close()}
