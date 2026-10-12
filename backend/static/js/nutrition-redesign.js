// Redesign V1 — client Nutrition tab.

window.clientNutritionPeriod = window.clientNutritionPeriod || 'today';
window.clientNutritionHistoryExpanded = window.clientNutritionHistoryExpanded || false;

function nutritionPct(v,target){
  if(!target)return 0;
  return Math.max(0,Math.min(100,Math.round((+v||0)/(+target||1)*100)));
}

function nutritionRing(label,value,target,unit,tone){
  let pct=nutritionPct(value,target);
  return '<div class="redesign-macro-ring-card">'
    +'<div class="redesign-macro-ring '+tone+'" style="--pct:'+pct+'"><span>'+pct+'%</span></div>'
    +'<strong>'+esc(label)+'</strong>'
    +'<small>'+fmtProgress(+value||0)+' / '+fmtProgress(+target||0)+' '+esc(unit)+'</small>'
  +'</div>';
}

function nutritionPeriodTabs(){
  let tab=(key,label)=>'<button class="'+(window.clientNutritionPeriod===key?'active':'')+'" onclick="switchClientNutritionPeriod(\''+key+'\')">'+esc(label)+'</button>';
  return '<div class="redesign-nutrition-tabs">'+tab('today','Сьогодні')+tab('week','Тиждень')+tab('month','Місяць')+'</div>';
}

async function switchClientNutritionPeriod(key){
  window.clientNutritionPeriod=key;
  window.clientNutritionHistoryExpanded=false;
  if(session?.role==='client'&&session.client_id)await showClientNutrition(session.client_id);
}

function nutritionRangeItems(d,daysBack){
  let cutoff=new Date();cutoff.setDate(cutoff.getDate()-daysBack+1);
  let cut=cutoff.toISOString().slice(0,10);
  return (d.nutrition||[]).filter(x=>x.day&&x.day>=cut).slice().sort((a,b)=>b.day.localeCompare(a.day));
}

function nutritionHistoryHTML(d,daysBack,label){
  let xs=nutritionRangeItems(d,daysBack),c=d.client||{};
  let avg=(key)=>xs.length?Math.round(xs.reduce((s,x)=>s+(+x[key]||0),0)/xs.length):0;
  let isMonth=daysBack>7,limit=isMonth&&!window.clientNutritionHistoryExpanded?7:xs.length,visible=xs.slice(0,limit);
  return '<div class="redesign-nutrition-history">'
    +'<div class="redesign-nutrition-summary-grid">'
      +'<div><span>Середні калорії</span><strong>'+avg('kcal')+'</strong><small>ккал / день</small></div>'
      +'<div><span>Заповнено днів</span><strong>'+xs.length+'</strong><small>за '+esc(label.toLowerCase())+'</small></div>'
    +'</div>'
    +'<div class="card redesign-nutrition-average"><div class="between"><div><span class="nutrition-kicker">Середнє БЖВ</span><strong>'+avg('protein')+' / '+avg('fat')+' / '+avg('carbs')+' г</strong></div></div>'
      +'<div class="redesign-average-bars">'
        +'<span><b>Б</b><i><em style="width:'+nutritionPct(avg('protein'),c.protein)+'%"></em></i></span>'
        +'<span><b>Ж</b><i><em style="width:'+nutritionPct(avg('fat'),c.fat)+'%"></em></i></span>'
        +'<span><b>В</b><i><em style="width:'+nutritionPct(avg('carbs'),c.carbs)+'%"></em></i></span>'
      +'</div>'
    +'</div>'
    +(xs.length?'<div class="redesign-nutrition-day-list">'+visible.map(x=>'<div class="redesign-nutrition-day-row"><div class="nutrition-row-date"><strong>'+esc(formatProgressDate(x.day))+'</strong><small>'+x.kcal+' ккал</small></div><span class="nutrition-row-values">Б '+x.protein+' · Ж '+x.fat+' · В '+x.carbs+'</span><button class="nutrition-row-edit" onclick="'+(x.__diary?'changeNutritionDiaryDay(\''+esc(x.day)+'\');switchClientNutritionPeriod(\'today\')':'openNutritionDateEditor(\''+esc(x.day)+'\','+(d.client?.id||session?.client_id||0)+',\'nutrition\')')+'" aria-label="Редагувати БЖВ за '+esc(formatProgressDate(x.day))+'">'+uiIcon('edit')+'</button></div>').join('')+'</div>':'<div class="redesign-empty-panel"><strong>Ще немає даних</strong><span>Коли ти почнеш заповнювати харчування, статистика з’явиться тут.</span></div>')
    +(isMonth&&xs.length>7?'<button class="nutrition-history-more" onclick="toggleNutritionHistory()">'+(window.clientNutritionHistoryExpanded?'Згорнути':'Переглянути всі')+' <span>›</span></button>':'')
  +'</div>';
}

