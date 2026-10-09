// Redesign V1 — client Progress tab.
// Overrides only the client progress presentation; data and mutations stay unchanged.

window.clientProgressView = window.clientProgressView || 'overview';
window.clientProgressTrainingLimit = window.clientProgressTrainingLimit || 8;

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
  let limit=Math.max(8,+window.clientProgressTrainingLimit||8),shown=sessions.slice(0,limit),hasMore=shown.length<sessions.length;
  return '<div class="redesign-progress-training-list">'+shown.map(function(s){
    let day=sessionDay(s),title=s.day_name||'Тренування';
    return '<button data-session="'+(+s.id||0)+'" onclick="openProgressWorkout(+this.dataset.session)" class="redesign-progress-training-row"><span class="training-row-icon">'+uiIcon('dumbbell')+'</span><span><strong>'+esc(title)+'</strong><small>'+esc(formatProgressDate(day))+'</small></span><b>›</b></button>';
  }).join('')+(hasMore?'<button type="button" class="redesign-progress-training-more" onclick="showMoreClientProgressTraining()">Показати ще</button>':'')+'</div>';
}

function showMoreClientProgressTraining(){
 window.clientProgressTrainingLimit=(+window.clientProgressTrainingLimit||8)+8;
 showClientSection('progress');
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
 let order=new Map(plan.map((x,i)=>[+x.id,i])),planned=new Map(plan.map(x=>[+x.id,x.exercise||''])),planById=new Map(plan.map(x=>[+x.id,x]));
 let groups={};
 sets.forEach(x=>{let key=String(+x.program_id||0)+'::'+String(x.exercise||'');(groups[key]||(groups[key]=[])).push(x)});
 let skippedAll=(d.skipped_sets||[]).filter(x=>x.day===day&&(!ids.size||ids.has(+x.program_id)));
 let exercises=Object.values(groups).map(xs=>{
   xs=xs.slice().sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   let pid=+xs[0].program_id||0,name=xs[0].exercise||planned.get(pid)||'Вправа';
   let aux=(d.aux_sets||[]).filter(a=>a.day===day&&(+a.program_id===pid||String(a.exercise||'').trim().toLocaleLowerCase('uk-UA')===String(name||'').trim().toLocaleLowerCase('uk-UA')));
   let skipped=skippedAll.filter(s=>+s.program_id===pid).sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   return {pid,name,planned:planned.get(pid)||'',sets:xs,aux,skipped,planItem:planById.get(pid)||null,order:order.has(pid)?order.get(pid):999};
 });
 skippedAll.forEach(s=>{
   let pid=+s.program_id||0;if(exercises.some(x=>+x.pid===pid))return;
   let p=planById.get(pid)||null,name=s.exercise||p?.exercise||planned.get(pid)||'Вправа';
   exercises.push({pid,name,planned:planned.get(pid)||'',sets:[],timed:[],aux:[],skipped:skippedAll.filter(x=>+x.program_id===pid).sort((a,b)=>(+a.set_number||0)-(+b.set_number||0)),planItem:p,order:order.has(pid)?order.get(pid):999});
 });
 let timedAll=(d.timed_result_sets||[]).filter(x=>x.day===day&&(!ids.size||ids.has(+x.program_id)));
 let timedGroups={};
 timedAll.forEach(x=>{let key=String(+x.program_id||0)+'::'+String(x.exercise||'');(timedGroups[key]||(timedGroups[key]=[])).push(x)});
 Object.values(timedGroups).forEach(xs=>{
   xs=xs.slice().sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   let pid=+xs[0].program_id||0,name=xs[0].exercise||planned.get(pid)||'Вправа',existing=exercises.find(x=>+x.pid===pid);
   if(existing){existing.timed=xs;return}
   exercises.push({pid,name,planned:planned.get(pid)||'',sets:[],timed:xs,aux:[],skipped:[],planItem:planById.get(pid)||null,order:order.has(pid)?order.get(pid):999});
 });
 exercises.forEach(x=>{if(!Array.isArray(x.timed))x.timed=[]});
 exercises.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'uk'));
 return {workout,day,plan,exercises};
}

