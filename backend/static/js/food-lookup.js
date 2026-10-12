// Authenticated, read-only product lookup for the production Nutrition screen.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(Math.round((Number(n)||0)*10)/10).toLocaleString('uk-UA',{maximumFractionDigits:1});
let timer=null,serial=0,chosen=null,defaultMeal='breakfast';
window.openFoodSearchModal=function(meal=''){
 defaultMeal=['breakfast','lunch','snack','dinner'].includes(meal)?meal:'breakfast';
 $('foodSearchModal')?.remove();serial++;chosen=null;
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="foodSearchModal"><div class="card food-lookup-modal">'
  +'<div class="between"><div><h2>Пошук продуктів</h2><p class="muted">Калорії та БЖВ на 100 г продукту</p></div><button type="button" class="dark" id="foodSearchClose">✕</button></div>'
  +'<div class="food-custom-actions"><button type="button" onclick="openMyFoodLibrary()">Мої продукти</button>'
  +'<button type="button" onclick="openPrivateFoodForm()">+ Свій продукт</button>'
  +'<button type="button" onclick="openMyRecipesLibrary()">Мої рецепти</button></div>'
  +'<input id="foodLookupQuery" type="search" maxlength="120" autocomplete="off" aria-label="Пошук продуктів" placeholder="Наприклад, гречка, молоко, курка">'
  +'<p class="food-lookup-status" id="foodLookupStatus">Введи щонайменше 2 символи.</p>'
  +'<div class="food-lookup-results" id="foodLookupResults"></div>'
  +'<button type="button" id="foodLookupMore" class="food-lookup-more" hidden>Пошук у розширеній базі</button><div id="foodLookupPortion"></div>'
  +'<p class="food-lookup-note">Дані залежать від виробника та способу приготування. Обери порцію та прийом їжі, щоб додати продукт у щоденник.</p></div></div>');
 $('foodSearchClose').onclick=()=>{$('foodSearchModal')?.remove();serial++};
 $('foodLookupQuery').oninput=function(){
  const q=this.value.trim(),requestId=++serial;clearTimeout(timer);
  $('foodLookupPortion').innerHTML='';chosen=null;$('foodLookupMore').hidden=true;
  if(q.length<2){$('foodLookupResults').innerHTML='';$('foodLookupStatus').textContent='Введи щонайменше 2 символи.';return}
  $('foodLookupStatus').textContent='Шукаємо…';
  timer=setTimeout(()=>lookupLocal(q,requestId),220);
 };
 $('foodLookupQuery').focus();
};
// Approved local USDA/manufacturer references always render first.
// Slow external APIs are never on the critical path for common food queries.
async function lookupLocal(query,id){
 try{
  const data=await api('/foods/preview?q='+encodeURIComponent(query)+'&limit=12');
  if(id!==serial||!$('foodSearchModal'))return;
  const items=Array.isArray(data?.items)?data.items:[];
  if(items.length){
   renderItems(items);
   $('foodLookupStatus').textContent='Локальна база · '+items.length+' результатів. За потреби пошукай у розширеній базі.';
   const more=$('foodLookupMore');
   more.hidden=false;more.disabled=false;more.textContent='Пошук у розширеній базі';
   more.onclick=()=>lookupExtended(query,id);
  }else{
   $('foodLookupStatus').textContent='У локальній базі немає збігів. Шукаємо додатково…';
   $('foodLookupResults').innerHTML='';
   await lookupExtended(query,id);
  }
 }catch(e){
  if(id!==serial||!$('foodSearchModal'))return;
  $('foodLookupStatus').textContent='Локальна база недоступна. Шукаємо додатково…';
  await lookupExtended(query,id);
 }
}
async function lookupExtended(query,id){
 const more=$('foodLookupMore');
 if(more){more.hidden=true;more.disabled=true;}
 const oldItems=$('foodLookupResults').innerHTML;
 $('foodLookupStatus').textContent='Шукаємо у розширеній базі…';
 try{
  const data=await api('/foods/search?q='+encodeURIComponent(query)+'&limit=12&page=1');
  if(id!==serial||!$('foodSearchModal'))return;
  const items=Array.isArray(data?.items)?data.items:[];
  if(items.length)renderItems(items);
  else if(!oldItems)$('foodLookupResults').innerHTML='';
  $('foodLookupStatus').textContent=items.length?'Розширена база · '+items.length+' результатів'+(data?.has_more?' · уточни запит':'')+'.':(oldItems?'Додаткових результатів немає.':'Нічого не знайдено.');
 }catch(e){
  if(id!==serial||!$('foodSearchModal'))return;
  $('foodLookupStatus').textContent=oldItems?'Розширена база тимчасово недоступна. Локальні результати збережено.':'Помилка пошуку. Спробуй ще раз.';
 }
 if(id===serial&&$('foodSearchModal')&&more){
  more.hidden=false;more.disabled=false;more.textContent='Повторити розширений пошук';
  more.onclick=()=>lookupExtended(query,id);
 }
}
function renderItems(items){
 $('foodLookupResults').innerHTML=items.map((x,i)=>'<button type="button" class="food-lookup-row" data-i="'+i+'">'
   +'<strong>'+esc(x.name||'Продукт')+'</strong>'
   +(x.brand?'<small>'+esc(x.brand)+'</small>':'')
   +'<span>'+esc(x.source_label||x.source||'Джерело не вказано')+(x.approximate?' · орієнтовно':'')+'</span>'
   +'<em>'+fmt(x.kcal_100)+' ккал · Б '+fmt(x.protein_100)+' · Ж '+fmt(x.fat_100)+' · В '+fmt(x.carbs_100)+'</em></button>').join('');
 $('foodLookupResults').querySelectorAll('[data-i]').forEach(btn=>btn.onclick=()=>choose(items[+btn.dataset.i]));
}
function choose(x){
 chosen=x;
 $('foodLookupPortion').innerHTML='<div class="food-lookup-portion"><strong>'+esc(x.name||'Продукт')+'</strong>'
  +'<label>Вага порції, г <input id="foodLookupGrams" type="number" min="1" max="2000" step="1" value="100"></label>'
  +'<label>Прийом їжі <select id="foodLookupMeal">'
  +[['breakfast','Сніданок'],['lunch','Обід'],['snack','Перекус'],['dinner','Вечеря']]
    .map(([k,t])=>'<option value="'+k+'"'+(defaultMeal===k?' selected':'')+'>'+t+'</option>').join('')
  +'</select></label>'
  +'<div id="foodLookupMacros"></div>'
  +'<button type="button" id="foodLookupAddToDiary" onclick="addChosenFoodToDiary(this)">+ Додати у щоденник</button>'
  +'<p id="foodLookupFeedback" class="food-lookup-feedback" role="status"></p></div>';
 $('foodLookupGrams').oninput=portion;portion();
}
function portion(){
 const grams=Number($('foodLookupGrams')?.value);
 if(!chosen||!$('foodLookupMacros'))return;
 if(!Number.isFinite(grams)||grams<=0||grams>2000){$('foodLookupMacros').textContent='Вкажи порцію від 1 до 2000 г.';return}
 const amount=key=>fmt((Number(chosen[key])||0)*grams/100);
 $('foodLookupMacros').innerHTML='<div class="food-lookup-macros">'
  +'<span><b>'+amount('kcal_100')+'</b><small>ккал</small></span>'
  +'<span><b>'+amount('protein_100')+'</b><small>Білки</small></span>'
  +'<span><b>'+amount('fat_100')+'</b><small>Жири</small></span>'
  +'<span><b>'+amount('carbs_100')+'</b><small>Вуглеводи</small></span></div>';
}