function toggleNutritionHistory(){
  window.clientNutritionHistoryExpanded=!window.clientNutritionHistoryExpanded;
  if(session?.role==='client'&&session.client_id)showClientNutrition(session.client_id);
}

window.openNutritionDateEditor = function(day,cid,source='nutrition'){
  document.getElementById('nutritionDateModal')?.remove();
  let d=window.currentClientData||{},c=d.client||{};
  let x=(d.nutrition||[]).filter(v=>v.day===day).sort((a,b)=>(+b.id||0)-(+a.id||0))[0]||{};
  let pretty=formatProgressDate(day);
  let val=(v)=>v==null||v===''?'':String(v);
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal" id="nutritionDateModal"><div class="card nutrition-date-modal">'
    +'<div class="nutrition-date-head"><div><h2>БЖВ за '+esc(pretty)+'</h2><p>Внеси або відредагуй підсумок харчування за цей день.</p></div><button class="nutrition-date-close" onclick="nutritionDateModal.remove()" aria-label="Закрити">×</button></div>'
    +'<div class="nutrition-date-grid">'
      +'<label><span>Калорії</span><input id="ndKcal" type="number" inputmode="decimal" value="'+val(x.kcal)+'" placeholder="Ккал · ціль '+(+c.kcal||0)+'"></label>'
      +'<label><span>Білки</span><input id="ndProtein" type="number" inputmode="decimal" value="'+val(x.protein)+'" placeholder="г · ціль '+(+c.protein||0)+'"></label>'
      +'<label><span>Жири</span><input id="ndFat" type="number" inputmode="decimal" value="'+val(x.fat)+'" placeholder="г · ціль '+(+c.fat||0)+'"></label>'
      +'<label><span>Вуглеводи</span><input id="ndCarbs" type="number" inputmode="decimal" value="'+val(x.carbs)+'" placeholder="г · ціль '+(+c.carbs||0)+'"></label>'
    +'</div>'
    +'<button class="nutrition-date-save" data-day="'+esc(day)+'" data-source="'+esc(source)+'" onclick="saveNutritionDateEditor(this.dataset.day,'+cid+',this.dataset.source,this)">Зберегти БЖВ</button>'
    +'</div></div>');
};

window.saveNutritionDateEditor = async function(day,cid,source='nutrition',button=null){
  let fields=['ndKcal','ndProtein','ndFat','ndCarbs'].map(id=>document.getElementById(id));
  if(fields.some(el=>!el||String(el.value).trim()===''))return alert('Заповни калорії, білки, жири та вуглеводи.');
  let [kcal,protein,fat,carbs]=fields.map(el=>+el.value);
  if([kcal,protein,fat,carbs].some(v=>!Number.isFinite(v)||v<0))return alert('Перевір значення БЖВ.');
  if(kcal>10000)return alert('Перевір калорії: значення понад 10 000 ккал виглядає помилковим.');
  if(protein>1000||fat>1000||carbs>1000)return alert('Перевір БЖВ: значення понад 1000 г виглядає помилковим.');
  let original=button?.textContent||'Зберегти БЖВ';
  if(button){button.disabled=true;button.textContent='Зберігаємо…'}
  try{
    await api('/history/nutrition',{method:'POST',body:JSON.stringify({client_id:cid,day,kcal,protein,fat,carbs})});
    document.getElementById('nutritionDateModal')?.remove();
    let nd=await loadClientData(cid);window.currentClientData=nd;
    if(source==='calendar'&&typeof showCalendarDay==='function')showCalendarDay(day,null,false);
    else await showClientNutrition(cid);
  }catch(e){
    if(button){button.disabled=false;button.textContent=original}
    alert(e.message||'Не вдалося зберегти БЖВ.');
  }
};