function progressVolumeNumber(v){
 let n=+v||0;
 return Math.round(n).toLocaleString('uk-UA');
}

function progressExerciseVolume(exercise){
 return (exercise?.sets||[]).reduce((sum,set)=>{
   let mode=normalizeRepeatMode(set.repeat_mode),factor=['per_leg','per_arm','per_side'].includes(mode)?2:1;
   return sum+(Math.max(0,+set.weight||0)*Math.max(0,+set.reps||0)*factor);
 },0);
}

function progressWorkoutStats(data){
 let exercises=data?.exercises||[],total=0,workSets=0;
 exercises.forEach(x=>{total+=progressExerciseVolume(x);workSets+=(x.sets||[]).length+(x.timed||[]).length});
 let lib=window.progressExerciseLibrary||window.exerciseLibrary||null;
 let muscles=[];
 if(lib&&Array.isArray(lib.exercises)&&Array.isArray(lib.muscles)){
   let muscleNames=new Map(lib.muscles.map(m=>[+m.id,m.name||'М’яз'])),byName=new Map();
   lib.exercises.forEach(x=>byName.set(String(x.name||'').trim().toLocaleLowerCase('uk-UA'),x));
   let totals=new Map();
   exercises.forEach(x=>{
     let volume=progressExerciseVolume(x);if(!(volume>0))return;
     let found=byName.get(String(x.name||'').trim().toLocaleLowerCase('uk-UA'))||byName.get(String(x.planned||'').trim().toLocaleLowerCase('uk-UA'));
     let ids=[...new Set((found?.primary_muscle_ids||[]).map(Number).filter(Boolean))];
     if(ids.length){
       let share=volume/ids.length;
       ids.forEach(id=>totals.set(muscleNames.get(id)||'Без групи',(totals.get(muscleNames.get(id)||'Без групи')||0)+share));
     }else{
       totals.set('Без групи',(totals.get('Без групи')||0)+volume);
     }
   });
   muscles=[...totals.entries()].map(([name,volume])=>({name,volume})).sort((a,b)=>b.volume-a.volume||a.name.localeCompare(b.name,'uk'));
 }
 return {total,workSets,muscles,hasMuscleData:!!lib};
}

function progressWorkoutStatsHTML(data){
 let stats=progressWorkoutStats(data);
 let maxMuscle=Math.max(0,...stats.muscles.map(x=>x.volume));
 let musclesHTML='';
 if(stats.hasMuscleData){
   musclesHTML=stats.muscles.length?stats.muscles.map(x=>{
     let pct=maxMuscle>0?Math.max(4,Math.min(100,(x.volume/maxMuscle)*100)):0;
     return '<div class="progress-workout-muscle-row"><div><span>'+esc(x.name)+'</span><strong>'+progressVolumeNumber(x.volume)+' кг</strong></div><i><b style="width:'+pct.toFixed(1)+'%"></b></i></div>';
   }).join(''):'<div class="progress-workout-muscle-empty">Для цієї тренування немає даних про м’язові групи.</div>';
 }else{
   musclesHTML='<div class="progress-workout-muscle-empty">Не вдалося завантажити м’язові групи.</div>';
 }
 return '<div class="progress-workout-stats">'
   +'<div class="progress-workout-stat primary"><small>Загальний обсяг</small><strong>'+progressVolumeNumber(stats.total)+' кг</strong></div>'
   +'<div class="progress-workout-stat"><small>Робочих підходів</small><strong>'+stats.workSets+'</strong></div>'
  +'</div>'
  +'<div class="progress-workout-muscles"><div class="progress-workout-muscles-head"><span>Обсяг за м’язами</span><small>основні м’язи</small></div>'+musclesHTML+'</div>';
}

async function ensureProgressExerciseLibrary(){
 if(window.progressExerciseLibrary)return window.progressExerciseLibrary;
 if(window.exerciseLibrary){window.progressExerciseLibrary=window.exerciseLibrary;return window.progressExerciseLibrary}
 try{
   window.progressExerciseLibrary=await api('/exercise-library');
   return window.progressExerciseLibrary;
 }catch(e){
   return null;
 }
}

