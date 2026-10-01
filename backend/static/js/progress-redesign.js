// Redesign V1 — client Progress tab.
// Overrides only the client progress presentation; data and mutations stay unchanged.

window.clientProgressView = window.clientProgressView || 'overview';

function redesignProgressTabs(){
  let tab=(key,label)=>'<button class="'+(window.clientProgressView===key?'active':'')+'" onclick="switchClientProgressView(\''+key+'\')">'+esc(label)+'</button>';
  return '<div class="redesign-progress-tabs">'+tab('overview','Загальний')+tab('measurements','Заміри')+tab('training','Тренування')+'</div>';
}

function switchClientProgressView(key){
  window.clientProgressView=key;
  if(session?.role==='client'&&session.client_id)showClientSection('progress');
}

function redesignMeasureDelta(last,prev,key){
  if(!last||!prev||!(+last[key]>0)||!(+prev[key]>0))return null;
  return (+last[key])-(+prev[key]);
}
function redesignMeasureValue(x,key,unit){
  return x&&+x[key]>0?fmtProgress(x[key])+' '+unit:'—';
}
function redesignDeltaHTML(v,unit){
  if(v===null)return '<small>Немає порівняння</small>';
  return '<small class="neutral-change">'+(v>0?'+':'')+fmtProgress(v)+' '+unit+'</small>';
}

function redesignWeightChartHTML(measures){
  let pts=measures.filter(x=>x.day&&+x.weight>0).slice(-8);
  if(pts.length<2)return '<div class="redesign-progress-empty-chart">Додай щонайменше два заміри ваги, щоб побачити графік.</div>';
  let vals=pts.map(x=>+x.weight),min=Math.min(...vals),max=Math.max(...vals),range=Math.max(1,max-min);
  let points=pts.map((x,i)=>{
    let px=8+i*(84/Math.max(1,pts.length-1));
    let py=76-((+x.weight-min)/range)*48;
    return [px,py];
  });
  let poly=points.map(p=>p.join(',')).join(' ');
  return '<div class="redesign-weight-chart"><svg viewBox="0 0 100 86" preserveAspectRatio="none" aria-label="Динаміка ваги">'
    +'<line x1="8" y1="76" x2="92" y2="76" class="chart-axis"/>'
    +'<polyline points="'+poly+'" class="chart-line"/>'
    +points.map(p=>'<ellipse cx="'+p[0]+'" cy="'+p[1]+'" rx=".45" ry="1.05" class="chart-dot"/>').join('')
    +'</svg><div class="redesign-weight-chart-labels"><span>'+esc(formatProgressDate(pts[0].day))+'</span><span>'+esc(formatProgressDate(pts[pts.length-1].day))+'</span></div></div>';
}

function redesignOverviewMetricOptions(last){
 let cfg=[
  ['waist','Талія','см'],['chest','Груди','см'],['hips','Стегна','см'],
  ['thighs_right','Стегно праве','см'],['thighs_left','Стегно ліве','см'],
  ['arms_right','Рука права','см'],['arms_left','Рука ліва','см'],
  ['calves_right','Гомілка права','см'],['calves_left','Гомілка ліва','см'],
  ['forearms_right','Передпліччя праве','см'],['forearms_left','Передпліччя ліве','см'],
  ['shoulders','Плечі','см'],['neck','Шия','см']
 ];
 let available=cfg.filter(([k])=>+last?.[k]>0);
 return available.length?available:cfg.slice(0,3);
}
function redesignOverviewMetricMeta(last){
 let opts=redesignOverviewMetricOptions(last);
 let key=String(window.clientProgressOverviewMetric||'waist');
 if(!opts.some(x=>x[0]===key))key=opts[0][0];
 window.clientProgressOverviewMetric=key;
 return opts.find(x=>x[0]===key)||opts[0];
}
function setClientProgressOverviewMetric(value){
 window.clientProgressOverviewMetric=value;
 showClientSection('progress');
}
function cycleClientProgressOverviewMetric(step){
 let d=window.currentClientData||{},measures=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let last=measures[measures.length-1]||null,opts=redesignOverviewMetricOptions(last);
 if(!opts.length)return;
 let current=String(window.clientProgressOverviewMetric||opts[0][0]);
 let index=opts.findIndex(x=>x[0]===current);if(index<0)index=0;
 index=(index+step+opts.length)%opts.length;
 window.clientProgressOverviewMetric=opts[index][0];
 showClientSection('progress');
}

