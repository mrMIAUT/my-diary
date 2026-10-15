// Trainer v12 — distinct colored home avatar rings, unified SVG Back control.
// Browser renders actual CSS stack at iPhone widths in both themes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('js/trainer.js'),library=read('js/library.js'),core=read('js/core.js');
new vm.Script(js);new vm.Script(library);new vm.Script(core);
assert.ok(js.includes('class="trainer-back-button trainer-theme-back"'), 'Theme Back must share SVG class');
assert.ok(js.includes('class="trainer-back-button" onclick="showTrainerClientsView()"'), 'Client Back must share SVG class');
assert.ok(library.includes('class="trainer-back-button" onclick="showTrainerMore()"'), 'Library Back must share SVG class');
assert.ok(!js.includes('aria-label="До клієнтів">‹'),'Avoid miscentered font glyph in client Back');
assert.ok(!library.includes('aria-label="Назад">‹'),'Avoid miscentered font glyph in library Back');
assert.ok(!js.includes('class="trainer-theme-back"'),'Avoid legacy font glyph in theme Back');
const iconPath=core.match(/chevron-left:'([^']+)'/);
assert.ok(iconPath&&iconPath[1].includes('m15 18-6-6 6-6'),'SVG uses centered 24x24 viewBox path');
const svg='<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">'+iconPath[1]+'</svg>';
const body=`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
  <div class="trainer-shell">
    <div class="trainer-home-page">
      <button class="trainer-hero-card" type="button">
        <div class="trainer-hero-head"><strong>Ваші клієнти</strong></div>
        <div class="trainer-hero-count">6 <small>активних клієнтів</small></div>
        <div class="trainer-avatar-stack">
          <span class="trainer-client-avatar trainer-avatar-tone-4">А</span>
          <span class="trainer-client-avatar trainer-avatar-tone-3">ДГ</span>
          <span class="trainer-client-avatar trainer-avatar-tone-1">С</span>
          <span class="trainer-client-avatar trainer-avatar-tone-0">Г</span>
          <span class="trainer-client-avatar more">+2</span>
        </div>
      </button>
    </div>
    <section class="trainer-client-page">
      <div class="trainer-client-navline">
        <button class="trainer-back-button" type="button" aria-label="До клієнтів">${svg}</button>
        <button class="trainer-client-more" type="button">•••</button>
      </div>
    </section>
    <section class="trainer-library-page">
      <div class="trainer-client-navline">
        <button class="trainer-back-button" type="button" aria-label="Назад">${svg}</button>
      </div>
    </section>
    <section class="trainer-more-page trainer-theme-settings">
      <div class="trainer-page-title trainer-more-title">
        <h1>Тема оформлення</h1>
        <button class="trainer-back-button trainer-theme-back" type="button" aria-label="Назад">${svg}</button>
      </div>
    </section>
  </div>
</body></html>`;
const styles=['css/base.css','css/components.css','css/refinements.css','css/redesign.css',
 'css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'];
const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2});
  await page.setContent(body);
  for(const name of styles)await page.addStyleTag({content:read(name)});
  const check=async(sel,key,value)=>{
   const actual=await page.locator(sel).first().evaluate((el,key)=>getComputedStyle(el)[key],key);
   assert.equal(actual,value,`${width}px ${sel} ${key}`);
  };
  const buttons='.trainer-client-navline button.trainer-back-button, .trainer-theme-settings button.trainer-back-button';
  for(const mode of ['dark','light']){
   await page.locator('body').evaluate((el,mode)=>{el.dataset.eplanTheme=mode},mode);
   const all=page.locator(buttons);
   assert.equal(await all.count(),3);
   for(let i=0;i<3;i++){
    const el=all.nth(i);
    assert.equal(await el.getAttribute('type'),'button','Back should not submit forms');
    assert.ok(await el.getAttribute('aria-label'),'Back retains accessible name');
    assert.equal(await el.locator('svg.ui-icon').count(),1,'Back uses only SVG');
    const geometry=await el.evaluate(button=>{
      const r=button.getBoundingClientRect(),svg=button.querySelector('svg'),sr=svg.getBoundingClientRect();
      const path=svg.querySelector('path').getBBox();
      return {w:r.width,h:r.height,sw:sr.width,sh:sr.height,
       dx:sr.x+sr.width/2-r.x-r.width/2,
       dy:sr.y+sr.height/2-r.y-r.height/2,
       px:path.x+path.width/2,py:path.y+path.height/2};
    });
    assert.equal(geometry.w,44);assert.equal(geometry.h,44);
    assert.equal(geometry.sw,22);assert.equal(geometry.sh,22);
    assert.ok(Math.abs(geometry.dx)<=0.2&&Math.abs(geometry.dy)<=0.2,'SVG must be centered inside back button');
    assert.ok(Math.abs(geometry.px-12)<0.1&&Math.abs(geometry.py-12)<0.1,'actual chevron path centered inside SVG');
   }
   const dark=mode==='dark';
   await check('.trainer-client-navline button.trainer-back-button','backgroundColor',dark?rgb(37,61,85):rgb(234,242,255));
   await check('.trainer-theme-settings button.trainer-back-button','backgroundColor',dark?rgb(37,61,85):rgb(234,242,255));
   await check('.trainer-client-navline button.trainer-back-button','color',dark?rgb(180,216,255):rgb(40,95,155));
   await check('.trainer-theme-settings button.trainer-back-button','color',dark?rgb(180,216,255):rgb(40,95,155));
   await check('.trainer-home-page .trainer-avatar-stack>.trainer-client-avatar','borderTopWidth','3px');
   await check('.trainer-home-page .trainer-avatar-stack>.trainer-client-avatar','borderTopColor',rgb(22,60,112));
   await check('.trainer-home-page .trainer-avatar-stack>.trainer-client-avatar:nth-child(2)','marginLeft','-3px');
   await check('.trainer-home-page .trainer-avatar-stack>.trainer-client-avatar:first-child','marginLeft','0px');
   const colors=await page.locator('.trainer-home-page .trainer-avatar-stack>.trainer-client-avatar').evaluateAll(els=>els.map(x=>getComputedStyle(x).backgroundColor));
   assert.equal(new Set(colors).size,5,'Colored individual avatars and neutral +N must remain distinct');
   const border=await page.locator('.trainer-avatar-stack>.trainer-client-avatar').first().evaluate(el=>getComputedStyle(el).boxShadow);
   assert.ok(border.includes('rgba(238, 246, 255, 0.72)'), 'Fine light edge differentiates dark ring on hero blue');
  }
  await page.close();
 }
 console.log('PASS: separated home client avatars and optically centered reusable SVG Back (dark/light, 320/390px)');
} finally {await browser.close()}
