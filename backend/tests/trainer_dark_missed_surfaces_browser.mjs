// Regression: exercise picker, trainer nutrition KPI and review cards.
// This browser test is read-only and uses the same CSS order as the live app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const sheets=['base.css','components.css','refinements.css','redesign.css','theme.css','trainer-avatars.css','trainer-dark.css'];
const markup=[
'<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
'<body class="eplan-redesign trainer-ui" data-eplan-theme="dark"><div class="wrap trainer-shell">',
'<div class="trainer-library-page"><div class="trainer-library-admin"><div class="trainer-library-admin-body">',
'<div class="trainer-library-admin-section"><div class="trainer-library-admin-form"><input placeholder="Назва групи"></div></div>',
'</div></div><div class="trainer-library-group"><div class="library-group-body"><div class="trainer-library-add">',
'<div class="trainer-library-input-stack"><input placeholder="Назва вправи"><input placeholder="Посилання на відео"></div>',
'<div class="library-muscle-picker"><div><strong>Основні м’язи</strong><div class="library-check-grid">',
'<label><input type="checkbox"><span>Біцепс</span></label>',
'<label><input type="checkbox" checked><span>Квадрицепс</span></label></div></div>',
'<div><strong>Додаткові м’язи</strong><div class="library-check-grid">',
'<label><input type="checkbox"><span>Трицепс</span></label></div></div></div>',
'<div class="trainer-library-add-actions"><button>Додати вправу</button></div>',
'</div></div></div></div>',
'<div class="trainer-nutrition-page"><div class="trainer-nutrition-summary">',
'<div><span class="trainer-stat-icon green">♧</span><strong>3</strong><small>з цілями харчування</small></div>',
'<div><span class="trainer-stat-icon orange">!</span><strong>3</strong><small>потребують уваги</small></div>',
'<div><span class="trainer-stat-icon blue">▣</span><strong>1/7</strong><small>середнє заповнення</small></div>',
'</div></div>',
'<section id="trainerPendingReviewQueue" class="trainer-review-queue">',
'<div class="trainer-review-queue-head"><div><h2>Тренування до перевірки</h2></div><span>2</span></div>',
'<div class="trainer-review-list"><div class="trainer-review-card">',
'<button class="trainer-review-toggle"><span class="trainer-review-main"><small>2026-10-14</small><strong>День 6</strong></span>',
'<span class="trainer-review-duration">1 год 20 хв</span><span class="trainer-review-badge">До перевірки</span>',
'<b class="trainer-review-arrow">⌄</b></button>',
'<div class="trainer-review-detail"><div class="trainer-review-exercise">',
'<div class="trainer-review-exercise-head"><strong>Присідання з резинкою</strong><span>2 підходи</span></div>',
'<div class="trainer-review-sets"><div><small>Підхід 1</small><b>30 сек</b><em>план 30 сек</em></div></div>',
'</div><label class="trainer-review-comment"><span>Коментар клієнту</span>',
'<textarea placeholder="Наступного разу..."></textarea></label>',
'<div class="trainer-review-actions"><button>Надіслати та перевірити</button><button class="dark">Без коментаря</button></div>',
'</div></div></div></section></div></body></html>'
].join('');
const rgb=(r,g,b)=>'rgb('+r+', '+g+', '+b+')';
const browser=await chromium.launch({headless:true});
try {
 for(const width of [320,390,430]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.setContent(markup);
  for(const name of sheets)await page.addStyleTag({content:fs.readFileSync(path.join(root,'css',name),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}'});
  const color=(selector,prop='backgroundColor')=>page.locator(selector).first().evaluate((el,key)=>getComputedStyle(el)[key],prop);
  const eq=async(selector,expected,prop='backgroundColor')=>
    assert.equal(await color(selector,prop),expected,width+'px '+selector+' '+prop);
  const clear='rgba(0, 0, 0, 0)';
  await eq('.trainer-library-admin-form',clear);
  await eq('.trainer-library-input-stack',clear);
  await eq('.trainer-library-input-stack input',rgb(40,43,49));
  await eq('.library-muscle-picker>div',rgb(43,48,57));
  await eq('.library-muscle-picker>div>strong',rgb(232,237,245),'color');
  await eq('.library-check-grid label',rgb(52,58,69));
  await eq('.library-check-grid label:has(input:checked)',rgb(41,62,88));
  await eq('.trainer-nutrition-summary .trainer-stat-icon.green',rgb(35,61,49));
  await eq('.trainer-nutrition-summary .trainer-stat-icon.orange',rgb(70,54,38));
  await eq('.trainer-nutrition-summary .trainer-stat-icon.blue',rgb(41,61,90));
  await eq('.trainer-review-card',rgb(28,30,35));
  await eq('.trainer-review-toggle',rgb(39,43,51));
  await eq('.trainer-review-main strong',rgb(241,243,247),'color');
  await eq('.trainer-review-duration',rgb(51,60,73));
  await eq('.trainer-review-detail',rgb(36,40,48));
  await eq('.trainer-review-comment textarea',rgb(40,43,49));
  await eq('.trainer-review-actions',clear);
  await eq('.trainer-review-actions button',rgb(41,70,105));
  await eq('.trainer-review-actions button.dark',rgb(51,57,67));
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
  await eq('.library-muscle-picker>div',rgb(255,255,255));
  await eq('.library-check-grid label',rgb(255,255,255));
  await eq('.trainer-review-card',rgb(255,255,255));
  await eq('.trainer-review-toggle',rgb(255,255,255));
  await eq('.trainer-review-actions button',rgb(237,244,255));
  await page.close();
 }
 console.log('PASS: trainer dark v15 library, nutrition, review + light isolation');
} finally {await browser.close();}
