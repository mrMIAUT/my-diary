// Trainer actual daily BJU date layout: iOS-native date control cannot overlap
// right arrow; date still selectable in dark AND light themes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const nutrition=fs.readFileSync(path.join(root,'js/nutrition.js'),'utf8');
const start=nutrition.indexOf('function trainerActualDiaryHTML(d){');
const end=nutrition.indexOf('function trainerActualDiaryNumber(',start);
assert.ok(start>=0&&end>start,'actual diary function available');
const makeMarkup=(date,today)=>vm.runInNewContext(
 nutrition.slice(start,end)+'\ntrainerActualDiaryHTML',
 {trainerActualDiaryState:()=>({day:date}),isoToday:()=>today,
  esc:(x)=>String(x).replaceAll('&','&amp;').replaceAll('"','&quot;'),
  Intl,Date,uiIcon:()=>'<svg class="ui-icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>'}
)({client:{id:1}});
const sheets=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css',
 'trainer-nav-parity.css'].map(x=>'css/'+x);
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
   await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign trainer-ui" data-eplan-theme="'+theme+'"><div id="app"><div id="nutrition">'+makeMarkup('2026-10-17','2026-10-17')+'</div></div></body></html>');
   for(const sheet of sheets)await page.addStyleTag({content:fs.readFileSync(path.join(root,sheet),'utf8')});
   const selectors={
    row:'#nutrition .trainer-actual-diary-date',
    label:'#nutrition .trainer-actual-diary-date>label',
    display:'#nutrition .trainer-actual-diary-date-display',
    input:'#nutrition .trainer-actual-diary-date input[type="date"]',
    prev:'#nutrition .trainer-actual-diary-date>button:first-child',
    next:'#nutrition .trainer-actual-diary-date>button:last-child'
   };
   const rects=await page.evaluate((s)=>{
    const out={};for(const [key,selector] of Object.entries(s)){
      const e=document.querySelector(selector);if(!e)throw Error('Missing '+selector);
      const r=e.getBoundingClientRect(),style=getComputedStyle(e);
      out[key]={left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom,
        height:r.height,opacity:style.opacity,background:style.backgroundColor,position:style.position};
    }return out;
   },selectors);
   const eps=1;
   assert.ok(rects.prev.right+9<=rects.label.left+eps,width+' '+theme+' left arrow separated');
   assert.ok(rects.display.right+9<=rects.next.left+eps,width+' '+theme+' date must not overlap right arrow');
   assert.ok(rects.input.right+9<=rects.next.left+eps,width+' '+theme+' native input must not cover arrow');
   assert.ok(rects.display.left>=rects.label.left-eps&&rects.display.right<=rects.label.right+eps,width+' display within label');
   assert.ok(rects.input.left>=rects.label.left-eps&&rects.input.right<=rects.label.right+eps,width+' input within label');
   assert.equal(rects.prev.width,44);
   assert.equal(rects.next.width,44);
   assert.equal(rects.input.opacity,'0');
   assert.equal(rects.input.position,'absolute');
   assert.equal(rects.display.height,46);
   assert.equal(await page.locator(selectors.input).inputValue(),'2026-10-17');
   assert.match(await page.locator(selectors.display).innerText(),/17.*жовт.*2026/);
   assert.equal(await page.locator(selectors.next).isDisabled(),true,'future date forbidden');
   const hit=await page.evaluate(s=>{
      const r=document.querySelector(s).getBoundingClientRect();
      return document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2)?.matches(s);
   },selectors.input);
   assert.equal(hit,true,'native picker input remains tap target');
   await page.evaluate(()=>{window.selectTrainerActualDiaryDate=(v)=>{window.__chosenDay=v};});
   await page.locator(selectors.input).fill('2026-10-16');
   assert.equal(await page.evaluate(()=>window.__chosenDay),'2026-10-16','change callback still works');
   if(theme==='dark'){
     assert.equal(rects.display.background,'rgb(40, 44, 52)');
   }else{
     assert.equal(rects.display.background,'rgb(244, 247, 251)');
   }
   await page.close();
  }
 }
 const old=makeMarkup('2026-10-15','2026-10-17');
 assert.ok(!old.includes('aria-label="Наступний день" disabled'), 'previous day next enabled');
 assert.ok(old.includes('value="2026-10-15"'),'day state persisted in input');
 console.log('PASS: iOS trainer diary date stays between 44px arrows and opens native date control; light/dark; 320/375/390/430px');
}finally{await browser.close()}
