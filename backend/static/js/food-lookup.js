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
 button.disabled=true;button.textContent='Зберігаємо…';
 try{
  await api('/nutrition/diary',{method:'POST',body:JSON.stringify({
   day:window.nutritionDiaryDay||isoToday(),meal,grams,
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
})();