window.addChosenFoodToDiary=async function(button){
 const grams=Number($('foodLookupGrams')?.value),meal=$('foodLookupMeal')?.value;
 const feedback=$('foodLookupFeedback');
 if(!chosen||!['breakfast','lunch','snack','dinner'].includes(meal))return;
 if(!Number.isFinite(grams)||grams<=0||grams>2000){
  if(feedback)feedback.textContent='Вкажи коректну вагу від 1 до 2000 г.';
  return;
 }
 const targetDate=window.nutritionDiaryDay||isoToday();
 const manual=(window.currentClientData?.nutrition||[]).find(x=>x.day===targetDate);
 if(manual&&!window.nutritionDiaryState?.active){
  if(!confirm('За цю дату вже є ручний підсумок БЖВ. Після додавання продукту на екрані показуватиметься підсумок щоденника, а старий ручний запис залишиться збереженим. Продовжити?'))return;
 }
 button.disabled=true;button.textContent='Зберігаємо…';
 try{
  await api('/nutrition/diary',{method:'POST',body:JSON.stringify({
   day:targetDate,meal,grams,
   name:String(chosen.name||'').slice(0,200),
   brand:String(chosen.brand||'').slice(0,120),
   source_label:String(chosen.source_label||chosen.source||'').slice(0,120),
   source_id:String(chosen.source_id||'').slice(0,200),
   approximate:chosen.approximate!==false,
   kcal_100:Number(chosen.kcal_100),protein_100:Number(chosen.protein_100),
   fat_100:Number(chosen.fat_100),carbs_100:Number(chosen.carbs_100)
  })});
  $('foodSearchModal')?.remove();serial++;chosen=null;
  await showClientNutrition(session.client_id);
  document.getElementById('nutritionDiaryCard')?.scrollIntoView({block:'start'});
 }catch(e){
  button.disabled=false;button.textContent='+ Додати у щоденник';
  if(feedback)feedback.textContent=e.message||'Не вдалося додати продукт. Перевір підключення.';
 }
};

