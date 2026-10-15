// Mobile trainer graphite QA v8 — real computed colors for body-level sheets
// and accidental painted structural wrappers. Does not use an account or data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const styles=['css/base.css','css/components.css','css/refinements.css',
  'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'];
const html=`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
<div class="trainer-client-page">
  <section class="trainer-exercise-card">
    <div class="trainer-exercise-shell">
      <div class="trainer-exercise-head">
       <div class="trainer-program-title-line">
        <span class="trainer-program-name-marquee"><span class="trainer-program-name-track"><strong>Тяга резинки до поясу в нахилі</strong><strong aria-hidden="true">Тяга резинки до поясу в нахилі</strong></span></span>
        <a href="#" class="alternative-tech-link">Техніка</a>
       </div>
       <span class="trainer-exercise-head-actions trainer-superset-inline-move"><button class="dark">↑</button><button class="dark">↓</button></span>
      </div>
    </div>
  </section>
  <div id="nutrition"><div class="trainer-nutrition-page">
    <div class="card trainer-nutrition-target-card is-editing">
      <div class="trainer-nutrition-target-head"><h2>Цільове харчування</h2></div>
      <button class="nutrition-calc-button trainer-nutrition-calc-launch">Розрахувати калорії та БЖВ</button>
      <div class="trainer-nutrition-target-fields"><label><span>Ккал</span><input placeholder="Ккал"></label></div>
      <div class="trainer-nutrition-target-actions"><button>Зберегти харчування</button><button class="dark">Скасувати</button></div>
    </div>
    <div class="card meal-plan-card">
     <div class="meal-plan-body">
       <div class="trainer-saved-ration-page">
         <div class="nutrition-menu-day-intro"><span>Меню на день</span></div>
         <article class="trainer-assigned-meal nutrition-menu-meal nutrition-menu-meal-v2">
           <div class="nutrition-menu-v2-layout">
             <div class="nutrition-menu-v2-copy">
               <div class="nutrition-menu-v2-kicker"><span class="nutrition-menu-number">01</span><span class="trainer-assigned-meal-label">Сніданок</span></div>
               <h3 class="trainer-assigned-dish">Нічна вівсянка з йогуртом, бананом і горіхами</h3>
               <div class="trainer-assigned-ingredients"><div class="nutrition-menu-ingredient">Вівсяні пластівці</div></div>
             </div>
           </div>
         </article>
       </div>
     </div>
    </div>
  </div></div>
</div>
<div class="modal trainer-day-title-modal" id="dayTitleModal"><div class="card trainer-day-title-card">
  <div class="edit-exercise-head"><h2>Назва тренувального дня</h2></div>
  <label class="trainer-day-title-field"><span>Назва дня</span><input id="dayTitleInput" value="Ноги + Спина + Плечі"></label>
  <div class="trainer-day-title-hint">Цю назву клієнт бачитиме у своїй програмі тренувань.</div>
</div></div>
<div class="modal trainer-nutrition-calc-overlay" id="trainerNutritionCalcModal">
  <div class="card redesign-nutrition-modal nutrition-targets-modal nutrition-calculator-modal trainer-nutrition-calc-card">
    <div class="trainer-nutrition-calc-head"><div><h2>Розрахунок калорій і БЖВ</h2><p>Внеси дані клієнта.</p></div><button class="trainer-nutrition-calc-close">×</button></div>
    <div class="nutrition-calc-grid">
      <label><span>Стать</span><select required><option value="" disabled selected>Обрати</option><option>Жінка</option></select></label>
      <label><span>Вік</span><input placeholder="років"></label>
      <label><span>Зріст</span><input placeholder="см"></label>
      <label><span>Вага</span><input placeholder="кг"></label>
    </div>
    <div class="nutrition-calc-result"><strong class="nutrition-calc-kcal">1660 ккал</strong><div class="nutrition-calc-macros"><span>Б 111</span></div></div>
    <button class="trainer-nutrition-calc-submit">Розрахувати</button>
  </div>
</div>
<div class="modal" id="structuredFoodPicker"><div class="card structured-picker">
  <div class="structured-picker-head"><strong>Обрати продукт</strong><button id="structuredPickerClose">×</button></div>
  <input id="structuredFoodSearch" type="search" placeholder="Пошук за назвою продукту">
  <div id="structuredFoodMatches">
    <button><strong>Абрикос (сирий)</strong><small>48 ккал · Б 1,4 · Ж 0,4 · В 11,1 / 100 г</small></button>
    <button><strong>Ананас (сирий)</strong><small>50 ккал · Б 0,5 · Ж 0,1 · В 13,1 / 100 г</small></button>
  </div>
</div></div>
</body></html>`;

