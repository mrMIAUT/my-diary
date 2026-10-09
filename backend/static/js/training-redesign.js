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

function redesignTrainingExerciseRow(x,num,inSuperset=false,showRest=true){
  let timed=isTimedWorkoutExercise(x),rest=showRest?restLabel(x):'',rir=timed?'':rirPlan(x).join(' / '),
      alts=timed?[]:exerciseAlternativeConfigs(x),mainTech=exerciseTechniqueUrl(x.exercise,x.technique_url),
      plan=timed?timedWorkoutPlanText(x):repeatPlanText(x);
  return '<div class="redesign-training-exercise '+(inSuperset?'is-superset-exercise':'')+'">'
    +'<span>'+num+'</span>'
    +'<div class="redesign-training-exercise-copy">'
      +'<div class="redesign-training-main-title-row"><strong>'+esc(x.exercise)+'</strong></div>'
      +(mainTech?'<div class="redesign-training-technique">'+techniqueLinkHTML(mainTech,'Техніка',true,'redesign-training-tech-link')+'</div>':'')
      +'<small>'+x.sets+' × '+esc(plan)+(rest?' · '+esc(rest):'')+'</small>'
      +(alts.length?'<div class="redesign-training-alternatives"><em>Альтернативи:</em>'+alts.map(function(v){
        let tech=exerciseTechniqueUrl(v.exercise),altRest=restLabel(v),altRir=rirPlan(v).join(' / ');
        return '<span class="redesign-training-alt-chip detailed"><i>'+esc(v.exercise)+'</i><small>'+v.sets+' × '+esc(v.reps)+' · RIR '+esc(altRir)+(altRest?' · '+esc(altRest):'')+'</small>'+(tech?techniqueLinkHTML(tech,'Техніка',true,'redesign-training-alt-tech'):'')+'</span>';
      }).join('')+'</div>':'')
    +'</div>'
    +'<b>'+(timed?'Час':'RIR '+esc(rir))+'</b>'
  +'</div>';
}

function redesignTrainingExerciseList(xs){
  let used=new Set(),html='';
  xs.forEach(function(x,i){
    if(used.has(x.id))return;
    if(x.superset_group){
      let pair=xs.filter(function(y){return y.superset_group===x.superset_group;})
        .slice()
        .sort(function(a,b){return (+a.superset_order||0)-(+b.superset_order||0)||xs.indexOf(a)-xs.indexOf(b);});
      pair.forEach(function(y){used.add(y.id);});
      let superRest=supersetRestLabel(pair);
      html+='<div class="redesign-training-superset">'
        +'<div class="redesign-training-superset-label"><span>Суперсет</span><small>виконати вправи по черзі'+(superRest?' · Відпочинок '+esc(superRest):'')+'</small></div>'
        +pair.map(function(y){return redesignTrainingExerciseRow(y,xs.indexOf(y)+1,true,false);}).join('')
      +'</div>';
    }else{
      used.add(x.id);
      html+=redesignTrainingExerciseRow(x,i+1,false);
    }
  });
  return html;
}

