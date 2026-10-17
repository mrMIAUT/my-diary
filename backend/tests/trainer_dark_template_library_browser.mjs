// Trainer dark v10 mobile QA — template editor, exercise library.
// Screenshot-driven computed style assertions in actual CSS load order.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const styles=['css/base.css','css/components.css','css/refinements.css',
  'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'];
const markup=`<!doctype html><html lang="uk"><head>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
<div class="trainer-library-page">
 <div class="trainer-library-summary">
  <div><strong>51</strong><small>ЄПЛАН</small></div>
  <div><strong>39</strong><small>моїх вправ</small></div>
  <div><strong>6</strong><small>груп</small></div>
 </div>
 <div class="trainer-library-tools">
  <div class="trainer-library-search"><input placeholder="Пошук вправи..."></div>
  <div class="trainer-library-filter-strip">
   <label class="trainer-library-filter-chip" style="position:relative!important;display:inline-flex!important;align-items:center!important;gap:5px!important;flex:0 0 auto!important;min-width:94px!important;max-width:178px!important;min-height:38px!important;padding:0 10px!important;margin:0!important;box-sizing:border-box!important;overflow:hidden!important;border-radius:999px!important;">
    <span>Групи</span><strong>Усі</strong><i>⌄</i><select><option>Усі</option></select>
   </label>
   <label class="trainer-library-filter-chip" style="position:relative!important;display:inline-flex!important;align-items:center!important;gap:5px!important;flex:0 0 auto!important;min-width:94px!important;max-width:178px!important;min-height:38px!important;padding:0 10px!important;margin:0!important;box-sizing:border-box!important;overflow:hidden!important;border-radius:999px!important;">
    <span>М’язи</span><strong>Усі</strong><i>⌄</i><select><option>Усі</option></select>
   </label>
  </div>
 </div>
 <div class="trainer-library-result-line">Знайдено <strong>90</strong></div>
 <div class="card trainer-library-group">
  <button class="exercise-toggle trainer-library-group-toggle redesign-library-group-head"><strong>Спина</strong>
    <span class="redesign-library-group-meta trainer-library-toggle-meta"><b>17</b><i class="arrow">⌄</i></span>
  </button>
  <div class="library-group-body" id="libGroup1">
   <div class="trainer-library-exercise-list">
    <div class="library-exercise trainer-library-exercise redesign-library-row">
     <div class="library-exercise-main"><div class="library-exercise-name-line"><strong>Горизонтальна важільна тяга</strong><span class="library-scope-badge platform">ЄПЛАН</span></div>
      <span class="library-muscles-empty">М’язи ще не призначені</span>
      <div class="trainer-library-video"><a class="redesign-library-video" href="#">Відео</a></div>
     </div>
     <div class="library-exercise-actions"><button class="library-icon-btn library-edit-btn">✎</button><button class="library-icon-btn library-delete-btn">×</button></div>
    </div>
   </div>
  </div>
 </div>
 <section class="card trainer-library-admin">
  <button class="exercise-toggle trainer-library-admin-toggle"><span><strong>Керування бібліотекою</strong></span></button>
  <div class="trainer-library-admin-body">
   <div class="trainer-library-admin-section">
    <div class="trainer-library-admin-section-head"><strong>Групи вправ</strong><small>Наприклад: Ноги, Груди, Спина</small></div>
    <div class="trainer-library-admin-form"><input placeholder="Назва групи"><button class="trainer-library-primary-btn">+ Додати групу</button></div>
   </div>
   <div class="trainer-library-admin-section">
    <div class="trainer-library-admin-section-head"><strong>Довідник м’язів</strong><small>Використовується для фільтрів та обсягу</small></div>
    <div class="trainer-library-admin-form"><input placeholder="Назва м’яза"><button class="trainer-library-primary-btn">+ Додати м’яз</button></div>
    <div class="library-muscle-admin-list">
     <div><span>Біцепс</span><button class="library-icon-btn library-delete-btn">×</button></div>
     <div><span>Задня дельта</span><button class="library-icon-btn library-delete-btn">×</button></div>
    </div>
   </div>
  </div>
 </section>
</div>
<div class="modal trainer-template-editor-modal" id="programTemplateEditorModal">
 <div class="card trainer-template-editor-card">
  <div class="trainer-template-editor-top"><div><small>ШАБЛОН ПРОГРАМИ</small><h2>Редагувати шаблон</h2><p>Зміни тут не вплинуть на програми, які вже призначені клієнтам.</p></div><button class="dark">×</button></div>
  <label class="trainer-program-rir-toggle"><span><strong>Відображати RIR</strong><small>Якщо вимкнено, поля RIR не показуються</small></span><input type="checkbox" checked></label>
  <div class="trainer-template-editor-meta"><label><span>Назва шаблону</span><input value="Денис Гулик"></label><label><span>Опис</span><textarea></textarea></label></div>
  <div class="trainer-template-editor-days">
   <section class="trainer-template-editor-day">
    <div class="trainer-template-editor-day-head"><div><small>День 3</small><input value="Ноги + Плечі + Руки"></div><div><button class="dark">↑</button><button class="dark">↓</button><button class="dark danger-soft">Видалити день</button></div></div>
    <div class="trainer-template-editor-items">
     <div class="trainer-template-editor-item">
      <div class="trainer-template-editor-item-head"><strong>Вправа 1</strong><div><button class="dark">↑</button><button class="dark">↓</button><button class="dark danger-soft">Видалити</button></div></div>
      <label class="trainer-template-editor-main-exercise"><span>Вправа</span><div class="trainer-program-exercise-field trainer-template-editor-exercise"><input value="Присідання зі штангою"><button>Обрати з бібліотеки</button></div></label>
      <div class="trainer-template-editor-grid"><label><span>Підходи</span><input value="3"></label><label><span>Повтори</span><input value="10-15"></label><label><span>RIR базовий</span><input value="2"></label><label><span>Відпочинок</span><input value="2"></label></div>
      <div class="trainer-template-alternatives"><div class="trainer-template-alternatives-head"><span>Альтернативи</span></div><div class="trainer-template-alternatives-empty">Альтернатив ще немає.</div></div>
     </div>
    </div>
   </section>
  </div>
  <div class="trainer-template-editor-actions"><button class="dark">Зберегти як новий</button><button class="trainer-template-primary">Зберегти зміни</button></div>
 </div>
</div>
</body></html>`;