function progressWorkoutDetailHTML(d,sid){
 let data=progressWorkoutData(d,sid);
 if(!data)return '<div class="redesign-empty-panel"><strong>Тренування не знайдено</strong><span>Повернись до списку тренувань і спробуй ще раз.</span></div>';
 let s=data.workout,duration=(+s.duration_seconds||0)>0?formatWorkoutDuration(+s.duration_seconds||0):'—';
 let review=s.trainer_reviewed?'<div class="calendar-review-done"><strong>Перевірено тренером ✓</strong>'+(s.trainer_comment?'<div>'+esc(s.trainer_comment)+'</div>':'')+'</div>':'';
 let canReopen=data.day===isoToday();
 let actions='<div class="completed-workout-actions"><button type="button" class="completed-workout-edit-btn" onclick="openCompletedWorkoutEditor('+sid+')">'+uiIcon('edit')+'<span>Редагувати тренування</span></button>'+(canReopen?'<button type="button" class="completed-workout-reopen-btn" onclick="reopenCompletedWorkout('+sid+',this)">Скасувати завершення</button>':'')+'</div>';
 let exercises=data.exercises.length?data.exercises.map(x=>{
   let replacement=x.planned&&x.planned!==x.name?'<span class="calendar-workout-replacement">За планом: '+esc(x.planned)+'</span>':'';
   if((x.timed||[]).length){
     let timedRows=(x.timed||[]).slice().sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
     let rows=timedRows.map(set=>'<div class="progress-workout-set-group"><div class="calendar-workout-set timed"><span>Підхід '+esc(set.set_number)+'</span><strong>'+esc(set.work_seconds)+' сек</strong><em>план '+esc(set.planned_seconds)+' сек'+(+set.rest_seconds>0?' · відпочинок '+esc(set.rest_seconds)+' сек':'')+'</em></div></div>').join('');
     let count=timedRows.length;
     return '<div class="progress-workout-exercise timed"><div class="progress-workout-exercise-head"><div><strong>'+esc(x.name)+'</strong>'+replacement+'<small class="progress-timed-label">За часом</small></div><span>'+count+' '+(count===1?'підхід':count<5?'підходи':'підходів')+'</span></div><div class="progress-workout-sets">'+rows+'</div></div>';
   }
   let warm=(x.aux||[]).filter(a=>a.kind==='warmup').sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));
   let warmHTML=warm.length?'<div class="progress-workout-aux warmup"><small>Розминка</small>'+warm.map(a=>'<span>'+esc(a.weight)+' кг × '+esc(repeatResultText(a.reps,a.repeat_mode||x.sets[0]?.repeat_mode))+'</span>').join('')+'</div>':'';
   let skippedSet=new Set((x.skipped||[]).map(s=>+s.set_number||0)),setMap=new Map((x.sets||[]).map(s=>[+s.set_number,s]));
   let numbers=[...new Set([...(x.sets||[]).map(s=>+s.set_number||0),...(x.skipped||[]).map(s=>+s.set_number||0)])].filter(Boolean).sort((a,b)=>a-b);
   let setsHTML=numbers.map(n=>{
     if(skippedSet.has(n))return '<div class="progress-workout-set-group"><div class="calendar-workout-set skipped"><span>Підхід '+esc(n)+'</span><strong>Пропущено</strong><em>не виконано</em></div></div>';
     let set=setMap.get(n);if(!set)return '';
     let drops=(x.aux||[]).filter(a=>a.kind==='drop'&&+a.parent_set_number===+set.set_number).sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));
     return '<div class="progress-workout-set-group"><div class="calendar-workout-set"><span>Підхід '+esc(set.set_number)+'</span><strong>'+esc(set.weight)+' кг × '+esc(repeatResultText(set.reps,set.repeat_mode))+'</strong><em>RIR '+esc(set.rir)+(+set.rest_seconds>0?' · ⏱ '+esc(formatSetRest(set.rest_seconds)):'')+'</em></div>'
       +drops.map((a,i)=>'<div class="progress-workout-drop"><span>↳ Дроп '+(i+1)+'</span><strong>'+esc(a.weight)+' кг × '+esc(repeatResultText(a.reps,a.repeat_mode||set.repeat_mode))+'</strong></div>').join('')+'</div>';
   }).join('');
   let rowCount=numbers.length;
   return '<div class="progress-workout-exercise"><div class="progress-workout-exercise-head"><div><strong>'+esc(x.name)+'</strong>'+replacement+'</div><span>'+rowCount+' '+(rowCount===1?'підхід':rowCount<5?'підходи':'підходів')+'</span></div>'+warmHTML+'<div class="progress-workout-sets">'+setsHTML+'</div></div>';
 }).join(''):'<div class="redesign-empty-panel"><strong>Результати не записані</strong><span>Для цього тренування немає збережених підходів.</span></div>';
 return '<div class="progress-workout-detail-hero"><div><span>Завершене тренування</span><h1>'+esc(s.day_name||'Тренування')+'</h1><small>'+esc(formatProgressDate(data.day))+'</small></div><div class="progress-workout-detail-duration"><span>Тривалість</span><strong>'+esc(duration)+'</strong></div></div>'+actions+review+progressWorkoutStatsHTML(data)+'<div class="progress-workout-detail-section"><div class="progress-workout-detail-section-head"><span>Вправи</span><strong>'+data.exercises.length+'</strong></div>'+exercises+'</div>';
}

