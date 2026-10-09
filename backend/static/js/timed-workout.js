// Timed exercises — additive workout mode.
// Loaded after the existing workout scripts. Classic workout code is left untouched.

function timedWorkoutHistoryRows(d,pid,exerciseName){
  exerciseName=exerciseName||'';
  var name=workoutHistoryExerciseName(d,pid,exerciseName);
  var nameKey=workoutHistoryNameKey(name);
  return (d&&d.timed_result_sets||[]).filter(function(r){
    if(!r||!r.day)return false;
    var rowKey=workoutHistoryNameKey(r.exercise);
    if(nameKey&&rowKey)return rowKey===nameKey;
    return +r.program_id===+pid;
  });
}

function todayTimedSets(d,pid){
  var workoutDay=workoutDataDay(d);
  return (d&&d.timed_result_sets||[])
    .filter(function(s){return +s.program_id===+pid&&s.day===workoutDay})
    .slice()
    .sort(function(a,b){return (+a.set_number||0)-(+b.set_number||0)});
}

function isTimedWorkoutExercise(x){
  return String(x&&x.execution_mode||'reps').toLowerCase()==='time';
}

function timedWorkoutPlanText(x){
  return String(Math.max(1,+((x&&x.work_seconds)||1)))+' сек';
}

function timedExercisePreviousHTML(x,d){
  var rows=timedWorkoutHistoryRows(d,x.id,workoutExerciseName(x));
  var today=workoutDataDay(d);
  var dates=[...new Set(rows.map(function(r){return r.day}))].filter(function(day){return day<today}).sort();
  if(!dates.length){
    return '<div class="workout-timed-previous empty"><span>Попередньо</span><strong>—</strong></div>';
  }
  var latest=dates[dates.length-1];
  var sets=rows.filter(function(r){return r.day===latest}).sort(function(a,b){return (+a.set_number||0)-(+b.set_number||0)});
  var previous=sets.length?Math.round(sets.reduce(function(sum,s){return sum+(+s.work_seconds||0)},0)/sets.length):0;
  var planned=Math.max(1,+x.work_seconds||1);
  var delta=planned-previous;
  return '<div class="workout-timed-previous"><span>Попередньо · '+esc(latest)+'</span><strong>'+esc(previous)+' сек</strong><em class="'+(delta>=0?'up':'down')+'">'+(delta>=0?'+':'')+esc(delta)+' сек</em></div>';
}

function timedExerciseHTML(x,d,cid){
  var done=todayTimedSets(d,x.id);
  var planned=Math.max(1,+x.work_seconds||1);
  var plannedSets=Math.max(1,+x.sets||1);
  var inSuperset=!!x.superset_group;
  var complete=done.length>=plannedSets;
  var commonRest=inSuperset?workoutSupersetRestSeconds(x,d):Math.max(0,+x.rest_seconds||0);

  if(complete){
    return '<div class="workout-completed-summary workout-timed-completed">'
      +'<div class="workout-completed-summary-head"><span class="workout-completed-summary-icon">✓</span><div><strong>Виконано ✓</strong><small>'+(inSuperset?'Усі кола суперсету виконано':'Вправа за часом збережена')+'</small></div></div>'
      +'<div class="workout-completed-sets">'
      +done.map(function(s){
        return '<div class="workout-completed-set"><span>'+(inSuperset?'Коло ':'Підхід ')+esc(s.set_number)+'</span><strong>'+esc(s.work_seconds)+' сек</strong><em>план '+esc(s.planned_seconds)+' сек'+(+s.rest_seconds>0?' · відпочинок '+esc(s.rest_seconds)+' сек':'')+'</em></div>';
      }).join('')
      +'</div>'
      +(inSuperset?'':'<button class="workout-completed-edit" onclick="openTimedExerciseTimer('+cid+','+x.id+',true)">Повторити вправу</button>')
      +'</div>';
  }

  var nextSet=1;
  while(done.some(function(s){return +s.set_number===nextSet})&&nextSet<=plannedSets)nextSet+=1;
  var progress=inSuperset&&done.length
    ?'<div class="workout-timed-superset-progress"><span>Виконано</span><strong>'+done.length+' з '+plannedSets+' кіл</strong></div>'
    :'';

  return timedExercisePreviousHTML(x,d)
    +progress
    +'<div class="workout-timed-plan">'
    +'<div><span>'+(inSuperset?'Кола':'Підходи')+'</span><strong>'+esc(plannedSets)+'</strong></div>'
    +'<div><span>Робота</span><strong>'+esc(planned)+' сек</strong></div>'
    +'<div><span>'+(inSuperset?'Після кола':'Відпочинок')+'</span><strong>'+esc(commonRest)+' сек</strong></div>'
    +'</div>'
    +'<button class="workout-finish-exercise workout-timed-start" onclick="openTimedExerciseTimer('+cid+','+x.id+')">'+(inSuperset?'Почати коло '+nextSet:'Почати вправу')+'</button>';
}

