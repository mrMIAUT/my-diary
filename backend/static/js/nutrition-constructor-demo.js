// Separate, interactive Є ПЛАН nutrition preview. No connection to customer APIs.
// The save action uses sessionStorage *on this test site only*.
let nutritionPlanDraft=[];
let demoSource=null;
let openMeals=new Set([1,2,3,4]);
const DEMO_STORAGE_KEY='eplan-nutrition-preview-v2';
window.currentClientData={client:{id:999,kcal:2380,protein:160,fat:60,carbs:300}};
const fmtDemo=v=>Number(v||0).toLocaleString('uk-UA',{maximumFractionDigits:1});
function demoCatalog(id){return (window.structuredCatalog||[]).find(x=>x.source_id===id)}
function rowKcal(row){
 const f=demoCatalog(row.source_id);if(!f)return 0;
 return Number(f.kcal_100||0)*Number(row.grams||0)/100*(row.count_in_targets===false?0:1);
}
function mealKcal(meal){return(meal?.foods||[]).reduce((n,r)=>n+rowKcal(r),0)}
function mealName(n){return ({1:'Сніданок',2:'Обід',3:'Перекус',4:'Вечеря',5:'Другий перекус'})[n]||'Прийом їжі '+n}
function mealSymbol(n){return ({1:'☀',2:'♧',3:'◇',4:'☽',5:'☆'})[n]||'◌'}
window.toggleMeal=function(n){
 if(openMeals.has(n))openMeals.delete(n);else openMeals.add(n);
 window.rerenderNutritionPlan();
};
window.addDemoVariant=function(n){
 const current=nutritionPlanDraft.filter(x=>x.meal_number===n);
 const v=Math.max(0,...current.map(x=>x.variant_number))+1;
 nutritionPlanDraft.push({meal_number:n,variant_number:v,sort:n*10+v,foods:[],content:''});
 openMeals.add(n);window.rerenderNutritionPlan();window.demoDraftChanged();
};
window.removeDemoVariant=function(n,v){
 if(nutritionPlanDraft.filter(x=>x.meal_number===n).length<=1)return;
 nutritionPlanDraft=nutritionPlanDraft.filter(x=>!(x.meal_number===n&&x.variant_number===v));
 window.rerenderNutritionPlan();window.demoDraftChanged();
};
window.rerenderNutritionPlan=function(){
 if(typeof window.renderStructuredMealHTML!=='function')return;
 const nums=[...new Set(nutritionPlanDraft.map(x=>x.meal_number))].sort((a,b)=>a-b);
 const host=document.getElementById('mealCards');
 if(!host)return;
 host.innerHTML=nums.map(n=>{
  const variants=nutritionPlanDraft.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number);
  const expanded=openMeals.has(n);
  return '<article class="meal-card" data-meal="'+n+'">'
   +'<button class="meal-head" type="button" onclick="toggleMeal('+n+')" aria-expanded="'+expanded+'">'
   +'<div class="meal-title"><span class="meal-symbol">'+mealSymbol(n)+'</span><span><strong>'+mealName(n)+'</strong><small>'+variants.length+' варіант(и)</small></span></div>'
   +'<span class="meal-actions"><span class="meal-chevron">'+(expanded?'⌃':'⌄')+'</span></span></button>'
   +(expanded?'<div class="meal-body">'+variants.map(x=>
     '<div class="variant-card"><div class="variant-title"><strong>Варіант '+x.variant_number+'</strong>'
     +'<span class="variant-macros" aria-label="Калорії та БЖВ цього варіанта">'+window.structuredVariantHeaderHTML(x)+'</span>'
     +(variants.length>1?'<button type="button" class="variant-delete" onclick="removeDemoVariant('+n+','+x.variant_number+')">Видалити</button>':'')+'</div>'
     +window.renderStructuredMealHTML(x)+'</div>'
    ).join('')
    +'<button type="button" class="add-variant" onclick="addDemoVariant('+n+')">＋ Додати варіант</button></div>':'')
   +'</article>';
 }).join('');
 const day=document.getElementById('dailySummary');
 if(day)day.innerHTML=window.structuredDailySummaryHTML();
};
function resetDraftData(){
 if(!demoSource)return;
 nutritionPlanDraft=demoSource.meals.map(x=>({
  meal_number:+x.meal_number,variant_number:+x.variant_number,sort:+x.sort,
  content:String(x.content||''),
  foods:(x.foods||[]).map(f=>({
   source_id:f.source_id,grams:Number(f.grams),count:f.count??null,
   count_in_targets:f.count_in_targets!==false
  }))
 }));
 openMeals=new Set([1,2,3,4,5]);
 window.rerenderNutritionPlan();
}
window.resetDemo=function(){
 if(!demoSource)return;
 if(document.getElementById('structuredFoodPicker')){
  document.getElementById('structuredPickerClose')?.click();
 }
 try{sessionStorage.removeItem(DEMO_STORAGE_KEY)}catch{}
 resetDraftData();
 setSaveStatus('Початковий раціон відновлено · тест без реальних клієнтів');
};
function setSaveStatus(text){
 const el=document.getElementById('saveDemoStatus');
 if(el)el.textContent=text;
}
window.demoDraftChanged=function(){
 setSaveStatus('Є незбережені зміни · це лише демоверсія');
};
window.saveDemo=function(){
 if(!demoSource)return;
 try{
  sessionStorage.setItem(DEMO_STORAGE_KEY,JSON.stringify(nutritionPlanDraft));
  setSaveStatus('Збережено для тестування в цьому браузері · клієнти не змінені');
 }catch{
  setSaveStatus('Браузер не дозволяє локальне збереження · зміни доступні до перезавантаження');
 }
};
async function bootDemo(){
 try{
  const [catalog,plan]=await Promise.all([
   fetch('/catalog.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('catalog');return r.json()}),
   fetch('/plan.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('plan');return r.json()})
  ]);
  if(!Array.isArray(catalog.items)||!catalog.items.length||!Array.isArray(plan.meals)||!plan.meals.length)
   throw Error('missing reviewed nutrition catalog');
  window.structuredCatalog=catalog.items;
  window.currentClientData={client:{id:999,kcal:plan.targets.kcal,protein:plan.targets.protein,
   fat:plan.targets.fat,carbs:plan.targets.carbs}};
  demoSource=plan;
  resetDraftData();
  try{
   const saved=sessionStorage.getItem(DEMO_STORAGE_KEY);
   if(saved){
    const parsed=JSON.parse(saved),ids=new Set(catalog.items.map(x=>x.source_id));
    if(Array.isArray(parsed)&&parsed.length&&parsed.every(item=>
      Array.isArray(item.foods)&&item.foods.every(row=>ids.has(row.source_id)&&Number(row.grams)>0))){
     nutritionPlanDraft=parsed;window.rerenderNutritionPlan();
     setSaveStatus('Відновлено збережену демоверсію · клієнти не змінені');
    }
   }
  }catch(e){console.warn('Stored preview skipped',e)}
 }catch(e){
  document.getElementById('mealCards').innerHTML='<div class="demo-banner">Не вдалося завантажити перевірені продукти. Онови сторінку.</div>';
  document.getElementById('dailySummary').innerHTML='';
  console.error('nutrition preview',e);
 }
}
bootDemo();
