// Client graphite inner-panel polish: avoid blue popups and rectangular fills.
// Synthetic DOM reflects actual client modal class and ID contracts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const styles=['base.css','components.css','refinements.css','redesign.css','theme.css',
 'trainer-avatars.css','trainer-dark.css','trainer-program-overview.css','trainer-nav-parity.css',
 'client-graphite.css','client-graphite-polish.css','client-graphite-deep-qa.css'].map(n=>'css/'+n);
const markup=`<div id="app"><div class="redesign-training-page"><div class="redesign-training-day is-next">
 <div class="redesign-training-day-body"><div class="redesign-training-superset">
 <div class="redesign-training-superset-label"><span>СУПЕРСЕТ</span><small>Відпочинок 2 хв</small></div>
 <div class="redesign-training-exercise"><span>1</span><strong>Тяга</strong></div>
 <div class="redesign-training-exercise"><span>2</span><strong>Жим</strong></div></div></div></div></div></div>
 <div id="weeklyCheckinModal" class="modal"><div class="card weekly-checkin-modal">
  <label class="weekly-checkin-comment">Коментар<textarea placeholder="Що було добре?"></textarea></label></div></div>
 <div id="completedWorkoutEditModal" class="modal completed-workout-edit-modal">
  <div class="card completed-workout-edit-card"><div class="completed-workout-edit-exercise">
   <div class="completed-workout-edit-aux-section">Розминка</div>
   <div class="completed-workout-edit-sets">
    <div class="completed-workout-edit-set-group">
      <div class="completed-workout-edit-set"><span>1</span><input value="10"></div>
      <div class="completed-workout-edit-drop-holder"><div class="completed-workout-edit-aux-row">
       <input value="5"></div></div>
    </div><div class="completed-workout-edit-set-group"><div class="completed-workout-edit-set">2</div></div>
   </div></div></div></div>
 <div id="foodSearchModal" class="modal"><div class="card food-lookup-modal">
  <div class="between"><h2>Пошук продуктів</h2><button class="dark" id="foodSearchClose">×</button></div>
  <div class="food-custom-actions"><button>Мої продукти</button></div>
  <input placeholder="Молоко"><div class="food-lookup-row"><strong>Молоко</strong><small>Молочне</small></div>
  <div class="food-lookup-portion"><label>Грами<select><option>100</option></select></label>
   <div class="food-lookup-macros"><span><b>100</b><small>ккал</small></span></div></div></div></div>
 <div id="myProductModal" class="modal"><div class="card my-foods-panel">
  <div class="between"><h2>Свій продукт</h2><button class="dark">×</button></div>
  <label>Назва<input placeholder="Домашній сир"></label>
  <div class="my-food-extra"><span>Додатково</span><small>Цукри, г</small></div>
  <label class="my-food-review"><input type="checkbox">Запропонувати</label>
  <button class="my-food-primary">Зберегти</button>
 </div></div>
 <div id="myFoodsModal" class="modal"><div class="card my-foods-panel">
  <div class="between"><h2>Мої продукти</h2><button class="dark">×</button></div>
  <div class="my-food-row"><div><strong>Сир</strong><small>100 ккал</small></div>
    <div class="my-food-row-actions"><button>Додати</button></div></div>
 </div></div>
 <div id="myRecipesModal" class="modal"><div class="card my-foods-panel">
  <div class="between"><h2>Мої рецепти</h2><button class="dark">×</button></div>
  <p class="muted">Поки немає</p>
 </div></div>`;
const selectors={
 comment:'#weeklyCheckinModal .weekly-checkin-comment',
 textarea:'#weeklyCheckinModal .weekly-checkin-comment textarea',
 group:'#completedWorkoutEditModal .completed-workout-edit-set-group',
 set:'#completedWorkoutEditModal .completed-workout-edit-set',
 aux:'#completedWorkoutEditModal .completed-workout-edit-aux-row',
 superset:'#app .redesign-training-superset',
 supersetExercise:'#app .redesign-training-superset .redesign-training-exercise',
 food:'#foodSearchModal .food-lookup-modal',
 foodInput:'#foodSearchModal .food-lookup-modal input',
 foodRow:'#foodSearchModal .food-lookup-row',
 foodMacros:'#foodSearchModal .food-lookup-macros span',
 foodSecondary:'#foodSearchModal .food-custom-actions button',
 product:'#myProductModal .my-foods-panel',
 productInput:'#myProductModal .my-foods-panel input:not([type=checkbox])',
 productExtra:'#myProductModal .my-food-extra',
 productSave:'#myProductModal .my-food-primary',
 foods:'#myFoodsModal .my-foods-panel',
 recipes:'#myRecipesModal .my-foods-panel',
 recipeClose:'#myRecipesModal .between>button.dark'
};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430]){
  const page=await browser.newPage({viewport:{width,height:850}});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign client-ui" data-eplan-theme="light">'+markup+'</body></html>');
  for(const p of styles)await page.addStyleTag({content:fs.readFileSync(path.join(root,p),'utf8')});
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const inspect=()=>page.evaluate(sels=>Object.fromEntries(Object.entries(sels).map(([k,v])=>{
   let el=document.querySelector(v);if(!el)throw Error('missing selector '+v);
   let cs=getComputedStyle(el);return [k,{bg:cs.backgroundColor,border:cs.borderTopColor,radius:cs.borderTopLeftRadius,color:cs.color}];
  })),selectors);
  const baseLight=await inspect();
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'css/client-graphite-inner-panels.css'),'utf8')});
  assert.deepEqual(await inspect(),baseLight,'light theme changed at '+width);
  await page.locator('body').evaluate(e=>e.dataset.eplanTheme='dark');
  const dark=await inspect();
  const eq=(k,field,value)=>assert.equal(dark[k][field],value,`${k} ${field} at ${width}px`);
  eq('comment','bg','rgba(0, 0, 0, 0)');
  eq('textarea','bg','rgb(48, 53, 61)');
  eq('group','bg','rgba(0, 0, 0, 0)');
  eq('set','bg','rgba(0, 0, 0, 0)');
  eq('aux','bg','rgba(0, 0, 0, 0)');
  eq('superset','bg','rgb(41, 44, 50)');
  eq('superset','radius','18px');
  eq('supersetExercise','bg','rgb(34, 37, 43)');
  for(const k of ['food','product','foods','recipes'])eq(k,'bg','rgb(34, 37, 43)');
  for(const k of ['foodInput','productInput'])eq(k,'bg','rgb(48, 53, 61)');
  for(const k of ['foodRow','foodMacros','productExtra'])eq(k,'bg','rgb(44, 48, 56)');
  eq('foodSecondary','bg','rgb(52, 58, 67)');
  eq('recipeClose','bg','rgb(52, 58, 67)');
  eq('productSave','bg','rgb(49, 95, 157)');
  await page.close();
 }
 console.log('PASS: graphite popup and rectangular panel cleanup in both themes, 320/375/390/430px');
}finally{await browser.close()}
