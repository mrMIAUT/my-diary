// Redesign V1 — client Nutrition tab.

window.clientNutritionPeriod = window.clientNutritionPeriod || 'today';

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
    +(xs.length?'<div class="redesign-nutrition-day-list">'+xs.map(x=>'<div class="redesign-nutrition-day-row"><div><strong>'+esc(formatProgressDate(x.day))+'</strong><small>'+x.kcal+' ккал</small></div><span>Б '+x.protein+' · Ж '+x.fat+' · В '+x.carbs+'</span></div>').join('')+'</div>':'<div class="redesign-empty-panel"><strong>Ще немає даних</strong><span>Коли ти почнеш заповнювати харчування, статистика з’явиться тут.</span></div>')
  +'</div>';
}

function redesignNutritionTodayHTML(d,c,cid){
  let today=isoToday(),x=(d.nutrition||[]).filter(v=>v.day===today).sort((a,b)=>(+b.id||0)-(+a.id||0))[0]||null;
  let kcal=x?.kcal||0,protein=x?.protein||0,fat=x?.fat||0,carbs=x?.carbs||0;
  let kcalPct=nutritionPct(kcal,c.kcal);
  return '<div class="redesign-nutrition-today">'
    +'<div class="card redesign-calorie-card">'
      +'<div class="between"><div><span class="nutrition-kicker">Калорії на сьогодні</span><strong>'+kcal.toLocaleString('uk-UA')+'<small> / '+(+c.kcal||0).toLocaleString('uk-UA')+' ккал</small></strong></div><span class="nutrition-fire">◉</span></div>'
      +'<div class="redesign-calorie-progress"><i style="width:'+kcalPct+'%"></i></div>'
      +'<div class="redesign-calorie-meta"><span>'+kcalPct+'%</span><button onclick="showClientBJU('+cid+')">Детальніше ›</button></div>'
    +'</div>'
    +'<div class="redesign-nutrition-section-head"><h2>Мої БЖВ на сьогодні</h2><button onclick="showClientBJU('+cid+')">Детальніше ›</button></div>'
    +'<div class="redesign-macro-grid">'
      +nutritionRing('Білки',protein,c.protein,'г','blue')
      +nutritionRing('Жири',fat,c.fat,'г','orange')
      +nutritionRing('Вуглеводи',carbs,c.carbs,'г','green')
    +'</div>'
    +'<div class="redesign-nutrition-actions">'
      +(x?'<button onclick="openRedesignNutritionEntry('+cid+','+x.id+')">'+uiIcon('edit')+' Редагувати БЖВ</button>':'<button onclick="openRedesignNutritionEntry('+cid+')">'+uiIcon('plus')+' Додати БЖВ</button>')
    +'</div>'
    +(clientMealPlanHTML(d)||'<div class="card"><div class="empty-state"><strong>План харчування ще не додано.</strong>Коли тренер додасть план, він з’явиться тут.</div></div>')
  +'</div>';
}

function openRedesignNutritionEntry(cid,nid=null){
  document.getElementById('redesignNutritionModal')?.remove();
  let d=window.currentClientData||{},c=d.client||{},x=nid?(d.nutrition||[]).find(v=>+v.id===+nid)||{}:{};
  document.body.insertAdjacentHTML('beforeend','<div class="modal" id="redesignNutritionModal"><div class="card redesign-nutrition-modal"><div class="between"><div><h2>БЖВ за сьогодні</h2><p class="muted">Внеси підсумок за день.</p></div><button class="dark" onclick="redesignNutritionModal.remove()">✕</button></div><div class="grid"><input id="dkcal" type="number" value="'+(+x.kcal||'')+'" placeholder="Ккал · ціль '+(+c.kcal||0)+'"><input id="dprotein" type="number" value="'+(+x.protein||'')+'" placeholder="Білки, г · '+(+c.protein||0)+'"><input id="dfat" type="number" value="'+(+x.fat||'')+'" placeholder="Жири, г · '+(+c.fat||0)+'"><input id="dcarbs" type="number" value="'+(+x.carbs||'')+'" placeholder="Вуглеводи, г · '+(+c.carbs||0)+'"></div><button style="width:100%;margin-top:14px" onclick="saveRedesignNutritionEntry('+cid+','+(nid||'null')+',this)">Зберегти</button></div></div>');
}

async function saveRedesignNutritionEntry(cid,nid,btn){
  await addDailyNutrition(cid,nid,btn);
  document.getElementById('redesignNutritionModal')?.remove();
  await showClientNutrition(cid);
}

window.showClientBJU = function(cid){
  let d=window.currentClientData||{},c=d.client||{},x=(d.nutrition||[]).filter(v=>v.day===isoToday()).sort((a,b)=>(+b.id||0)-(+a.id||0))[0]||{};
  currentClientView='nutrition';
  let body='<div class="client-section-page redesign-bju-page"><div class="redesign-back-title"><button onclick="showClientNutrition('+cid+')">‹</button><h1>Моє БЖВ</h1></div>'
    +'<div class="card redesign-bju-summary"><span>Загальний підсумок</span><strong>'+((+x.kcal||0).toLocaleString('uk-UA'))+' <small>/ '+(+c.kcal||0).toLocaleString('uk-UA')+' ккал</small></strong><div class="redesign-calorie-progress"><i style="width:'+nutritionPct(x.kcal,c.kcal)+'%"></i></div></div>'
    +'<div class="redesign-bju-detail-grid">'
      +nutritionRing('Білки',x.protein||0,c.protein,'г','blue')
      +nutritionRing('Жири',x.fat||0,c.fat,'г','orange')
      +nutritionRing('Вуглеводи',x.carbs||0,c.carbs,'г','green')
    +'</div>'
  +'</div>';
  app.innerHTML=shell(body);
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};

window.showClientNutrition = async function(cid){
  let d=window.currentClientData;
  if(!d||+d.client?.id!==+cid)d=await loadClientData(cid);
  let c=d.client;window.currentClientData=d;currentClientView='nutrition';
  let access=clientAccess(c);
  if(!access.features?.nutrition){
    app.innerHTML=shell('<div class="client-section-page redesign-nutrition-page"><h1>Харчування</h1><div class="redesign-empty-panel"><strong>Харчування недоступне</strong><span>Ця функція не входить до поточного тарифу.</span></div></div>');
    refreshNotificationBadge(cid,'client','clientNotifyBtn');return;
  }
  let body=window.clientNutritionPeriod==='week'?nutritionHistoryHTML(d,7,'тиждень'):window.clientNutritionPeriod==='month'?nutritionHistoryHTML(d,30,'місяць'):redesignNutritionTodayHTML(d,c,cid);
  app.innerHTML=shell('<div class="client-section-page redesign-nutrition-page"><h1>Харчування</h1>'+nutritionPeriodTabs()+body+'</div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};
