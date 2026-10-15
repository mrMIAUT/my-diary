// Trainer graphite dark theme — computed style regression in Chromium.
// No authentication, API, app state or database access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const cssFiles=['css/redesign.css','css/theme.css','css/trainer-dark.css'];
const markup=`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
<main class="trainer-home-page">
  <div class="trainer-home-stats"><button><span class="trainer-stat-icon orange">!</span></button><button><span class="trainer-stat-icon green">✓</span></button><button><span class="trainer-stat-icon blue">+</span></button></div>
  <div class="trainer-activity-card"><button class="trainer-activity-row"><span>Клієнт</span></button></div>
  <div class="trainer-client-list"><button class="trainer-client-row">Клієнт</button></div>
</main>
<main class="trainer-client-page">
  <section id="program">
    <label class="trainer-program-rir-toggle"><span><strong>Відображати RIR</strong><small>Для досвідчених клієнтів</small></span><input type="checkbox" checked></label>
    <div class="trainer-program-editor">
      <div class="trainer-program-editor-head"><h2>Програма тренувань</h2><p>Редактор</p></div>
      <div class="trainer-program-editor-grid"><label><span>Вправа</span><span class="trainer-program-exercise-field"><input placeholder="Вправа"><button type="button">Обрати з бібліотеки</button></span></label></div>
      <div class="trainer-program-alternatives-block">
        <div class="trainer-program-alternatives-title"><span>Альтернативи</span></div>
        <div class="trainer-program-alternative-card trainer-program-alternative-row"><div class="trainer-program-alternative-main"><input class="trainer-program-alternative-input"><button class="trainer-program-alternative-pick">Обрати з бібліотеки</button><button class="trainer-program-alternative-remove">✕</button></div><div class="trainer-program-alternative-params"><label><span>Підходи</span><input value="3"></label></div></div>
      </div>
      <div class="trainer-inline-superset-builder"><button class="trainer-inline-superset-toggle" type="button">+ Додати суперсет</button></div>
    </div>
    <article class="program-day-card">
      <div class="program-day-heading"><h2>День 1</h2></div>
      <div class="program-block trainer-exercise-card">
        <div class="trainer-exercise-shell">
          <div class="trainer-exercise-head"><div class="trainer-program-title-line"><strong>Присідання зі штангою</strong></div><div class="trainer-exercise-head-actions"><button>+</button></div></div>
          <div class="trainer-exercise-body">
            <div class="program-extra"><span class="badge">RIR 2/1/1</span></div>
            <div class="exercise-alternatives"><strong>Альтернативи</strong><span class="alternative-chip">Випади</span></div>
            <div class="inner-actions"><button class="dark">Редагувати</button><button class="danger">Видалити</button></div>
          </div>
        </div>
      </div>
    </article>
  </section>
</main>
</body></html>`;

const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await page.setContent(markup);
  for(const file of cssFiles)await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  const check=async(selector,property,expected)=>{
    const value=await page.locator(selector).first().evaluate((el,key)=>getComputedStyle(el)[key],property);
    assert.equal(value,expected,`${selector} ${property}`);
  };
  await check('.trainer-stat-icon.orange','backgroundColor',rgb(64,48,37));
  await check('.trainer-stat-icon.green','backgroundColor',rgb(33,59,45));
  await check('.trainer-stat-icon.blue','backgroundColor',rgb(38,58,86));
  await check('.trainer-home-page .trainer-activity-card','backgroundColor','rgba(0, 0, 0, 0)');
  await check('.trainer-home-page .trainer-activity-row','backgroundColor',rgb(28,30,35));
  await check('.trainer-program-rir-toggle','backgroundColor',rgb(28,30,35));
  await check('.trainer-program-rir-toggle strong','color',rgb(243,244,246));
  await check('.trainer-program-exercise-field>button','backgroundColor',rgb(41,61,88));
  await check('.trainer-program-alternatives-block','backgroundColor',rgb(34,39,46));
  await check('.trainer-program-alternative-card','backgroundColor',rgb(41,45,52));
  await check('.trainer-program-alternative-remove','backgroundColor',rgb(57,39,46));
  await check('.trainer-inline-superset-toggle','backgroundColor',rgb(41,56,71));
  await check('.trainer-exercise-head','backgroundColor',rgb(40,43,49));
  await check('.trainer-exercise-head .trainer-program-title-line>strong','color',rgb(243,244,246));
  await check('.trainer-exercise-body','backgroundColor',rgb(28,30,35));
  await check('.trainer-exercise-body .program-extra .badge','backgroundColor',rgb(44,51,61));
  await check('.trainer-exercise-body .inner-actions button.danger','backgroundColor',rgb(57,39,46));
  // The same selectors must retain their original light-mode backgrounds.
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
  await check('.trainer-program-rir-toggle','backgroundColor',rgb(246,249,253));
  await check('.trainer-exercise-head','backgroundColor',rgb(247,249,252));
  await check('.trainer-inline-superset-toggle','backgroundColor',rgb(244,248,255));
  console.log('PASS: trainer graphite dark surfaces, program editor contrast, and light-mode isolation');
} finally {
  await browser.close();
}