// EPLAN 1.2 — food diary is independent of the assigned training menu and
// preserves old manually-entered BJU days until the user first logs a product.
window.nutritionDiaryDay=window.nutritionDiaryDay||'';
window.nutritionDiaryState=null;
const nutritionDiaryMeals=[
 ['breakfast','Сніданок'],['lunch','Обід'],['snack','Перекус'],['dinner','Вечеря']
];
function nutritionDiaryNumber(v){return Number(v||0).toLocaleString('uk-UA',{maximumFractionDigits:1})}
function nutritionDiaryDayHTML(d,cid){
 if(d.diaryUnavailable)return '<section class="card nutrition-diary-card"><h2>Щоденник харчування</h2>'
  +'<p class="nutrition-diary-note">Щоденник тимчасово недоступний. Спробуй оновити сторінку, коли з’явиться інтернет.</p></section>';
 const state=d.diarySelected||{items:[],totals:{kcal:0,protein:0,fat:0,carbs:0},active:false};
 const meals=nutritionDiaryMeals;
 const display=state.active?'Записано за день':'Додай перший продукт, щоб почати щоденник.';
 const amount=(k)=>nutritionDiaryNumber(state.totals?.[k]||0);
 const day=window.nutritionDiaryDay||isoToday();
 return '<section class="card nutrition-diary-card" id="nutritionDiaryCard">'
  +'<div class="nutrition-diary-heading"><div><span class="nutrition-kicker">ХАРЧУВАННЯ</span>'
  +'<h2>Щоденник харчування</h2><p>'+display+'</p></div>'
  +'<label>Дата<input type="date" id="nutritionDiaryDate" aria-label="Дата щоденника"'
  +' max="'+isoToday()+'" value="'+esc(day)+'" onchange="changeNutritionDiaryDay(this.value)"></label></div>'
  +'<div class="nutrition-diary-day-total"><strong>'+amount('kcal')+' <small>ккал</small></strong>'
  +'<span>Б '+amount('protein')+' · Ж '+amount('fat')+' · В '+amount('carbs')+' г</span></div>'
  +meals.map(([key,label])=>{
   const items=(state.items||[]).filter(x=>x.meal===key);
   const subtotal=items.reduce((v,x)=>v+Number(x.kcal||0),0);
   return '<section class="nutrition-diary-meal" data-meal="'+key+'">'
   +'<div class="nutrition-diary-meal-head"><div><strong>'+label+'</strong><small>'
   +nutritionDiaryNumber(subtotal)+' ккал</small></div>'
   +'<button type="button" onclick="openFoodSearchLazy(\''+key+'\')">+ Додати</button></div>'
   +(items.length?items.map(item=>{
    const id=Number(item.id);
    return '<div class="nutrition-diary-item"><div><strong>'+esc(item.name)+'</strong>'
      +(item.brand?'<small>'+esc(item.brand)+'</small>':'')
      +'<small>'+nutritionDiaryNumber(item.grams)+' г · '+nutritionDiaryNumber(item.kcal)+' ккал'
      +' · Б '+nutritionDiaryNumber(item.protein)+' · Ж '+nutritionDiaryNumber(item.fat)+' · В '+nutritionDiaryNumber(item.carbs)+'</small>'
      +'</div><div class="nutrition-diary-item-actions">'
      +'<button type="button" aria-label="Змінити порцію" onclick="editNutritionDiaryEntry('+id+')">'+uiIcon('edit')+'</button>'
      +'<button type="button" aria-label="Видалити продукт" onclick="deleteNutritionDiaryEntry('+id+')">×</button>'
      +'</div></div>';
   }).join(''):'<p class="nutrition-diary-empty">Ще немає продуктів</p>')
   +'</section>';
  }).join('')
  +'<p class="nutrition-diary-note">Підрахунок за фактично доданими продуктами. Значення БЖВ залежать від джерела, марки та стану продукту.</p>'
  +'</section>';
}
window.changeNutritionDiaryDay=async function(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day>isoToday())return;
 window.nutritionDiaryDay=day;
 await showClientNutrition(session.client_id);
 document.getElementById('nutritionDiaryCard')?.scrollIntoView({block:'start'});
};
window.editNutritionDiaryEntry=function(id){
 const entry=window.nutritionDiaryState?.items?.find(x=>Number(x.id)===Number(id));
 if(!entry)return;
 document.getElementById('nutritionDiaryEditModal')?.remove();
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="nutritionDiaryEditModal">'
 +'<div class="card nutrition-diary-edit"><h2>Змінити порцію</h2><strong>'+esc(entry.name)+'</strong>'
 +'<label>Грамовка, г<input type="number" id="nutritionDiaryEditGrams" min="1" max="2000" step="1" inputmode="decimal" value="'+Number(entry.grams)+'"></label>'
 +'<label>Прийом їжі<select id="nutritionDiaryEditMeal">'
 +nutritionDiaryMeals.map(([k,t])=>'<option value="'+k+'"'+(entry.meal===k?' selected':'')+'>'+t+'</option>').join('')+'</select></label>'
 +'<div class="nutrition-diary-edit-actions"><button type="button" onclick="nutritionDiaryEditModal.remove()">Скасувати</button>'
 +'<button type="button" class="primary" onclick="saveNutritionDiaryEdit('+Number(id)+',this)">Зберегти</button></div>'
 +'</div></div>');
};
window.saveNutritionDiaryEdit=async function(id,button){
 const grams=Number(document.getElementById('nutritionDiaryEditGrams')?.value);
 const meal=document.getElementById('nutritionDiaryEditMeal')?.value;
 if(!Number.isFinite(grams)||grams<=0||grams>2000)return alert('Вкажи вагу від 1 до 2000 г.');
 if(!nutritionDiaryMeals.some(row=>row[0]===meal))return;
 button.disabled=true;
 try{
  await api('/nutrition/diary/'+id,{method:'PATCH',body:JSON.stringify({grams,meal})});
  document.getElementById('nutritionDiaryEditModal')?.remove();
  await showClientNutrition(session.client_id);
 }catch(e){button.disabled=false;alert(e.message||'Не вдалося зберегти порцію.')}
};
window.deleteNutritionDiaryEntry=async function(id){
 if(!confirm('Видалити продукт зі щоденника?'))return;
 try{
  await api('/nutrition/diary/'+id,{method:'DELETE'});
  await showClientNutrition(session.client_id);
 }catch(e){alert(e.message||'Не вдалося видалити продукт.')}
};
function nutritionDiaryOverlay(d,overview){
 const byDay=new Map((overview?.days||[]).map(x=>[x.day,x]));
 const originals=(d.nutrition||[]).filter(x=>!byDay.has(x.day));
 const rows=(overview?.days||[]).map(x=>({...x,id:-1,checked:1,__diary:true}));
 return {...d,nutrition:[...originals,...rows]};
}

