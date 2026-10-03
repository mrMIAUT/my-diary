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
      +'<div><span class="achievement-icon green">'+uiIcon('ruler')+'</span><strong>'+measures.length+'</strong><small>замірів додано</small></div>'
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
    return '<button data-session="'+(+s.id||0)+'" onclick="openProgressWorkout(+this.dataset.session)" class="redesign-progress-training-row"><span class="training-row-icon">'+uiIcon('dumbbell')+'</span><span><strong>'+esc(title)+'</strong><small>'+esc(formatProgressDate(day))+'</small></span><b>›</b></button>';
  }).join('')+'</div>';
}

function progressWorkoutData(d,sid){
 let workout=(d.workout_sessions||[]).find(x=>+x.id===+sid&&x.status==='finished');
 if(!workout)return null;
 let day=sessionDay(workout),plan=[];
 if(workout.program_snapshot){
   try{let snap=JSON.parse(workout.program_snapshot);if(Array.isArray(snap))plan=snap}catch(e){}
 }
 if(!plan.length)plan=(d.program||[]).filter(x=>x.day_name===workout.day_name);
 let all=uniqueResultSets((d.result_sets||[]).filter(x=>x.day===day));
 let ids=new Set(plan.map(x=>+x.id).filter(Boolean));
 let sets=ids.size?all.filter(x=>ids.has(+x.program_id)):all;
 if(!sets.length)sets=all;
 let order=new Map(plan.map((x,i)=>[+x.id,i])),planned=new Map(plan.map(x=>[+x.id,x.exercise||'']));
 let groups={};
 sets.forEach(x=>{let key=String(+x.program_id||0)+'::'+String(x.exercise||'');(groups[key]||(groups[key]=[])).push(x)});
 let exercises=Object.values(groups).map(xs=>{
   xs=xs.slice().sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   let pid=+xs[0].program_id||0;
   return {pid,name:xs[0].exercise||planned.get(pid)||'Вправа',planned:planned.get(pid)||'',sets:xs,order:order.has(pid)?order.get(pid):999};
 }).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'uk'));
 return {workout,day,exercises};
}

function progressWorkoutDetailHTML(d,sid){
 let data=progressWorkoutData(d,sid);
 if(!data)return '<div class="redesign-empty-panel"><strong>Тренування не знайдено</strong><span>Повернись до списку тренувань і спробуй ще раз.</span></div>';
 let s=data.workout,duration=(+s.duration_seconds||0)>0?formatWorkoutDuration(+s.duration_seconds||0):'—';
 let review=s.trainer_reviewed?'<div class="calendar-review-done"><strong>Перевірено тренером ✓</strong>'+(s.trainer_comment?'<div>'+esc(s.trainer_comment)+'</div>':'')+'</div>':'';
 let exercises=data.exercises.length?data.exercises.map(x=>{
   let replacement=x.planned&&x.planned!==x.name?'<span class="calendar-workout-replacement">За планом: '+esc(x.planned)+'</span>':'';
   return '<div class="progress-workout-exercise"><div class="progress-workout-exercise-head"><div><strong>'+esc(x.name)+'</strong>'+replacement+'</div><span>'+x.sets.length+' '+(x.sets.length===1?'підхід':x.sets.length<5?'підходи':'підходів')+'</span></div><div class="progress-workout-sets">'+x.sets.map(set=>'<div class="calendar-workout-set"><span>Підхід '+esc(set.set_number)+'</span><strong>'+esc(set.weight)+' кг × '+esc(set.reps)+'</strong><em>RIR '+esc(set.rir)+'</em></div>').join('')+'</div></div>';
 }).join(''):'<div class="redesign-empty-panel"><strong>Результати не записані</strong><span>Для цього тренування немає збережених підходів.</span></div>';
 return '<div class="progress-workout-detail-hero"><div><span>Завершене тренування</span><h1>'+esc(s.day_name||'Тренування')+'</h1><small>'+esc(formatProgressDate(data.day))+'</small></div><div class="progress-workout-detail-duration"><span>Тривалість</span><strong>'+esc(duration)+'</strong></div></div>'+review+'<div class="progress-workout-detail-section"><div class="progress-workout-detail-section-head"><span>Вправи</span><strong>'+data.exercises.length+'</strong></div>'+exercises+'</div>';
}

function openProgressWorkout(sid,pushHistory=true){
 let d=window.currentClientData||{},data=progressWorkoutData(d,sid);
 if(!data){window.clientProgressView='training';showClientSection('progress');return}
 window.clientProgressView='training';
 window.progressHistoryReturn=false;
 currentClientView='progress';
 if(pushHistory){
   history.replaceState({eplanPage:'clientHome',eplanClient:session?.client_id,eplanSection:'progress'},'',location.href);
   history.pushState({eplanPage:'clientProgressWorkout',eplanClient:session?.client_id,eplanWorkoutId:+sid},'',location.pathname+location.search+'#workout-'+sid);
 }
 app.innerHTML=shell('<div class="client-section-page redesign-progress-workout-detail"><button class="unified-back-button" onclick="returnFromProgressWorkout()" aria-label="Назад до тренувань">‹</button>'+progressWorkoutDetailHTML(d,sid)+'</div>');
 refreshNotificationBadge(session?.client_id,'client','clientNotifyBtn');
}

function returnFromProgressWorkout(){
 window.clientProgressView='training';
 if(history.state?.eplanPage==='clientProgressWorkout'){history.back();return}
 showClientSection('progress');
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