function redesignProgressOverviewHTML(d){
  let measures=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
  let last=measures[measures.length-1]||null,prev=measures[measures.length-2]||null;
  let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished');
  let weekStart=redesignWeekStartISO();
  let weekSessions=sessions.filter(x=>sessionDay(x)&&sessionDay(x)>=weekStart);
  let weekDone=weekSessions.length;
  let days=[...new Set((d.program||[]).map(x=>x.day_name))].filter(Boolean);
  let weeklyTarget=days.length||0;
  let weightDelta=redesignMeasureDelta(last,prev,'weight');
  let metric=redesignOverviewMetricMeta(last),metricKey=metric[0],metricLabel=metric[1],metricUnit=metric[2];
  let metricDelta=redesignMeasureDelta(last,prev,metricKey);
  return '<div class="redesign-progress-overview">'
    +'<div class="redesign-progress-topgrid">'
      +'<button class="redesign-progress-kpi redesign-progress-kpi-weight" onclick="switchClientProgressView(\'measurements\')"><span class="kpi-icon blue">'+uiIcon('scale')+'</span><div class="redesign-progress-kpi-labelrow redesign-progress-kpi-labelrow-static"><small>Вага</small></div><strong>'+redesignMeasureValue(last,'weight','кг')+'</strong>'+redesignDeltaHTML(weightDelta,'кг')+'</button>'
      +'<div class="redesign-progress-kpi redesign-progress-kpi-select" role="button" tabindex="0" onclick="switchClientProgressView(\'measurements\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();switchClientProgressView(\'measurements\')}"><span class="kpi-icon green">'+uiIcon('ruler')+'</span><div class="redesign-progress-kpi-labelrow"><small>'+esc(metricLabel)+'</small><div class="redesign-progress-kpi-arrows"><button type="button" aria-label="Попередній показник" onclick="event.stopPropagation();cycleClientProgressOverviewMetric(-1)">‹</button><button type="button" aria-label="Наступний показник" onclick="event.stopPropagation();cycleClientProgressOverviewMetric(1)">›</button></div></div><strong>'+redesignMeasureValue(last,metricKey,metricUnit)+'</strong>'+redesignDeltaHTML(metricDelta,metricUnit)+'</div>'
    +'</div>'
    +'<div class="card redesign-progress-week"><div class="between"><div><span class="progress-kicker">Тренування цього тижня</span><strong>'+weekDone+(weeklyTarget?' / '+weeklyTarget:'')+'</strong><small class="progress-week-caption">'+(weeklyTarget&&weekDone>weeklyTarget?'План виконано · +'+(weekDone-weeklyTarget)+' додаткове '+((weekDone-weeklyTarget)===1?'тренування':'тренування'):(weeklyTarget?'тижнева ціль':'') )+'</small></div><span class="progress-week-icon">'+uiIcon('dumbbell')+'</span></div><div class="progress-week-bars">'+Array.from({length:Math.max(weeklyTarget,weekDone,1)},(_,i)=>'<i class="'+(i<weekDone?'done':'')+'"></i>').join('')+'</div></div>'
    +'<div class="card redesign-progress-chart-card"><div class="between"><div><span class="progress-kicker">Динаміка ваги</span><strong>'+(last&&+last.weight>0?fmtProgress(last.weight)+' кг':'Немає даних')+'</strong></div><button onclick="switchClientProgressView(\'measurements\')">Детальніше ›</button></div>'+redesignWeightChartHTML(measures)+'</div>'
    +'<div class="redesign-progress-achievements-head"><div><span>Досягнення</span><strong>Твої результати та активність</strong></div><button onclick="showClientAchievements('+(d.client?.id||session?.client_id||0)+')">Переглянути всі ›</button></div>'
    +'<div class="redesign-progress-achievements">'
      +'<div><span class="achievement-icon trophy">★</span><strong>'+sessions.length+'</strong><small>тренувань виконано</small></div>'
      +'<div><span class="achievement-icon fire">◎</span><strong>'+Math.min(weekDone,7)+'</strong><small>активних днів</small></div>'
      +'<div><span class="achievement-icon blue">'+uiIcon('ruler')+'</span><strong>'+measures.length+'</strong><small>замірів додано</small></div>'
    +'</div>'
  +'</div>';
}

function redesignProgressMeasurementsHTML(d){
  let c=d.client||{};
  return '<div class="redesign-progress-measurements">'+clientMeasurementsHTML(d,c.id)+'</div>';
}

function redesignProgressTrainingHTML(d){
  let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished').slice().sort((a,b)=>(b.finished_at||b.started_at||'').localeCompare(a.finished_at||a.started_at||''));
  if(!sessions.length)return '<div class="redesign-empty-panel"><strong>Ще немає завершених тренувань</strong><span>Після першого тренування тут з’явиться історія.</span></div>';
  return '<div class="redesign-progress-training-list">'+sessions.slice(0,12).map(function(s){
    let day=sessionDay(s),title=s.day_name||'Тренування';
    return '<button onclick="openProgressTrainingHistory()" class="redesign-progress-training-row"><span class="training-row-icon">'+uiIcon('dumbbell')+'</span><span><strong>'+esc(title)+'</strong><small>'+esc(formatProgressDate(day))+'</small></span><b>›</b></button>';
  }).join('')+'</div>';
}

function openProgressTrainingHistory(){
 window.progressHistoryReturn=true;
 showClientSection('history');
}

function returnFromProgressHistory(){
 window.progressHistoryReturn=false;
 window.clientProgressView='training';
 showClientSection('progress');
}

window.clientProgressHTML = function(d){
  let body=window.clientProgressView==='measurements'?redesignProgressMeasurementsHTML(d):window.clientProgressView==='training'?redesignProgressTrainingHTML(d):redesignProgressOverviewHTML(d);
  return '<div class="redesign-progress-page">'+redesignProgressTabs()+body+'</div>';
};
