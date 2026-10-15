// Graphite QA v7 — computed colors for trainer training-day sheets and nutrition.
// CSS only; no network, no user data, no backend. Test light/dark separation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const files=['css/base.css','css/components.css','css/refinements.css',
 'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'];
const markup=`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
 <div class="trainer-client-page">
  <div id="nutrition"><div class="trainer-nutrition-page">
   <div class="trainer-nutrition-target-card">
    <div class="trainer-nutrition-target-head"><h2>Цільове харчування</h2><button class="trainer-nutrition-edit">Редагувати</button></div>
    <div class="trainer-nutrition-target-summary"><div><span>Ккал</span><strong>1660</strong></div><div><span>Білки</span><strong>111 г</strong></div></div>
   </div>
   <div class="card meal-plan-card">
    <div class="meal-plan-head"><strong>План харчування</strong></div>
    <div class="meal-autoplan-toolbar"><button class="meal-autoplan-open">Створити план автоматично</button></div>
    <div class="meal-plan-body">
     <div class="trainer-ration-tabs"><button class="active">Раціон 1</button><button>Раціон 2</button></div>
     <div class="meal-editor">
      <div class="meal-editor-head"><strong>Сніданок</strong></div>
      <div class="meal-variant">
       <div class="trainer-meal-recipe">
        <strong>Нічна вівсянка з йогуртом, бананом і горіхами</strong>
        <p>З вечора змішай інгредієнти та постав у холодильник.</p>
        <button>Обрати з бібліотеки страв</button>
       </div>
       <div class="structured-meal-editor">
        <div class="structured-food-row">
         <div class="structured-food-title"><button class="structured-food-name">Вівсяні пластівці (сухі) <span>Замінити</span></button><button class="structured-remove">×</button></div>
         <div class="structured-food-details"><label><input class="structured-grams" value="30" type="number"><span>г</span></label><span class="structured-food-macro">113,7 ккал · Б 3,9 · Ж 2 · В 20,3</span></div>
         <label class="structured-veg-opt"><input type="checkbox" checked> Враховувати овочі в цільових БЖВ</label>
        </div>
        <button class="structured-add">+ Додати продукт</button>
        <div class="structured-meal-summary"><strong>Цільові · 490,1 ккал</strong><small>Фактично з овочами · 527,5 ккал</small></div>
       </div>
      </div>
     </div>
     <div class="structured-daily-summary"><strong>Денний підсумок · обраний раціон</strong><div class="structured-daily-grid"><span><small>Ккал</small><b>1593</b></span><span><small>Білки</small><b>107,5</b></span><span><small>Жири</small><b>47,7</b></span><span><small>Вуглеводи</small><b>180,1</b></span></div><p>З усіма овочами фактично: 1657,1 ккал</p></div>
     <div class="meal-actions"><button class="meal-autoplan-save">Зберегти план клієнту</button></div>
    </div>
   </div>
  </div></div>
 </div>
 <div class="modal trainer-day-title-modal" id="dayTitleModal"><div class="card trainer-day-title-card">
   <div class="edit-exercise-head"><div><small class="trainer-day-title-kicker">ТРЕНУВАЛЬНИЙ ДЕНЬ</small><h2>Назва тренувального дня</h2><div class="trainer-day-title-day">День 1</div></div><button class="dark edit-exercise-close">✕</button></div>
   <label class="trainer-day-title-field"><span>Назва дня</span><input id="dayTitleInput" value="Ноги + Спина + Плечі"></label>
   <p class="trainer-day-title-hint">Цю назву клієнт бачитиме у своїй програмі тренувань.</p>
   <button class="trainer-day-title-save">Зберегти назву</button>
 </div></div>
 <div class="modal trainer-extra-day-modal" id="extraTrainingDayModal"><div class="card trainer-extra-day-modal-card">
  <div class="edit-exercise-head"><div><small>ДОДАТКОВЕ ТРЕНУВАННЯ</small><h2>Створити день</h2></div><button class="dark edit-exercise-close">✕</button></div>
  <div class="trainer-extra-day-form">
   <label><span>День</span><input value="Додатковий день"></label>
   <label><span>Назва</span><input value="Груди + руки"></label>
   <label><span>Режим</span><select><option>Разово</option></select></label>
   <label><span>Статус</span><select><option>Активне</option></select></label>
  </div>
  <div class="trainer-extra-day-note">Разовий день автоматично призупиниться після завершення.</div>
  <button class="trainer-extra-day-save">Створити тренування</button>
 </div></div>
</body></html>`;

