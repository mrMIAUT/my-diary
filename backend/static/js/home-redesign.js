// Redesign V1 — client home dashboard override.
// Loaded after client.js so production logic stays intact while the redesign evolves.


function redesignClientDelta(last,prev,key){
  if(!last||!prev||!(+last[key]>0)||!(+prev[key]>0))return null;
  return (+last[key])-(+prev[key]);
}

function redesignWeekStartISO(){
  let d=new Date(),day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  d.setHours(12,0,0,0);
  let local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function redesignCurrentWeekCheckin(d){
 let week=redesignWeekStartISO();
 return (d.checkins||[]).find(x=>String(x.week_start||'')===week)||null;
}
function openWeeklyCheckin(cid){
 let d=window.currentClientData||{},cur=redesignCurrentWeekCheckin(d)||{};
 let scale=(id,label,val)=>'<div class="weekly-checkin-field"><label>'+label+'</label><div class="weekly-checkin-scale">'+[1,2,3,4,5].map(n=>'<label><input type="radio" name="'+id+'" value="'+n+'" '+((+val||3)===n?'checked':'')+'><span>'+n+'</span></label>').join('')+'</div></div>';
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="weeklyCheckinModal"><div class="card weekly-checkin-modal"><div class="between"><div><small>ЩОТИЖНЕВИЙ ЗВІТ</small><h2>Як минув твій тиждень?</h2></div><button class="dark" onclick="weeklyCheckinModal.remove()">✕</button></div>'
   +scale('ciMood','Самопочуття',cur.mood)
   +scale('ciSleep','Сон',cur.sleep)
   +scale('ciEnergy','Енергія',cur.energy)
   +scale('ciHunger','Голод',cur.hunger)
   +scale('ciDifficulty','Складність тренувань',cur.difficulty)
   +'<label class="weekly-checkin-comment">Коментар<textarea id="ciComment" placeholder="Що було добре або що заважало?">'+esc(cur.comment||'')+'</textarea></label>'
   +'<button class="weekly-checkin-save" onclick="saveWeeklyCheckin('+cid+')">Зберегти звіт</button></div></div>');
}
async function saveWeeklyCheckin(cid){
 let pick=name=>+(document.querySelector('input[name="'+name+'"]:checked')?.value||3);
 let payload={mood:pick('ciMood'),sleep:pick('ciSleep'),hunger:pick('ciHunger'),energy:pick('ciEnergy'),difficulty:pick('ciDifficulty'),comment:document.getElementById('ciComment')?.value||''};
 await api('/client/'+cid+'/checkin',{method:'POST',body:JSON.stringify(payload)});
 weeklyCheckinModal?.remove();
 await clientCabinet(cid);
}

function redesignClientMetric(title,value,unit,delta,icon,action,subtitle){
  let deltaHtml='<em>—</em>';
  if(delta!==null){
    let sign=delta>0?'+':'';
    let arrow=delta<0?'↓':delta>0?'↑':'';
    deltaHtml='<em class="neutral-change">'+arrow+' '+sign+fmtProgress(delta)+' '+unit+'</em>';
  }
  return '<button class="client-home-metric" onclick="'+action+'">'
    +'<span class="client-home-metric-icon">'+uiIcon(icon)+'</span>'
    +'<span>'+esc(title)+'</span>'
    +'<strong>'+(value?esc(String(value)):'—')+(value?' <small>'+esc(unit)+'</small>':'')+'</strong>'
    +(subtitle?'<em>'+esc(subtitle)+'</em>':deltaHtml)
    +'</button>';
}

