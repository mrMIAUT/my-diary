// v6 iPhone visual regressions: trainer exercise fields/modal/measurements.
// Static isolated markup and actual stylesheet order: no accounts, API or DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const cssFiles=['css/base.css','css/components.css','css/refinements.css',
  'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'];
const html=`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
<div class="trainer-client-page">
 <div id="program"><section class="card trainer-program-editor">
  <div class="trainer-program-editor-head"><h2>Програма тренувань</h2></div>
  <div class="trainer-program-editor-grid">
    <label class="wide"><span>День</span><input placeholder="Напр. День 1"></label>
    <label class="wide"><span>Назва дня</span><input placeholder="Ноги + руки"></label>
    <label class="wide"><span>Вправа</span><div class="trainer-program-exercise-field">
      <input placeholder="Оберіть або введіть вправу"><button type="button">Обрати з бібліотеки</button>
    </div></label>
    <label class="wide"><span>Техніка</span><input placeholder="https://"></label>
  </div>
 </section></div>
 <div class="card trainer-checkin-history"><div class="trainer-checkin-history-head"><div><h2>Історія щотижневих звітів</h2></div><span>0</span></div></div>
 <section class="trainer-measurements-page">
  <div class="measurement-visual-overview">
    <div class="measurement-weight-visual">
      <div class="measurement-place-top">
        <span class="measurement-generated-art sex-female metric-art-weight" style="--mx:0%;--my:0%" aria-hidden="true"></span><span>Вага</span>
      </div>
      <div><strong>55.6 <small>кг</small></strong><em>Без порівняння</em></div>
    </div>
    <div class="measurement-place-card">
      <div class="measurement-place-top"><span class="measurement-generated-art sex-female metric-art-arms" style="--mx:0%;--my:0%" aria-hidden="true"></span><span>Руки</span></div>
      <div class="measurement-side-values"><span><small>Права</small><b>24 см</b></span><span><small>Ліва</small><b>24 см</b></span></div>
    </div>
  </div>
  <div class="card measurement-history-calendar-card is-open">
   <button class="measurement-history-calendar-toggle" type="button"><span><strong>Історія замірів</strong><small>1 запис</small></span><b>⌄</b></button>
   <div class="measurement-history-calendar-body">
     <div class="measurement-calendar-head"><button type="button">‹</button><strong>Жовтень 2026 р.</strong><button type="button">›</button></div>
     <div class="measurement-calendar-weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Нд</span></div>
     <div class="measurement-calendar-grid">
       <button class="measurement-calendar-day">12</button><button class="measurement-calendar-day has-data active">13</button><button class="measurement-calendar-day">14</button>
     </div>
     <div class="measurement-calendar-hint">Обери дату із замірами, щоб переглянути запис.</div>
   </div>
  </div>
 </section>
</div>
<div class="modal" id="editExerciseModal"><div class="card edit-exercise-card">
 <div class="edit-exercise-head"><h2>Редагувати вправу</h2><button class="dark edit-exercise-close">✕</button></div>
 <div class="grid"><input id="editDay" value="День 1"><div class="trainer-program-exercise-field"><input id="editName" value="Присідання з резинкою"><button>Обрати з бібліотеки</button></div>
 <input id="editTech" placeholder="Посилання на техніку">
 <label><span>Тип виконання</span><select id="editExecutionMode"><option>За часом</option></select></label>
 <input id="editRest" value="60">
 <label class="trainer-repeat-mode-field"><span>Як рахувати повтори</span><select><option>Звичайно</option></select></label>
 </div><button class="trainer-edit-exercise-primary">Зберегти зміни</button>
</div></div>
</body></html>`;

const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try {
 for (const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
  await page.setContent(html);
  for(const file of cssFiles)await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}'});
  const property=(sel,key)=>page.locator(sel).first().evaluate((el,key)=>getComputedStyle(el)[key],key);
  const check=async(sel,key,expected)=>{
    const got=await property(sel,key);
    assert.equal(got,expected,`${width}px ${sel} ${key}`);
  };
  const darkCard=rgb(28,30,35),raised=rgb(40,43,49),text=rgb(243,244,246);
  await check('.trainer-program-editor-grid','backgroundColor','rgba(0, 0, 0, 0)');
  await check('.trainer-program-editor-grid>label','backgroundColor','rgba(0, 0, 0, 0)');
  await check('.trainer-program-editor .trainer-program-exercise-field','backgroundColor','rgba(0, 0, 0, 0)');
  await check('#editExerciseModal>.edit-exercise-card','backgroundColor',darkCard);
  await check('#editExerciseModal .edit-exercise-head h2','color',text);
  await check('#editExerciseModal .edit-exercise-close','backgroundColor',rgb(48,56,70));
  await check('#editExerciseModal #editDay','backgroundColor',raised);
  await check('#editExerciseModal #editExecutionMode','backgroundColor',raised);
  await check('#editExerciseModal #editDay','color',text);
  await check('.measurement-weight-visual .measurement-place-top>span:not(.measurement-generated-art)','color',text);
  await check('.measurement-weight-visual strong','color',text);
  await check('.measurement-side-values>span','backgroundColor',rgb(42,46,55));
  await check('.measurement-side-values b','color',rgb(241,244,248));
  await check('.trainer-measurements-page .measurement-history-calendar-toggle','backgroundColor',darkCard);
  await check('.trainer-measurements-page .measurement-history-calendar-toggle strong','color',text);
  await check('.measurement-history-calendar-body','backgroundColor',darkCard);
  await check('.trainer-measurements-page .measurement-calendar-day','backgroundColor',raised);
  await check('.trainer-measurements-page .measurement-calendar-day.active','backgroundColor',rgb(52,120,246));
  await check('.measurement-calendar-head>button','backgroundColor',rgb(48,56,70));
  await check('.trainer-measurements-page .measurement-calendar-hint','backgroundColor',rgb(40,45,53));
  await check('.trainer-checkin-history-head>span','backgroundColor',rgb(42,62,88));
  const artwork=await page.locator('.measurement-place-card .measurement-generated-art').evaluate(el=>({
    filter:getComputedStyle(el).filter,blend:getComputedStyle(el).mixBlendMode,
    backdrop:getComputedStyle(el.parentElement,'::before').backgroundColor
  }));
  assert.ok(artwork.filter.includes('invert(1)'),`art filter missing ${JSON.stringify(artwork)}`);
  assert.equal(artwork.blend,'screen');
  assert.equal(artwork.backdrop,rgb(37,44,54));
  const widths=await page.evaluate(()=>{
    const editor=document.querySelector('.trainer-program-editor');
    const grid=document.querySelector('.trainer-program-editor-grid');
    const modal=document.querySelector('.edit-exercise-card');
    return {editor:editor.clientWidth,grid: grid.getBoundingClientRect().width,
      modal:modal.getBoundingClientRect().width};
  });
  assert.ok(widths.modal<=width,`modal overflows ${width}: ${JSON.stringify(widths)}`);

  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
  await check('#editExerciseModal>.edit-exercise-card','backgroundColor',rgb(255,255,255));
  await check('.measurement-history-calendar-toggle','backgroundColor',rgb(255,255,255));
  await check('.measurement-calendar-day','backgroundColor',rgb(247,249,252));
  await check('.measurement-side-values>span','backgroundColor',rgb(246,249,253));
  await page.close();
 }
 console.log('PASS: trainer dark v6 editor/modal and measured graphics/history, at 320px and 390px; light remains unchanged');
} finally {
 await browser.close();
}