function completedWorkoutEditSetRowHTML(n,set={},targetRir=2){
 let value=v=>v===undefined||v===null?'':esc(String(v));
 let rest=set.rest_seconds===undefined||set.rest_seconds===null?'':String(set.rest_seconds);
 return '<div class="completed-workout-edit-set" data-set-number="'+n+'" data-rest-seconds="'+esc(rest)+'">'
   +'<span class="completed-workout-edit-set-number">'+n+'</span>'
   +'<input data-field="weight" type="number" min="0" step="0.5" inputmode="decimal" value="'+value(set.weight)+'" placeholder="кг" aria-label="Вага, підхід '+n+'">'
   +'<input data-field="reps" type="number" min="1" step="1" inputmode="numeric" value="'+value(set.reps)+'" placeholder="повт." aria-label="Повтори, підхід '+n+'">'
   +'<input data-field="rir" type="number" min="0" max="10" step="1" inputmode="numeric" value="'+value(set.rir)+'" placeholder="'+value(targetRir)+'" aria-label="RIR, підхід '+n+'">'
  +'</div>';
}

function completedWorkoutEditAuxRowHTML(kind,index,aux={},parentSet=0){
 let value=v=>v===undefined||v===null?'':esc(String(v));
 let label=kind==='warmup'?'Розм. '+index:'Дроп '+index;
 return '<div class="completed-workout-edit-aux-row '+kind+'" data-kind="'+kind+'" data-aux-number="'+index+'" data-parent-set="'+(+parentSet||0)+'">'
   +'<span>'+label+'</span>'
   +'<input data-field="weight" type="number" min="0" step="0.5" inputmode="decimal" value="'+value(aux.weight)+'" placeholder="кг" aria-label="Вага, '+label+'">'
   +'<input data-field="reps" type="number" min="1" step="1" inputmode="numeric" value="'+value(aux.reps)+'" placeholder="повт." aria-label="Повтори, '+label+'">'
   +'<button type="button" aria-label="Видалити '+label+'" onclick="removeCompletedWorkoutAuxRow(this)">✕</button>'
  +'</div>';
}