function redesignNutritionTodayHTML(d,c,cid){
  let today=isoToday(),x=(d.nutrition||[]).filter(v=>v.day===today).sort((a,b)=>(+b.id||0)-(+a.id||0))[0]||null;
  const diary=d.diaryToday;
  if(diary?.active)x={kcal:diary.totals.kcal,protein:diary.totals.protein,
                       fat:diary.totals.fat,carbs:diary.totals.carbs,__diary:true};
  let kcal=x?.kcal||0,protein=x?.protein||0,fat=x?.fat||0,carbs=x?.carbs||0;
  let kcalPct=nutritionPct(kcal,c.kcal);
  return '<div class="redesign-nutrition-today">'
    +'<div class="card redesign-calorie-card">'
      +'<div class="between"><div><span class="nutrition-kicker">Калорії на сьогодні</span><strong>'+kcal.toLocaleString('uk-UA')+'<small> / '+(+c.kcal||0).toLocaleString('uk-UA')+' ккал</small></strong></div><span class="nutrition-fire">◉</span></div>'
      +'<div class="redesign-calorie-progress"><i style="width:'+kcalPct+'%"></i></div>'
      +'<div class="redesign-calorie-meta"><span>'+kcalPct+'%</span></div>'
    +'</div>'
    +'<div class="redesign-nutrition-section-head"><h2>Мої БЖВ на сьогодні</h2></div>'
    +'<div class="redesign-macro-grid">'
      +nutritionRing('Білки',protein,c.protein,'г','blue')
      +nutritionRing('Жири',fat,c.fat,'г','orange')
      +nutritionRing('Вуглеводи',carbs,c.carbs,'г','green')
    +'</div>'
    +'<div class="redesign-nutrition-actions">'
      +(x?.__diary
        ?'<button type="button" onclick="document.getElementById(\'nutritionDiaryCard\')?.scrollIntoView({block:\'start\'})">'+uiIcon('edit')+' Мій щоденник</button>'
        :(x?'<button onclick="openRedesignNutritionEntry('+cid+','+x.id+')">'+uiIcon('edit')+' Редагувати БЖВ</button>':'<button onclick="openRedesignNutritionEntry('+cid+')">'+uiIcon('plus')+' Додати БЖВ</button>'))
      +'<button type="button" class="nutrition-food-search-button" onclick="openFoodSearchLazy()">'+uiIcon('search')+' Додати продукт</button>'
    +'</div>'
    +nutritionDiaryDayHTML(d,cid)
    +(clientAccess(c).features?.meal_plan
      ?(clientMealPlanHTML(d)||'<div class="card"><div class="empty-state"><strong>План харчування ще не додано.</strong>Коли тренер додасть план, він з’явиться тут.</div></div>')
      :'<div class="card nutrition-coaching-upsell"><span class="nutrition-kicker">ПОСЛУГА ТРЕНЕРА</span><strong>Персональний план харчування</strong><p>Щоденник БЖВ доступний у твоєму тарифі. Персональний план харчування складається тренером окремо.</p><button onclick="showClientTrainers('+cid+')">Переглянути тренерів ›</button></div>')
  +'</div>';
}

