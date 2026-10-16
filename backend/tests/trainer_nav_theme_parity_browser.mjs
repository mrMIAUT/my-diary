// Trainer floating navigation must keep precisely the same geometry across themes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const styles=['css/base.css','css/components.css','css/refinements.css',
 'css/redesign.css','css/theme.css','css/trainer-avatars.css',
 'css/trainer-dark.css','css/trainer-program-overview.css','css/trainer-nav-parity.css'];
const labels=['Головна','Клієнти','Програми','Харчування','Більше'];
const html='<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
'<body class="eplan-redesign trainer-ui" data-eplan-theme="light"><div class="trainer-shell"></div>'+
'<nav class="trainer-bottom-nav" aria-label="Навігація тренера">'+
labels.map((label,i)=>'<button type="button" '+(i===1?'class="active"':'')+'>'+
'<svg class="ui-icon trainer-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3z"/></svg>'+
'<span>'+label+'</span></button>').join('')+'</nav></body></html>';
const rounded=(n)=>Math.round(n*100)/100;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:2});
  await page.setContent(html);
  for(const file of styles)await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const measure=()=>page.evaluate(()=>{
   const bar=document.querySelector('.trainer-bottom-nav'),active=bar.querySelector('button.active'),
    icon=active.querySelector('svg'),label=active.querySelector('span');
   const rect=el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
   const st=getComputedStyle(bar),btn=getComputedStyle(active),lt=getComputedStyle(label);
   return {bar:rect(bar),active:rect(active),icon:rect(icon),label:rect(label),
    padding:st.padding,bottom:st.bottom,gap:st.gap,radius:st.borderRadius,
    itemGap:btn.gap,itemPadding:btn.padding,buttonRadius:btn.borderRadius,
    fontSize:lt.fontSize,lineHeight:lt.lineHeight,
    bg:st.backgroundColor,activeBg:btn.backgroundColor,
    itemText:btn.color,overflow:document.documentElement.scrollWidth>innerWidth+2};
  });
  const light=await measure();
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='dark');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const dark=await measure();
  for(const k of ['bar','active','icon','label']){
   assert.deepEqual(light[k].map(rounded),dark[k].map(rounded),`${width}px geometry mismatch ${k}`);
  }
  for(const k of ['padding','bottom','gap','radius','itemGap','itemPadding','buttonRadius','fontSize','lineHeight']){
   assert.equal(light[k],dark[k],`${width}px style mismatch ${k}`);
  }
  assert.notEqual(light.bg,dark.bg,'theme palette should change');
  assert.notEqual(light.activeBg,dark.activeBg,'active tab palette should change');
  assert.ok(light.bar[0]>=0 && light.bar[0]+light.bar[2]<=width+1,'nav outside viewport');
  assert.equal(light.overflow,false,'light horizontal overflow');
  assert.equal(dark.overflow,false,'dark horizontal overflow');
  assert.equal(light.icon[2],22,'icon width');
  assert.equal(light.active[3],50,'tab height');
  await page.close();
 }
 console.log('PASS: trainer floating bottom menu geometry identical in light and dark modes, 320/375/390/430px');
} finally{await browser.close()}