function completedWorkoutEditWorkGroupHTML(n,set={},targetRir=2,aux=[]){
 let drops=(aux||[]).filter(a=>a.kind==='drop'&&+a.parent_set_number===+n).sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));
 return '<div class="completed-workout-edit-set-group" data-work-set-group="'+n+'">'
   +completedWorkoutEditSetRowHTML(n,set,targetRir)
   +'<div class="completed-workout-edit-drop-holder" data-drop-holder="'+n+'">'
     +drops.map((a,i)=>completedWorkoutEditAuxRowHTML('drop',+a.aux_number||i+1,a,n)).join('')
   +'</div>'
   +'<button type="button" class="completed-workout-add-drop" data-parent-set="'+n+'" onclick="addCompletedWorkoutDrop(this)">+ Додати дроп-сет</button>'
  +'</div>';
}

function completedWorkoutEditorExerciseHTML(p,data){
 let pid=+p.id||0,existing=(data.exercises||[]).find(x=>+x.pid===pid),exercise=existing?.name||p.exercise||'Вправа';
 let timed=String(p?.execution_mode||'reps').toLowerCase()==='time'||(existing?.timed||[]).length>0;
 if(timed){
   let rows=(existing?.timed||[]).slice().sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   return '<section class="completed-workout-edit-exercise timed-readonly" data-program-id="'+pid+'" data-exercise="'+esc(exercise)+'" data-timed-readonly="1">'
     +'<div class="completed-workout-edit-exercise-head"><div><strong>'+esc(exercise)+'</strong><small>Вправа за часом</small></div><span>'+rows.length+' підх.</span></div>'
     +'<div class="completed-workout-timed-readonly">'+(rows.length?rows.map(s=>'<div><span>Підхід '+esc(s.set_number)+'</span><strong>'+esc(s.work_seconds)+' сек</strong><small>план '+esc(s.planned_seconds)+' сек'+(+s.rest_seconds>0?' · відпочинок '+esc(s.rest_seconds)+' сек':'')+'</small></div>').join(''):'<p>Результати ще не збережені.</p>')+'</div>'
     +'<p class="completed-workout-timed-note">Результати вправ за часом у цьому редакторі поки доступні лише для перегляду. Історія зберігається окремо.</p>'
   +'</section>';
 }
 let current=(existing?.sets||[]).slice().sort((a,b)=>(+a.set_number||0)-(+b.set_number||0)),aux=(existing?.aux||[]).slice();
 let warmups=aux.filter(a=>a.kind==='warmup').sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));
 let count=Math.max(1,+p.sets||0,...current.map(x=>+x.set_number||0));
 let rirValues=typeof rirPlan==='function'?rirPlan(p):Array.from({length:count},()=>+p.target_rir||0);
 let rows='';
 for(let n=1;n<=count;n++)rows+=completedWorkoutEditWorkGroupHTML(n,current.find(x=>+x.set_number===n)||{},rirValues[n-1]??(+p.target_rir||0),aux);
 return '<section class="completed-workout-edit-exercise" data-program-id="'+pid+'" data-exercise="'+esc(exercise)+'" data-target-rir="'+esc(String(+p.target_rir||0))+'">'
   +'<div class="completed-workout-edit-exercise-head"><div><strong>'+esc(exercise)+'</strong>'+(existing?.planned&&existing.planned!==exercise?'<small>За планом: '+esc(existing.planned)+'</small>':'')+'</div><span>'+count+' підх.</span></div>'
   +'<div class="completed-workout-edit-aux-section warmup">'
     +'<div class="completed-workout-edit-aux-title"><span>Розминка</span><small>необов’язково</small></div>'
     +'<div class="completed-workout-edit-warmup-holder">'+warmups.map((a,i)=>completedWorkoutEditAuxRowHTML('warmup',+a.aux_number||i+1,a,0)).join('')+'</div>'
     +'<button type="button" class="completed-workout-add-warmup" onclick="addCompletedWorkoutWarmup(this)">+ Додати розминочний підхід</button>'
   +'</div>'
   +'<div class="completed-workout-edit-labels"><span></span><span>Вага</span><span>Повтори</span><span>RIR</span></div>'
   +'<div class="completed-workout-edit-sets">'+rows+'</div>'
   +'<button type="button" class="completed-workout-add-set" onclick="addCompletedWorkoutEditSet(this)">+ Додати робочий підхід</button>'
  +'</section>';
}