function redesignTrainingDayCard(d,cid,groups,day,index,cycle,todayCompletedDay=''){
  let xs=groups[day]||[],isTodayDone=todayCompletedDay===day,isNext=!isTodayDone&&cycle.next===day,isDone=isTodayDone||cycle.done.includes(day);
  let title=programDayTitle(d,day)||'Силове тренування';
  let muscleNames=[];
  xs.forEach(function(x){
    (x.primary_muscles||[]).forEach(function(m){if(m&&!muscleNames.includes(m))muscleNames.push(m)});
  });
  let desc=muscleNames.slice(0,3).join(' · ')||title;
  let status=isTodayDone?'Виконано сьогодні':isDone?'Виконано':isNext?'Наступне':'За планом';
  return '<article class="redesign-training-day '+(isNext?'is-next ':'')+(isDone?'is-done':'')+'">'
    +'<button class="redesign-training-day-main" data-day="'+esc(day)+'" onclick="toggleRedesignTrainingDay(this.dataset.day,this)">'
      +'<span class="redesign-training-day-index">'+(index+1)+'</span>'
      +'<span class="redesign-training-day-copy"><strong>'+esc(day)+'</strong><small>'+esc(title)+'</small><em>'+xs.length+' '+(xs.length===1?'вправа':xs.length<5?'вправи':'вправ')+' · '+esc(desc)+'</em></span>'
      +'<span class="redesign-training-day-status">'+esc(status)+'</span>'
      +'<span class="redesign-training-chevron">⌄</span>'
    +'</button>'
    +'<div class="redesign-training-day-body hidden" data-training-day="'+esc(day)+'">'
      +'<div class="redesign-training-exercises">'+redesignTrainingExerciseList(xs)+'</div>'
      +(isTodayDone
        ?'<div class="redesign-completed-workout-note">✓ Тренування вже виконано сьогодні</div>'
        :'<button class="redesign-start-workout" data-day="'+esc(day)+'" onclick="event.stopPropagation();startWorkout('+cid+',this.dataset.day,this)">'+(isDone?'Почати ще раз':'Почати тренування')+'</button>')
    +'</div>'
  +'</article>';
}

function redesignExtraTrainingDayCard(d,cid,groups,day,todayCompletedDay=''){
  let xs=groups[day]||[],m=programDayMeta(d,day),isTodayDone=todayCompletedDay===day;
  let title=programDayTitle(d,day)||'Додаткове тренування';
  let until=String(m?.active_until||'').slice(0,10);
  let meta=programDayExtraModeLabel(m)+(until?' · до '+formatProgressDate(until):'');
  return '<article class="redesign-training-day redesign-extra-training-day">'
    +'<button class="redesign-training-day-main" data-day="'+esc(day)+'" onclick="toggleRedesignTrainingDay(this.dataset.day,this)">'
      +'<span class="redesign-training-day-index extra">+</span>'
      +'<span class="redesign-training-day-copy"><strong>'+esc(day)+'</strong><small>'+esc(title)+'</small><em>'+xs.length+' '+(xs.length===1?'вправа':xs.length<5?'вправи':'вправ')+' · '+esc(meta)+'</em></span>'
      +'<span class="redesign-training-day-status extra">Додаткове</span>'
      +'<span class="redesign-training-chevron">⌄</span>'
    +'</button>'
    +'<div class="redesign-training-day-body hidden" data-training-day="'+esc(day)+'">'
      +'<div class="redesign-training-exercises">'+redesignTrainingExerciseList(xs)+'</div>'
      +(isTodayDone
        ?'<div class="redesign-completed-workout-note">✓ Тренування вже виконано сьогодні</div>'
        :'<button class="redesign-start-workout extra" data-day="'+esc(day)+'" onclick="event.stopPropagation();startWorkout('+cid+',this.dataset.day,this)">Почати додаткове тренування</button>')
    +'</div>'
  +'</article>';
}

function toggleRedesignTrainingDay(day,btn){
  let body=btn?.parentElement?.querySelector('.redesign-training-day-body');if(!body)return;
  body.classList.toggle('hidden');
  btn.classList.toggle('open',!body.classList.contains('hidden'));
}

