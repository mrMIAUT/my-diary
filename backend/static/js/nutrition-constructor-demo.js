// Standalone prototype using exactly the same structured meal editor script as
// the experimental application branch. Never connects to customer APIs.
let nutritionPlanDraft=[];
let demoSource=null;
let openMeals=new Set([1,2,3,4]);
window.currentClientData={client:{id:999,kcal:2380,protein:160,fat:60,carbs:300}};
function escDemo(x){return String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function fmtDemo(n){return Number(n||0).toLocaleString('uk-UA',{maximumFractionDigits:1});}
function renderTargets(){
 const c=window.currentClientData.client;
 document.getElementById('targetStats').innerHTML=[
  ['Калорії',c.kcal,'ккал'],['Білки',c.protein,'г'],
  ['Жири',c.fat,'г'],['Вуглеводи',c.carbs,'г']
 ].map(([title,num,unit])=>'<div class="stat"><small>'+title+'</small><strong>'+fmtDemo(num)+'</strong><small>'+unit+'</small></div>').join('');
}
function mealName(n){return ({1:'Сніданок',2:'Обід',3:'Перекус',4:'Вечеря',5:'Другий перекус'})[n]||'Прийом їжі '+n;}
function toggleMeal(n){if(openMeals.has(n))openMeals.delete(n);else openMeals.add(n);rerenderNutritionPlan(true);}
function addDemoVariant(n){
 const existing=nutritionPlanDraft.filter(x=>x.meal_number===n);
 const v=Math.max(...existing.map(x=>x.variant_number),0)+1;
 nutritionPlanDraft.push({meal_number:n,variant_number:v,sort:n*10+v,foods:[],content:''});
 openMeals.add(n);rerenderNutritionPlan(true);
}
function removeDemoVariant(n,v){
 if(nutritionPlanDraft.filter(x=>x.meal_number===n).length===1)return;
 nutritionPlanDraft=nutritionPlanDraft.filter(x=>!(x.meal_number===n&&x.variant_number===v));
 rerenderNutritionPlan(true);
}
function rerenderNutritionPlan(){
 const nums=[...new Set(nutritionPlanDraft.map(x=>x.meal_number))].sort((a,b)=>a-b);
 document.getElementById('mealCards').innerHTML=nums.map(n=>{
  const variants=nutritionPlanDraft.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number);
  const show=openMeals.has(n);
  return '<article class="meal-card"><button class="meal-head" type="button" onclick="toggleMeal('+n+')">'
    +'<span>'+mealName(n)+'<small>'+variants.length+' варіант(и) · розрахунок окремо для кожного</small></span>'
    +'<span class="chevron">'+(show?'⌃':'⌄')+'</span></button>'
    +(show?'<div class="meal-body">'+variants.map(x=>
      '<div class="variant-card"><div class="variant-title"><span>Варіант '+x.variant_number+'</span>'
      +(variants.length>1?'<button class="pill" onclick="removeDemoVariant('+n+','+x.variant_number+')">Видалити</button>':'<span class="variant-note">Основний</span>')+'</div>'
      +window.renderStructuredMealHTML(x)+'</div>'
    ).join('')+'<button type="button" class="add-variant" onclick="addDemoVariant('+n+')">+ Додати варіант</button></div>':'')
    +'</article>';
 }).join('');
 document.getElementById('dailySummary').innerHTML=window.structuredDailySummaryHTML();
}
window.resetDemo=function(){
 if(!demoSource)return;
 nutritionPlanDraft=demoSource.meals.map(x=>({
   meal_number:+x.meal_number,variant_number:+x.variant_number,sort:+x.sort,
   content:String(x.content||''),foods:(x.foods||[]).map(f=>({
    source_id:f.source_id,grams:Number(f.grams),count:f.count??null,
    count_in_targets:f.count_in_targets!==false
   }))
 }));
 openMeals=new Set([1,2,3,4]);
 rerenderNutritionPlan(true);
};
async function bootDemo(){
 try{
   const [catalog,plan]=await Promise.all([
    fetch('/catalog.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('catalog');return r.json();}),
    fetch('/plan.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('plan');return r.json();})
   ]);
   if(!Array.isArray(catalog.items)||!catalog.items.length||!Array.isArray(plan.meals))
     throw Error('missing reviewed nutrition catalog');
   window.structuredCatalog=catalog.items;
   window.currentClientData={client:{id:999,
     kcal:plan.targets.kcal,protein:plan.targets.protein,
     fat:plan.targets.fat,carbs:plan.targets.carbs}};
   demoSource=plan;
   renderTargets();
   resetDemo();
 }catch(e){
   document.getElementById('mealCards').innerHTML='<div class="info">Не вдалося завантажити тестовий каталог. Онови сторінку.</div>';
   console.error('nutrition preview',e);
 }
}
bootDemo();