// Do not load the food-search module during application bootstrap. A network or
// script error in optional search must never prevent the training app from starting.
window.openFoodSearchLazy = async function(meal=''){
  if(typeof window.openFoodSearchModal==='function')return window.openFoodSearchModal(meal);
  try{
    if(!window.eplanFoodSearchLoader){
      window.eplanFoodSearchLoader=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='/static/js/food-lookup.js?v=4';
        script.onload=()=>resolve();
        script.onerror=()=>reject(new Error('Food search module unavailable'));
        document.head.appendChild(script);
      }).catch(e=>{window.eplanFoodSearchLoader=null;throw e;});
    }
    await window.eplanFoodSearchLoader;
    if(typeof window.openFoodSearchModal!=='function')throw new Error('Food search failed to initialize');
    window.openFoodSearchModal(meal);
  }catch(e){
    console.warn('Є ПЛАН: food search unavailable',e);
    alert('Не вдалося відкрити пошук продуктів. Перевір з’єднання та спробуй знову.');
  }
};

function openRedesignNutritionEntry(cid,nid=null){
  document.getElementById('redesignNutritionModal')?.remove();
  let d=window.currentClientData||{},c=d.client||{},x=nid?(d.nutrition||[]).find(v=>+v.id===+nid)||{}:{};
  document.body.insertAdjacentHTML('beforeend','<div class="modal" id="redesignNutritionModal"><div class="card redesign-nutrition-modal"><div class="between"><div><h2>БЖВ за сьогодні</h2><p class="muted">Внеси підсумок за день.</p></div><button class="dark" onclick="redesignNutritionModal.remove()">✕</button></div><div class="grid"><input id="dkcal" type="number" value="'+(+x.kcal||'')+'" placeholder="Ккал · ціль '+(+c.kcal||0)+'"><input id="dprotein" type="number" value="'+(+x.protein||'')+'" placeholder="Білки, г · '+(+c.protein||0)+'"><input id="dfat" type="number" value="'+(+x.fat||'')+'" placeholder="Жири, г · '+(+c.fat||0)+'"><input id="dcarbs" type="number" value="'+(+x.carbs||'')+'" placeholder="Вуглеводи, г · '+(+c.carbs||0)+'"></div><button style="width:100%;margin-top:14px" onclick="saveRedesignNutritionEntry('+cid+','+(nid||'null')+',this)">Зберегти</button></div></div>');
}