function redesignTrainingProgramHTML(d,cid,groups){
  let allDays=Object.keys(groups||{}),
      days=allDays.filter(day=>!programDayIsExtra(d,day)),
      extraDays=allDays.filter(day=>programDayIsExtra(d,day)&&programDayIsAvailable(d,day)&&(groups[day]||[]).length),
      cycle=workoutCycleState(d,groups||{}),today=isoToday(),sessions=d.workout_sessions||[],
      todaySets=(d.result_sets||[]).filter(x=>x.day===today),
      todaySession=sessions.find(x=>x.status==='finished'&&sessionDay(x)===today)||(todaySets.length?sessions.filter(x=>x.status==='finished').slice().sort((a,b)=>(+b.id||0)-(+a.id||0))[0]:null),
      todayProgramSession=todaySession&&workoutSessionMatchesCurrentProgram(d,todaySession)?todaySession:null,
      todayCompletedDay=todayProgramSession?.day_name||'',
      todayBannerDay=todaySession?.day_name||'',
      todayDuration=todaySession?.duration_seconds;
  if(!days.length&&!extraDays.length)return '<div class="redesign-empty-panel"><strong>Програму ще не додано</strong><span>Коли тренер призначить програму або додаткове тренування, воно з’явиться тут.</span></div>';
  let completed=Math.min(days.length,cycle.done.length),pct=days.length?Math.round(completed/days.length*100):0;
  let summary=days.length?'<div class="redesign-training-summary"><div><span>Поточний цикл</span><strong>'+completed+' з '+days.length+'</strong></div><div class="redesign-training-cycle"><i style="width:'+pct+'%"></i></div><b>'+pct+'%</b></div>':'';
  let mainDays=days.length?'<div class="redesign-training-day-list">'+days.map(function(day,i){return redesignTrainingDayCard(d,cid,groups,day,i,cycle,todayCompletedDay)}).join('')+'</div>':'';
  let extraSection=extraDays.length?'<section class="redesign-extra-training-section"><div class="redesign-extra-training-head"><div><span>Додаткові тренування</span><small>Не впливають на основний цикл</small></div><b>'+extraDays.length+'</b></div><div class="redesign-training-day-list extra">'+extraDays.map(function(day){return redesignExtraTrainingDayCard(d,cid,groups,day,todayCompletedDay)}).join('')+'</div></section>':'';
  return '<div class="redesign-training-overview">'+(todayBannerDay?'<div class="redesign-training-today-done"><span class="redesign-training-today-done-icon">✓</span><div><strong>Тренування на сьогодні завершено</strong><small>'+esc(todayBannerDay)+' виконано'+(todayDuration!==undefined&&todayDuration!==null?' · ⏱ '+esc(formatWorkoutDuration(todayDuration)):'')+'. Наступне тренування — за планом.</small></div></div>':'')
    +summary
    +'<div class="redesign-training-help">'
      +'<button onclick="toggleClientPanel(\'trainingRulesBody\',this)"><span class="client-home-today-icon">'+uiIcon('run')+'</span><span><strong>Розминка та правила</strong><small>RIR, підходи, дроп-сети, суперсети</small></span><span class="redesign-training-rule-chevron">⌄</span></button>'
      +'<div id="trainingRulesBody" class="hidden redesign-training-help-body">'
        +'<div class="redesign-rule-item"><b>1</b><div><strong>Розминка</strong><p>Перед тренуванням виконуємо загальну розминку. Перед вправами за потреби робимо розминочні підходи, поступово підводячись до робочої ваги.</p></div></div>'
        +'<div class="redesign-rule-item"><b>2</b><div><strong>Робочі підходи</strong><p>У програмі вказані робочі підходи. Розминочні підходи можна вносити за бажанням — вони не враховуються як робочі та не впливають на прогресію.</p></div></div>'
        +'<div class="redesign-rule-item"><b>3</b><div><strong>RIR</strong><p>Показує, скільки повторів залишилося б у запасі до відмови. RIR 2 — приблизно ще 2 повтори.</p></div></div>'
        +'<div class="redesign-rule-item"><b>4</b><div><strong>Дроп-сет</strong><p>Після робочого підходу зменшуємо вагу й без звичайного відпочинку продовжуємо вправу. За потреби можна додати кілька дропів.</p></div></div>'
        +'<div class="redesign-rule-item"><b>5</b><div><strong>Суперсет</strong><p>Дві вправи виконуються одна за одною без звичайного відпочинку між ними. Відпочинок — після обох вправ.</p></div></div>'
      +'</div>'
    +'</div>'
    +mainDays+extraSection
  +'</div>';
}