const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390]){
   const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2});
   await page.setContent(html);
   for(const s of styles)await page.addStyleTag({content:fs.readFileSync(path.join(root,s),'utf8')});
   await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}'});
   const prop=(q,p)=>page.locator(q).first().evaluate((el,p)=>getComputedStyle(el)[p],p);
   const check=async(q,p,expected)=>assert.equal(await prop(q,p),expected,`${width}px ${q} ${p}`);
   const card=rgb(28,30,35),raised=rgb(40,43,49),white=rgb(243,244,246),transparent='rgba(0, 0, 0, 0)';
   await check('#dayTitleModal .trainer-day-title-field','backgroundColor',transparent);
   await check('#dayTitleModal #dayTitleInput','backgroundColor',raised);
   await check('.trainer-exercise-head .trainer-exercise-head-actions','backgroundColor',transparent);
   await check('.trainer-exercise-head .trainer-program-title-line','backgroundColor',transparent);
   await check('.trainer-exercise-head .alternative-tech-link::before','display','none');
   await check('#nutrition .trainer-nutrition-target-actions','backgroundColor',transparent);
   await check('#nutrition .trainer-nutrition-target-actions button:not(.dark)','backgroundColor',rgb(52,120,246));
   await check('#nutrition .trainer-nutrition-target-actions button.dark','backgroundColor',rgb(48,56,70));
   await check('#nutrition .trainer-nutrition-calc-launch','backgroundColor',rgb(41,61,88));
   await check('#nutrition .trainer-saved-ration-page','backgroundColor',transparent);
   await check('#nutrition .trainer-assigned-dish','backgroundColor',transparent);
   await check('#nutrition .trainer-assigned-dish','color',rgb(241,244,248));
   await check('#nutrition .trainer-assigned-ingredients','backgroundColor',transparent);

   await check('#trainerNutritionCalcModal .trainer-nutrition-calc-card','backgroundColor',card);
   await check('#trainerNutritionCalcModal .trainer-nutrition-calc-head','backgroundColor',card);
   await check('#trainerNutritionCalcModal .trainer-nutrition-calc-head h2','color',white);
   await check('#trainerNutritionCalcModal .nutrition-calc-grid input','backgroundColor',raised);
   await check('#trainerNutritionCalcModal .nutrition-calc-grid select','backgroundColor',raised);
   await check('#trainerNutritionCalcModal .nutrition-calc-grid input','color',white);
   await check('#trainerNutritionCalcModal .trainer-nutrition-calc-close','backgroundColor',rgb(48,56,70));
   await check('#trainerNutritionCalcModal .nutrition-calc-result','backgroundColor',rgb(36,43,52));
   await check('#structuredFoodPicker .structured-picker','backgroundColor',card);
   await check('#structuredFoodPicker .structured-picker-head strong','color',white);
   await check('#structuredFoodPicker #structuredFoodSearch','backgroundColor',raised);
   await check('#structuredFoodPicker #structuredFoodMatches button','backgroundColor',raised);
   await check('#structuredFoodPicker #structuredFoodMatches button strong','color',rgb(240,243,247));
   await check('#structuredFoodPicker #structuredFoodMatches button small','color',rgb(171,185,204));
   const overflow=await page.locator('#structuredFoodPicker .structured-picker').evaluate(el=>({
      right:el.getBoundingClientRect().right, left:el.getBoundingClientRect().left
   }));
   assert.ok(overflow.left>=-1 && overflow.right<=width+1,`picker overflow ${width}:${JSON.stringify(overflow)}`);
   // Light theme retains the previous white modal and light action backgrounds.
   await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
   await check('#trainerNutritionCalcModal .trainer-nutrition-calc-card','backgroundColor',rgb(255,255,255));
   await check('#structuredFoodPicker .structured-picker','backgroundColor',rgb(255,255,255));
   await check('#nutrition .trainer-nutrition-target-actions button:not(.dark)','backgroundColor',rgb(237,244,255));
   await page.close();
 }
 console.log('PASS trainer dark v8: sheets, structural bands, calculator & product picker at 320/390px; light isolation');
}finally{await browser.close();}