window.timedExerciseTimerState=window.timedExerciseTimerState||null;

function closeTimedExerciseTimer(force){
  force=!!force;
  var s=window.timedExerciseTimerState;
  if(s&&s.raf)cancelAnimationFrame(s.raf);
  if(!force&&s&&['work','rest'].includes(s.phase)&&s.remainingMs>0){
    if(!confirm('Закрити таймер цієї вправи? Поточний підхід не буде збережено.'))return;
  }
  window.timedExerciseTimerState=null;
  var modal=document.getElementById('timedExerciseWorkoutModal');
  if(modal)modal.remove();
}

function openTimedExerciseTimer(cid,pid,repeat){
  var d=window.currentClientData||{};
  var raw=(d.program||[]).find(function(v){return +v.id===+pid});
  var x=raw?workoutEffectiveExercise(raw):null;
  if(!x||!isTimedWorkoutExercise(x))return alert('Вправу за часом не знайдено.');
  closeTimedExerciseTimer(true);

  var work=Math.max(1,+x.work_seconds||1);
  var sets=Math.max(1,+x.sets||1);
  var inSuperset=!!x.superset_group;
  var existing=inSuperset?todayTimedSets(d,pid):[];
  var currentSet=1;
  if(inSuperset){
    while(existing.some(function(v){return +v.set_number===currentSet})&&currentSet<=sets)currentSet+=1;
    if(currentSet>sets)return alert('Усі кола цієї вправи вже виконані.');
  }
  var commonRest=inSuperset?workoutSupersetRestSeconds(x,d):Math.max(0,+x.rest_seconds||0);
  var isLast=inSuperset&&workoutSupersetIsLast(x,d);
  var internalRest=inSuperset?0:commonRest;

  window.timedExerciseTimerState={
    cid:cid,pid:pid,exercise:workoutExerciseName(x),
    work:work,rest:internalRest,sharedRest:commonRest,sets:sets,currentSet:currentSet,
    singleSet:inSuperset,isLastSupersetPeer:isLast,
    phase:'idle',totalMs:work*1000,remainingMs:work*1000,
    endsAt:0,raf:0,paused:false,
    results:existing.map(function(v){
      return {set_number:+v.set_number,work_seconds:+v.work_seconds,planned_seconds:+v.planned_seconds,rest_seconds:v.rest_seconds==null?null:+v.rest_seconds};
    })
  };

  var meta=inSuperset
    ?'Коло '+currentSet+' з '+sets+' · '+work+' сек'
    :'Підхід 1 з '+sets+' · '+work+' сек · відпочинок '+internalRest+' сек';
  var html='<div class="modal workout-timed-modal" id="timedExerciseWorkoutModal">'
    +'<div class="card workout-timed-modal-card">'
    +'<div class="workout-timed-modal-head"><div><small>'+(inSuperset?'СУПЕРСЕТ · ВПРАВА ЗА ЧАСОМ':'ВПРАВА ЗА ЧАСОМ')+'</small><h2>'+esc(workoutExerciseName(x))+'</h2></div><button type="button" class="workout-timed-close" onclick="closeTimedExerciseTimer()" aria-label="Закрити">✕</button></div>'
    +'<div class="workout-timed-modal-meta"><span id="timedExerciseSetLabel">'+meta+'</span><b>'+(inSuperset?'без відпочинку до кінця кола':work+' сек · відпочинок '+internalRest+' сек')+'</b></div>'
    +'<div class="workout-timed-ring" id="timedExerciseRing">'
    +'<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54"></circle><circle class="progress" id="timedExerciseProgress" cx="60" cy="60" r="54"></circle></svg>'
    +'<div><span id="timedExercisePhase">ГОТОВА</span><strong id="timedExerciseValue">'+formatTimedSeconds(work*1000)+'</strong><small id="timedExerciseHint">натисни «Старт»</small></div>'
    +'</div>'
    +'<button type="button" class="workout-timed-primary" id="timedExercisePrimary" onclick="toggleTimedExerciseTimer()">Старт</button>'
    +'</div></div>';

  document.body.insertAdjacentHTML('beforeend',html);
  var modal=document.getElementById('timedExerciseWorkoutModal');
  if(modal)modal.addEventListener('click',function(e){if(e.target===modal)closeTimedExerciseTimer()});
  renderTimedExerciseTimer();
}

