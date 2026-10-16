// Screenshot-driven client semantic color and superset layout regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const sheets=['base.css','components.css','refinements.css','redesign.css','theme.css','trainer-avatars.css',
 'trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css','client-graphite.css',
 'client-graphite-polish.css','client-graphite-deep-qa.css','client-graphite-inner-panels.css']
 .map(x=>'css/'+x);
const markup=`<div id="app"><div class="client-section-page redesign-training-page">
 <div class="redesign-training-stats"><div class="redesign-training-stat-grid">
 <div><span><svg class="ui-icon" viewBox="0 0 24 24"><path d="M2 2 L8 8"/></svg></span><strong>10</strong><small>тренувань</small></div>
 <div><span><svg class="ui-icon" viewBox="0 0 24 24"><path d="M2 2 L8 8"/></svg></span><strong>18</strong><small>вправ</small></div>
 <div><span><svg class="ui-icon" viewBox="0 0 24 24"><path d="M2 2 L8 8"/></svg></span><strong>2</strong><small>цикл</small></div></div></div>
 <div class="redesign-training-day"><div class="redesign-training-day-body">
 <div class="redesign-training-superset">
  <div class="redesign-training-superset-label"><span>СУПЕРСЕТ</span><small>Відпочинок 60 сек</small></div>
  <div class="redesign-training-exercise"><span>1</span><strong>Згинання рук</strong></div>
  <div class="redesign-training-exercise"><span>2</span><strong>Розгинання рук</strong></div>
 </div></div></div></div>
 <div class="client-home-today-grid"><div class="client-home-today-card"><span class="client-home-today-icon"><svg class="ui-icon"><path d="M1 1L9 9"/></svg></span></div>
 <div class="client-home-today-card"><span class="client-home-today-icon"><svg class="ui-icon"><path d="M1 1L9 9"/></svg></span></div></div>
 <div class="client-home-metrics">
 <div class="client-home-metric"><span class="client-home-metric-icon"><svg class="ui-icon"><path d="M1 1L9 9"/></svg></span></div>
 <div class="client-home-metric"><span class="client-home-metric-icon"><svg class="ui-icon"><path d="M1 1L9 9"/></svg></span></div>
 <div class="client-home-metric"><span class="client-home-metric-icon"><svg class="ui-icon"><path d="M1 1L9 9"/></svg></span></div></div>
 <div class="nutrition-diary-card"><div class="nutrition-diary-day-total"><strong>0 ккал</strong><span>Б 0</span></div>
 <div class="nutrition-diary-meal"><div class="nutrition-diary-meal-body">
 <button class="nutrition-diary-add">+ Додати продукт</button></div></div></div>
 <div class="trainer-market-page"><div class="trainer-market-card trainer-card-v3 marketplace current">
 <div class="trainer-card-v3-tags"><i>Набір м'язової маси</i></div><div class="trainer-card-v3-footer">Твій тренер</div></div></div>
 <div class="redesign-client-library"><div class="redesign-library-group">
  <button class="redesign-library-group-head">Спина</button><div class="redesign-library-group-body">
  <div class="redesign-library-row">Тяга блока</div></div></div></div>
 <div class="redesign-more-subpage"><div class="redesign-help-item">
  <button><strong>Як почати тренування?</strong></button><div>Допомога</div></div></div></div>`;
const selectors={
 superset:'.redesign-training-superset',
 label:'.redesign-training-superset-label',
 exercise:'.redesign-training-superset .redesign-training-exercise',
 stat1:'.redesign-training-stat-grid>div:nth-child(1)>span',
 stat2:'.redesign-training-stat-grid>div:nth-child(2)>span',
 stat3:'.redesign-training-stat-grid>div:nth-child(3)>span',
 svg1:'.redesign-training-stat-grid>div:nth-child(1)>span svg',
 svg2:'.redesign-training-stat-grid>div:nth-child(2)>span svg',
 svg3:'.redesign-training-stat-grid>div:nth-child(3)>span svg',
 today1:'.client-home-today-card:nth-child(1) .client-home-today-icon',
 today2:'.client-home-today-card:nth-child(2) .client-home-today-icon',
 metric1:'.client-home-metric:nth-child(1) .client-home-metric-icon',
 metric2:'.client-home-metric:nth-child(2) .client-home-metric-icon',
 metric3:'.client-home-metric:nth-child(3) .client-home-metric-icon',
 total:'.nutrition-diary-day-total',
 add:'.nutrition-diary-meal .nutrition-diary-add',
 trainer:'.trainer-market-card.trainer-card-v3.marketplace',
 library:'.redesign-library-group-head',
 exerciseRow:'.redesign-library-row',
 help:'.redesign-help-item>button'
};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+markup+'</body></html>');
  for(const f of sheets)await page.addStyleTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const measure=()=>page.evaluate(sels=>Object.fromEntries(Object.entries(sels).map(([k,q])=>{
   const e=document.querySelector(q),s=getComputedStyle(e);
   return [k,{bg:s.backgroundColor,color:s.color,stroke:s.stroke,border:s.borderTopColor,
    pad:s.padding,margin:s.margin,radius:s.borderTopLeftRadius,shadow:s.boxShadow}];
  })),selectors);
  const light=await measure();
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-semantic-accents.css'),'utf8')});
  assert.deepEqual(await measure(),light,'must not change light at '+width);
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='dark');
  const d=await measure();
  const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
  const eq=(key,field,expected)=>assert.equal(d[key][field],expected,`${width}px ${key} ${field}`);
  eq('superset','pad','0px');eq('superset','radius','18px');
  eq('label','margin','0px');eq('exercise','bg',rgb(35,38,44));
  eq('stat1','bg',rgb(65,53,43));eq('stat2','bg',rgb(36,64,55));eq('stat3','bg',rgb(56,49,72));
  eq('svg1','stroke',rgb(240,195,138));eq('svg2','stroke',rgb(151,221,196));eq('svg3','stroke',rgb(202,183,243));
  eq('today1','bg',rgb(52,53,74));eq('today2','bg',rgb(38,64,56));
  eq('metric1','bg',rgb(57,50,76));eq('metric2','bg',rgb(37,64,57));eq('metric3','bg',rgb(69,56,41));
  eq('total','bg',rgb(41,45,52));eq('add','bg',rgb(49,57,67));
  eq('trainer','bg',rgb(34,37,43));eq('library','bg',rgb(43,46,53));
  eq('exerciseRow','bg','rgba(0, 0, 0, 0)');eq('help','bg',rgb(41,45,52));
  await page.close();
 }
 console.log('PASS: semantic home/stat icon colors, clean supersets, graphite diary/library/help, light isolation');
}finally{await browser.close()}
