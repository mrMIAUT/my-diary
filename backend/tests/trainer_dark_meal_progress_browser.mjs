// Trainer v11: dark assigned meal glyphs + progress metric/activity calendar.
// Computed style regression on iPhone widths, plus untouched light palette.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const styles=['css/base.css','css/components.css','css/refinements.css',
  'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'];
const markup=`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
<div class="trainer-client-page"><section id="nutrition">
  <div class="trainer-saved-plan">
    <article class="trainer-assigned-meal nutrition-menu-meal nutrition-menu-meal-v2">
      <div class="nutrition-menu-v2-layout">
       <div class="nutrition-menu-photo nutrition-meal-icon nutrition-meal-icon-breakfast"><svg viewBox="0 0 24 24"><path d="M10 2v2"/></svg></div>
       <div class="nutrition-menu-v2-copy"><h3>Сніданок</h3></div>
      </div>
    </article>
    <article class="trainer-assigned-meal nutrition-menu-meal nutrition-menu-meal-v2">
      <div class="nutrition-menu-v2-layout">
       <div class="nutrition-menu-photo nutrition-meal-icon nutrition-meal-icon-lunch"><svg viewBox="0 0 24 24"><path d="M10 2v2"/></svg></div>
       <div class="nutrition-menu-v2-copy"><h3>Обід</h3></div>
      </div>
    </article>
    <article class="trainer-assigned-meal nutrition-menu-meal nutrition-menu-meal-v2">
      <div class="nutrition-menu-v2-layout">
       <div class="nutrition-menu-photo nutrition-meal-icon nutrition-meal-icon-dinner"><svg viewBox="0 0 24 24"><path d="M10 2v2"/></svg></div>
       <div class="nutrition-menu-v2-copy"><h3>Вечеря</h3></div>
      </div>
    </article>
    <article class="trainer-assigned-meal nutrition-menu-meal nutrition-menu-meal-v2">
      <div class="nutrition-menu-v2-layout">
       <div class="nutrition-menu-photo nutrition-meal-icon nutrition-meal-icon-snack"><svg viewBox="0 0 24 24"><path d="M10 2v2"/></svg></div>
       <div class="nutrition-menu-v2-copy"><h3>Перекус</h3></div>
      </div>
    </article>
  </div>
 <div class="trainer-nutrition-target-summary">
  <div class="kcal"><span>Ккал</span><strong>1660</strong></div>
  <div class="protein"><span>Білки</span><strong>111 г</strong></div>
  <div class="fat"><span>Жири</span><strong>50 г</strong></div>
  <div class="carbs"><span>Вуглеводи</span><strong>192 г</strong></div>
 </div>
 <section class="trainer-actual-diary"><div class="trainer-actual-diary-date">
  <button type="button" aria-label="Попередній день">‹</button>
  <label><span>Дата</span><input type="date" value="2026-10-15"></label>
  <button type="button" aria-label="Наступний день" disabled>›</button>
 </div></section>
</section>
<section id="progress">
 <div class="trainer-progress-page">
  <div class="trainer-progress-summary">
   <div><span>Тренувань</span><strong>1</strong><small>за період</small></div>
   <div><span>Робочий обсяг</span><strong>192 кг</strong><small>вага × повтори</small></div>
   <div><span>PR вправ</span><strong>3</strong><small>особисті максимуми</small></div>
  </div>
  <section class="trainer-workout-calendar-card">
   <div class="trainer-workout-calendar-title"><h2>Календар тренувань</h2><span>1</span></div>
   <div class="trainer-workout-calendar-nav"><button>‹</button><strong>Жовтень 2026 р.</strong><button>›</button></div>
   <div class="trainer-workout-calendar-grid"><button class="trainer-workout-calendar-cell has-workout selected">15<i></i></button><button class="trainer-workout-calendar-cell">14</button></div>
   <section class="trainer-volume-panel">
    <div class="trainer-volume-head"><small>ТРЕНУВАЛЬНИЙ ОБСЯГ</small><h3>15 жовт.</h3></div>
    <div class="trainer-calendar-day-volume"><div><small>Обсяг</small><strong>192 кг</strong></div></div>
    <div class="trainer-volume-kpis"><div><span>Загальний обсяг</span><strong>192 кг</strong></div></div>
    <div class="trainer-volume-muscles-head"><span>Обсяг за м’язами</span></div>
    <div class="trainer-volume-muscles"><div class="trainer-volume-muscle-row"><div><span>Без групи</span><strong>192 кг</strong></div><i><b style="width:100%"></b></i></div><div class="trainer-progress-empty compact">Немає даних</div></div>
   </section>
   <div class="trainer-workout-calendar-comment"><small>Коментар тренера</small><p>Молодець!</p></div>
  </section>
  <section class="trainer-progress-section"><h3>Активність</h3>
    <div class="trainer-progress-activity-stats">
      <div><span>Середні кроки</span><strong>3 585</strong><small>1 дн. з даними</small></div>
      <div><span>Кардіо</span><strong>0 хв</strong><small>0 записів</small></div>
      <div><span>Остання активність</span><strong>15 жовт.</strong><small>3 585 кроків</small></div>
    </div>
    <div class="trainer-progress-activity-list"><div><span><strong>15 жовт.</strong><small>Кроки</small></span><b>3 585 кроків</b></div></div>
  </section>
  <section class="trainer-progress-section">
    <div class="trainer-progress-pr-grid"><div class="trainer-progress-pr-card"><span>PR</span><strong>Румунська тяга</strong><b>3.5 кг × 12</b><small>15 жовт.</small></div></div>
  </section>
 </div>
</section></div>
</body></html>`;
const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2});
  await page.setContent(markup);
  for(const p of styles)await page.addStyleTag({content:fs.readFileSync(path.join(root,p),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}'});
  const get=(selector,prop)=>page.locator(selector).first().evaluate((el,prop)=>getComputedStyle(el)[prop],prop);
  const check=async(sel,prop,want)=>assert.equal(await get(sel,prop),want,`${width}px ${sel} ${prop}`);
  await check('#nutrition .nutrition-meal-icon-breakfast','backgroundColor',rgb(35,57,81));
  await check('#nutrition .nutrition-meal-icon-lunch','backgroundColor',rgb(32,62,53));
  await check('#nutrition .nutrition-meal-icon-dinner','backgroundColor',rgb(64,51,40));
  await check('#nutrition .nutrition-meal-icon-snack','backgroundColor',rgb(51,45,70));
  await check('#nutrition .nutrition-meal-icon-breakfast','color',rgb(137,186,255));
  await check('#nutrition .nutrition-menu-v2-layout','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#progress .trainer-progress-summary','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#progress .trainer-progress-summary>div','backgroundColor',rgb(40,43,49));
  await check('#progress .trainer-progress-summary strong','color',rgb(240,243,248));
  await check('#progress .trainer-progress-activity-stats>div','backgroundColor',rgb(40,43,49));
  await check('#progress .trainer-progress-activity-stats strong','color',rgb(240,243,248));
  await check('#progress .trainer-progress-activity-list>div','backgroundColor',rgb(40,43,49));
  await check('#progress .trainer-progress-activity-list b','color',rgb(237,242,248));
  await check('#progress .trainer-progress-pr-grid','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#progress .trainer-progress-pr-card','backgroundColor',rgb(32,35,41));
  await check('#progress .trainer-progress-pr-card b','color',rgb(241,243,247));
  await check('#progress .trainer-workout-calendar-nav','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#progress .trainer-workout-calendar-nav>button','backgroundColor',rgb(48,56,70));
  await check('#progress .trainer-workout-calendar-title>span','backgroundColor',rgb(41,61,88));
  await check('#progress .trainer-volume-muscle-row>div','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#progress .trainer-volume-muscle-row strong','color',rgb(237,242,248));


  // Regression: v24 dark-mode follow-up to real trainer screenshots.
  await check('#nutrition .trainer-actual-diary-date>button','backgroundColor',rgb(43,59,77));
  const arrowWidths=await page.locator('#nutrition .trainer-actual-diary-date>button').evaluateAll(
    list=>list.map(el=>el.getBoundingClientRect().width));
  assert.ok(arrowWidths.every(w=>w===44),'Date arrows must remain 44px, without overlapping the input');
  await check('#progress .trainer-workout-calendar-cell.selected','backgroundColor',rgb(48,67,92));
  await check('#progress .trainer-volume-panel .trainer-progress-empty.compact','backgroundColor',rgb(40,45,53));
  await check('#progress .trainer-workout-calendar-comment p','color',rgb(237,248,241));
  await check('#progress .trainer-calendar-day-volume','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#progress .trainer-volume-kpis','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#nutrition .trainer-nutrition-target-summary .protein>span','color',rgb(165,205,255));
  await check('#nutrition .trainer-nutrition-target-summary .fat>span','color',rgb(243,201,140));
  await check('#nutrition .trainer-nutrition-target-summary .carbs>span','color',rgb(160,219,182));


  // Subtle iOS-like curved reflections: no translucent overlay on any text.
  const darkCardImage=await get('#progress .trainer-workout-calendar-card','backgroundImage');
  assert.ok(darkCardImage.includes('radial-gradient'),width+'px dark card needs a curved light edge');
  const darkCardShadow=await get('#progress .trainer-workout-calendar-card','boxShadow');
  assert.ok(darkCardShadow.includes('inset'),width+'px dark card needs an inner rim');
  await check('body','backgroundColor',rgb(0,0,0));

  // Light mode must remain the existing UI after switching the root flag.
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
  const lightCardImage=await get('#progress .trainer-workout-calendar-card','backgroundImage');
  assert.ok(!lightCardImage.includes('radial-gradient'),width+'px light trainer must not inherit dark glass sheen');
  await check('#progress .trainer-progress-summary>div','backgroundColor',rgb(255,255,255));
  await check('#progress .trainer-progress-summary strong','color',rgb(10,23,56));
  await check('#progress .trainer-progress-activity-stats>div','backgroundColor',rgb(255,255,255));
  await check('#progress .trainer-workout-calendar-nav>button','backgroundColor',rgb(245,248,252));

  await check('#nutrition .trainer-actual-diary-date>button','backgroundColor',rgb(231,238,248));
  await check('#progress .trainer-workout-calendar-cell.selected','backgroundColor',rgb(61,127,242));
  await check('#nutrition .trainer-nutrition-target-summary .protein>span','color',rgb(56,107,180));
  await check('#nutrition .trainer-nutrition-target-summary .fat>span','color',rgb(156,103,31));
  await check('#nutrition .trainer-nutrition-target-summary .carbs>span','color',rgb(46,128,80));

  assert.notEqual(await get('#nutrition .nutrition-meal-icon-breakfast','backgroundColor'),rgb(35,57,81),'Breakfast icon stayed dark in light mode');
  await page.close();
 }
 console.log('PASS: trainer v11 meal glyphs, activity metrics, PR, volume and light-mode isolation at 320/390px');
} finally{await browser.close();}