const escapeUser=s=>esc(s);
let privateFoodItems=[],privateFoodEditing=null,recipeItems=[];
const mealLabels=[['breakfast','Сніданок'],['lunch','Обід'],['snack','Перекус'],['dinner','Вечеря']];
function customFoodOption(item){
 return {name:item.name,brand:item.brand||'',
 source_label:'Мій продукт · особиста бібліотека',source_id:'private:'+item.id,
 approximate:true,
 kcal_100:Number(item.kcal_100),protein_100:Number(item.protein_100),
 fat_100:Number(item.fat_100),carbs_100:Number(item.carbs_100)};
}
window.openMyFoodLibrary=async function(){
 $('myFoodsModal')?.remove();
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="myFoodsModal">'
 +'<div class="card my-foods-panel"><div class="between"><h2>Мої продукти</h2>'
 +'<button type="button" class="dark" onclick="myFoodsModal.remove()">×</button></div>'
 +'<p class="muted">Тільки твої продукти. В загальному пошуку їх побачать інші лише після перевірки тренером.</p>'
 +'<div id="myFoodsList">Завантаження…</div>'
 +'<button type="button" class="my-food-primary" onclick="openPrivateFoodForm()">+ Створити продукт</button></div></div>');
 try{
  privateFoodItems=(await api('/nutrition/my-foods')).items||[];
  $('myFoodsList').innerHTML=privateFoodItems.length?privateFoodItems.map(x=>
  '<div class="my-food-row"><div><strong>'+esc(x.name)+'</strong>'
  +(x.brand?'<small>'+esc(x.brand)+'</small>':'')
  +'<small>'+fmt(x.kcal_100)+' ккал · Б '+fmt(x.protein_100)+' · Ж '+fmt(x.fat_100)+' · В '+fmt(x.carbs_100)+'</small>'
  +'<small>'+(x.review_status==='pending'?'На перевірці':x.review_status==='approved'?'Перевірено':x.review_status==='rejected'?'Не схвалено':'Особистий')+'</small></div>'
  +'<div class="my-food-row-actions"><button type="button" onclick="choosePrivateFood('+Number(x.id)+')">Додати</button>'
  +'<button type="button" onclick="openPrivateFoodForm('+Number(x.id)+')">Змінити</button>'
  +(x.review_status==='private'||x.review_status==='rejected'
   ?'<button type="button" aria-label="Видалити власний продукт" onclick="deletePrivateFood('+Number(x.id)+')">×</button>':'')
  +'</div></div>'
  ).join(''):'<p class="muted">Поки немає власних продуктів.</p>';
 }catch(e){$('myFoodsList').textContent=e.message||'Не вдалося завантажити продукти.'}
};
window.choosePrivateFood=function(id){
 const item=privateFoodItems.find(x=>Number(x.id)===Number(id));if(!item)return;
 $('myFoodsModal')?.remove();
 if(!$('foodSearchModal'))window.openFoodSearchModal(defaultMeal);
 choose(customFoodOption(item));
};
window.deletePrivateFood=async function(id){
 if(!confirm('Видалити власний продукт? Уже записані дні щоденника залишаться незмінними.'))return;
 try{await api('/nutrition/my-foods/'+id,{method:'DELETE'});await openMyFoodLibrary();}
 catch(e){alert(e.message||'Не вдалося видалити продукт.')}
};
window.openPrivateFoodForm=function(id=null){
 const item=id?privateFoodItems.find(x=>Number(x.id)===Number(id)):null;
 privateFoodEditing=item?Number(item.id):null;
 $('myProductModal')?.remove();
 const value=(key)=>item?esc(item[key]):'';
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="myProductModal">'
  +'<div class="card my-foods-panel"><div class="between"><h2>'+(item?'Редагувати продукт':'Свій продукт')+'</h2>'
  +'<button type="button" class="dark" onclick="myProductModal.remove()">×</button></div>'
  +'<p class="muted">Калорії та БЖВ на 100 г. Вводь інформацію з етикетки продукту.</p>'
  +'<label>Назва<input id="customFoodName" maxlength="150" value="'+value('name')+'" placeholder="Наприклад, домашній сир"></label>'
  +'<label>Бренд (необов’язково)<input id="customFoodBrand" maxlength="120" value="'+value('brand')+'"></label>'
  +'<div class="my-food-macros">'
  +[['kcal_100','Ккал'],['protein_100','Білки, г'],['fat_100','Жири, г'],['carbs_100','Вуглеводи, г']]
   .map(([k,label])=>'<label>'+label+'<input id="customFood_'+k+'" inputmode="decimal" type="number" min="0" max="'+(k==='kcal_100'?1000:100)+'" step="0.01" value="'+value(k)+'"></label>').join('')
  +'</div><label class="my-food-review"><input type="checkbox" id="customFoodSubmitReview">'
  +' Запропонувати для загальної бази після перевірки тренером</label>'
  +'<p class="my-food-hint">Без цього прапорця продукт залишиться тільки твоїм. Навіть із ним продукт НЕ публікується автоматично.</p>'
  +'<p class="my-food-error" id="customFoodError" role="alert"></p>'
  +'<button type="button" id="saveCustomFoodButton" class="my-food-primary" onclick="savePrivateFood(this)">Зберегти</button></div></div>');
};
window.savePrivateFood=async function(button){
 const read=id=>Number(String($(id)?.value||'').replace(',','.'));
 const vals={name:String($('customFoodName')?.value||'').trim(),brand:String($('customFoodBrand')?.value||'').trim(),
  kcal_100:read('customFood_kcal_100'),protein_100:read('customFood_protein_100'),
  fat_100:read('customFood_fat_100'),carbs_100:read('customFood_carbs_100'),
  submit_for_review:Boolean($('customFoodSubmitReview')?.checked)};
 const issue=$('customFoodError');
 if(vals.name.length<2||Object.keys(vals).filter(k=>k.endsWith('_100')).some(k=>!Number.isFinite(vals[k])||vals[k]<0)||
  (!vals.kcal_100&&!vals.protein_100&&!vals.fat_100&&!vals.carbs_100)){
  if(issue)issue.textContent='Заповни назву та всі значення КБЖУ на 100 г.';return;
 }
 button.disabled=true;
 try{
  const response=await api('/nutrition/my-foods'+(privateFoodEditing?'/'+privateFoodEditing:''),{
   method:privateFoodEditing?'PATCH':'POST',body:JSON.stringify(vals)
  });
  $('myProductModal')?.remove();
  if($('myFoodsModal'))await openMyFoodLibrary();
  else{
   if(!$('foodSearchModal'))window.openFoodSearchModal(defaultMeal);
   choose(customFoodOption(response.item));
  }
 }catch(e){button.disabled=false;if(issue)issue.textContent=e.message||'Не вдалося зберегти продукт.'}
};
window.openMyRecipesLibrary=async function(){
 $('myRecipesModal')?.remove();
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="myRecipesModal">'
 +'<div class="card my-foods-panel"><div class="between"><h2>Мої рецепти</h2>'
 +'<button type="button" class="dark" onclick="myRecipesModal.remove()">×</button></div>'
 +'<p class="muted">Збережені страви з твого щоденника. Вони не потрапляють у загальну базу.</p>'
 +'<div id="myRecipesList">Завантаження…</div></div></div>');
 try{
  recipeItems=(await api('/nutrition/recipes')).items||[];
  $('myRecipesList').innerHTML=recipeItems.length?recipeItems.map(x=>
   '<div class="my-food-row"><div><strong>'+esc(x.name)+'</strong><small>'+fmt(x.grams)+' г · '
   +fmt(x.kcal_100*Number(x.grams)/100)+' ккал</small><small>'+x.ingredients.length+' складників</small></div>'
   +'<div class="my-food-row-actions"><button type="button" onclick="logMyRecipe('+Number(x.id)+',this)">Додати</button>'
   +'<button type="button" onclick="deleteMyRecipe('+Number(x.id)+')">×</button></div></div>'
  ).join(''):'<p class="muted">Збережених рецептів поки немає. Створи їх з будь-якого заповненого прийому їжі.</p>';
 }catch(e){$('myRecipesList').textContent=e.message||'Не вдалося завантажити рецепти.'}
};
window.logMyRecipe=async function(id,button){
 const recipe=recipeItems.find(x=>Number(x.id)===Number(id));if(!recipe)return;
 const input=prompt('Вага порції рецепта, г',Math.min(2000,recipe.grams));
 if(input===null)return;
 const grams=Number(String(input).replace(',','.'));
 if(!Number.isFinite(grams)||grams<=0||grams>2000)return alert('Вкажи вагу від 1 до 2000 г.');
 button.disabled=true;
 try{
  await api('/nutrition/recipes/'+id+'/log',{method:'POST',body:JSON.stringify({
   day:window.nutritionDiaryDay||isoToday(),meal:defaultMeal,grams
  })});
  $('myRecipesModal')?.remove();$('foodSearchModal')?.remove();serial++;
  await showClientNutrition(session.client_id);
 }catch(e){button.disabled=false;alert(e.message||'Не вдалося додати рецепт.')}
};
window.deleteMyRecipe=async function(id){
 if(!confirm('Видалити збережений рецепт? Записи щоденника залишаться.'))return;
 try{await api('/nutrition/recipes/'+id,{method:'DELETE'});await openMyRecipesLibrary()}
 catch(e){alert(e.message||'Не вдалося видалити рецепт.')}
};

})();
