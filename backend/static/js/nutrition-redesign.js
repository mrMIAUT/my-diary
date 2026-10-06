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
    +(xs.length?'<div class="redesign-nutrition-day-list">'+visible.map(x=>'<div class="redesign-nutrition-day-row"><div class="nutrition-row-date"><strong>'+esc(formatProgressDate(x.day))+'</strong><small>'+x.kcal+' ккал</small></div><span class="nutrition-row-values">Б '+x.protein+' · Ж '+x.fat+' · В '+x.carbs+'</span><button class="nutrition-row-edit" onclick="openNutritionDateEditor(\''+esc(x.day)+'\','+(d.client?.id||session?.client_id||0)+',\'nutrition\')" aria-label="Редагувати БЖВ за '+esc(formatProgressDate(x.day))+'">'+uiIcon('edit')+'</button></div>').join('')+'</div>':'<div class="redesign-empty-panel"><strong>Ще немає даних</strong><span>Коли ти почнеш заповнювати харчування, статистика з’явиться тут.</span></div>')
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

function redesignNutritionTodayHTML(d,c,cid){
  let today=isoToday(),x=(d.nutrition||[]).filter(v=>v.day===today).sort((a,b)=>(+b.id||0)-(+a.id||0))[0]||null;
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
      +(x?'<button onclick="openRedesignNutritionEntry('+cid+','+x.id+')">'+uiIcon('edit')+' Редагувати БЖВ</button>':'<button onclick="openRedesignNutritionEntry('+cid+')">'+uiIcon('plus')+' Додати БЖВ</button>')
      +(!clientAccess(c).features?.meal_plan?'<button class="nutrition-targets-button" onclick="openNutritionTargetsModal('+cid+')">'+uiIcon('edit')+' Налаштувати цілі</button>':'')
    +'</div>'
    +(clientAccess(c).features?.meal_plan
      ?(clientMealPlanHTML(d)||'<div class="card"><div class="empty-state"><strong>План харчування ще не додано.</strong>Коли тренер додасть план, він з’явиться тут.</div></div>')
      :'<div class="card nutrition-coaching-upsell"><span class="nutrition-kicker">ПОСЛУГА ТРЕНЕРА</span><strong>Персональний план харчування</strong><p>Щоденник БЖВ доступний у твоєму тарифі. Персональний план харчування складається тренером окремо.</p><button onclick="showClientTrainers('+cid+')">Переглянути тренерів ›</button></div>')
  +'</div>';
}

window.openNutritionTargetsModal = function(cid){
  document.getElementById('nutritionTargetsModal')?.remove();
  let c=(window.currentClientData||{}).client||{};
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal" id="nutritionTargetsModal"><div class="card redesign-nutrition-modal nutrition-targets-modal nutrition-calculator-modal">'
    +'<div class="between"><div><h2>Розрахунок калорій і БЖВ</h2><p class="muted">Стартовий орієнтир, який потім можна коригувати за динамікою ваги.</p></div><button class="dark" onclick="nutritionTargetsModal.remove()">✕</button></div>'
    +'<div class="nutrition-calc-grid">'
      +'<label><span>Стать</span><select id="calcSex"><option value="male">Чоловіча</option><option value="female">Жіноча</option></select></label>'
      +'<label><span>Вік</span><input id="calcAge" type="number" inputmode="numeric" min="18" max="100" placeholder="років"></label>'
      +'<label><span>Зріст</span><input id="calcHeight" type="number" inputmode="decimal" min="120" max="230" placeholder="см"></label>'
      +'<label><span>Вага</span><input id="calcWeight" type="number" inputmode="decimal" min="35" max="300" placeholder="кг"></label>'
      +'<label><span>Жир, % <small>(необов’язково)</small></span><input id="calcBodyFat" type="number" inputmode="decimal" min="3" max="60" placeholder="%"></label>'
      +'<label><span>Активність</span><select id="calcActivity"><option value="1.2">Мінімальна</option><option value="1.375">Легка · 1–3 тренування/тиж.</option><option value="1.55" selected>Середня · 3–5 тренувань/тиж.</option><option value="1.725">Висока · 6–7 тренувань/тиж.</option><option value="1.9">Дуже висока</option></select></label>'
      +'<label class="nutrition-calc-wide"><span>Ціль</span><select id="calcGoal"><option value="loss">Зниження ваги</option><option value="maintain" selected>Підтримання</option><option value="gain">Набір м’язової маси</option></select></label>'
    +'</div>'
    +'<button class="nutrition-calc-button" onclick="calculateNutritionTargets()">Розрахувати</button>'
    +'<div id="nutritionCalcResult"></div>'
    +'<details class="nutrition-calc-manual"><summary>Ввести цілі вручну</summary><div class="grid"><input id="targetKcal" type="number" inputmode="numeric" value="'+(+c.kcal||'')+'" placeholder="Ккал"><input id="targetProtein" type="number" inputmode="numeric" value="'+(+c.protein||'')+'" placeholder="Білки, г"><input id="targetFat" type="number" inputmode="numeric" value="'+(+c.fat||'')+'" placeholder="Жири, г"><input id="targetCarbs" type="number" inputmode="numeric" value="'+(+c.carbs||'')+'" placeholder="Вуглеводи, г"></div><button style="width:100%;margin-top:14px" onclick="saveNutritionTargets('+cid+',this)">Зберегти вручну</button></details>'
    +'</div></div>');
};

