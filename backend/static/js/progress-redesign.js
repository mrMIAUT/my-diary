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
  let cls=v<0?'good':v>0?'warn':'';
  return '<small class="'+cls+'">'+(v>0?'+':'')+fmtProgress(v)+' '+unit+'</small>';
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
    +points.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.8" class="chart-dot"/>').join('')
    +'</svg><div class="redesign-weight-chart-labels"><span>'+esc(formatProgressDate(pts[0].day))+'</span><span>'+esc(formatProgressDate(pts[pts.length-1].day))+'</span></div></div>';
}

function redesignProgressOverviewHTML(d){
  let measures=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
  let last=measures[measures.length-1]||null,prev=measures[measures.length-2]||null;
  let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished');
  let weekStart=redesignWeekStartISO();
  let weekDone=sessions.filter(x=>sessionDay(x)&&sessionDay(x)>=weekStart).length;
  let days=[...new Set((d.program||[]).map(x=>x.day_name))].filter(Boolean);
  let weightDelta=redesignMeasureDelta(last,prev,'weight'),waistDelta=redesignMeasureDelta(last,prev,'waist');
  return '<div class="redesign-progress-overview">'
    +'<div class="redesign-progress-topgrid">'
      +'<button class="redesign-progress-kpi" onclick="switchClientProgressView(\'measurements\')"><span class="kpi-icon blue">'+uiIcon('measure')+'</span><small>Вага</small><strong>'+redesignMeasureValue(last,'weight','кг')+'</strong>'+redesignDeltaHTML(weightDelta,'кг')+'</button>'
      +'<button class="redesign-progress-kpi" onclick="switchClientProgressView(\'measurements\')"><span class="kpi-icon green">'+uiIcon('chart')+'</span><small>Талія</small><strong>'+redesignMeasureValue(last,'waist','см')+'</strong>'+redesignDeltaHTML(waistDelta,'см')+'</button>'
    +'</div>'
    +'<div class="card redesign-progress-week"><div class="between"><div><span class="progress-kicker">Тренування цього тижня</span><strong>'+weekDone+' з '+(days.length||0)+'</strong></div><span class="progress-week-icon">'+uiIcon('dumbbell')+'</span></div><div class="progress-week-bars">'+Array.from({length:7},(_,i)=>'<i class="'+(i<Math.min(weekDone,7)?'done':'')+'"></i>').join('')+'</div></div>'
    +'<div class="card redesign-progress-chart-card"><div class="between"><div><span class="progress-kicker">Динаміка ваги</span><strong>'+(last&&+last.weight>0?fmtProgress(last.weight)+' кг':'Немає даних')+'</strong></div><button onclick="switchClientProgressView(\'measurements\')">Детальніше ›</button></div>'+redesignWeightChartHTML(measures)+'</div>'
    +'<div class="redesign-progress-achievements">'
      +'<div><span class="achievement-icon trophy">★</span><strong>'+sessions.length+'</strong><small>тренувань виконано</small></div>'
      +'<div><span class="achievement-icon fire">◎</span><strong>'+Math.min(weekDone,7)+'</strong><small>активних днів</small></div>'
      +'<div><span class="achievement-icon blue">'+uiIcon('chart')+'</span><strong>'+measures.length+'</strong><small>замірів додано</small></div>'
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