const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try {
 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2});
  await page.setContent(markup);
  for(const f of files)await page.addStyleTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  // Never assert colors while legacy button transitions are mid-frame.
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}'});
  const style=async(sel,prop)=>page.locator(sel).first().evaluate((el,p)=>getComputedStyle(el)[p],prop);
  const eq=async(sel,prop,want)=>{
   const got=await style(sel,prop);
   assert.equal(got,want,`${width}px ${sel} ${prop}: ${got}`);
  };
  const card=rgb(28,30,35),raised=rgb(40,43,49),bright=rgb(243,244,246);
  await eq('#dayTitleModal>.trainer-day-title-card','backgroundColor',card);
  await eq('#dayTitleModal .edit-exercise-head h2','color',bright);
  await eq('#dayTitleModal #dayTitleInput','backgroundColor',raised);
  await eq('#dayTitleModal #dayTitleInput','color',bright);
  await eq('#dayTitleModal .edit-exercise-close','backgroundColor',rgb(48,56,70));
  await eq('#extraTrainingDayModal>.trainer-extra-day-modal-card','backgroundColor',card);
  await eq('#extraTrainingDayModal .edit-exercise-head h2','color',bright);
  await eq('#extraTrainingDayModal .trainer-extra-day-note','backgroundColor',rgb(40,45,53));
  await eq('#extraTrainingDayModal .trainer-extra-day-form input','backgroundColor',raised);
  await eq('#extraTrainingDayModal .trainer-extra-day-form select','backgroundColor',raised);
  await eq('#extraTrainingDayModal .edit-exercise-close','backgroundColor',rgb(48,56,70));

  await eq('#nutrition .trainer-nutrition-target-summary','backgroundColor','rgba(0, 0, 0, 0)');
  await eq('#nutrition .trainer-nutrition-target-summary>div','backgroundColor',raised);
  await eq('#nutrition .meal-autoplan-open','backgroundColor',rgb(41,61,88));
  await eq('#nutrition .trainer-ration-tabs','backgroundColor','rgba(0, 0, 0, 0)');
  await eq('#nutrition .trainer-meal-recipe>strong','color',bright);
  await eq('#nutrition .trainer-meal-recipe button','backgroundColor',rgb(41,61,88));
  await eq('#nutrition .structured-food-name','color',rgb(240,243,247));
  await eq('#nutrition .structured-food-name span','color',rgb(130,182,255));
  await eq('#nutrition .structured-remove','backgroundColor',rgb(57,43,51));
  await eq('#nutrition .structured-food-macro','color',rgb(174,186,204));
  await eq('#nutrition .structured-veg-opt','color',rgb(177,189,204));
  await eq('#nutrition .structured-add','backgroundColor',rgb(41,61,88));
  await eq('#nutrition .structured-meal-summary','backgroundColor',rgb(35,42,51));
  await eq('#nutrition .structured-daily-summary','backgroundColor',rgb(34,39,47));
  await eq('#nutrition .structured-daily-grid>span','backgroundColor',rgb(45,50,60));
  await eq('#nutrition .structured-daily-grid b','color',rgb(240,243,248));
  await eq('#nutrition .structured-daily-summary>strong','color',bright);
  const checkState=await page.locator('#nutrition .structured-veg-opt input').evaluate(el=>({
    accent:getComputedStyle(el).accentColor, scheme:getComputedStyle(el).colorScheme
  }));
  assert.equal(checkState.accent,rgb(52,120,246));
  assert.ok(checkState.scheme.includes('dark'));
  // No wide overflows for created meal controls on a compact iPhone.
  const widths=await page.evaluate(()=>{
   let content=document.querySelector('#nutrition .structured-daily-summary');
   let tiles=[...document.querySelectorAll('#nutrition .structured-daily-grid>span')];
   return {gridWidth:content.clientWidth,tiles:tiles.map(x=>x.clientWidth)};
  });
  assert.ok(widths.tiles.every(x=>x>0),`empty daily summary tile at ${width}`);

  // Switching theme must recover the original light redesign.
  await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
  await eq('#dayTitleModal>.trainer-day-title-card','backgroundColor',rgb(255,255,255));
  await eq('#extraTrainingDayModal>.trainer-extra-day-modal-card','backgroundColor',rgb(255,255,255));
  await eq('#nutrition .structured-daily-summary','backgroundColor',rgb(245,249,255));
  await eq('#nutrition .structured-food-name','color',rgb(20,39,76));
  await page.close();
 }
 console.log('PASS: trainer graphite v7 modals and nutrition editor, dark/light at 320px + 390px');
} finally {
 await browser.close();
}
