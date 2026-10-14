// Offline-friendly, read-only recipe template picker for the isolated preview.
// No external recipe HTML, no client database, no third-party recipe instructions.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('uk-UA',{maximumFractionDigits:1});
const tags={make_ahead:'З вечора',cold:'Холодна страва',hot:'Гаряча страва',quick:'Швидко',vegetarian:'Без м’яса',meal_prep:'Заготовка'};
const cats={breakfast:'Сніданки',lunch:'Обіди',snack:'Перекуси',dinner:'Вечері'};
const defaultCategory={1:'breakfast',2:'lunch',3:'snack',4:'dinner',5:'snack'};
let state=null;
let loading=null;
function currentDraft(){return (nutritionPlanDraft||[]).find(x=>x.meal_number===state?.n&&x.variant_number===state?.v)}
async function getLibrary(){
 if(!loading)loading=api('/trainer/foods/recipes').then(result=>{
  if(!Array.isArray(result.templates)||result.templates.length!==60)
   throw Error('Template catalog incomplete');
  return result.templates;
 }).catch(err=>{loading=null;throw err});
 return loading;
}
function close(){
 $('recipeTemplatePicker')?.remove();state=null;document.body.classList.remove('picker-open');
}
function render(){
 const container=$('recipeTemplateList');
 if(!container||!state)return;
 const q=String(state.query||'').trim().toLocaleLowerCase('uk-UA');
 const matches=(state.recipes||[]).filter(recipe=>
  recipe.category===state.category&&
  (recipe.title.toLocaleLowerCase('uk-UA').includes(q)||
   recipe.preparation.toLocaleLowerCase('uk-UA').includes(q))).slice(0,60);
 $('recipeTemplateCount').textContent=matches.length+' з 15 варіантів у категорії · 60 перевірених шаблонів';
 $('recipeTemplateFilters').innerHTML=Object.entries(cats).map(([category,label])=>{
  const count=state.recipes.filter(r=>r.category===category).length;
  return '<button type="button" data-cat="'+category+'" class="'+(category===state.category?'active':'')+'">'+label+' <b>'+count+'</b></button>';
 }).join('');
 $('recipeTemplateFilters').querySelectorAll('[data-cat]').forEach(button=>{
  button.onclick=()=>{state.category=button.dataset.cat;render()};
 });
 container.innerHTML=matches.map(r=>{
  const vals=window.NutritionPortionFitter.sumRows(r.foods||[],window.structuredCatalog||[]);
  const total=Object.fromEntries(window.NutritionPortionFitter.macroKeys.map((k,i)=>[k,vals[i]]));
  const meta=(r.tags||[]).map(tag=>tags[tag]||tag);
  return '<article class="recipe-template-card">'
    +'<div class="recipe-template-meta">'+meta.map(label=>'<span>'+esc(label)+'</span>').join('')
    +'<span>'+fmt(r.minutes)+' хв підготовки</span></div>'
    +'<h3>'+esc(r.title)+'</h3><p>'+esc(r.preparation)+'</p>'
    +'<div class="recipe-template-macros">'+fmt(total.kcal)+' ккал · Б '+fmt(total.protein)+' · Ж '+fmt(total.fat)+' · В '+fmt(total.carbs)+'</div>'
    +'<div class="recipe-template-footer"><a class="recipe-template-source" href="'+esc(r.source_url)+'" target="_blank" rel="noopener noreferrer" title="Джерело кулінарної ідеї">'+esc(r.source_name)+' ↗</a>'
    +'<button type="button" data-recipe="'+esc(r.id)+'">Взяти шаблон</button></div>'
    +'</article>';
 }).join('')||'<p class="recipe-template-empty">У цій категорії збігів немає. Спробуй інший запит.</p>';
 container.querySelectorAll('button[data-recipe]').forEach(button=>button.onclick=()=>choose(button.dataset.recipe));
}
function choose(id){
 const r=state?.recipes?.find(item=>item.id===id),item=currentDraft();
 if(!r||!item)return;
 if(!r.foods?.length){alert('У шаблоні немає перевірених продуктів.');return}
 const menu=(window.structuredCatalog||[]);
 if(r.foods.some(food=>!menu.some(x=>x.source_id===food.source_id))){
  alert('Деякі продукти відсутні у локальній базі Є ПЛАН.');return;
 }
 // Fit only the newly inserted dish to the *remaining* daily calorie
 // and BJU targets. All previously configured meals stay unchanged.
 let fitted;
 try{
  if(typeof window.applyRecipeToRation!=='function')throw Error('Auto-fit module unavailable');
  fitted=window.applyRecipeToRation(item,r,state.fitMode);
 }catch(e){
  console.warn('Recipe auto-fit',e);
  alert(e?.message||'Не вдалося підібрати порції. Спробуй інший рецепт.');
  return;
 }
 close();
 const targetLabel=fitted.mode==='previous'?'БЖВ попередньої страви':'залишок добової цілі';
 const info=fitted.within_tolerance?
  'Порції підібрано під '+targetLabel+'. Перевір перед призначенням.':
  'Порції наближено до '+targetLabel+', але залишилось відхилення. Перевір КБЖУ та грамовки.';
 const status=$('saveDemoStatus');if(status)status.textContent=info;
}
window.openRecipeTemplatePicker=async function(n,v){
 const item=(nutritionPlanDraft||[]).find(x=>x.meal_number===+n&&x.variant_number===+v);
 if(!item)return;
 close();
 const original=$('saveDemoStatus');
 if(original)original.textContent='Відкриваємо бібліотеку рецептів…';
 let items;
 try{items=await getLibrary()}catch(e){
  if(original)original.textContent='Помилка завантаження рецептів. Спробуй ще раз.';
  console.warn('Recipe template load',e);return;
 }
 const hadFood=(item.foods||[]).some(x=>x.count_in_targets!==false);
 const mealCount=new Set((nutritionPlanDraft||[]).map(x=>x.meal_number)).size;
 const assignedCategory=typeof window.trainerMealCategory==='function'?
  window.trainerMealCategory(n,mealCount):(defaultCategory[n]||'breakfast');
 state={n:+n,v:+v,recipes:items,category:assignedCategory==='evening'?'snack':assignedCategory,
  query:'',fitMode:hadFood?'previous':'day',canCompare:hadFood};
 document.body.insertAdjacentHTML('beforeend',
  '<div id="recipeTemplatePicker" class="modal" role="dialog" aria-modal="true" aria-labelledby="recipeTemplateTitle">'
  +'<div class="card recipe-template-sheet">'
  +'<header class="recipe-template-head"><div><h2 id="recipeTemplateTitle">Бібліотека страв</h2><p>60 варіантів із перевіреної бази · грамовки добираються автоматично</p></div>'
  +'<button type="button" id="recipeTemplateClose" aria-label="Закрити"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18"/></svg></button></header>'
  +'<div class="recipe-fit-settings"><strong>Як підбирати порції?</strong>'
  +'<div class="recipe-fit-choices" role="group" aria-label="Режим підбору БЖВ">'
  +(hadFood?'<button type="button" data-fit="previous" class="active">Як у попередній страві</button>':'')
  +'<button type="button" data-fit="day" class="'+(hadFood?'':'active')+'">Під денну ціль</button></div>'
  +'<p id="recipeFitDescription"></p></div>'
  +'<input id="recipeTemplateSearch" type="search" placeholder="Назва страви або інгредієнт" autocomplete="off">'
  +'<div class="recipe-template-categories" id="recipeTemplateFilters"></div>'
  +'<p id="recipeTemplateCount" class="recipe-template-count"></p>'
  +'<div class="recipe-template-list" id="recipeTemplateList"></div>'
  +'<p class="recipe-template-credit">Рецепти — адаптації кулінарних ідей. БЖВ з перевіреного каталогу. Тренер перевіряє склад, порції та алергени перед збереженням плану.</p>'
  +'</div></div>');
 document.body.classList.add('picker-open');
 $('recipeTemplateClose').onclick=close;
 const description=$('recipeFitDescription');
 const describe=()=>{
  if(!state||!description)return;
  description.textContent=state.fitMode==='previous'
   ?'Нова страва наблизиться до КБЖУ цього прийому. Інші прийоми не зміняться.'
   :'Порції під залишок добової цілі. Якщо інші прийоми ще порожні — залишок розподіляється між ними.';
 };
 $('recipeTemplatePicker').querySelectorAll('button[data-fit]').forEach(button=>{
  button.onclick=()=>{
   if(!state)return;
   state.fitMode=button.dataset.fit;
   $('recipeTemplatePicker').querySelectorAll('button[data-fit]').forEach(el=>{
    el.classList.toggle('active',el===button);
    el.setAttribute('aria-pressed',String(el===button));
   });
   describe();
  };
  button.setAttribute('aria-pressed',String(button.dataset.fit===state.fitMode));
 });
 describe();
 $('recipeTemplateSearch').oninput=ev=>{if(!state)return;state.query=ev.target.value;render()};
 render();
 if(original)original.textContent='Бібліотека рецептів завантажена · це лише демоверсія';
};
})();