function openCompletedWorkoutEditor(sid){
 let d=window.currentClientData||{},data=progressWorkoutData(d,sid);
 if(!data)return alert('Тренування не знайдено.');
 let plan=(data.plan||[]).slice();
 if(!plan.length){
   plan=(data.exercises||[]).map(x=>({id:x.pid,exercise:x.name,sets:Math.max(1,...(x.sets||[]).map(s=>+s.set_number||0)),target_rir:2}));
 }
 if(!plan.length)return alert('У цьому тренуванні немає вправ для редагування.');
 document.getElementById('completedWorkoutEditModal')?.remove();
 let hasClassic=plan.some(p=>String(p?.execution_mode||'reps').toLowerCase()!=='time');
 document.body.insertAdjacentHTML('beforeend','<div class="modal completed-workout-edit-modal" id="completedWorkoutEditModal" onclick="if(event.target===this)this.remove()">'
   +'<div class="card completed-workout-edit-card">'
     +'<div class="completed-workout-edit-head"><div><small>'+esc(formatProgressDate(data.day))+'</small><h2>Редагувати тренування</h2><p>Класичні вправи можна редагувати тут. Результати вправ за часом показуємо без зміни, щоб не втратити історію.</p></div><button type="button" class="dark" aria-label="Закрити" onclick="completedWorkoutEditModal.remove()">✕</button></div>'
     +'<div class="completed-workout-edit-list">'+plan.map(p=>completedWorkoutEditorExerciseHTML(p,data)).join('')+'</div>'
     +(hasClassic?'<button type="button" class="completed-workout-save" onclick="saveCompletedWorkoutEdit('+sid+',this)">Зберегти зміни</button>':'')
   +'</div></div>');
}

function nextCompletedWorkoutAuxNumber(holder){
 let nums=[...holder.querySelectorAll('.completed-workout-edit-aux-row')].map(x=>+x.dataset.auxNumber||0);
 return Math.max(0,...nums)+1;
}

function addCompletedWorkoutWarmup(button){
 let card=button?.closest('.completed-workout-edit-exercise'),holder=card?.querySelector('.completed-workout-edit-warmup-holder');if(!holder)return;
 let n=nextCompletedWorkoutAuxNumber(holder);if(n>50)return alert('Максимум 50 розминочних підходів.');
 holder.insertAdjacentHTML('beforeend',completedWorkoutEditAuxRowHTML('warmup',n,{},0));
}

function addCompletedWorkoutDrop(button){
 let group=button?.closest('.completed-workout-edit-set-group'),holder=group?.querySelector('.completed-workout-edit-drop-holder');if(!holder)return;
 let parent=+button.dataset.parentSet||+group.dataset.workSetGroup||0,n=nextCompletedWorkoutAuxNumber(holder);
 if(n>50)return alert('Максимум 50 дроп-сетів до підходу.');
 holder.insertAdjacentHTML('beforeend',completedWorkoutEditAuxRowHTML('drop',n,{},parent));
}

function removeCompletedWorkoutAuxRow(button){
 button?.closest('.completed-workout-edit-aux-row')?.remove();
}

function addCompletedWorkoutEditSet(button){
 let card=button?.closest('.completed-workout-edit-exercise'),holder=card?.querySelector('.completed-workout-edit-sets');if(!card||!holder)return;
 let rows=[...holder.querySelectorAll('.completed-workout-edit-set')],n=Math.max(0,...rows.map(x=>+x.dataset.setNumber||0))+1;
 if(n>20)return alert('Максимум 20 підходів.');
 holder.insertAdjacentHTML('beforeend',completedWorkoutEditWorkGroupHTML(n,{},+card.dataset.targetRir||0,[]));
 card.querySelector('.completed-workout-edit-exercise-head>span').textContent=n+' підх.';
}

