// Authenticated, read-only product lookup for the production Nutrition screen.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(Math.round((Number(n)||0)*10)/10).toLocaleString('uk-UA',{maximumFractionDigits:1});
let timer=null,serial=0,chosen=null;
window.openFoodSearchModal=function(){
 $('foodSearchModal')?.remove();serial++;chosen=null;
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="foodSearchModal"><div class="card food-lookup-modal">'
  +'<div class="between"><div><h2>Пошук продуктів</h2><p class="muted">Калорії та БЖВ на 100 г продукту</p></div><button type="button" class="dark" id="foodSearchClose">✕</button></div>'
  +'<input id="foodLookupQuery" type="search" maxlength="120" autocomplete="off" aria-label="Пошук продуктів" placeholder="Наприклад, гречка, молоко, курка">'
  +'<p class="food-lookup-status" id="foodLookupStatus">Введи щонайменше 2 символи.</p>'
  +'<div class="food-lookup-results" id="foodLookupResults"></div><div id="foodLookupPortion"></div>'
  +'<p class="food-lookup-note">Дані залежать від виробника та способу приготування. Це довідковий пошук — записи до щоденника БЖВ не додаються автоматично.</p></div></div>');
 $('foodSearchClose').onclick=()=>{$('foodSearchModal')?.remove();serial++};
 $('foodLookupQuery').oninput=function(){
  const q=this.value.trim(),requestId=++serial;clearTimeout(timer);
  $('foodLookupPortion').innerHTML='';chosen=null;
  if(q.length<2){$('foodLookupResults').innerHTML='';$('foodLookupStatus').textContent='Введи щонайменше 2 символи.';return}
  $('foodLookupStatus').textContent='Шукаємо…';
  timer=setTimeout(()=>lookup(q,requestId),500);
 };
 $('foodLookupQuery').focus();
};
async function lookup(query,id){
 try{
  const data=await api('/foods/search?q='+encodeURIComponent(query)+'&limit=12&page=1');
  if(id!==serial||!$('foodSearchModal'))return;
  const items=Array.isArray(data?.items)?data.items:[];
  $('foodLookupStatus').textContent=items.length?'Результати: '+items.length+(data?.has_more?' · уточни запит для інших':''):'Нічого не знайдено.';
  $('foodLookupResults').innerHTML=items.map((x,i)=>'<button type="button" class="food-lookup-row" data-i="'+i+'">'
    +'<strong>'+esc(x.name||'Продукт')+'</strong>'
    +(x.brand?'<small>'+esc(x.brand)+'</small>':'')
    +'<span>'+esc(x.source_label||x.source||'Джерело не вказано')+(x.approximate?' · орієнтовно':'')+'</span>'
    +'<em>'+fmt(x.kcal_100)+' ккал · Б '+fmt(x.protein_100)+' · Ж '+fmt(x.fat_100)+' · В '+fmt(x.carbs_100)+'</em></button>').join('');
  $('foodLookupResults').querySelectorAll('[data-i]').forEach(btn=>btn.onclick=()=>choose(items[+btn.dataset.i]));
 }catch(_){
  if(id!==serial||!$('foodSearchModal'))return;
  $('foodLookupStatus').textContent='Помилка пошуку. Спробуй ще раз.';
  $('foodLookupResults').innerHTML='';
 }
}
function choose(x){
 chosen=x;
 $('foodLookupPortion').innerHTML='<div class="food-lookup-portion"><strong>'+esc(x.name||'Продукт')+'</strong>'
  +'<label>Вага порції, г <input id="foodLookupGrams" type="number" min="1" max="2000" step="1" value="100"></label>'
  +'<div id="foodLookupMacros"></div></div>';
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
})();