async function saveRedesignNutritionEntry(cid,nid,btn){
  let kcal=+document.getElementById('dkcal')?.value||0,
      protein=+document.getElementById('dprotein')?.value||0,
      fat=+document.getElementById('dfat')?.value||0,
      carbs=+document.getElementById('dcarbs')?.value||0;
  if([kcal,protein,fat,carbs].some(v=>v<0))return alert('Значення не можуть бути від’ємними.');
  if(kcal>10000)return alert('Перевір калорії: значення понад 10 000 ккал виглядає помилковим.');
  if(protein>1000||fat>1000||carbs>1000)return alert('Перевір БЖВ: значення понад 1000 г виглядає помилковим.');
  await addDailyNutrition(cid,nid,btn);
  document.getElementById('redesignNutritionModal')?.remove();
  await showClientNutrition(cid);
}

window.showClientNutrition = async function(cid){
  let d=window.currentClientData;
  if(!d||+d.client?.id!==+cid)d=await loadClientData(cid);
  let c=d.client;window.currentClientData=d;currentClientView='nutrition';
  let access=clientAccess(c);
  if(!access.features?.nutrition){
    app.innerHTML=shell('<div class="client-section-page redesign-nutrition-page"><h1>Харчування</h1><div class="redesign-empty-panel"><strong>Харчування доступне в активних тарифах ЄПЛАН</strong><span>Активуй будь-який платний тариф, щоб вести БЖВ та історію харчування.</span></div></div>');
    refreshNotificationBadge(cid,'client','clientNotifyBtn');return;
  }
  // Diary read failures never break the existing Nutrition page; preserve
  // history and targets even if the new feature is temporarily unavailable.
  let display=d;
  try{
   const overview=await api('/nutrition/diary/overview?days=30');
   display=nutritionDiaryOverlay(d,overview);
   if(window.clientNutritionPeriod==='today'){
    const day=window.nutritionDiaryDay||isoToday();
    const results=await Promise.all([
      api('/nutrition/diary?day='+encodeURIComponent(day)),
      day===isoToday()?Promise.resolve(null):api('/nutrition/diary?day='+isoToday())
    ]);
    display.diarySelected=results[0];
    display.diaryToday=results[1]||results[0];
    window.nutritionDiaryState=results[0];
   }
  }catch(e){
   console.warn('Є ПЛАН: diary unavailable',e);
   if(window.clientNutritionPeriod==='today'){
     display={...d,diaryUnavailable:true,diarySelected:{items:[],totals:{},active:false},diaryToday:null};
     window.nutritionDiaryState=null;
   }
  }
  let body=window.clientNutritionPeriod==='week'?nutritionHistoryHTML(display,7,'тиждень'):window.clientNutritionPeriod==='month'?nutritionHistoryHTML(display,30,'місяць'):redesignNutritionTodayHTML(display,c,cid);
  app.innerHTML=shell('<div class="client-section-page redesign-nutrition-page"><h1>Харчування</h1>'+nutritionPeriodTabs()+body+'</div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};