async function saveCompletedWorkoutEdit(sid,button=null){
 let modal=document.getElementById('completedWorkoutEditModal');if(!modal)return;
 let sets=[],auxSets=[];
 for(const card of modal.querySelectorAll('.completed-workout-edit-exercise')){
   if(card.dataset.timedReadonly==='1')continue;
   let pid=+card.dataset.programId||0,exercise=card.dataset.exercise||'',savedNumbers=new Set();
   for(const row of card.querySelectorAll('.completed-workout-edit-set')){
     let weight=String(row.querySelector('[data-field="weight"]')?.value||'').trim();
     let reps=String(row.querySelector('[data-field="reps"]')?.value||'').trim();
     let rir=String(row.querySelector('[data-field="rir"]')?.value||'').trim();
     if(!weight&&!reps&&!rir)continue;
     if(weight===''||reps===''||rir==='')return alert('Заповни вагу, повтори та RIR у кожному внесеному робочому підході.');
     let setNumber=+row.dataset.setNumber,rest=String(row.dataset.restSeconds||'').trim();
     savedNumbers.add(setNumber);
     sets.push({program_id:pid,exercise,set_number:setNumber,weight:+weight,reps:+reps,rir:+rir,rest_seconds:rest===''?null:+rest});
   }
   for(const row of card.querySelectorAll('.completed-workout-edit-aux-row')){
     let kind=row.dataset.kind||'',parent=+row.dataset.parentSet||0;
     let weight=String(row.querySelector('[data-field="weight"]')?.value||'').trim();
     let reps=String(row.querySelector('[data-field="reps"]')?.value||'').trim();
     if(!weight&&!reps)continue;
     if(weight===''||reps==='')return alert('Заповни вагу та повтори у кожному внесеному '+(kind==='drop'?'дроп-сеті':'розминочному підході')+'.');
     if(kind==='drop'&&!savedNumbers.has(parent))return alert('Спочатку заповни робочий підхід '+parent+', до якого доданий дроп-сет.');
     auxSets.push({program_id:pid,exercise,kind,parent_set_number:kind==='drop'?parent:null,aux_number:+row.dataset.auxNumber||1,weight:+weight,reps:+reps});
   }
 }
 if(!sets.length)return alert('Заповни хоча б один робочий підхід.');
 let restore=setActionLoading(button,'Зберігаємо…');
 try{
   await api('/workout/'+sid+'/results',{method:'PATCH',body:JSON.stringify({sets,aux_sets:auxSets})});
   modal.remove();
   window.currentClientData=await loadClientData(session.client_id);
   await openProgressWorkout(sid,false);
 }catch(e){
   restore();
   alert(e?.message||'Не вдалося зберегти зміни.');
 }
}

async function reopenCompletedWorkout(sid,button=null){
 let d=window.currentClientData||{},data=progressWorkoutData(d,sid);
 if(!data)return alert('Тренування не знайдено.');
 if(data.day!==isoToday())return alert('Скасувати завершення можна лише в день тренування. Для минулих тренувань скористайся редагуванням.');
 if(!confirm('Скасувати завершення і повернути тренування в активне? Уже внесені підходи збережуться.'))return;
 let restore=setActionLoading(button,'Повертаємо…');
 try{
   let reopened=await api('/workout/'+sid+'/reopen',{method:'POST'});
   document.getElementById('completedWorkoutEditModal')?.remove();
   document.getElementById('finishSummaryModal')?.remove();
   let cid=session?.client_id;
   if(cid&&reopened?.id){let k=offlineLocalScopeKey();if(k)localStorage.setItem('eplanActiveWorkoutV2_'+k+'_'+cid,JSON.stringify(reopened));}
   window.currentClientData=await loadClientData(cid);
   window.clientTrainingTab='program';
   await showClientTraining(cid);
 }catch(e){
   restore();
   alert(e?.message||'Не вдалося скасувати завершення тренування.');
 }
}

async function openProgressWorkout(sid,pushHistory=true){
 let d=window.currentClientData||{},data=progressWorkoutData(d,sid);
 if(!data){window.clientProgressView='training';showClientSection('progress');return}
 await ensureProgressExerciseLibrary();
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
