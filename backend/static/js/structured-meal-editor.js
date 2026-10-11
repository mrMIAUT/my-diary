// Optional structured nutrition editor: loaded only by the trainer.
// Catalog values are a local, approved preview. The server recalculates on save.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('uk-UA',{maximumFractionDigits:1});
const macroKeys=['kcal','protein','fat','carbs'];
const sourceKeys=['kcal_100','protein_100','fat_100','carbs_100'];
let picker=null;
window.structuredCatalog=null;
window.loadStructuredMealCatalog=async function(){
 if(window.structuredCatalog?.length)return window.structuredCatalog;
 const res=await api('/trainer/foods/catalog');
 if(!Array.isArray(res?.items)||!res.items.length)throw Error('Catalog empty');
 window.structuredCatalog=res.items;
 return res.items;
};
function byId(source_id){
 return (window.structuredCatalog||[]).find(x=>x.source_id===source_id);
}
function draft(n,v){
 return (nutritionPlanDraft||[]).find(x=>x.meal_number===+n&&x.variant_number===+v);
}
function grams(food,row){
 return food?.unit==='pcs'?(Math.round(Number(row?.count)||Number(row?.grams)/50)||1)*50:Number(row?.grams)||0;
}
function perFood(row){
 const food=byId(row.source_id);
 const amount=grams(food,row);
 if(!food||!Number.isFinite(amount)||amount<0)return {kcal:0,protein:0,fat:0,carbs:0};
 return Object.fromEntries(macroKeys.map((k,i)=>[k,Number(food[sourceKeys[i]]||0)*amount/100]));
}
function mealTotal(item,actual=false){
 const sum={kcal:0,protein:0,fat:0,carbs:0};
 for(const row of item?.foods||[]){
   if(!actual&&row.count_in_targets===false)continue;
   const v=perFood(row);
   for(const k of macroKeys)sum[k]+=v[k];
 }
 return sum;
}
function dailyTotals(actual=false){
 const sum={kcal:0,protein:0,fat:0,carbs:0};
 const mealNums=[...new Set((nutritionPlanDraft||[]).map(x=>x.meal_number))];
 for(const n of mealNums){
   const variant=(nutritionPlanDraft||[]).filter(x=>x.meal_number===n)
        .sort((a,b)=>a.variant_number-b.variant_number)[0];
   if(!variant?.foods?.length)continue;
   const totals=mealTotal(variant,actual);
   for(const k of macroKeys)sum[k]+=totals[k];
 }
 return sum;
}
function macroLine(vals){
 return fmt(vals.kcal)+' ккал · Б '+fmt(vals.protein)+' · Ж '+fmt(vals.fat)+' · В '+fmt(vals.carbs);
}
function syncText(item){
 item.content=(item.foods||[]).map(row=>{
   const food=byId(row.source_id);
   if(!food)return '';
   const unit=food.unit==='pcs'?(Number(row.count)||1)+' шт.':fmt(row.grams)+' г';
   return food.name+' — '+unit+(row.count_in_targets===false?' (не входить у цільові БЖВ)':'');
 }).filter(Boolean).join('\n');
}
window.renderStructuredMealHTML=function(item){
 const n=item.meal_number,v=item.variant_number;
 const html=(item.foods||[]).map((row,i)=>{
   const food=byId(row.source_id);
   if(!food)return '';
   const val=perFood(row);
   const egg=food.unit==='pcs',unit=egg?'шт.':'г';
   const quantity=egg?(Number(row.count)||Math.max(1,Math.round(row.grams/50))):Number(row.grams)||100;
   return '<div class="structured-food-row" data-index="'+i+'">'
    +'<div class="structured-food-title"><button type="button" class="structured-food-name" onclick="pickStructuredFood('+n+','+v+','+i+')">'+esc(food.name)+' <span>Замінити</span></button>'
    +'<button class="structured-remove" type="button" aria-label="Прибрати продукт" onclick="deleteStructuredFood('+n+','+v+','+i+')">×</button></div>'
    +'<div class="structured-food-details"><label><input class="structured-grams" type="number" min="'+(egg?'1':'1')+'" max="'+(egg?'8':'2000')+'" step="'+(egg?'1':'1')+'" inputmode="decimal" value="'+quantity+'" oninput="editStructuredQty('+n+','+v+','+i+',this)"><span>'+unit+'</span></label>'
    +'<span class="structured-food-macro">'+macroLine(val)+'</span></div>'
    +(food.optional_vegetable?'<label class="structured-veg-opt"><input type="checkbox" '+(row.count_in_targets===false?'':'checked')+' onchange="toggleStructuredVegetable('+n+','+v+','+i+',this.checked)"> Враховувати овочі в цільових БЖВ</label>':'')
    +'</div>';
 }).join('');
 const totals=mealTotal(item);
 const actual=mealTotal(item,true);
 return '<div class="structured-meal-editor" data-meal="'+n+'" data-variant="'+v+'">'
    +html
    +'<button type="button" class="structured-add" onclick="pickStructuredFood('+n+','+v+',-1)">+ Додати продукт</button>'
    +'<div class="structured-meal-summary"><strong>Цільові · '+macroLine(totals)+'</strong>'
    +(macroKeys.some(k=>Math.abs(actual[k]-totals[k])>.1)?'<small>Фактично з овочами · '+macroLine(actual)+'</small>':'')
    +'</div></div>';
};
window.structuredDailySummaryHTML=function(){
 if(!(nutritionPlanDraft||[]).some(x=>x.foods?.length))return '';
 const totals=dailyTotals();
 const c=window.currentClientData?.client||{};
 const goal={kcal:c.kcal||0,protein:c.protein||0,fat:c.fat||0,carbs:c.carbs||0};
 const differ=macroKeys.map(k=>'<span><small>'+({kcal:'Ккал',protein:'Білки',fat:'Жири',carbs:'Вуглеводи'}[k])+'</small>'
    +'<b>'+fmt(totals[k])+'</b><small>з '+fmt(goal[k])+'</small></span>').join('');
 const actual=dailyTotals(true);
 return '<div id="structuredDailySummary" class="structured-daily-summary"><strong>Денний підсумок · основні варіанти</strong>'
   +'<div class="structured-daily-grid">'+differ+'</div>'
   +'<p>З усіма овочами фактично: '+macroLine(actual)+'</p>'
   +'<small>Альтернативи не додаються до денного підсумку. Це оцінка на основі записів каталогу.</small></div>';
};
window.refreshStructuredNutrition=function(){
 document.querySelectorAll('.structured-meal-editor').forEach(box=>{
   const item=draft(box.dataset.meal,box.dataset.variant);
   if(!item)return;
   const a=mealTotal(item),b=mealTotal(item,true);
   const el=box.querySelector('.structured-meal-summary');
   if(el)el.innerHTML='<strong>Цільові · '+macroLine(a)+'</strong>'
      +(macroKeys.some(k=>Math.abs(a[k]-b[k])>.1)?'<small>Фактично з овочами · '+macroLine(b)+'</small>':'');
 });
 const day=$('structuredDailySummary');
 if(day)day.outerHTML=window.structuredDailySummaryHTML();
};
window.editStructuredQty=function(n,v,i,input){
 const item=draft(n,v),row=item?.foods?.[i],food=row&&byId(row.source_id);
 if(!item||!food)return;
 const qty=Number(input.value);
 if(!Number.isFinite(qty)||qty<=0)return;
 const value=food.unit==='pcs'?Math.round(qty):Math.round(qty*10)/10;
 if(food.unit==='pcs'&&(value<1||value>8))return;
 if(food.unit!=='pcs'&&value>2000)return;
 row.grams=food.unit==='pcs'?value*50:value;
 row.count=food.unit==='pcs'?value:null;
 syncText(item);
 const metric=input.closest('.structured-food-row')?.querySelector('.structured-food-macro');
 if(metric)metric.textContent=macroLine(perFood(row));
 window.refreshStructuredNutrition();
};
window.toggleStructuredVegetable=function(n,v,i,on){
 const item=draft(n,v),row=item?.foods?.[i],food=row&&byId(row.source_id);
 if(!food?.optional_vegetable)return;
 row.count_in_targets=!!on;
 syncText(item);
 window.refreshStructuredNutrition();
};
window.deleteStructuredFood=function(n,v,i){
 const item=draft(n,v);if(!item?.foods)return;
 item.foods.splice(i,1);syncText(item);rerenderNutritionPlan(true);
};
window.pickStructuredFood=function(n,v,i){
 if(!draft(n,v)||!window.structuredCatalog?.length)return;
 picker={n,v,i};
 $('structuredFoodPicker')?.remove();
 document.body.insertAdjacentHTML('beforeend',
  '<div class="modal" id="structuredFoodPicker" role="dialog" aria-modal="true">'
  +'<div class="card structured-picker"><div class="structured-picker-head">'
  +'<strong>Обрати продукт</strong><button id="structuredPickerClose" type="button">✕</button></div>'
  +'<input id="structuredFoodSearch" type="search" placeholder="Пошук за назвою продукту" autocomplete="off">'
  +'<div id="structuredFoodMatches"></div></div></div>');
 $('structuredPickerClose').onclick=()=>{$('structuredFoodPicker').remove();picker=null};
 $('structuredFoodSearch').oninput=()=>renderMatches($('structuredFoodSearch').value);
 renderMatches('');
 $('structuredFoodSearch').focus();
};
function renderMatches(query){
 const term=String(query||'').trim().toLocaleLowerCase('uk-UA');
 const matches=(window.structuredCatalog||[]).filter(x=>x.name.toLocaleLowerCase('uk-UA').includes(term)).slice(0,35);
 $('structuredFoodMatches').innerHTML=matches.map(x=>'<button type="button" data-sid="'+esc(x.source_id)+'"><strong>'+esc(x.name)+'</strong><small>'
     +fmt(x.kcal_100)+' ккал · Б '+fmt(x.protein_100)+' · Ж '+fmt(x.fat_100)+' · В '+fmt(x.carbs_100)+' / 100 г</small></button>').join('')
    ||'<p>Немає відповідних продуктів у перевіреній базі.</p>';
 $('structuredFoodMatches').querySelectorAll('button[data-sid]').forEach(button=>{
   button.onclick=()=>window.selectStructuredFood(button.dataset.sid);
 });
}
window.selectStructuredFood=function(sid){
 if(!picker)return;
 const {n,v,i}=picker,food=byId(sid),item=draft(n,v);
 if(!food||!item)return;
 const prev=i>=0?item.foods[i]:null;
 const count=food.unit==='pcs'?Math.max(1,Math.min(8,Math.round((prev?.grams||100)/50))):null;
 const fresh={source_id:sid,count,grams:count?count*50:(prev?.grams||100),
    count_in_targets:!food.optional_vegetable};
 if(i>=0)item.foods[i]=fresh;else (item.foods||(item.foods=[])).push(fresh);
 syncText(item);$('structuredFoodPicker')?.remove();picker=null;
 rerenderNutritionPlan(true);
};
})();