function redesignClientHomeHTML(d,c,cid,groups){
  let days=Object.keys(groups||{});
  let cycle=workoutCycleState(d,groups||{});
  let sessions=d.workout_sessions||[];
  let active=sessions.find(function(x){return x.status==='training'});
  let today=isoToday();
  let todayFinished=sessions.find(function(x){return x.status==='finished'&&sessionDay(x)===today});
  let todayNutrition=(d.nutrition||[]).filter(function(x){return x.day===today}).sort(function(a,b){return (+b.id||0)-(+a.id||0)})[0]||null;

  let measures=(d.measurements||[]).filter(function(x){return x.day}).slice().sort(function(a,b){return a.day.localeCompare(b.day)});
  let last=measures[measures.length-1]||null;
  let prev=measures[measures.length-2]||null;

  let weekStart=redesignWeekStartISO();
  let weekDone=sessions.filter(function(x){
    return x.status==='finished' && sessionDay(x) && sessionDay(x)>=weekStart;
  }).length;
  let weekDates=[];
  let ws=new Date(weekStart+'T12:00:00');
  for(let i=0;i<7;i++){let q=new Date(ws);q.setDate(ws.getDate()+i);weekDates.push(q.toISOString().slice(0,10))}
  let finishedDates=new Set(sessions.filter(function(x){return x.status==='finished'&&sessionDay(x)}).map(sessionDay));
  let weekBars=weekDates.map(function(day,i){return '<i class="'+(finishedDates.has(day)?'done':'')+'" style="height:'+(i===3?'24':'16')+'px"></i>'}).join('');

  let completedInCycle=Math.min(days.length,cycle.done.length);
  let cyclePercent=days.length?Math.round((completedInCycle/days.length)*100):0;
  let nextDay=active&&active.day_name?active.day_name:(cycle.next||days[0]||'Тренування');
  let nextTitle=programDayTitle(d,nextDay)||'Силове тренування';
  let nextIndex=Math.max(1,days.indexOf(nextDay)+1);

  let kcalNow=+todayNutrition?.kcal||0;
  let kcalTarget=+c.kcal||0;
  let kcalPct=kcalTarget?Math.min(100,Math.round(kcalNow/kcalTarget*100)):0;

  let programMeta=days.length ? days.length+' тренувальних '+(days.length===1?'день':days.length<5?'дні':'днів') : 'Програма формується';
  let trainMain=active?'Триває зараз':todayFinished?'Виконано ✓':days.length?'День '+nextIndex+' з '+days.length:'Ще немає плану';
  let trainSub=active?'Продовжити '+nextDay:todayFinished?(todayFinished.day_name||'Тренування'):nextTitle;
  let foodMain=(kcalNow||kcalTarget)?kcalNow.toLocaleString('uk-UA')+(kcalTarget?' / '+kcalTarget.toLocaleString('uk-UA'):'')+' ккал':'БЖВ за сьогодні';
  let foodSub=todayNutrition?'Дані збережено':'Заповнити сьогодні';
  let features=clientAccess(c).features||{},nutritionEnabled=!!features.nutrition,checkinEnabled=!!features.checkin;

  return '<section class="client-home">'
    +'<button class="client-program-hero '+(active?'is-active':'')+'" onclick="showClientTraining('+cid+')">'
      +'<span class="client-program-hero-kicker">Моя програма</span>'
      +(active?'<span class="client-program-active-status"><i></i>Тренування триває · '+esc(active.day_name||nextDay)+'</span>':'')
      +'<strong>'+esc(c.goal||'Твоя програма')+'</strong>'
      +'<span class="client-program-hero-meta">'+esc(programMeta)+'</span>'
      +'<div class="client-program-progress-label"><span>Прогрес циклу</span><b>'+(days.length?completedInCycle+' з '+days.length:'—')+'</b></div>'
      +'<div class="client-program-hero-progress">'
        +'<span><i style="width:'+cyclePercent+'%"></i></span><b>'+cyclePercent+'%</b>'
      +'</div>'
      +'<span class="client-program-hero-cta '+(active?'active':'')+'">'+(active?'Перейти до активного тренування':'Перейти до тренувань')+' <b>›</b></span>'
    +'</button>'

    +'<div class="client-home-section-head"><h2>Сьогодні</h2></div>'
    +'<div class="client-home-today-grid '+(nutritionEnabled?'':'single')+'">'
      +'<button class="client-home-today-card" onclick="showClientTraining('+cid+')">'
        +'<span class="client-home-today-icon">'+uiIcon('dumbbell')+'</span>'
        +'<small>Тренування</small>'
        +'<strong>'+esc(trainMain)+'</strong>'
        +'<em>'+esc(trainSub)+'</em>'
        +'<span class="home-chevron">›</span>'
      +'</button>'
      +(nutritionEnabled?'<button class="client-home-today-card" onclick="showClientNutrition('+cid+')">'
        +'<span class="client-home-today-icon">'+uiIcon('food')+'</span>'
        +'<small>Харчування</small>'
        +'<strong>'+esc(foodMain)+'</strong>'
        +'<div class="home-mini-progress"><i style="width:'+kcalPct+'%"></i></div>'
        +'<em>'+esc(foodSub)+'</em>'
        +'<span class="home-chevron">›</span>'
      +'</button>':'')
    +'</div>'

    +(checkinEnabled?(redesignCurrentWeekCheckin(d)
      ?'<button class="client-weekly-checkin done" onclick="openWeeklyCheckin('+cid+')"><span>Щотижневий звіт</span><strong>Заповнено ✓</strong><em>Можна оновити до кінця тижня</em><b>›</b></button>'
      :'<button class="client-weekly-checkin" onclick="openWeeklyCheckin('+cid+')"><span>Щотижневий звіт</span><strong>Як минув твій тиждень?</strong><em>Займе близько хвилини</em><b>›</b></button>'):'')

    +'<div class="client-home-section-head">'
      +'<h2>Мій прогрес</h2>'
      +'<button onclick="showClientSection(\'progress\')">Детальніше ›</button>'
    +'</div>'
    +'<div class="client-home-metrics">'
      +redesignClientMetric('Вага',last&&+last.weight>0?fmtProgress(last.weight):'', 'кг', redesignClientDelta(last,prev,'weight'), 'scale', 'showClientSection(\'progress\')','')
      +redesignClientMetric('Талія',last&&+last.waist>0?fmtProgress(last.waist):'', 'см', redesignClientDelta(last,prev,'waist'), 'ruler', 'showClientSection(\'progress\')','')
      +'<button class="client-home-metric client-home-training-metric" onclick="showClientSection(\'history\')"><span class="client-home-metric-icon">'+uiIcon('dumbbell')+'</span><span>Тренування</span><strong>'+weekDone+'<small>'+(days.length?' / '+days.length:'')+'</small></strong><div class="home-week-bars">'+weekBars+'</div><em>цього тижня</em></button>'
    +'</div>'
  +'</section>';
}

