// Є ПЛАН: nutrition constructor preview UI (isolated demo branch).
// Text-only product rows. All macros are calculated from the locally audited catalog.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('uk-UA',{maximumFractionDigits:1});
const keys=['kcal','protein','fat','carbs'];
const sourceKeys=['kcal_100','protein_100','fat_100','carbs_100'];
const icons={kcal:'◉',protein:'◌',fat:'♢',carbs:'≋'};
const labels={kcal:'Калорії',protein:'Білки',fat:'Жири',carbs:'Вуглеводи'};
let picker=null;
window.structuredCatalog=null;

const dataFor=id=>(window.structuredCatalog||[]).find(x=>x.source_id===id);
const mealFor=(n,v)=>(nutritionPlanDraft||[]).find(x=>x.meal_number===+n&&x.variant_number===+v);
function quantityFor(food,row){
 return food?.unit==='pcs'?(Number.isFinite(Number(row?.count))&&Number(row.count)>0?Number(row.count):Math.max(1,Math.round(Number(row?.grams||50)/50))):Number(row?.grams||0);
}
function gramsFor(food,row){
 return food?.unit==='pcs'?quantityFor(food,row)*Number(food?.grams_per_piece||50):Number(row?.grams||0);
}
function macros(food,grams){
 return Object.fromEntries(keys.map((k,i)=>[k,Number(food?.[sourceKeys[i]]||0)*grams/100]));
}
function add(a,b){for(const k of keys)a[k]+=b[k];return a}
const zeros=()=>({kcal:0,protein:0,fat:0,carbs:0});
function mealMacros(item,actual=false){
 const total=zeros();
 for(const row of item?.foods||[]){
  if(!actual&&row.count_in_targets===false)continue;
  add(total,macros(dataFor(row.source_id),gramsFor(dataFor(row.source_id),row)));
 }
 return total;
}
function dayMacros(actual=false,override=null){
 const total=zeros();
 const all=nutritionPlanDraft||[];
 const mealNos=[...new Set(all.map(x=>x.meal_number))];
 for(const n of mealNos){
  const variant=all.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number)[0];
  if(!variant)continue;
  const selected=override?.n===n&&override?.v===variant.variant_number?override.item:variant;
  add(total,mealMacros(selected,actual));
 }
 return total;
}
const macroText=v=>fmt(v.kcal)+' ккал · Б '+fmt(v.protein)+' · Ж '+fmt(v.fat)+' · В '+fmt(v.carbs);
function syncContent(item){
 item.content=(item.foods||[]).map(row=>{
  const f=dataFor(row.source_id);if(!f)return '';
  const q=quantityFor(f,row),unit=f.unit==='pcs'?' шт.':' г';
  return f.name+' — '+fmt(q)+unit+(row.count_in_targets===false?' · овочі поза цільовими БЖВ':'');
 }).filter(Boolean).join('\n');
}
function persistChange(){
 if(typeof window.demoDraftChanged==='function')window.demoDraftChanged();
}
function setQuantity(item,row,food,quantity){
 if(!Number.isFinite(quantity))return false;
 if(food.unit==='pcs'){
  if(!Number.isInteger(quantity)||quantity<1||quantity>8)return false;
  row.count=quantity;row.grams=quantity*Number(food.grams_per_piece||50);
 }else{
  if(quantity<1||quantity>2000)return false;
  row.count=null;row.grams=Math.round(quantity*10)/10;
 }
 syncContent(item);
 return true;
}
function lineHTML(row,n,v,i){
 const food=dataFor(row.source_id);
 if(!food)return '<p class="missing-product">Продукт недоступний — вибери заміну</p>';
 const amount=quantityFor(food,row),value=macros(food,gramsFor(food,row));
 const veg=!row.count_in_targets&&food.optional_vegetable;
 return '<div class="structured-food-row" data-index="'+i+'">'
 +'<div class="structured-product-info">'
 +'<button type="button" class="structured-food-name" onclick="pickStructuredFood('+n+','+v+','+i+')" aria-label="Редагувати '+escapeHtml(food.name)+'">'+escapeHtml(food.name)+'</button>'
 +(veg?'<span class="vegetable-label">Овочі поза цільовими БЖВ</span>':'')
 +'<span class="structured-food-macro">'+macroText(value)+'</span></div>'
 +'<div class="stepper"><button type="button" class="stepper-minus" aria-label="Зменшити порцію" onclick="stepStructuredQty('+n+','+v+','+i+',-1)">−</button>'
 +'<label><input class="structured-grams" type="number" inputmode="decimal" min="1" max="'+(food.unit==='pcs'?'8':'2000')+'" step="'+(food.unit==='pcs'?'1':'5')+'" value="'+fmt(amount).replace(',','.')+'" oninput="editStructuredQty('+n+','+v+','+i+',this)"><span>'+ (food.unit==='pcs'?'шт.':'г')+'</span></label>'
 +'<button type="button" class="stepper-plus" aria-label="Збільшити порцію" onclick="stepStructuredQty('+n+','+v+','+i+',1)">+</button></div>'
 +'</div>';
}
window.renderStructuredMealHTML=function(item){
 const n=item.meal_number,v=item.variant_number;
 const listed=(item.foods||[]).map((row,i)=>lineHTML(row,n,v,i)).join('');
 const tracked=mealMacros(item),actual=mealMacros(item,true);
 return '<div class="structured-meal-editor" data-meal="'+n+'" data-variant="'+v+'">'
 +(listed||'<div class="empty-products">Додай продукти до цього варіанта</div>')
 +'<button type="button" class="structured-add" onclick="pickStructuredFood('+n+','+v+',-1)">＋ Додати продукт</button>'
 +'<div class="structured-meal-summary"><span class="structured-goal">Разом: '+macroText(tracked)+'</span>'
 +(keys.some(k=>Math.abs(actual[k]-tracked[k])>.05)?'<small>Фактично з овочами: '+macroText(actual)+'</small>':'')
 +'</div></div>';
};
window.structuredDailySummaryHTML=function(){
 const totals=dayMacros(),actual=dayMacros(true);
 const c=window.currentClientData?.client||{};
 const goal={kcal:c.kcal||0,protein:c.protein||0,fat:c.fat||0,carbs:c.carbs||0};
 return '<div id="structuredDailySummary" class="structured-daily-summary"><strong>Підсумок на день</strong><small>Враховано лише перший варіант кожного прийому</small>'
 +'<div class="structured-daily-grid">'+keys.map(k=>{
  const pct=goal[k]>0?Math.round(totals[k]/goal[k]*100):0;
  return '<div class="nutrition-stat stat-'+k+'"><div class="nutrition-stat-head"><span>'+labels[k]+'</span></div>'
   +'<b>'+fmt(totals[k])+' <em>/ '+fmt(goal[k])+(k==='kcal'?'':' г')+'</em></b>'
   +'<div class="progress-track"><span style="width:'+Math.min(100,Math.max(0,pct))+'%"></span></div></div>';
 }).join('')+'</div>'
 +(keys.some(k=>Math.abs(actual[k]-totals[k])>.05)?'<p>Фактично з овочами: '+macroText(actual)+'</p>':'')
 +'</div>';
};
window.refreshStructuredNutrition=function(){
 document.querySelectorAll('.structured-meal-editor').forEach(node=>{
  const item=mealFor(node.dataset.meal,node.dataset.variant);if(!item)return;
  const a=mealMacros(item),b=mealMacros(item,true);
  const goal=node.querySelector('.structured-meal-summary');
  if(goal)goal.innerHTML='<span class="structured-goal">Разом: '+macroText(a)+'</span>'
   +(keys.some(k=>Math.abs(a[k]-b[k])>.05)?'<small>Фактично з овочами: '+macroText(b)+'</small>':'');
  const variant=node.closest('.variant-card')?.querySelector('.variant-kcal');
  if(variant)variant.textContent=fmt(a.kcal)+' ккал';
 });
 const day=$('dailySummary');
 if(day)day.innerHTML=window.structuredDailySummaryHTML();
 document.querySelectorAll('.meal-card').forEach(card=>{
  const n=+card.dataset.meal,primary=(nutritionPlanDraft||[]).filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number)[0];
  const label=card.querySelector('.meal-kcal');
  if(label&&primary)label.textContent=fmt(mealMacros(primary).kcal)+' ккал';
 });
 persistChange();
};
function syncRow(item,i){
 const container=document.querySelector('.structured-meal-editor[data-meal="'+item.meal_number+'"][data-variant="'+item.variant_number+'"]');
 const row=container?.querySelector('.structured-food-row[data-index="'+i+'"]');if(!row)return;
 const food=dataFor(item.foods[i].source_id);
 row.querySelector('.structured-food-macro').textContent=macroText(macros(food,gramsFor(food,item.foods[i])));
 window.refreshStructuredNutrition();
}
window.stepStructuredQty=function(n,v,i,delta){
 const item=mealFor(n,v),row=item?.foods?.[i],food=row&&dataFor(row.source_id);if(!food)return;
 const amount=quantityFor(food,row)+(food.unit==='pcs'?1:5)*delta;
 if(!setQuantity(item,row,food,amount))return;
 const input=document.querySelector('.structured-meal-editor[data-meal="'+n+'"][data-variant="'+v+'"] .structured-food-row[data-index="'+i+'"] input');
 if(input)input.value=amount;
 syncRow(item,i);
};
window.editStructuredQty=function(n,v,i,input){
 const item=mealFor(n,v),row=item?.foods?.[i],food=row&&dataFor(row.source_id);if(!food)return;
 const next=Number(input.value);
 if(!input.value||!setQuantity(item,row,food,next))return;
 syncRow(item,i);
};
window.deleteStructuredFood=function(n,v,i){
 const item=mealFor(n,v);if(!item?.foods)return;
 item.foods.splice(i,1);syncContent(item);
 if(typeof window.rerenderNutritionPlan==='function')window.rerenderNutritionPlan(true);
 persistChange();
};
window.toggleStructuredVegetable=function(n,v,i,on){
 const item=mealFor(n,v),row=item?.foods?.[i],food=row&&dataFor(row.source_id);
 if(!food?.optional_vegetable)return;
 row.count_in_targets=!!on;syncContent(item);
 if(typeof window.rerenderNutritionPlan==='function')window.rerenderNutritionPlan(true);
 persistChange();
};
const options=[
 ['all','Усі'],['popular','Популярні'],['veg','Овочі'],['fruit','Фрукти'],
 ['grain','Крупи'],['protein','Білкові'],['dairy','Молочні']
];
function category(food){
 const name=food.name.toLocaleLowerCase('uk-UA');
 if(/огір|помідор|шпинат|моркв|капуст|броколі|перець/.test(name))return 'veg';
 if(/банан|яблу|груш|апельс|ягод|виноград/.test(name))return 'fruit';
 if(/греч|рис|вівсян|пластів|макарон|булгур|круп|хліб/.test(name))return 'grain';
 if(/йогурт|молок|сир|кефір/.test(name))return 'dairy';
 if(/яйц|яйце|куряч|індич|лосос|тун|квасол|риба|ялович/.test(name))return 'protein';
 return 'other';
}
function pickerRow(food){
 return '<button type="button" class="picker-food '+(picker.selected===food.source_id?'selected':'')+'" data-sid="'+escapeHtml(food.source_id)+'">'
 +'<strong>'+escapeHtml(food.name)+'</strong><span>'+fmt(food.kcal_100)+' ккал · Б '+fmt(food.protein_100)+' · Ж '+fmt(food.fat_100)+' · В '+fmt(food.carbs_100)+' / 100 г</span></button>';
}
function renderList(){
 if(!$('structuredFoodMatches')||!picker)return;
 const search=($('structuredFoodSearch')?.value||'').trim().toLocaleLowerCase('uk-UA');
 const matches=(window.structuredCatalog||[]).filter(f=>(picker.filter==='all'
  ||picker.filter==='popular'&&(/яйце|куряч|вівсян|банан|йогурт|рис|греч|помідор|огір/.test(f.name.toLocaleLowerCase('uk-UA')))
  ||category(f)===picker.filter)&&f.name.toLocaleLowerCase('uk-UA').includes(search)).slice(0,42);
 $('structuredFoodMatches').innerHTML=matches.map(pickerRow).join('')||'<p class="no-matches">Нічого не знайдено. Спробуй іншу назву.</p>';
 $('structuredFoodMatches').querySelectorAll('button[data-sid]').forEach(b=>b.onclick=()=>chooseProduct(b.dataset.sid));
 const filters=$('structuredFilters');
 if(filters)filters.innerHTML=options.map(([k,label])=>'<button type="button" class="'+(k===picker.filter?'selected':'')+'" data-filter="'+k+'">'+label+'</button>').join('');
 filters?.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{picker.filter=b.dataset.filter;renderList()});
}
function projectedTotals(){
 const item=mealFor(picker.n,picker.v);if(!item)return null;
 const clone={...item,foods:(item.foods||[]).map(x=>({...x}))};
 const f=dataFor(picker.selected);
 if(f){
  const row={source_id:f.source_id,grams:picker.qty*(f.unit==='pcs'?(f.grams_per_piece||50):1),
   count:f.unit==='pcs'?picker.qty:null,count_in_targets:!f.optional_vegetable||picker.includeVeg};
  if(picker.i>=0)clone.foods[picker.i]=row;else clone.foods.push(row);
 }
 return {meal:mealMacros(clone),day:dayMacros(false,{n:picker.n,v:picker.v,item:clone})};
}
function miniStats(values){
 return '<div class="picker-stats">'+keys.map(k=>'<span class="stat-'+k+'"><b>'+fmt(values[k])+'</b><small>'+labels[k]+(k==='kcal'?'':' · г')+'</small></span>').join('')+'</div>';
}
function renderDetails(){
 const node=$('structuredFoodDetail'),food=dataFor(picker?.selected);
 if(!node)return;
 if(!food){node.innerHTML='<div class="picker-empty">Обери продукт зі списку, щоб налаштувати кількість.</div>';return;}
 const egg=food.unit==='pcs',grams=picker.qty*(egg?(food.grams_per_piece||50):1);
 const per100=macros(food,100),total=macros(food,grams);
 const summary=projectedTotals();
 node.innerHTML='<div class="detail-title"><strong>'+escapeHtml(food.name)+'</strong><small>На 100 г продукту · перевірена база</small></div>'
  +miniStats(per100)
  +'<div class="quantity-section"><strong>Кількість</strong><div class="quantity-control">'
  +'<button type="button" id="pickerQtyMinus">−</button><label><input id="pickerQty" type="number" inputmode="decimal" min="1" max="'+(egg?'8':'2000')+'" value="'+picker.qty+'"><span>'+(egg?'шт.':'г')+'</span></label>'
  +'<button type="button" id="pickerQtyPlus">+</button></div>'
  +(egg?'<p class="hint">≈ '+fmt(grams)+' г їстівної частини · 1 яйце ≈ 50 г без шкаралупи</p>':'')
  +'</div>'
  +(food.optional_vegetable?'<label class="veg-choice"><span><strong>Враховувати овочі в цільових БЖВ</strong><small>Фактичні калорії враховуються завжди</small></span><input id="pickerIncludeVeg" type="checkbox" '+(picker.includeVeg?'checked':'')+'></label>':'')
  +'<div class="selected-macros"><strong>Поживна цінність обраної кількості</strong>'+miniStats(total)+'</div>'
  +(summary?'<div class="picker-impact"><strong>Після оновлення</strong><span>Прийом їжі: '+macroText(summary.meal)+'</span><span>За день: '+macroText(summary.day)+'</span></div>':'')
  +'<button type="button" class="picker-apply" id="pickerApply">'+(picker.i<0?'Додати в прийом їжі':'Зберегти зміни')+'</button>'
  +(picker.i>=0?'<button type="button" class="picker-remove" id="pickerRemove">Видалити з прийому</button>':'');
 const input=$('pickerQty');
 const changeQty=delta=>{
  const value=Number(input.value)+delta*(egg?1:5);
  if(value<1||value>(egg?8:2000))return;
  picker.qty=value;renderDetails();
 };
 $('pickerQtyMinus').onclick=()=>changeQty(-1);
 $('pickerQtyPlus').onclick=()=>changeQty(1);
 input.oninput=()=>{
  const v=Number(input.value);
  if(input.value&&Number.isFinite(v)&&v>=1&&v<=(egg?8:2000)&&(!egg||Number.isInteger(v))){
   picker.qty=v;
   renderDetails();
   $('pickerQty')?.focus();
  }
 };
 const toggle=$('pickerIncludeVeg');
 if(toggle)toggle.onchange=()=>{picker.includeVeg=toggle.checked;renderDetails()};
 $('pickerApply').onclick=applyPicker;
 if($('pickerRemove'))$('pickerRemove').onclick=()=>{
  const {n,v,i}=picker;closePicker();window.deleteStructuredFood(n,v,i);
 };
}
function chooseProduct(sid){
 const f=dataFor(sid);if(!f)return;
 picker.selected=sid;
 const prev=picker.i>=0?mealFor(picker.n,picker.v)?.foods?.[picker.i]:null;
 picker.qty=f.unit==='pcs'?Math.max(1,Math.min(8,Math.round(Number(prev?.grams||100)/50))):Math.max(1,Math.min(2000,Number(prev?.grams||100)));
 picker.includeVeg=!f.optional_vegetable;
 renderList();renderDetails();
}
function closePicker(){$('structuredFoodPicker')?.remove();picker=null;document.body.classList.remove('picker-open')}
function applyPicker(){
 const food=dataFor(picker?.selected),item=picker&&mealFor(picker.n,picker.v);
 if(!food||!item)return;
 if(!Number.isFinite(picker.qty)||picker.qty<1||picker.qty>(food.unit==='pcs'?8:2000)||(food.unit==='pcs'&&!Number.isInteger(picker.qty)))return;
 const row={source_id:food.source_id,grams:picker.qty*(food.unit==='pcs'?(food.grams_per_piece||50):1),
  count:food.unit==='pcs'?picker.qty:null,count_in_targets:!food.optional_vegetable||picker.includeVeg};
 if(picker.i>=0)item.foods[picker.i]=row;else(item.foods||(item.foods=[])).push(row);
 syncContent(item);closePicker();
 if(typeof window.rerenderNutritionPlan==='function')window.rerenderNutritionPlan(true);
 persistChange();
}
window.pickStructuredFood=function(n,v,i){
 const item=mealFor(n,v);if(!item||!window.structuredCatalog?.length)return;
 const row=i>=0?item.foods?.[i]:null;
 const food=row&&dataFor(row.source_id);
 picker={n,v,i,selected:food?.source_id||null,filter:'all',
  qty:food?quantityFor(food,row):100,includeVeg:row?.count_in_targets!==false};
 $('structuredFoodPicker')?.remove();
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="structuredFoodPicker" role="dialog" aria-modal="true" aria-label="Редагування продукту">'
 +'<div class="card structured-picker">'
 +'<div class="structured-picker-head"><div class="picker-handle"></div><button type="button" class="picker-close" id="structuredPickerClose" aria-label="Закрити">×</button>'
 +'<h2>Редагування продукту</h2><p>Знайди продукт і налаштуй кількість</p></div>'
 +'<div class="picker-search-wrap"><span>⌕</span><input id="structuredFoodSearch" type="search" placeholder="Пошук продукту" autocomplete="off"></div>'
 +'<div id="structuredFilters" class="picker-filters"></div>'
 +'<div class="picker-columns"><div id="structuredFoodMatches" class="picker-list"></div><div id="structuredFoodDetail" class="picker-details"></div></div>'
 +'</div></div>');
 document.body.classList.add('picker-open');
 $('structuredPickerClose').onclick=closePicker;
 $('structuredFoodSearch').oninput=renderList;
 renderList();renderDetails();
};
})();
