// Redesign V1 — client Training tab.
// Loaded after workout.js so it can reuse the existing secure workout flow.

window.clientTrainingTab = window.clientTrainingTab || 'program';

function clientTrainingTabButton(key,label){
  return '<button class="'+(window.clientTrainingTab===key?'active':'')+'" onclick="switchClientTrainingTab(\''+key+'\')">'+esc(label)+'</button>';
}

async function switchClientTrainingTab(key){
  window.clientTrainingTab=key;
  if(session?.role==='client'&&session.client_id)await showClientTraining(session.client_id);
}

function redesignTrainingDayCard(d,cid,groups,day,index,cycle){
  let xs=groups[day]||[],isNext=cycle.next===day,isDone=cycle.done.includes(day);
  let title=programDayTitle(d,day)||'Силове тренування';
  let muscleNames=[];
  xs.forEach(function(x){
    (x.primary_muscles||[]).forEach(function(m){if(m&&!muscleNames.includes(m))muscleNames.push(m)});
  });
  let desc=muscleNames.slice(0,3).join(' · ')||title;
  let status=isDone?'Виконано':isNext?'Наступне':'За планом';
  return '<article class="redesign-training-day '+(isNext?'is-next ':'')+(isDone?'is-done':'')+'">'
    +'<button class="redesign-training-day-main" onclick="toggleRedesignTrainingDay(\''+esc(day).replace(/'/g,"\\'")+'\',this)">'
      +'<span class="redesign-training-day-index">'+(index+1)+'</span>'
      +'<span class="redesign-training-day-copy"><strong>'+esc(day)+'</strong><small>'+esc(title)+'</small><em>'+xs.length+' '+(xs.length===1?'вправа':xs.length<5?'вправи':'вправ')+' · '+esc(desc)+'</em></span>'
      +'<span class="redesign-training-day-status">'+esc(status)+'</span>'
      +'<span class="redesign-training-chevron">⌄</span>'
    +'</button>'
    +'<div class="redesign-training-day-body hidden" data-training-day="'+esc(day)+'">'
      +'<div class="redesign-training-exercises">'
        +xs.map(function(x,i){
          let rest=restLabel(x),rir=rirPlan(x).join(' / ');
          return '<div class="redesign-training-exercise"><span>'+(i+1)+'</span><div><strong>'+esc(x.exercise)+'</strong><small>'+x.sets+' × '+esc(x.reps)+(rest?' · '+esc(rest):'')+'</small></div><b>RIR '+esc(rir)+'</b></div>';
        }).join('')
      +'</div>'
      +(isNext?'<button class="redesign-start-workout" data-day="'+esc(day)+'" onclick="event.stopPropagation();startWorkout('+cid+',this.dataset.day,this)">Почати тренування</button>':'')
    +'</div>'
  +'</article>';
}

function toggleRedesignTrainingDay(day,btn){
  let body=btn?.parentElement?.querySelector('.redesign-training-day-body');if(!body)return;
  body.classList.toggle('hidden');
  btn.classList.toggle('open',!body.classList.contains('hidden'));
}

function redesignTrainingProgramHTML(d,cid,groups){
  let days=Object.keys(groups||{}),cycle=workoutCycleState(d,groups||{});
  if(!days.length)return '<div class="redesign-empty-panel"><strong>Програму ще не додано</strong><span>Коли тренер призначить програму, тренувальні дні з’являться тут.</span></div>';
  let completed=Math.min(days.length,cycle.done.length),pct=days.length?Math.round(completed/days.length*100):0;
  return '<div class="redesign-training-overview">'
    +'<div class="redesign-training-summary"><div><span>Поточний цикл</span><strong>'+completed+' з '+days.length+'</strong></div><div class="redesign-training-cycle"><i style="width:'+pct+'%"></i></div><b>'+pct+'%</b></div>'
    +'<div class="redesign-training-day-list">'+days.map(function(day,i){return redesignTrainingDayCard(d,cid,groups,day,i,cycle)}).join('')+'</div>'
    +'<div class="redesign-training-help">'
      +'<button onclick="toggleClientPanel(\'trainingTermsPanel\',this)"><span class="client-home-today-icon">'+uiIcon('run')+'</span><span><strong>Розминка та правила</strong><small>RIR, робочі підходи, суперсети</small></span><span>›</span></button>'
      +'<div id="trainingTermsPanel" class="hidden redesign-training-help-body">'+trainingTermsHelpHTML().replace(/^<div class="card client-collapsible training-terms-card">|<\/div>$/g,'')+'</div>'
    +'</div>'
  +'</div>';
}

function redesignClientExerciseLibraryHTML(){
  let L=window.exerciseLibrary||{groups:[],muscles:[],exercises:[]};
  if(!(L.exercises||[]).length)return '<div class="redesign-empty-panel"><strong>Бібліотека поки порожня</strong><span>Вправи з’являться тут після додавання тренером.</span></div>';
  return '<div class="redesign-client-library">'
    +(L.groups||[]).map(function(g){
      let xs=(L.exercises||[]).filter(function(x){return +x.group_id===+g.id});
      if(!xs.length)return '';
      return '<section class="redesign-library-group"><div class="redesign-library-group-head"><strong>'+esc(g.name)+'</strong><span>'+xs.length+'</span></div>'
        +xs.map(function(x){
          let primary=(x.primary_muscle_ids||[]).map(libraryMuscleName).filter(Boolean).slice(0,2);
          return '<div class="redesign-library-row"><div><strong>'+esc(x.name)+'</strong><small>'+esc(primary.join(' · ')||'Вправа')+'</small></div>'
            +(x.technique_url?techniqueLinkHTML(x.technique_url,'Відео',false,'redesign-library-video'):'')
          +'</div>';
        }).join('')+'</section>';
    }).join('')
  +'</div>';
}

function redesignTrainingStatsHTML(d,cid,groups){
  let sessions=(d.workout_sessions||[]).filter(function(x){return x.status==='finished'}),sets=d.result_sets||[];
  let uniqueDays=[...new Set(sessions.map(sessionDay).filter(Boolean))].sort();
  let lastDay=uniqueDays[uniqueDays.length-1]||'';
  let cycle=workoutCycleState(d,groups||{});
  let exerciseCount=new Set(sets.map(function(x){return x.program_id})).size;
  return '<div class="redesign-training-stats">'
    +'<div class="redesign-training-stat-grid">'
      +'<div><span>'+uiIcon('calendar')+'</span><strong>'+sessions.length+'</strong><small>тренувань</small></div>'
      +'<div><span>'+uiIcon('dumbbell')+'</span><strong>'+exerciseCount+'</strong><small>вправ виконано</small></div>'
      +'<div><span>'+uiIcon('chart')+'</span><strong>'+cycle.done.length+'</strong><small>у поточному циклі</small></div>'
    +'</div>'
    +'<div class="card redesign-training-last"><span>Останнє тренування</span><strong>'+(lastDay?esc(formatProgressDate(lastDay)):'Ще немає')+'</strong><small>'+(lastDay?'Результати збережені в історії':'Після першого тренування тут з’явиться статистика')+'</small></div>'
    +'<button class="redesign-training-details" onclick="showClientSection(\'progress\')">Переглянути весь прогрес <span>›</span></button>'
  +'</div>';
}

window.showClientTraining = async function(cid){
  let d=window.currentClientData;
  if(!d||+d.client?.id!==+cid)d=await loadClientData(cid);
  let c=d.client;window.currentClientData=d;currentClientView='training';
  let groups={};(d.program||[]).forEach(function(x){(groups[x.day_name]||(groups[x.day_name]=[])).push(x)});
  let access=clientAccess(c);
  let active=(d.workout_sessions||[]).find(function(x){return x.status==='training'});

  if(!access.features?.workouts){
    app.innerHTML=shell('<div class="client-section-page redesign-training-page"><h1>Тренування</h1><div class="redesign-empty-panel"><strong>Тренування недоступні</strong><span>Ця функція не входить до поточного тарифу.</span></div></div>');
    refreshNotificationBadge(cid,'client','clientNotifyBtn');return;
  }

  if(active){
    let activeBody=restTimerPanelHTML()+'<div class="card redesign-active-workout"><div class="training-live">Тренування триває</div><h2>'+esc(active.day_name)+'</h2>'+activeExercisesHTML(groups[active.day_name]||[],d,cid)+'<div class="finish-workout-wrap"><button class="finish-workout-btn" onclick="finishWorkout('+cid+','+active.id+',this)">Завершити тренування</button></div></div>';
    app.innerHTML=shell('<div class="client-section-page redesign-training-page"><h1>Тренування</h1>'+activeBody+'</div>');
    refreshNotificationBadge(cid,'client','clientNotifyBtn');return;
  }

  if(window.clientTrainingTab==='exercises')await loadExerciseLibrary();
  let body=window.clientTrainingTab==='exercises'?redesignClientExerciseLibraryHTML():window.clientTrainingTab==='stats'?redesignTrainingStatsHTML(d,cid,groups):redesignTrainingProgramHTML(d,cid,groups);
  let tabs='<div class="redesign-training-tabs">'+clientTrainingTabButton('program','Моя програма')+clientTrainingTabButton('exercises','Вправи')+clientTrainingTabButton('stats','Статистика')+'</div>';
  app.innerHTML=shell('<div class="client-section-page redesign-training-page"><h1>Тренування</h1>'+tabs+body+'</div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};
