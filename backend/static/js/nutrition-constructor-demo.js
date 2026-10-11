// Isolated demo of whole-day rations (one selected dish per meal) with macros.
// Only this browser's sessionStorage is used. Production and customers untouched.
let nutritionPlanDraft=[];
let rationPlans=[];
let activeRationId=1;
let demoSource=null;
let openMeals=new Set([1,2,3,4]);
const DEMO_STORAGE_KEY='eplan-nutrition-preview-rations-v1';
window.currentClientData={client:{id:999,kcal:2380,protein:160,fat:60,carbs:300}};
const fmtDemo=v=>Number(v||0).toLocaleString('uk-UA',{maximumFractionDigits:1});
const escapeDish=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const demoCatalog=id=>(window.structuredCatalog||[]).find(x=>x.source_id===id);
const deepClone=x=>JSON.parse(JSON.stringify(x));
const macroKeys=['kcal','protein','fat','carbs'];
function macroGoal(){const c=window.currentClientData.client;return macroKeys.map(k=>Number(c[k]||0))}
function rowMacros(row){
 const f=demoCatalog(row.source_id);
 return macroKeys.map((key,i)=>row.count_in_targets===false?0:Number(f?.[['kcal_100','protein_100','fat_100','carbs_100'][i]]||0)*Number(row.grams||0)/100);
}
function mealMacrosDemo(meal){
 const m=[0,0,0,0];
 for(const food of meal?.foods||[]){
  const values=rowMacros(food);for(let i=0;i<4;i++)m[i]+=values[i];
 }
 return m;
}
function totalsForRation(meals){
 const m=[0,0,0,0];
 for(const item of meals||[]){
  const vals=mealMacrosDemo(item);for(let i=0;i<4;i++)m[i]+=vals[i];
 }
 return m;
}
function macroDiff(meals){
 const actual=totalsForRation(meals),goal=macroGoal();
 return window.NutritionPortionFitter.assess(actual,goal);
}
function currentPlan(){return rationPlans.find(p=>p.id===activeRationId)}
function mealName(n){return ({1:'Сніданок',2:'Обід',3:'Перекус',4:'Вечеря',5:'Другий перекус'})[n]||'Прийом їжі '+n}
function mealSymbol(n){return ({1:'☀',2:'♧',3:'◇',4:'☽',5:'☆'})[n]||'◌'}
function plainMeal(raw){
 return {
  meal_number:+raw.meal_number,variant_number:1,sort:+raw.sort||0,
  content:String(raw.content||''),dish_title:String(raw.dish_title||'Власна страва'),
  preparation:String(raw.preparation||'Обери продукти та уточни спосіб приготування.'),
  recipe_id:raw.recipe_id||null,recipe_source_url:raw.recipe_source_url||null,
  recipe_source_name:raw.recipe_source_name||null,
  auto_fit:raw.auto_fit||null,edited:!!raw.edited,
  foods:(raw.foods||[]).map(f=>({
   source_id:f.source_id,grams:Number(f.grams),count:f.count??null,
   count_in_targets:f.count_in_targets!==false,usage_note:String(f.usage_note||''),
   portion_rules:f.portion_rules?{...f.portion_rules}:null
  }))
 };
}
function prepareRation(meals,id){
 return {id,name:'Раціон '+id,meals:meals.map(x=>plainMeal(x)).sort((a,b)=>a.meal_number-b.meal_number)};
}
function syncCurrent(){
 const chosen=currentPlan();
 if(chosen)nutritionPlanDraft=chosen.meals;
}
window.selectDemoRation=function(id){
 if(!rationPlans.some(p=>p.id===+id))return;
 activeRationId=+id;syncCurrent();openMeals=new Set([1,2,3,4,5]);
 window.rerenderNutritionPlan();
};
window.addDemoRation=function(){
 if(rationPlans.length>=7)return alert('У демоверсії можна створити до 7 раціонів.');
 const id=Math.max(0,...rationPlans.map(p=>p.id))+1;
 rationPlans.push(prepareRation(currentPlan()?.meals||[],id));
 window.selectDemoRation(id);window.demoDraftChanged();
};
window.removeDemoRation=function(){
 if(rationPlans.length<2)return;
 if(!confirm('Видалити поточний раціон лише з демоверсії?'))return;
 rationPlans=rationPlans.filter(p=>p.id!==activeRationId);
 window.selectDemoRation(rationPlans[0].id);window.demoDraftChanged();
};
window.toggleMeal=function(n){
 if(openMeals.has(n))openMeals.delete(n);else openMeals.add(n);
 window.rerenderNutritionPlan();
};
window.demoRecipeChanged=function(item){
 if(!item)return;
 item.edited=true;item.auto_fit=null;
 item.recipe_id=null;item.recipe_source_url=null;item.recipe_source_name=null;
 item.dish_title='Власна комбінація продуктів';
 item.preparation='Склад змінено. Перевір, як поєднати та приготувати продукти.';
};
function formatDelta(delta){
 const data=delta||{};
 return 'Ккал '+(data.kcal>0?'+':'')+fmtDemo(data.kcal||0)
  +' · Б '+(data.protein>0?'+':'')+fmtDemo(data.protein||0)
  +' · Ж '+(data.fat>0?'+':'')+fmtDemo(data.fat||0)
  +' · В '+(data.carbs>0?'+':'')+fmtDemo(data.carbs||0);
}
window.renderRationTabs=function(){
 const host=document.getElementById('rationTabs');if(!host)return;
 host.innerHTML='<div class="ration-tabs-scroll">'
  +rationPlans.map(p=>'<button type="button" data-ration="'+p.id+'" class="ration-tab '+(p.id===activeRationId?'active':'')+'" aria-pressed="'+(p.id===activeRationId)+'">'+escapeDish(p.name)+'</button>').join('')
  +'<button type="button" class="ration-tab ration-tab-add" id="addRation" '+(rationPlans.length>=7?'disabled':'')+'>＋ Раціон</button></div>'
  +(rationPlans.length>2?'<button type="button" class="ration-delete" id="deleteRation">Видалити цей раціон</button>':'');
 host.querySelectorAll('[data-ration]').forEach(button=>button.onclick=()=>window.selectDemoRation(button.dataset.ration));
 host.querySelector('#addRation').onclick=window.addDemoRation;
 if(host.querySelector('#deleteRation'))host.querySelector('#deleteRation').onclick=window.removeDemoRation;
};
window.rerenderNutritionPlan=function(){
 if(typeof window.renderStructuredMealHTML!=='function'||!currentPlan())return;
 window.renderRationTabs();
 const host=document.getElementById('mealCards');if(!host)return;
 host.innerHTML=nutritionPlanDraft.map(item=>{
  const n=item.meal_number,expanded=openMeals.has(n);
  const fit=item.auto_fit;
  return '<article class="meal-card" data-meal="'+n+'">'
   +'<button class="meal-head" type="button" onclick="toggleMeal('+n+')" aria-expanded="'+expanded+'">'
   +'<div class="meal-title"><span class="meal-symbol">'+mealSymbol(n)+'</span><span><strong>'+mealName(n)+'</strong><small>'+escapeDish(item.dish_title||'Обери страву')+'</small></span></div>'
   +'<span class="meal-actions"><span class="meal-chevron">'+(expanded?'⌃':'⌄')+'</span></span></button>'
   +(expanded?'<div class="meal-body"><div class="variant-card">'
     +'<div class="variant-title"><strong>Обрана страва</strong>'
     +'<span class="variant-macros" aria-label="Калорії та БЖВ страви">'+window.structuredVariantHeaderHTML(item)+'</span></div>'
     +'<div class="meal-recipe"><strong>'+escapeDish(item.dish_title||'Власна страва')+'</strong>'
     +'<p>'+escapeDish(item.preparation||'Обери продукти та склади готову страву.')+'</p>'
     +'<div class="meal-recipe-actions"><button type="button" class="open-recipe-library" onclick="openRecipeTemplatePicker('+n+',1)">≡ Замінити страву з бібліотеки</button>'
     +(item.recipe_source_url?'<a href="'+escapeDish(item.recipe_source_url)+'" target="_blank" rel="noopener noreferrer">Ідея: '+escapeDish(item.recipe_source_name||'кулінарне джерело')+' ↗</a>':'')
     +'</div></div>'
     +(fit?'<div class="auto-fit-notice '+(fit.within_tolerance?'ok':'warn')+'"><strong>'
       +(fit.within_tolerance?'Порції підібрано під добову ціль':'Порції підібрано, але денна ціль ще не досягнута')
       +'</strong><span>Відхилення за день: '+formatDelta(fit.diff)+'</span>'
       +(!fit.within_tolerance?'<small>Деякі БЖВ неможливо точно набрати лише цим рецептом без неприродних порцій. Інші прийоми не змінено.</small>':'')
       +'</div>':'')
     +window.renderStructuredMealHTML(item)
     +'</div></div>':'')
   +'</article>';
 }).join('');
 const day=document.getElementById('dailySummary');
 if(day)day.innerHTML=window.structuredDailySummaryHTML();
 const summary=macroDiff(nutritionPlanDraft);
 const state=document.getElementById('rationAccuracy');
 if(state)state.innerHTML='<div class="ration-accuracy '+(summary.within_tolerance?'good':'notice')+'">'
   +'<span>'+(summary.within_tolerance?'БЖВ близькі до цілі':'Відхилення від добової цілі')+'</span>'
   +'<strong>'+formatDelta(summary.diff)+'</strong>'
   +(!summary.within_tolerance?'<button type="button" onclick="rebalanceCurrentRation()">Підлаштувати всі прийоми</button>':'')
   +'<small>Це цільові БЖВ. Овочі поза ціллю враховані окремо у фактичних підсумках.</small></div>';
};
function otherMealsRemainder(selected){
 const goal=macroGoal(),rest=totalsForRation(nutritionPlanDraft.filter(m=>m!==selected));
 return goal.map((value,i)=>value-rest[i]);
}
window.applyRecipeToRation=function(item,recipe){
 if(!currentPlan()||!nutritionPlanDraft.includes(item))throw Error('Wrong active ration');
 const fit=window.NutritionPortionFitter.fit(recipe,otherMealsRemainder(item),macroGoal(),window.structuredCatalog);
 item.foods=fit.foods;
 item.dish_title=recipe.title;
 item.preparation=recipe.preparation;
 item.recipe_source_name=recipe.source_name;
 item.recipe_source_url=recipe.source_url;
 item.recipe_id=recipe.id;
 item.edited=false;
 item.auto_fit={within_tolerance:fit.within_tolerance,diff:fit.diff,pct:fit.pct};
 item.content=item.foods.map(f=>{
  const source=demoCatalog(f.source_id);
  return source.name+' — '+(f.count??fmtDemo(f.grams))+(f.count!=null?' шт.':' г');
 }).join('\n');
 window.rerenderNutritionPlan();
 window.demoDraftChanged();
 return fit;
};
window.rebalanceCurrentRation=function(){
 if(!currentPlan())return;
 const catalog=window.structuredCatalog,goal=macroGoal();
 // Opt-in only: fit each selected meal while keeping recipe ingredients and
 // respecting its already-applied serving bounds and whole eggs.
 for(let pass=0;pass<3;pass++){
  for(const meal of nutritionPlanDraft){
   const remaining=otherMealsRemainder(meal);
   const adjusted=window.NutritionPortionFitter.fit(
    {foods:meal.foods},remaining,goal,catalog);
   meal.foods=adjusted.foods;
   meal.auto_fit=null;
  }
 }
 const results=macroDiff(nutritionPlanDraft);
 window.rerenderNutritionPlan();window.demoDraftChanged();
 document.getElementById('saveDemoStatus').textContent=results.within_tolerance?
  'Порції в усьому раціоні підлаштовано · перевір рецепти перед використанням':
  'Порції перераховано, але ціль не досягнута повністю. Обери інші страви або перевір цілі.';
};
function initializeRations(){
 if(!demoSource)return;
 const primary=demoSource.meals.filter(x=>+x.variant_number===1);
 const alternative=demoSource.meals.filter(x=>+x.variant_number===2);
 rationPlans=[prepareRation(primary,1),prepareRation(alternative.length?alternative:primary,2)];
 activeRationId=1;syncCurrent();
 openMeals=new Set([1,2,3,4,5]);
 window.rerenderNutritionPlan();
}
window.resetDemo=function(){
 if(!demoSource)return;
 document.getElementById('structuredPickerClose')?.click();
 document.getElementById('recipeTemplateClose')?.click();
 try{sessionStorage.removeItem(DEMO_STORAGE_KEY)}catch{}
 initializeRations();
 setSaveStatus('Початкові раціони відновлено · тест без реальних клієнтів');
};
function setSaveStatus(value){
 const el=document.getElementById('saveDemoStatus');if(el)el.textContent=value;
}
window.demoDraftChanged=function(){
 setSaveStatus('Є незбережені зміни · це лише демоверсія');
};
window.saveDemo=function(){
 if(!demoSource)return;
 try{
  sessionStorage.setItem(DEMO_STORAGE_KEY,JSON.stringify({version:1,activeRationId,rationPlans}));
  setSaveStatus('Збережено лише у цьому браузері · клієнти не змінені');
 }catch{
  setSaveStatus('Локальне збереження недоступне. Зміни є до перезавантаження.');
 }
};
function validateSaved(snapshot,catalog){
 const ids=new Set(catalog.map(x=>x.source_id));
 return snapshot&&snapshot.version===1&&Array.isArray(snapshot.rationPlans)
   &&snapshot.rationPlans.length>=1&&snapshot.rationPlans.length<=7
   &&snapshot.rationPlans.every(p=>Number.isInteger(p.id)&&Array.isArray(p.meals)
      &&p.meals.length>=3&&p.meals.length<=5
      &&p.meals.every(meal=>Array.isArray(meal.foods)
         &&meal.foods.length<=30&&meal.foods.every(f=>ids.has(f.source_id)
            &&Number.isFinite(Number(f.grams))&&Number(f.grams)>0&&Number(f.grams)<=2000)));
}
async function bootDemo(){
 try{
  const [catalog,plan]=await Promise.all([
   fetch('/catalog.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('catalog');return r.json()}),
   fetch('/plan.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('plan');return r.json()})
  ]);
  if(!Array.isArray(catalog.items)||!catalog.items.length||!Array.isArray(plan.meals)||!plan.meals.length)
   throw Error('Missing reviewed nutrition catalog');
  window.structuredCatalog=catalog.items;
  window.currentClientData={client:{id:999,kcal:plan.targets.kcal,protein:plan.targets.protein,
   fat:plan.targets.fat,carbs:plan.targets.carbs}};
  demoSource=plan;initializeRations();
  try{
   const saved=sessionStorage.getItem(DEMO_STORAGE_KEY);
   if(saved){
    const snapshot=JSON.parse(saved);
    if(validateSaved(snapshot,catalog.items)){
     rationPlans=snapshot.rationPlans.map(p=>prepareRation(p.meals,p.id));
     activeRationId=rationPlans.some(p=>p.id===snapshot.activeRationId)?
       snapshot.activeRationId:rationPlans[0].id;
     syncCurrent();window.rerenderNutritionPlan();
     setSaveStatus('Відновлено збережені раціони · клієнти не змінені');
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
