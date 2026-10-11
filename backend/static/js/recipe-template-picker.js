// Offline-friendly, read-only recipe template picker for the isolated preview.
// No external recipe HTML, no client database, no third-party recipe instructions.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('uk-UA',{maximumFractionDigits:1});
const tags={make_ahead:'З вечора',cold:'Холодна страва',hot:'Гаряча страва',quick:'Швидко',vegetarian:'Без м’яса',meal_prep:'Заготовка'};
const cats={breakfast:'Сніданки',lunch:'Обіди',snack:'Перекуси',dinner:'Вечері',evening:'Другий перекус'};
const defaultCategory={1:'breakfast',2:'lunch',3:'snack',4:'dinner',5:'evening'};
let state=null;
let loading=null;
function currentDraft(){return (nutritionPlanDraft||[]).find(x=>x.meal_number===state?.n&&x.variant_number===state?.v)}
async function getLibrary(){
 if(!loading)loading=fetch('/recipe-library.json',{cache:'no-store'}).then(r=>{
  if(!r.ok)throw Error('Template catalog unavailable');
  return r.json();
 }).then(result=>{
  if(!Array.isArray(result.templates)||result.templates.length<35)
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
 $('recipeTemplateCount').textContent=matches.length+' з '+state.recipes.length+' перевірених шаблонів';
 $('recipeTemplateFilters').innerHTML=Object.entries(cats).map(([category,label])=>{
  const count=state.recipes.filter(r=>r.category===category).length;
  return '<button type="button" data-cat="'+category+'" class="'+(category===state.category?'active':'')+'">'+label+' <b>'+count+'</b></button>';
 }).join('');
 $('recipeTemplateFilters').querySelectorAll('[data-cat]').forEach(button=>{
  button.onclick=()=>{state.category=button.dataset.cat;render()};
 });
 container.innerHTML=matches.map(r=>{
  const total=r.totals||{};
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
 // Explicit click chooses a recipe. It changes only the selected meal variant.
 item.foods=r.foods.map(f=>({
  source_id:f.source_id,grams:Number(f.grams),count:f.count??null,
  count_in_targets:f.count_in_targets!==false,usage_note:String(f.usage_note||'')
 }));
 item.dish_title=r.title;
 item.preparation=r.preparation;
 item.recipe_source_name=r.source_name;
 item.recipe_source_url=r.source_url;
 item.recipe_id=r.id;
 item.edited=false;
 item.content=item.foods.map(f=>{
  const base=menu.find(x=>x.source_id===f.source_id);
  return base.name+' — '+(f.count??fmt(f.grams))+(f.count!==null?' шт.':' г');
 }).join('\n');
 close();
 window.rerenderNutritionPlan();
 window.demoDraftChanged?.();
 window.scrollTo?.({top:Math.max(0,(document.querySelector('.variant-card')?.getBoundingClientRect().top||0)+window.scrollY-80),behavior:'smooth'});
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
 state={n:+n,v:+v,recipes:items,category:defaultCategory[n]||'breakfast',query:''};
 document.body.insertAdjacentHTML('beforeend',
  '<div id="recipeTemplatePicker" class="modal" role="dialog" aria-modal="true" aria-labelledby="recipeTemplateTitle">'
  +'<div class="card recipe-template-sheet">'
  +'<header class="recipe-template-head"><div><h2 id="recipeTemplateTitle">Бібліотека страв</h2><p>Рецепти, які реально готують, із грамовками з бази Є ПЛАН</p></div>'
  +'<button type="button" id="recipeTemplateClose" aria-label="Закрити">×</button></header>'
  +'<input id="recipeTemplateSearch" type="search" placeholder="Назва страви або інгредієнт" autocomplete="off">'
  +'<div class="recipe-template-categories" id="recipeTemplateFilters"></div>'
  +'<p id="recipeTemplateCount" class="recipe-template-count"></p>'
  +'<div class="recipe-template-list" id="recipeTemplateList"></div>'
  +'<p class="recipe-template-credit">Рецепти — адаптації за кулінарними джерелами, не дослівні копії. БЖВ розраховані лише для інгредієнтів, які відображені в картці. Приготування та допуски перевіряє тренер.</p>'
  +'</div></div>');
 document.body.classList.add('picker-open');
 $('recipeTemplateClose').onclick=close;
 $('recipeTemplateSearch').oninput=ev=>{if(!state)return;state.query=ev.target.value;render()};
 render();
 if(original)original.textContent='Бібліотека рецептів завантажена · це лише демоверсія';
};
})();