function redesignPausedClientHomeHTML(c,id){
  return '<section class="client-paused-home">'
    +'<div class="card client-paused-view-card">'
      +'<span class="client-paused-kicker">Режим перегляду</span>'
      +'<h2>Доступ призупинено</h2>'
      +'<p>Ти можеш переглядати попередні тренування, прогрес та історію. Нові записи недоступні.</p>'
    +'</div>'
    +'<button class="client-paused-history-card" onclick="showClientSection(\'history\')">'
      +'<span class="client-paused-history-icon">'+uiIcon('calendar')+'</span>'
      +'<span class="client-paused-history-copy"><strong>Моя історія</strong><small>Усі попередні записи залишаються збереженими</small></span>'
      +'<span class="client-paused-history-chevron">›</span>'
    +'</button>'
  +'</section>';
}

window.clientCabinet = async function(id){
  let d=await loadClientData(id),c=d.client;
  window.currentClientData=d;
  let groups={};
  (d.program||[]).forEach(function(x){(groups[x.day_name]||(groups[x.day_name]=[])).push(x)});

  let access=clientAccess(c);
  if(access.expired||access.manually_frozen||access.effective_plan==='free'){
    currentClientView='home';
    app.innerHTML=shell(accessBannerHTML(c)+redesignPausedClientHomeHTML(c,id));
    refreshNotificationBadge(id,'client','clientNotifyBtn');
    return;
  }

  currentClientView='home';
  app.innerHTML=shell(accessBannerHTML(c)+redesignClientHomeHTML(d,c,id,groups));
  refreshNotificationBadge(id,'client','clientNotifyBtn');
};