const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2});
  await page.setContent(markup);
  for(const name of styles)await page.addStyleTag({content:fs.readFileSync(path.join(root,name),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}'});
  const val=(sel,prop)=>page.locator(sel).first().evaluate((el,p)=>getComputedStyle(el)[p],prop);
  const check=async(sel,prop,expected)=>assert.equal(await val(sel,prop),expected,`${width}px ${sel} ${prop}`);
  const clear='rgba(0, 0, 0, 0)',paper=rgb(29,32,37),raised=rgb(41,45,52),text=rgb(241,243,247);
  // Template editing: no strips behind the title or group labels.
  await check('#programTemplateEditorModal .trainer-template-editor-card','backgroundColor',paper);
  await check('#programTemplateEditorModal .trainer-template-editor-top','backgroundColor',clear);
  await check('#programTemplateEditorModal .trainer-template-editor-day','backgroundColor',raised);
  await check('#programTemplateEditorModal .trainer-template-editor-day-head','backgroundColor',clear);
  await check('#programTemplateEditorModal .trainer-template-editor-item','backgroundColor',raised);
  await check('#programTemplateEditorModal .trainer-template-editor-item-head','backgroundColor',clear);
  await check('#programTemplateEditorModal .trainer-template-editor-item-head>strong','color',text);
  await check('#programTemplateEditorModal .trainer-template-editor-grid','backgroundColor',clear);
  await check('#programTemplateEditorModal .trainer-template-editor-grid>label','backgroundColor',clear);
  await check('#programTemplateEditorModal .trainer-template-editor-exercise','backgroundColor',clear);
  await check('#programTemplateEditorModal .trainer-template-editor-grid input','backgroundColor',raised);
  await check('#programTemplateEditorModal .trainer-template-editor-exercise>button','backgroundColor',rgb(41,61,88));
  await check('#programTemplateEditorModal .trainer-template-editor-day-head button.danger-soft','backgroundColor',rgb(57,39,46));
  await check('#programTemplateEditorModal .trainer-template-editor-actions .trainer-template-primary','backgroundColor',rgb(52,120,246));

  // Screenshot regression: admin muscle rows and nested form are fully graphite.
  await check('.trainer-library-admin-body','backgroundColor',raised);
  await check('.trainer-library-admin-section-head strong','color',rgb(243,244,246));
  await check('.trainer-library-admin-section-head small','color',rgb(169,184,202));
  await check('.trainer-library-admin-form input','backgroundColor',rgb(40,43,49));
  await check('.library-muscle-admin-list>div','backgroundColor',raised);
  await check('.library-muscle-admin-list>div>span','color',rgb(243,244,246));
  await check('.library-muscle-admin-list .library-delete-btn','backgroundColor',rgb(57,39,46));
  // Light mode must continue to use the existing white rows.
  await page.evaluate(()=>document.body.dataset.eplanTheme='light');
  await check('.library-muscle-admin-list>div','backgroundColor',rgb(255,255,255));
  await page.evaluate(()=>document.body.dataset.eplanTheme='dark');
  // Library: strong counts, dark chips, neutral group, non-tiled video links.
  await check('.trainer-library-page .trainer-library-summary strong','color',rgb(240,243,248));
  await check('.trainer-library-page .trainer-library-summary>div','backgroundColor',paper);
  await check('.trainer-library-page .trainer-library-filter-chip','backgroundColor',raised);
  await check('.trainer-library-page .trainer-library-filter-chip>strong','color',rgb(240,243,248));
  await check('.trainer-library-page .trainer-library-filter-chip>select','colorScheme','dark');
  await check('.trainer-library-page .trainer-library-group-toggle','backgroundColor',rgb(40,48,58));
  await check('.trainer-library-page .trainer-library-toggle-meta','backgroundColor',clear);
  await check('.trainer-library-page .trainer-library-toggle-meta>b','backgroundColor',rgb(51,68,85));
  await check('.trainer-library-page .trainer-library-exercise','backgroundColor',paper);
  await check('.trainer-library-page .library-exercise-name-line>strong','color',text);
  await check('.trainer-library-page .library-scope-badge','backgroundColor',rgb(41,61,88));
  await check('.trainer-library-page .trainer-library-video','backgroundColor',clear);
  await check('.trainer-library-page .trainer-library-video .redesign-library-video','backgroundColor',clear);
  await check('.trainer-library-page .library-edit-btn','backgroundColor',rgb(48,56,70));
  await check('.trainer-library-page .library-delete-btn','backgroundColor',rgb(57,39,46));

  // Original light palette is restored immediately when the user changes theme.
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
  await check('.trainer-library-page .trainer-library-filter-chip','backgroundColor',rgb(255,255,255));
  await check('.trainer-library-page .trainer-library-summary strong','color',rgb(8,22,51));
  await check('.trainer-library-page .library-edit-btn','backgroundColor',rgb(242,246,251));
  await check('#programTemplateEditorModal .trainer-template-editor-day','backgroundColor',rgb(255,255,255));
  await check('#programTemplateEditorModal .trainer-template-editor-grid input','backgroundColor',rgb(247,249,252));
  await page.close();
 }
 console.log('PASS: trainer v10 template and library graphite/no stripes; light mode at 320px and 390px');
} finally{await browser.close();}