function toggleClientLibraryGroup(id,button){
  let body=document.getElementById(id);if(!body)return;
  let open=!body.classList.contains('hidden');
  body.classList.toggle('hidden',open);
  button?.classList.toggle('open',!open);
  button?.setAttribute('aria-expanded',String(!open));
}

function redesignClientExerciseLibraryHTML(){
  let L=window.exerciseLibrary||{groups:[],muscles:[],exercises:[]};
  if(!(L.exercises||[]).length)return '<div class="redesign-empty-panel"><strong>Бібліотека поки порожня</strong><span>Вправи з’являться тут після додавання тренером.</span></div>';
  return '<div class="redesign-client-library">'
    +(L.groups||[]).map(function(g){
      let xs=(L.exercises||[]).filter(function(x){return +x.group_id===+g.id});
      if(!xs.length)return '';
      let bodyId='clientLibGroup'+g.id;
      return '<section class="redesign-library-group">'
        +'<button class="redesign-library-group-head" type="button" aria-expanded="false" aria-controls="'+bodyId+'" onclick="toggleClientLibraryGroup(\''+bodyId+'\',this)">'
          +'<strong>'+esc(g.name)+'</strong><span class="redesign-library-group-meta"><b>'+xs.length+'</b><i>⌄</i></span>'
        +'</button>'
        +'<div id="'+bodyId+'" class="redesign-library-group-body hidden">'
          +xs.map(function(x){
            let primary=(x.primary_muscle_ids||[]).map(libraryMuscleName).filter(Boolean).slice(0,2);
            return '<div class="redesign-library-row"><div><strong>'+esc(x.name)+'</strong><small>'+esc(primary.join(' · ')||'Вправа')+'</small></div>'
              +(x.technique_url?techniqueLinkHTML(x.technique_url,'Відео',false,'redesign-library-video'):'')
            +'</div>';
          }).join('')
        +'</div>'
      +'</section>';
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
  if(!window.exerciseLibrary?.exercises?.length)await loadExerciseLibrary();
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
    let activeDay=String(active.workout_day||'').slice(0,10)||isoToday();
    let hasSavedSets=(d.result_sets||[]).some(x=>x.day===activeDay);
    let cancelSeconds=Math.max(0,120-(+active.duration_seconds||0));
    let canCancel=!hasSavedSets&&cancelSeconds>0;
    let cancelHTML=canCancel?'<button type="button" class="workout-cancel-early" data-workout-cancel-button="1" onclick="cancelWorkout('+cid+','+active.id+',this)">Скасувати тренування</button>':'';
    let activeBody='<div class="card redesign-active-workout"><div class="redesign-active-workout-head"><div class="training-live">Тренування триває</div>'+compactRestTimerHTML()+'</div><h2>'+esc(active.day_name)+'</h2>'+cancelHTML+activeExercisesHTML(groups[active.day_name]||[],d,cid)+'<div class="finish-workout-wrap"><button class="finish-workout-btn" onclick="finishWorkout('+cid+','+active.id+',this)">Завершити тренування</button></div></div>';
    app.innerHTML=shell('<div class="client-section-page redesign-training-page"><h1>Тренування</h1>'+activeBody+'</div>');
    if(canCancel)setTimeout(()=>document.querySelector('[data-workout-cancel-button="1"]')?.remove(),cancelSeconds*1000+250);
    refreshNotificationBadge(cid,'client','clientNotifyBtn');return;
  }

  let body=window.clientTrainingTab==='activity'?cardioHTML(d,cid,false):window.clientTrainingTab==='stats'?redesignTrainingStatsHTML(d,cid,groups):redesignTrainingProgramHTML(d,cid,groups);
  let tabs='<div class="redesign-training-tabs">'+clientTrainingTabButton('program','Моя програма')+clientTrainingTabButton('activity','Активність')+clientTrainingTabButton('stats','Статистика')+'</div>';
  app.innerHTML=shell('<div class="client-section-page redesign-training-page"><h1>Тренування</h1>'+tabs+body+'</div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};
