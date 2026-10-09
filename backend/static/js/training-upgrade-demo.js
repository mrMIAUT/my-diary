(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const CIRC = 2 * Math.PI * 54;

  const state = {
    role:'trainer',
    format:'time',
    place:'Дім',
    exercise:'Присідання з резинкою',
    sets:3,
    work:30,
    rest:30,
    load:'Резинка',
    reps:'10–15',
    rir:2,
    previous:25,
    expanded:0,
    completed:new Set(),
    techniqueOpen:new Set(),
    classicDone:new Map(),
    classicExtra:new Map(),
    timed:{
      exerciseIndex:null,
      phase:'idle',
      currentSet:1,
      totalMs:30000,
      remainingMs:30000,
      endsAt:0,
      raf:0,
      paused:false,
      autoClose:0
    },
    restTimer:{
      totalMs:0,
      remainingMs:0,
      endsAt:0,
      raf:0
    }
  };

  function clamp(n,min,max,fallback){
    n=Number(n);
    return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
  }

  function readBuilder(){
    state.exercise=($('#exerciseName')?.value||'Вправа').trim()||'Вправа';
    state.sets=clamp($('#setCount')?.value,1,10,3);
    state.work=clamp($('#workSeconds')?.value,5,600,30);
    state.rest=clamp($('#restSeconds')?.value,0,600,30);
    state.load=($('#loadLabel')?.value||'').trim();
    state.reps=($('#repRange')?.value||'10–15').trim()||'10–15';
    state.rir=clamp($('#rirValue')?.value,0,10,2);
  }

  function exercises(){
    return [
      {
        name:state.exercise,
        format:state.format,
        sets:state.sets,
        work:state.work,
        rest:state.rest,
        load:state.load||'Без ваги',
        reps:state.reps,
        rir:state.rir,
        previous:state.previous,
        technique:'Відео техніки · присідання з резинкою'
      },
      {
        name:'Віджимання від підлоги',
        format:'reps',
        sets:3,
        reps:'8–12',
        rir:2,
        rest:30,
        load:'Власна вага',
        technique:'Відео техніки · віджимання від підлоги'
      },
      {
        name:'Ягодичний міст з резинкою',
        format:'time',
        sets:3,
        work:35,
        rest:25,
        load:'Резинка',
        previous:30,
        technique:'Відео техніки · ягодичний міст'
      }
    ];
  }

  function setRole(role){
    state.role=role;
    $$('.role-switch button').forEach(b=>b.classList.toggle('active',b.dataset.role===role));
    $('#trainerView')?.classList.toggle('active',role==='trainer');
    $('#clientView')?.classList.toggle('active',role==='client');
    if(role==='client'){
      readBuilder();
      renderClientWorkout();
      window.scrollTo({top:0,behavior:'smooth'});
    }else{
      closeTimedExercise();
      stopRestTimer();
    }
  }

  function setFormat(format){
    state.format=format;
    $$('#formatSwitch button').forEach(b=>b.classList.toggle('active',b.dataset.format===format));
    $$('.timed-field').forEach(el=>el.classList.toggle('hidden',format!=='time'));
    $$('.classic-field').forEach(el=>el.classList.toggle('hidden',format!=='reps'));
    const help=$('#formatHelp');
    if(help){
      help.textContent=format==='time'
        ?'Підходи виконуються за таймером. Після роботи відпочинок запускається автоматично.'
        :'Звичайні робочі підходи: вага, повтори та RIR — як у поточному ЄПЛАН.';
    }
    readBuilder();
    renderTrainerPreview();
    if(state.role==='client') renderClientWorkout();
  }

  function setPlace(place){
    state.place=place;
    $$('#placeChips button').forEach(b=>b.classList.toggle('active',b.dataset.place===place));
    renderTrainerPreview();
  }

  function renderTrainerPreview(){
    readBuilder();
    const root=$('#trainerExercisePreview');
    if(!root)return;
    const mode=state.format==='time'?'За часом':'Класичне';
    const details=state.format==='time'
      ?[`${state.sets} підходи`,`${state.work} сек робота`,`${state.rest} сек відпочинок`,state.load||'без додаткової ваги']
      :[`${state.sets} підходи`,`${state.reps} повторів`,`RIR ${state.rir}`,state.load||'вага за потреби'];
    root.innerHTML=`
      <div class="exercise-preview">
        <div class="exercise-preview-head">
          <div><strong>${esc(state.exercise)}</strong><small>${esc(state.place)}</small></div>
          <span class="exercise-preview-badge">${mode}</span>
        </div>
        <div class="exercise-preview-meta">${details.map(v=>`<span>${esc(v)}</span>`).join('')}</div>
      </div>`;
  }

  function renderClientWorkout(){
    readBuilder();
    const root=$('#clientWorkoutList');
    if(!root)return;
    const list=exercises();
    root.innerHTML=list.map((x,i)=>exerciseCardHTML(x,i)).join('');

    $$('[data-exercise-toggle]',root).forEach(btn=>{
      btn.addEventListener('click',()=>{
        const i=Number(btn.dataset.exerciseToggle);
        state.expanded=state.expanded===i?null:i;
        renderClientWorkout();
      });
    });

    $$('[data-technique-toggle]',root).forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const i=Number(btn.dataset.techniqueToggle);
        if(state.techniqueOpen.has(i))state.techniqueOpen.delete(i);else state.techniqueOpen.add(i);
        renderClientWorkout();
      });
    });

    $$('[data-start-timed]',root).forEach(btn=>{
      btn.addEventListener('click',()=>openTimedExercise(Number(btn.dataset.startTimed)));
    });

    $('[data-classic-check]',root).forEach(btn=>{
      btn.addEventListener('click',()=>toggleClassicSet(Number(btn.dataset.exercise),Number(btn.dataset.classicCheck)));
    });
    $('[data-add-classic]',root).forEach(btn=>{
      btn.addEventListener('click',()=>{
        const i=Number(btn.dataset.addClassic);
        state.classicExtra.set(i,(state.classicExtra.get(i)||0)+1);
        renderClientWorkout();
      });
    });
  }

  function exerciseCardHTML(x,i){
    const open=state.expanded===i;
    const done=state.completed.has(i);
    const plan=x.format==='time'
      ?[`${x.sets} × ${x.work} сек`,`Відпочинок ${x.rest} сек`]
      :[`${x.sets} × ${x.reps}`,`Відпочинок ${x.rest} сек`,`RIR ${x.rir}`];
    return `
      <article class="main-live-exercise${open?' open':''}${done?' is-exercise-complete':''}" id="clientExerciseCard${i}">
        <button type="button" class="main-live-toggle${open?' open':''}" data-exercise-toggle="${i}">
          <span class="main-live-copy">
            <span class="main-title-line"><strong>${esc(x.name)}</strong></span>
            <span class="main-technique-row">Техніка</span>
            <span class="main-plan-line">${plan.map(v=>`<span>${esc(v)}</span>`).join('')}</span>
          </span>
          <span class="main-toggle-side">
            <span class="main-arrow">${open?'⌃':'⌄'}</span>
            ${done?'<span class="main-done-badge">✓</span>':''}
          </span>
        </button>
        ${open?exerciseBodyHTML(x,i):''}
      </article>`;
  }

  function exerciseBodyHTML(x,i){
    const techniqueOpen=state.techniqueOpen.has(i);
    return `
      <div class="main-live-body">
        <div class="main-body-actions">
          <button type="button" class="main-technique-button" data-technique-toggle="${i}">▶ ${techniqueOpen?'Сховати техніку':'Техніка'}</button>
        </div>
        <div class="technique-preview main-technique-preview${techniqueOpen?' open':''}">
          <div class="technique-thumb">▶</div>
          <div><strong>${esc(x.technique)}</strong><small>Тут буде прикріплене тренером відео або посилання на техніку.</small></div>
        </div>
        ${x.format==='time'
          ?timedBodyHTML(x,i)
          :classicRowsHTML(x,i)}
      </div>`;
  }

  function timedBodyHTML(x,i){
    return `
      <div class="main-timed-summary">
        <div><span>Підходи</span><strong>${x.sets}</strong></div>
        <div><span>Робота</span><strong>${x.work} сек</strong></div>
        <div><span>Відпочинок</span><strong>${x.rest} сек</strong></div>
      </div>
      <button type="button" class="start-timed-exercise main-finish-action" data-start-timed="${i}">${state.completed.has(i)?'Повторити вправу':'Почати вправу'}</button>`;
  }

  function classicRowsHTML(x,i){
    const doneSets=state.classicDone.get(i)||new Set();
    const total=x.sets+(state.classicExtra.get(i)||0);
    return `
      <div class="main-set-head">
        <span>Підхід</span><span>Вага</span><span>Повтори</span><span>RIR</span><span></span>
      </div>
      <div class="main-set-list">
        ${Array.from({length:total},(_,idx)=>{
          const n=idx+1,done=doneSets.has(n);
          return `
            <div class="main-set-row${done?' done':''}">
              <span class="main-set-number">${n}</span>
              <input type="number" step="0.5" placeholder="кг" aria-label="Вага, підхід ${n}">
              <input type="number" placeholder="${esc(x.reps)}" aria-label="Повтори, підхід ${n}">
              <input type="number" value="${x.rir}" min="0" max="10" aria-label="RIR, підхід ${n}">
              <button type="button" class="main-set-check" data-exercise="${i}" data-classic-check="${n}" aria-label="Позначити підхід ${n}">${done?'✓':'✓'}</button>
            </div>`;
        }).join('')}
      </div>
      <button type="button" class="main-add-set" data-add-classic="${i}">＋ Додати підхід</button>`;
  }

  function toggleClassicSet(exerciseIndex,setNumber){
    const x=exercises()[exerciseIndex];
    if(!x||x.format!=='reps')return;
    let set=state.classicDone.get(exerciseIndex);
    if(!set){set=new Set();state.classicDone.set(exerciseIndex,set);}
    const wasDone=set.has(setNumber);
    const total=x.sets+(state.classicExtra.get(exerciseIndex)||0);
    if(wasDone){
      set.delete(setNumber);
      state.completed.delete(exerciseIndex);
      stopRestTimer();
    }else{
      set.add(setNumber);
      pulse();
      if(set.size>=total){
        state.completed.add(exerciseIndex);
        stopRestTimer();
      }else{
        startRestTimer(x.rest);
      }
    }
    renderClientWorkout();
  }

  function quickMode(){
    return !!$('#globalQuickTest')?.checked;
  }

  function openTimedExercise(index){
    const x=exercises()[index];
    if(!x||x.format!=='time')return;
    state.timed.exerciseIndex=index;
    state.timed.phase='idle';
    state.timed.currentSet=1;
    state.timed.paused=false;
    const d=timedDurations(x);
    state.timed.totalMs=d.work*1000;
    state.timed.remainingMs=d.work*1000;
    state.timed.endsAt=0;
    stopTimedRAF();
    clearTimeout(state.timed.autoClose);
    $('#modalExerciseName').textContent=x.name;
    $('#loadChip').textContent=x.load||'Без ваги';
    $('#workPlan').textContent=x.work+' сек';
    $('#restPlan').textContent=x.rest+' сек';
    const modal=$('#timedExerciseModal');
    modal?.classList.remove('hidden');
    modal?.setAttribute('aria-hidden','false');
    renderTimedTimer();
  }

  function closeTimedExercise(){
    stopTimedRAF();
    clearTimeout(state.timed.autoClose);
    state.timed.autoClose=0;
    const modal=$('#timedExerciseModal');
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden','true');
    state.timed.exerciseIndex=null;
  }

  function timedDurations(x){
    return quickMode()?{work:5,rest:3}:{work:+x.work||30,rest:+x.rest||0};
  }

  function stopTimedRAF(){
    if(state.timed.raf)cancelAnimationFrame(state.timed.raf);
    state.timed.raf=0;
  }

  function setTimedPhase(phase,seconds){
    stopTimedRAF();
    const ms=Math.max(0,+seconds||0)*1000;
    state.timed.phase=phase;
    state.timed.paused=false;
    state.timed.totalMs=Math.max(1,ms);
    state.timed.remainingMs=ms;
    state.timed.endsAt=performance.now()+ms;
    renderTimedTimer();
  }

  function startTimedWork(){
    const x=exercises()[state.timed.exerciseIndex];
    if(!x)return;
    setTimedPhase('work',timedDurations(x).work);
    pulse();
    state.timed.raf=requestAnimationFrame(timedFrame);
  }

  function startTimedRest(){
    const x=exercises()[state.timed.exerciseIndex];
    if(!x)return;
    const rest=timedDurations(x).rest;
    if(rest<=0){
      state.timed.currentSet+=1;
      startTimedWork();
      return;
    }
    setTimedPhase('rest',rest);
    pulse();
    state.timed.raf=requestAnimationFrame(timedFrame);
  }

  function timedFrame(now){
    if(state.timed.paused||!['work','rest'].includes(state.timed.phase)){state.timed.raf=0;return;}
    state.timed.remainingMs=Math.max(0,state.timed.endsAt-now);
    renderTimedFrame();
    if(state.timed.remainingMs<=0){
      state.timed.raf=0;
      advanceTimed();
      return;
    }
    state.timed.raf=requestAnimationFrame(timedFrame);
  }

  function advanceTimed(){
    const x=exercises()[state.timed.exerciseIndex];
    if(!x)return;
    if(state.timed.phase==='work'){
      if(state.timed.currentSet>=x.sets){
        finishTimedExercise();
      }else{
        startTimedRest();
      }
    }else if(state.timed.phase==='rest'){
      state.timed.currentSet+=1;
      startTimedWork();
    }
  }

  function finishTimedExercise(){
    const index=state.timed.exerciseIndex;
    stopTimedRAF();
    state.timed.phase='done';
    state.timed.remainingMs=0;
    state.completed.add(index);
    pulse([120,80,120]);
    renderTimedTimer();
    renderClientWorkout();
    state.timed.autoClose=setTimeout(()=>{
      closeTimedExercise();
      const list=exercises();
      const next=list.findIndex((_,i)=>i>index&&!state.completed.has(i));
      if(next>=0){
        state.expanded=next;
        renderClientWorkout();
        requestAnimationFrame(()=>$('#clientExerciseCard'+next)?.scrollIntoView({behavior:'smooth',block:'center'}));
      }
    },900);
  }

  function toggleTimedTimer(){
    const x=exercises()[state.timed.exerciseIndex];
    if(!x)return;
    if(state.timed.phase==='idle'||state.timed.phase==='done'){
      state.timed.currentSet=1;
      startTimedWork();
      return;
    }
    if(state.timed.paused){
      state.timed.paused=false;
      state.timed.endsAt=performance.now()+state.timed.remainingMs;
      renderTimedTimer();
      state.timed.raf=requestAnimationFrame(timedFrame);
    }else{
      state.timed.remainingMs=Math.max(0,state.timed.endsAt-performance.now());
      state.timed.paused=true;
      stopTimedRAF();
      renderTimedTimer();
    }
  }

  function resetTimedTimer(){
    const index=state.timed.exerciseIndex;
    const x=exercises()[index];
    if(!x)return;
    stopTimedRAF();
    clearTimeout(state.timed.autoClose);
    state.timed.phase='idle';
    state.timed.currentSet=1;
    state.timed.paused=false;
    const d=timedDurations(x);
    state.timed.totalMs=d.work*1000;
    state.timed.remainingMs=d.work*1000;
    state.timed.endsAt=0;
    renderTimedTimer();
  }

  function renderTimedTimer(){
    const index=state.timed.exerciseIndex;
    const x=exercises()[index];
    if(!x)return;
    const t=state.timed,ring=$('#timerRing'),phase=$('#phaseLabel'),hint=$('#timerHint'),progress=$('#setProgressText'),primary=$('#timerPrimary');
    if(!ring||!phase||!hint||!progress||!primary)return;

    progress.textContent=t.phase==='done'
      ?`Завершено · ${x.sets} з ${x.sets}`
      :`Підхід ${Math.min(t.currentSet,x.sets)} з ${x.sets}`;

    ring.classList.remove('work','rest','done');
    if(t.phase==='work')ring.classList.add('work');
    if(t.phase==='rest')ring.classList.add('rest');
    if(t.phase==='done')ring.classList.add('done');

    if(t.phase==='idle'){
      phase.textContent='ГОТОВА';
      hint.textContent='натисни «Старт»';
      primary.textContent='Старт';
    }else if(t.phase==='work'){
      phase.textContent='РОБОТА';
      hint.textContent=t.paused?'таймер на паузі':'виконуй вправу';
      primary.textContent=t.paused?'Продовжити':'Пауза';
    }else if(t.phase==='rest'){
      phase.textContent='ВІДПОЧИНОК';
      hint.textContent=t.paused?'таймер на паузі':'далі автоматично';
      primary.textContent=t.paused?'Продовжити':'Пауза';
    }else{
      phase.textContent='ГОТОВО';
      hint.textContent='вправу завершено';
      primary.textContent='Готово';
    }
    renderTimedFrame();
  }

  function renderTimedFrame(){
    const value=$('#timerValue'),circle=$('#timerProgressCircle');
    if(!value||!circle)return;
    const t=state.timed;
    value.textContent=formatMs(t.remainingMs);
    let ratio=0;
    if(t.phase==='work'||t.phase==='rest')ratio=t.totalMs?(t.totalMs-t.remainingMs)/t.totalMs:0;
    else if(t.phase==='done')ratio=1;
    ratio=Math.max(0,Math.min(1,ratio));
    circle.style.strokeDasharray=String(CIRC);
    circle.style.strokeDashoffset=String(CIRC*(1-ratio));
  }

  function stopRestTimer(){
    if(state.restTimer.raf)cancelAnimationFrame(state.restTimer.raf);
    state.restTimer.raf=0;
    state.restTimer.totalMs=0;
    state.restTimer.remainingMs=0;
    $('#restTimerBar')?.classList.add('hidden');
  }

  function startRestTimer(seconds){
    stopRestTimer();
    const actual=quickMode()?5:Math.max(0,+seconds||0);
    if(actual<=0)return;
    state.restTimer.totalMs=actual*1000;
    state.restTimer.remainingMs=actual*1000;
    state.restTimer.endsAt=performance.now()+state.restTimer.totalMs;
    $('#restTimerBar')?.classList.remove('hidden');
    renderRestTimer();
    state.restTimer.raf=requestAnimationFrame(restTimerFrame);
  }

  function restTimerFrame(now){
    state.restTimer.remainingMs=Math.max(0,state.restTimer.endsAt-now);
    renderRestTimer();
    if(state.restTimer.remainingMs<=0){
      state.restTimer.raf=0;
      pulse([90,70,90]);
      setTimeout(()=>$('#restTimerBar')?.classList.add('hidden'),350);
      return;
    }
    state.restTimer.raf=requestAnimationFrame(restTimerFrame);
  }

  function renderRestTimer(){
    const val=$('#restTimerValue'),bar=$('#restTimerProgress');
    if(!val||!bar)return;
    val.textContent=formatMs(state.restTimer.remainingMs);
    const ratio=state.restTimer.totalMs?1-(state.restTimer.remainingMs/state.restTimer.totalMs):0;
    bar.style.width=(Math.max(0,Math.min(1,ratio))*100)+'%';
  }

  function formatMs(ms){
    const sec=Math.max(0,Math.ceil((+ms||0)/1000));
    return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  }

  function pulse(pattern=40){
    try{if('vibrate'in navigator)navigator.vibrate(pattern);}catch(_){}
  }

  function esc(v){
    return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  $$('.role-switch button').forEach(btn=>btn.addEventListener('click',()=>setRole(btn.dataset.role)));
  $$('#formatSwitch button').forEach(btn=>btn.addEventListener('click',()=>setFormat(btn.dataset.format)));
  $$('#placeChips button').forEach(btn=>btn.addEventListener('click',()=>setPlace(btn.dataset.place)));

  ['exerciseName','setCount','workSeconds','restSeconds','loadLabel','repRange','rirValue'].forEach(id=>{
    $('#'+id)?.addEventListener('input',()=>{
      readBuilder();
      renderTrainerPreview();
      if(state.role==='client')renderClientWorkout();
    });
  });

  $('#saveExercise')?.addEventListener('click',()=>{
    readBuilder();
    renderTrainerPreview();
    if(state.role==='client')renderClientWorkout();
    const notice=$('#savedNotice');
    if(notice){
      notice.classList.add('show');
      setTimeout(()=>notice.classList.remove('show'),1600);
    }
  });

  $('#openClient')?.addEventListener('click',()=>setRole('client'));
  $('#backTrainer')?.addEventListener('click',()=>setRole('trainer'));
  $('#timerPrimary')?.addEventListener('click',toggleTimedTimer);
  $('#timerReset')?.addEventListener('click',resetTimedTimer);
  $('#closeTimedModal')?.addEventListener('click',closeTimedExercise);
  $('#skipRestTimer')?.addEventListener('click',stopRestTimer);
  $('#globalQuickTest')?.addEventListener('change',()=>{
    stopRestTimer();
    if(state.timed.exerciseIndex!==null)resetTimedTimer();
  });
  $('#timedExerciseModal')?.addEventListener('click',e=>{
    if(e.target===e.currentTarget)closeTimedExercise();
  });

  renderTrainerPreview();
})();