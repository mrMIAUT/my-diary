// Optional trainer-only meal plan preview. No backend writes until explicit save.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('uk-UA',{maximumFractionDigits:1});
let requestSerial=0, preview=null, clientId=0;
const groups=[
 ['dairy','Молочні'],['eggs','Яйця'],['fish','Риба'],
 ['nuts','Горіхи'],['gluten','Глютенові продукти'],['meat','М’ясо']
];
window.openAutoMealPlanModal=function(cid){
 const c=window.currentClientData?.client;
 if(session?.role!=='trainer'||!c||+c.id!==+cid||!clientAccess(c).features?.meal_plan)return;
 requestSerial++;preview=null;clientId=cid;
 $('autoMealPlanModal')?.remove();
 document.body.insertAdjacentHTML('beforeend',
   '<div class="modal" id="autoMealPlanModal" role="dialog" aria-modal="true" aria-labelledby="autoMealPlanTitle">'
  +'<div class="card auto-meal-modal"><div class="auto-meal-head">'
  +'<div><h2 id="autoMealPlanTitle">Автоматичний план харчування</h2><p>Чернетка із перевірених продуктів. Тренер затверджує раціон.</p></div>'
  +'<button class="auto-meal-close" type="button" id="autoMealClose" aria-label="Закрити">✕</button></div>'
  +'<div class="auto-meal-target"><strong>Призначені цілі</strong><span>'+fmt(c.kcal)+' ккал · Б '+fmt(c.protein)+' · Ж '+fmt(c.fat)+' · В '+fmt(c.carbs)+'</span></div>'
  +'<div class="auto-meal-settings">'
  +'<label>Прийоми їжі<select id="autoMealCount"><option value="" selected disabled>Обрати</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>'
  +'<label>Варіанти на прийом<select id="autoMealVariants"><option value="" selected disabled>Обрати</option><option value="1">1 варіант</option><option value="2">2 варіанти</option></select></label></div>'
  +'<fieldset class="auto-meal-exclusions"><legend>Не використовувати продукти</legend>'
  +groups.map(([key,label])=>'<label><input type="checkbox" value="'+key+'">'+esc(label)+'</label>').join('')
  +'<p>Це фільтр добору, не перевірка алергенів. При алергії обов’язково перевіряй склад та сліди продуктів.</p></fieldset>'
  +'<button id="autoMealGenerate" class="auto-meal-primary" type="button">Створити чернетку</button>'
  +'<div id="autoMealPreview" aria-live="polite"></div>'
  +'</div></div>');
 $('autoMealClose').onclick=()=>{$('autoMealPlanModal')?.remove();requestSerial++};
 $('autoMealGenerate').onclick=generate;
};
async function generate(){
 const cid=clientId,serial=++requestSerial;
 const meals=+$('autoMealCount').value,variants=+$('autoMealVariants').value;
 if(meals<3||meals>5||variants<1||variants>2){
   $('autoMealPreview').textContent='Обери кількість прийомів і варіантів.';return;
 }
 const excluded=Array.from($('autoMealPlanModal').querySelectorAll('.auto-meal-exclusions input:checked'),x=>x.value);
 const button=$('autoMealGenerate');button.disabled=true;button.textContent='Створюємо…';
 $('autoMealPreview').innerHTML='<p class="auto-meal-loading">Розраховуємо порції за перевіреним каталогом…</p>';
 try{
   const result=await api('/trainer/client/'+cid+'/nutrition/auto-plan',{method:'POST',
       body:JSON.stringify({meals,variants,excluded})});
   if(serial!==requestSerial||!$('autoMealPlanModal'))return;
   preview=result;
   renderPreview(result);
 }catch(e){
   if(serial!==requestSerial||!$('autoMealPlanModal'))return;
   $('autoMealPreview').textContent=e.message||'Не вдалося створити план.';
 }finally{
   if(serial===requestSerial&&$('autoMealPlanModal')){
     button.disabled=false;button.textContent='Згенерувати ще раз';
   }
 }
}
function renderPreview(data){
 const delta=data.deviations_pct||{},total=data.totals||{},target=data.targets||{};
 const within=!!data.within_tolerance;
 $('autoMealPreview').innerHTML=
    '<div class="auto-meal-summary '+(within?'ok':'needs-review')+'">'
     +'<strong>Раціон за варіантом 1 · '+(within?'БЖВ близько до цілі':'Потрібна корекція БЖВ')+'</strong>'
     +'<div class="auto-meal-numbers">'+[['kcal','Ккал'],['protein','Білки'],['fat','Жири'],['carbs','Вуглеводи']]
        .map(([key,label])=>'<span><small>'+label+'</small><b>'+fmt(total[key])+'</b><small>ціль '+fmt(target[key])+' · '+(delta[key]>0?'+':'')+fmt(delta[key])+'%</small></span>').join('')
      +'</div></div>'
    +'<div class="auto-meal-results">'
    +(data.meals||[]).map(item=>'<div class="auto-meal-choice"><div class="auto-meal-choice-head"><strong>'
         +esc(item.meal_name)+' · варіант '+item.variant_number+'</strong><span>'+fmt(item.totals?.kcal)+' ккал</span></div>'
         +'<div class="auto-meal-foods">'+(item.foods||[]).map(food=>'<div><span>'+esc(food.name)+'</span><b>'+fmt(food.grams)+' г</b></div>').join('')+'</div>'
         +'<p>Б '+fmt(item.totals?.protein)+' · Ж '+fmt(item.totals?.fat)+' · В '+fmt(item.totals?.carbs)+'</p></div>').join('')
    +'</div><div class="auto-meal-review-note">'+(data.warnings||[]).map(x=>'<p>'+esc(x)+'</p>').join('')+'</div>'
    +'<button type="button" class="auto-meal-apply" id="autoMealApply">Перенести у редактор</button>'
    +'<p class="auto-meal-footnote">Перенесення не призначає план клієнту. Після перевірки натисни «Зберегти план клієнту».</p>';
 $('autoMealApply').onclick=applyDraft;
}
async function applyDraft(){
 const current=window.currentClientData||{},c=current.client||{};
 if(!preview||session?.role!=='trainer'||+c.id!==+clientId)return;
 if((current.nutrition_plan||[]).some(x=>String(x.content||'').trim())||
      String(c.meal_plan||'').trim()){
   if(!confirm('У редакторі вже є план. Замінити лише чернетку? Збережений у клієнта план не зміниться, поки ти не натиснеш «Зберегти план клієнту».'))return;
 }
 try{await window.ensureStructuredMealEditor();}
 catch(e){console.warn(e);alert('Не вдалося завантажити редактор продуктів. Чернетка збережена у вікні.');return;}
 const copy=(preview.meals||[]).map(x=>({
   meal_number:+x.meal_number,variant_number:+x.variant_number,
   sort:+x.sort,content:String(x.content||''),
   foods:(x.foods||[]).map(food=>({
     source_id:food.source_id,grams:+food.grams,
     count:food.count??null,count_in_targets:food.count_in_targets!==false
   }))
 }));
 if(!copy.length)return;
 // Prepare the normal trainer editor, then replace only its local unsaved draft.
 editNutritionTargets();
 nutritionPlanDraft=copy;
 rerenderNutritionPlan(true);
 $('nutritionPlanBody')?.classList.remove('hidden');
 $('autoMealPlanModal')?.remove();requestSerial++;preview=null;
 document.querySelector('#nutritionPlanHost')?.scrollIntoView({behavior:'smooth',block:'start'});
}
})();
