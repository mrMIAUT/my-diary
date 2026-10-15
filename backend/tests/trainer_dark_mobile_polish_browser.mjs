// Computed-color and narrow viewport regression for trainer dark v5.
// Uses static trainer markup: no account, API or database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const cssFiles=[
  'css/base.css','css/components.css','css/refinements.css',
  'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'
];

const html=`<!doctype html><html lang="uk">
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
<div class="trainer-client-page" style="width:100%;padding:14px;box-sizing:border-box;">
 <div id="program">
  <section class="card trainer-extra-manager">
   <div class="trainer-extra-manager-head"><div><span class="trainer-extra-manager-kicker">ГНУЧКИЙ ПЛАН</span><h2>Додаткові тренування</h2></div><button class="trainer-extra-manager-create">＋ Створити</button></div>
   <div class="trainer-extra-manager-empty"><span>＋</span><div><strong>Додаткових тренувань ще немає</strong><small>Створи день, який можна активувати лише коли він потрібен клієнту.</small></div></div>
  </section>
  <section class="program-day-card">
   <div class="program-day-header-row"><div class="program-day-heading"><h2>День 1</h2><small>Ноги + спина</small></div></div>
   <div id="programDay_1">
    <div class="program-block trainer-exercise-card">
     <div class="trainer-exercise-shell">
      <div class="trainer-exercise-head">
       <div class="trainer-program-title-line">
        <span class="trainer-program-name-marquee is-long"><span class="trainer-program-name-track">
          <strong>Тяга резинки до поясу в нахилі з опорою</strong><strong aria-hidden="true">Тяга резинки до поясу в нахилі з опорою</strong>
        </span></span><a class="alternative-tech-link" href="#">Техніка</a>
       </div>
       <span class="trainer-exercise-head-actions"><button>↓</button><button>＋</button></span>
      </div>
      <div class="trainer-exercise-body">2 підходи × 30 сек</div>
     </div>
    </div>
    <div class="program-block trainer-exercise-card superset-block">
     <div class="trainer-superset-head"><span>СУПЕРСЕТ</span><small>Відпочинок 1-2 хв</small></div>
     <div class="superset-inner">
      <div class="trainer-exercise-head">
       <div class="trainer-program-title-line superset-title-line">
        <span class="trainer-program-name-marquee is-long"><span class="trainer-program-name-track">
         <strong>Розгинання рук у сторони з резинкою стоячи</strong><strong aria-hidden="true">Розгинання рук у сторони з резинкою стоячи</strong>
        </span></span><a class="alternative-tech-link" href="#">Техніка</a>
       </div>
       <span class="trainer-exercise-head-actions trainer-superset-inline-move"><button>↑</button><button>↓</button></span>
      </div>
      <div class="trainer-exercise-body">2 підходи × 12-15</div>
     </div>
     <div class="superset-inner">
      <div class="trainer-exercise-head">
       <div class="trainer-program-title-line superset-title-line">
        <span class="trainer-program-name-marquee is-long"><span class="trainer-program-name-track">
         <strong>Розгинання руки за головою сидячи з гумою</strong><strong aria-hidden="true">Розгинання руки за головою сидячи з гумою</strong>
        </span></span><a class="alternative-tech-link" href="#">Техніка</a>
       </div>
      </div>
      <div class="trainer-exercise-body">2 підходи × 12-15</div>
     </div>
    </div>
   </div>
  </section>
 </div>
</div>
<div class="trainer-client-actions-layer" style="position:fixed;inset:0;display:grid;place-items:center;z-index:20;">
 <div class="trainer-client-actions-pop">
  <div class="trainer-client-actions-head"><strong>Дії з клієнтом</strong><button type="button">✕</button></div>
  <button class="trainer-client-action neutral">Заморозити клієнта</button>
  <button class="trainer-client-action danger">Видалити клієнта</button>
 </div>
</div>
</body></html>`;

const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try {
 for (const width of [320,375,390]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:2});
  await page.setContent(html);
  for(const filename of cssFiles){
   await page.addStyleTag({content:fs.readFileSync(path.join(root,filename),'utf8')});
  }
  const style=async(selector,key)=>page.locator(selector).first().evaluate((el,k)=>getComputedStyle(el)[k],key);
  const check=async(selector,key,want)=>assert.equal(await style(selector,key),want,`${width}px ${selector} ${key}`);
  await check('.trainer-extra-manager-empty>span','backgroundColor',rgb(41,61,88));
  await check('.trainer-extra-manager-empty strong','color',rgb(243,244,246));
  await check('.trainer-superset-head>span:first-child','color',rgb(166,203,255));
  await check('.trainer-client-actions-head','backgroundColor','rgba(0, 0, 0, 0)');
  await check('.trainer-client-actions-head>strong','color',rgb(243,244,246));
  await check('.trainer-client-actions-head>button','backgroundColor',rgb(48,52,61));
  await check('.trainer-client-actions-pop .trainer-client-action.danger','backgroundColor',rgb(57,39,46));
  await check('.trainer-program-name-track','animationName','none');
  await check('.trainer-program-name-track>strong[aria-hidden="true"]','display','none');
  await check('.trainer-program-name-track>strong','whiteSpace','normal');
  const placement=await page.evaluate(()=>{
    const heads=[...document.querySelectorAll('.trainer-exercise-head')];
    return heads.map(head=>{
      const title=head.querySelector('.trainer-program-title-line');
      const track=head.querySelector('.trainer-program-name-track');
      const actions=head.querySelector('.trainer-exercise-head-actions');
      const tech=head.querySelector('.alternative-tech-link');
      const hr=head.getBoundingClientRect(), tr=title.getBoundingClientRect(),te=tech?.getBoundingClientRect();
      const ar=actions?.getBoundingClientRect();
      return {
        name:track?.innerText,headHeight:hr.height,
        overflow:title.scrollWidth>title.clientWidth+1||head.scrollWidth>head.clientWidth+1,
        inside:tr.left>=hr.left-1&&tr.right<=hr.right+1,
        actionsSeparate:!ar||tr.right<=ar.left+1,
        techInside:!te||(te.left>=tr.left-1&&te.right<=tr.right+1)
      };
    });
  });
  for(const card of placement){
   assert.ok(card.headHeight>=58,`undersized header at ${width}: ${JSON.stringify(card)}`);
   assert.equal(card.overflow,false,`overflow at ${width}: ${JSON.stringify(card)}`);
   assert.equal(card.inside,true,`title outside header at ${width}`);
   assert.equal(card.actionsSeparate,true,`controls overlap title at ${width}`);
   assert.equal(card.techInside,true,`tech link outside title at ${width}`);
  }
  // An existing light-mode marquee remains as it was before v5.
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
  await check('.trainer-extra-manager-empty>span','backgroundColor',rgb(237,245,255));
  await check('.trainer-client-actions-head>button','backgroundColor',rgb(240,244,249));
  assert.notEqual(await style('.trainer-program-name-track','animationName'),'none');
  await page.close();
 }
 console.log('PASS: mobile trainer dark v5 — graphite extras, readable titles and client action modal, 320/375/390px');
} finally {
 await browser.close();
}