window.calculateNutritionTargets = function(){
  let sex=document.getElementById('calcSex')?.value,
      age=+document.getElementById('calcAge')?.value,
      height=+document.getElementById('calcHeight')?.value,
      weight=+document.getElementById('calcWeight')?.value,
      bodyFat=+document.getElementById('calcBodyFat')?.value||0,
      activity=+document.getElementById('calcActivity')?.value,
      goal=document.getElementById('calcGoal')?.value;
  if(!age||!height||!weight||age<18||age>100||height<120||height>230||weight<35||weight>300)return alert('Перевір вік, зріст і вагу.');
  if(bodyFat&&(bodyFat<3||bodyFat>60))return alert('Перевір відсоток жиру.');
  let leanMass=bodyFat?weight*(1-bodyFat/100):null;
  let bmr=leanMass ? 370+21.6*leanMass : (10*weight+6.25*height-5*age+(sex==='male'?5:-161));
  let maintenance=bmr*activity;
  let factor=goal==='loss'?0.85:goal==='gain'?1.08:1;
  let kcal=Math.round(maintenance*factor/10)*10;
  let proteinBase=leanMass||weight;
  let protein=Math.round(proteinBase*(goal==='loss'?2.2:goal==='gain'?1.8:1.8));
  let fat=Math.round(weight*(goal==='loss'?0.8:0.9));
  let carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  window.pendingNutritionTargets={kcal,protein,fat,carbs};
  let method=leanMass?'Katch–McArdle · з урахуванням сухої маси':'Mifflin–St Jeor · за загальною масою';
  let goalText=goal==='loss'?'дефіцит 15%':goal==='gain'?'профіцит 8%':'підтримання';
  document.getElementById('nutritionCalcResult').innerHTML=
    '<div class="nutrition-calc-result"><span class="nutrition-kicker">Твій стартовий орієнтир</span><strong class="nutrition-calc-kcal">'+kcal.toLocaleString('uk-UA')+' <small>ккал/день</small></strong>'
    +'<div class="nutrition-calc-macros"><span><b>'+protein+'</b> г<small>Білки</small></span><span><b>'+fat+'</b> г<small>Жири</small></span><span><b>'+carbs+'</b> г<small>Вуглеводи</small></span></div>'
    +'<p>'+method+' · '+goalText+'. Білок '+(leanMass?'розраховано від сухої маси':'тимчасово розраховано від маси тіла')+'.</p>'
    +'<button onclick="applyCalculatedNutritionTargets(this)">Застосувати ці цілі</button></div>';
};

window.applyCalculatedNutritionTargets = async function(btn){
  let cid=(window.currentClientData||{}).client?.id||session?.client_id,body=window.pendingNutritionTargets;
  if(!cid||!body)return;
  if(btn){btn.disabled=true;btn.textContent='Зберігаємо…'}
  try{
    await api('/client/'+cid+'/nutrition-targets',{method:'PATCH',body:JSON.stringify(body)});
    document.getElementById('nutritionTargetsModal')?.remove();
    let d=await loadClientData(cid);window.currentClientData=d;
    await showClientNutrition(cid);
  }catch(e){if(btn){btn.disabled=false;btn.textContent='Застосувати ці цілі'} alert(e.message||'Не вдалося зберегти цілі.');}
};

window.saveNutritionTargets = async function(cid,btn){
  let body={
    kcal:+document.getElementById('targetKcal')?.value||0,
    protein:+document.getElementById('targetProtein')?.value||0,
    fat:+document.getElementById('targetFat')?.value||0,
    carbs:+document.getElementById('targetCarbs')?.value||0
  };
  if(Object.values(body).some(v=>v<0))return alert('Значення не можуть бути від’ємними.');
  if(btn){btn.disabled=true;btn.textContent='Зберігаємо…'}
  try{
    await api('/client/'+cid+'/nutrition-targets',{method:'PATCH',body:JSON.stringify(body)});
    document.getElementById('nutritionTargetsModal')?.remove();
    let d=await loadClientData(cid);window.currentClientData=d;
    await showClientNutrition(cid);
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='Зберегти вручну'}
    alert(e.message||'Не вдалося зберегти цілі.');
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
  let body=window.clientNutritionPeriod==='week'?nutritionHistoryHTML(d,7,'тиждень'):window.clientNutritionPeriod==='month'?nutritionHistoryHTML(d,30,'місяць'):redesignNutritionTodayHTML(d,c,cid);
  app.innerHTML=shell('<div class="client-section-page redesign-nutrition-page"><h1>Харчування</h1>'+nutritionPeriodTabs()+body+'</div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};