function timedExerciseCircleLength(){return 2*Math.PI*54}

function formatTimedSeconds(value){
  var sec=Math.max(0,Math.ceil((+value||0)/1000));
  var m=Math.floor(sec/60);
  var s=sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

function setTimedExercisePhase(phase,seconds){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  if(s.raf)cancelAnimationFrame(s.raf);
  var ms=Math.max(0,+seconds||0)*1000;
  s.phase=phase;
  s.totalMs=Math.max(1,ms);
  s.remainingMs=ms;
  s.endsAt=performance.now()+ms;
  s.paused=false;
  s.raf=0;
  renderTimedExerciseTimer();
}

function startTimedExerciseWork(){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  setTimedExercisePhase('work',s.work);
  try{if(navigator.vibrate)navigator.vibrate(40)}catch(e){}
  s.raf=requestAnimationFrame(timedExerciseFrame);
}

function startTimedExerciseRest(){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  if(s.rest<=0){s.currentSet+=1;startTimedExerciseWork();return}
  setTimedExercisePhase('rest',s.rest);
  try{if(navigator.vibrate)navigator.vibrate([60,40,60])}catch(e){}
  s.raf=requestAnimationFrame(timedExerciseFrame);
}

function timedExerciseFrame(now){
  var s=window.timedExerciseTimerState;
  if(!s||s.paused||!['work','rest'].includes(s.phase))return;
  s.remainingMs=Math.max(0,s.endsAt-now);
  renderTimedExerciseTimerFrame();
  if(s.remainingMs<=0){
    s.raf=0;
    advanceTimedExerciseTimer();
    return;
  }
  s.raf=requestAnimationFrame(timedExerciseFrame);
}

async function advanceTimedExerciseTimer(){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  if(s.phase==='work'){
    s.results=s.results.filter(function(r){return r.set_number!==s.currentSet});
    s.results.push({
      set_number:s.currentSet,
      work_seconds:s.work,
      planned_seconds:s.work,
      rest_seconds:s.singleSet&&s.isLastSupersetPeer?s.sharedRest:s.rest
    });
    if(s.singleSet){await finishTimedExerciseTimer();return}
    if(s.currentSet>=s.sets){await finishTimedExerciseTimer();return}
    startTimedExerciseRest();
  }else if(s.phase==='rest'){
    s.currentSet+=1;
    startTimedExerciseWork();
  }
}

function toggleTimedExerciseTimer(){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  if(s.phase==='idle'){startTimedExerciseWork();return}
  if(s.phase==='done'){closeTimedExerciseTimer(true);return}
  if(s.paused){
    s.paused=false;
    s.endsAt=performance.now()+s.remainingMs;
    renderTimedExerciseTimer();
    s.raf=requestAnimationFrame(timedExerciseFrame);
  }else{
    s.remainingMs=Math.max(0,s.endsAt-performance.now());
    s.paused=true;
    if(s.raf)cancelAnimationFrame(s.raf);
    s.raf=0;
    renderTimedExerciseTimer();
  }
}

async function finishTimedExerciseTimer(){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  s.phase='saving';
  renderTimedExerciseTimer();
  try{
    await api('/timed-result-sets',{
      method:'POST',
      body:JSON.stringify({client_id:s.cid,program_id:s.pid,exercise:s.exercise,sets:s.results})
    });

    var cid=s.cid,pid=s.pid,round=s.currentSet,singleSet=s.singleSet,
        d=window.currentClientData||{},raw=(d.program||[]).find(function(v){return +v.id===+pid}),
        isLast=singleSet&&raw?workoutSupersetIsLast(raw,d):!!s.isLastSupersetPeer,
        sharedRest=singleSet&&raw?workoutSupersetRestSeconds(raw,d):Math.max(0,+s.sharedRest||0),
        hasNextRound=round<Math.max(1,+s.sets||1);

    // Start the common superset rest immediately after the final exercise of a
    // round. Doing this before the UI refresh avoids losing the automatic timer.
    if(singleSet&&isLast&&hasNextRound&&sharedRest>0){
      await startRestTimer(sharedRest,null,false);
    }

    s.phase='done';
    s.remainingMs=0;
    renderTimedExerciseTimer();
    try{if(navigator.vibrate)navigator.vibrate([100,70,100])}catch(e){}

    setTimeout(async function(){
      closeTimedExerciseTimer(true);
      var fresh=await loadClientData(cid);
      window.currentClientData=fresh;
      await showClientTraining(cid);
      if(singleSet){
        if(isLast){
          if(hasNextRound)setTimeout(function(){focusSupersetRoundStart(pid,round+1)},80);
        }else{
          setTimeout(function(){focusSupersetNextExercise(pid,round)},80);
        }
      }else{
        focusNextUnfinishedExercise(pid);
      }
    },550);
  }catch(e){
    s.phase='idle';
    if(!s.singleSet){s.currentSet=1;s.results=[]}
    s.remainingMs=s.work*1000;
    renderTimedExerciseTimer();
    alert(e.message||'Не вдалося зберегти вправу за часом.');
  }
}

function renderTimedExerciseTimer(){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  var phase=document.getElementById('timedExercisePhase');
  var hint=document.getElementById('timedExerciseHint');
  var btn=document.getElementById('timedExercisePrimary');
  var label=document.getElementById('timedExerciseSetLabel');
  var ring=document.getElementById('timedExerciseRing');
  if(!phase||!hint||!btn||!label||!ring)return;

  label.textContent=s.phase==='done'
    ?(s.singleSet?'Коло '+s.currentSet+' завершено':'Вправу завершено')
    :(s.singleSet?'Коло '+Math.min(s.currentSet,s.sets)+' з '+s.sets:'Підхід '+Math.min(s.currentSet,s.sets)+' з '+s.sets);
  ring.classList.toggle('rest',s.phase==='rest');
  ring.classList.toggle('done',s.phase==='done');

  if(s.phase==='idle'){
    phase.textContent='ГОТОВА';hint.textContent='натисни «Старт»';btn.textContent='Старт';btn.disabled=false;
  }else if(s.phase==='work'){
    phase.textContent='РОБОТА';hint.textContent=s.paused?'таймер на паузі':'виконуй вправу';btn.textContent=s.paused?'Продовжити':'Пауза';btn.disabled=false;
  }else if(s.phase==='rest'){
    phase.textContent='ВІДПОЧИНОК';hint.textContent=s.paused?'таймер на паузі':'наступний підхід автоматично';btn.textContent=s.paused?'Продовжити':'Пауза';btn.disabled=false;
  }else if(s.phase==='saving'){
    phase.textContent='ЗБЕРІГАЄМО';hint.textContent='секунду…';btn.textContent='Зберігаємо…';btn.disabled=true;
  }else{
    phase.textContent='ГОТОВО';hint.textContent='вправу завершено';btn.textContent='Готово';btn.disabled=false;
  }
  renderTimedExerciseTimerFrame();
}

function renderTimedExerciseTimerFrame(){
  var s=window.timedExerciseTimerState;
  if(!s)return;
  var value=document.getElementById('timedExerciseValue');
  var circle=document.getElementById('timedExerciseProgress');
  if(!value||!circle)return;

  value.textContent=formatTimedSeconds(s.remainingMs);
  var ratio=0;
  if(['work','rest'].includes(s.phase)){
    ratio=s.totalMs?(s.totalMs-s.remainingMs)/s.totalMs:0;
  }else if(s.phase==='done'){
    ratio=1;
  }
  ratio=Math.max(0,Math.min(1,ratio));
  var length=timedExerciseCircleLength();
  circle.style.strokeDasharray=String(length);
  circle.style.strokeDashoffset=String(length*(1-ratio));
}
