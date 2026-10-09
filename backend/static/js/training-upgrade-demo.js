(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const CIRC=2*Math.PI*54;

  const state={
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
    clientMode:'program',
    dayOpen:true,
    activeOpen:0,
    completed:new Set(),
    techniqueOpen:new Set(),
    classicDone:new Map(),
    classicExtra:new Map(),
    activeStartedAt:0,
    durationTicker:0,
    timed:{exerciseIndex:null,phase:'idle',currentSet:1,totalMs:30000,remainingMs:30000,endsAt:0,raf:0,paused:false,autoClose:0},
    restTimer:{totalMs:0,remainingMs:0,endsAt:0,raf:0}
  };

  function clamp(n,min,max,fallback){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
  function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

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
      {name:state.exercise,format:state.format,sets:state.sets,work:state.work,rest:state.rest,load:state.load||'Без ваги',reps:state.reps,rir:[state.rir,state.rir,state.rir],previous:state.previous,technique:'Відео техніки · присідання з резинкою'},
      {name:'Віджимання від підлоги',format:'reps',sets:3,reps:'8–12',rir:[2,1,0],rest:30,load:'Власна вага',technique:'Відео техніки · віджимання від підлоги'},
      {name:'Ягодичний міст з резинкою',format:'time',sets:3,work:35,rest:25,load:'Резинка',previous:30,technique:'Відео техніки · ягодичний міст'}
    ];
  }

  function planText(x){return x.format==='time'?x.work+' сек':x.reps}
  function rirText(x){return x.format==='reps'?'RIR '+(x.rir||[]).join(' / '):''}
  function restText(x){return x.rest+' сек'}

  function setRole(role){
    state.role=role;
    $$('.role-switch button').forEach(b=>b.classList.toggle('active',b.dataset.role===role));
    $('#trainerView')?.classList.toggle('active',role==='trainer');
    $('#clientView')?.classList.toggle('active',role==='client');
    if(role==='client'){
      readBuilder();
      renderClient();
      window.scrollTo({top:0,behavior:'smooth'});
    }else{
      closeTimedExercise();
      stopRestTimer();
      stopDurationTicker();
    }
  }

  function setFormat(format){
    state.format=format;
    $$('#formatSwitch button').forEach(b=>b.classList.toggle('active',b.dataset.format===format));
    $$('.timed-field').forEach(el=>el.classList.toggle('hidden',format!=='time'));
    $$('.classic-field').forEach(el=>el.classList.toggle('hidden',format!=='reps'));
    const help=$('#formatHelp');
    if(help)help.textContent=format==='time'
      ?'Підходи виконуються за таймером. Після роботи відпочинок запускається автоматично.'
      :'Звичайні робочі підходи: вага, повтори та RIR — як у поточному ЄПЛАН.';
    readBuilder();renderTrainerPreview();if(state.role==='client')renderClient();
  }

  function setPlace(place){
    state.place=place;
    $$('#placeChips button').forEach(b=>b.classList.toggle('active',b.dataset.place===place));
    renderTrainerPreview();
  }

  function renderTrainerPreview(){
    readBuilder();
    const root=$('#trainerExercisePreview');if(!root)return;
    const details=state.format==='time'
      ?[`${state.sets} підходи`,`${state.work} сек робота`,`${state.rest} сек відпочинок`,state.load||'без додаткової ваги']
      :[`${state.sets} підходи`,`${state.reps} повторів`,`RIR ${state.rir}`,state.load||'вага за потреби'];
    root.innerHTML=`<div class="exercise-preview"><div class="exercise-preview-head"><div><strong>${esc(state.exercise)}</strong><small>${esc(state.place)}</small></div><span class="exercise-preview-badge">${state.format==='time'?'За часом':'Класичне'}</span></div><div class="exercise-preview-meta">${details.map(v=>`<span>${esc(v)}</span>`).join('')}</div></div>`;
  }

  function renderClient(){
    const root=$('#clientScreen');if(!root)return;
    root.innerHTML=state.clientMode==='program'?programScreenHTML():activeScreenHTML();
    bindClient();
    if(state.clientMode==='active')startDurationTicker();
  }

  function programScreenHTML(){
    const xs=exercises();
    return `
      <div class="main-client-page">
        <h1 class="main-screen-title">Тренування</h1>
        <div class="prototype-test-toggle compact">
          <label><input id="globalQuickTest" type="checkbox"><span><strong>Швидкий тест таймерів</strong><small>Робота 5 сек · відпочинок 3–5 сек</small></span></label>
        </div>
        <article class="program-day-card-v3 is-next">
          <button type="button" class="program-day-main-v3${state.dayOpen?' open':''}" id="programDayToggle">
            <span class="program-day-index-v3">1</span>
            <span class="program-day-copy-v3"><strong>День 1</strong><small>Домашнє тренування</small><em>${xs.length} вправ · Дім</em></span>
            <span class="program-day-status-v3">Наступне</span>
            <span class="program-day-chevron-v3">⌄</span>
          </button>
          ${state.dayOpen?`
          <div class="program-day-body-v3">
            <div class="program-exercise-list-v3">
              ${xs.map((x,i)=>programExerciseHTML(x,i)).join('')}
            </div>
            <button id="startPrototypeWorkout" class="program-start-v3">Почати тренування</button>
          </div>`:''}
        </article>
        <button id="backTrainer" class="ghost-link">← Повернутися до конструктора тренера</button>
      </div>`;
  }

  function programExerciseHTML(x,i){
    const meta=x.format==='time'
      ?`${x.sets} × ${x.work} сек · відпочинок ${x.rest} сек`
      :`${x.sets} × ${x.reps} · ${Math.ceil(x.rest/60)} хв`;
    return `
      <div class="program-exercise-row-v3">
        <span class="program-exercise-num-v3">${i+1}</span>
        <div class="program-exercise-copy-v3">
          <strong>${esc(x.name)}</strong>
          <span class="program-technique-v3">Техніка</span>
          <small>${esc(meta)}</small>
        </div>
        <b>${x.format==='reps'?esc(rirText(x)):'Час'}</b>
      </div>`;
  }

  function activeScreenHTML(){
    const xs=exercises();
    return `
      <div class="main-client-page active-prototype-page">
        <h1 class="main-screen-title">Тренування</h1>
        <div class="active-top-v3">
          <div class="active-live-v3"><i></i>Тренування триває</div>
          <button type="button" class="active-timer-button-v3"><span>⏱</span><b id="headerRestTimer">Таймер</b></button>
          <button type="button" class="active-play-v3">▶</button>
        </div>
        <h2 class="active-day-title-v3">День 1</h2>
        <button id="cancelPrototypeWorkout" class="active-cancel-v3">Скасувати тренування</button>
        <div class="duration-strip-v3"><span>Тривалість тренування</span><b id="prototypeDuration">⏱ 0 хв</b></div>
        <div class="active-exercise-list-v3">
          ${xs.map((x,i)=>activeExerciseHTML(x,i)).join('')}
        </div>
        <button id="finishPrototypeWorkout" class="finish-workout-v3">Завершити тренування</button>
        <button id="backTrainer" class="ghost-link">← Повернутися до конструктора тренера</button>
      </div>`;
  }

  function activeExerciseHTML(x,i){
    const open=state.activeOpen===i;
    const done=state.completed.has(i);
    const plan=x.format==='time'
      ?[`${x.sets} × ${x.work} сек`,`Відпочинок ${x.rest} сек`]
      :[`${x.sets} × ${x.reps}`,`Відпочинок ${x.rest} сек`,rirText(x)];
    return `
      <article class="active-exercise-v3${done?' done':''}">
        <button type="button" class="active-exercise-toggle-v3${open?' open':''}" data-active-toggle="${i}">
          <span class="active-exercise-copy-v3">
            <strong>${esc(x.name)}</strong>
            <span class="active-technique-v3">Техніка</span>
            <span class="active-plan-v3">${plan.map((v,idx)=>`<span>${idx?'<i></i>':''}${esc(v)}</span>`).join('')}</span>
          </span>
          <span class="active-toggle-side-v3"><span>${open?'⌃':'⌄'}</span>${done?'<b>✓</b>':''}</span>
        </button>
        ${open?`<div class="active-exercise-body-v3">${activeBodyHTML(x,i)}</div>`:''}
      </article>`;
  }

  function activeBodyHTML(x,i){
    const techOpen=state.techniqueOpen.has(i);
    return `
      <button type="button" class="history-button-v3">Історія та графік</button>
      <button type="button" class="warmup-button-v3">＋ Додати розминочні підходи</button>
      <button type="button" class="tech-inline-v3" data-technique-toggle="${i}">▶ ${techOpen?'Сховати техніку':'Техніка'}</button>
      <div class="technique-preview-v3${techOpen?' open':''}"><div class="technique-thumb">▶</div><div><strong>${esc(x.technique)}</strong><small>Тут буде прикріплене тренером відео.</small></div></div>
      ${x.format==='time'?timedActiveBody(x,i):classicActiveBody(x,i)}
    `;
  }

  function timedActiveBody(x,i){
    const prev=Number.isFinite(+x.previous)?+x.previous:Math.max(5,x.work-5);
    return `
      <div class="timed-previous-v3"><span>Попередньо</span><strong>${prev} сек</strong><em>${x.work-prev>=0?'+':''}${x.work-prev} сек</em></div>
      <div class="timed-plan-v3"><div><span>Підходи</span><strong>${x.sets}</strong></div><div><span>Робота</span><strong>${x.work} сек</strong></div><div><span>Відпочинок</span><strong>${x.rest} сек</strong></div></div>
      <button type="button" class="start-timed-v3" data-start-timed="${i}">${state.completed.has(i)?'Повторити вправу':'Почати вправу'}</button>
    `;
  }

  function classicActiveBody(x,i){
    const doneSets=state.classicDone.get(i)||new Set();
    const total=x.sets+(state.classicExtra.get(i)||0);
    return `
      <div class="set-head-v3"><span>Підхід</span><span>Вага</span><span>Повтори</span><span>RIR</span><span></span></div>
      <div class="set-list-v3">
        ${Array.from({length:total},(_,idx)=>{
          const n=idx+1,done=doneSets.has(n),rir=(x.rir||[])[Math.min(idx,(x.rir||[]).length-1)]??2;
          return `
            <div class="set-wrap-v3">
              <div class="previous-row-v3"><span>Попередньо</span><b>—</b></div>
              <div class="set-row-v3${done?' done':''}">
                <span class="set-number-v3">${n}</span>
                <input type="number" step="0.5" placeholder="кг" aria-label="Вага, підхід ${n}">
                <input type="number" placeholder="${esc(x.reps)}" aria-label="Повтори, підхід ${n}">
                <input type="number" value="${rir}" min="0" max="10" aria-label="RIR, підхід ${n}">
                <button type="button" class="set-check-v3" data-classic-check="${n}" data-exercise="${i}">✓</button>
              </div>
            </div>`;
        }).join('')}
      </div>
      <button type="button" class="add-set-v3" data-add-set="${i}">＋ Додати підхід</button>
      <small class="swipe-hint-v3">Свайп вліво: пропустити плановий або видалити доданий підхід</small>
      <button type="button" class="finish-exercise-v3" data-finish-classic="${i}">Закінчити вправу</button>
    `;
  }

  function bindClient(){
    $('#backTrainer')?.addEventListener('click',()=>setRole('trainer'));
    $('#programDayToggle')?.addEventListener('click',()=>{state.dayOpen=!state.dayOpen;renderClient()});
    $('#startPrototypeWorkout')?.addEventListener('click',startWorkoutPrototype);
    $('#cancelPrototypeWorkout')?.addEventListener('click',()=>{state.clientMode='program';stopDurationTicker();stopRestTimer();renderClient()});
    $('#finishPrototypeWorkout')?.addEventListener('click',()=>{state.clientMode='program';stopDurationTicker();stopRestTimer();renderClient()});

    $$('[data-active-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.activeToggle);state.activeOpen=state.activeOpen===i?null:i;renderClient()}));
    $$('[data-technique-toggle]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const i=Number(btn.dataset.techniqueToggle);state.techniqueOpen.has(i)?state.techniqueOpen.delete(i):state.techniqueOpen.add(i);renderClient()}));
    $$('[data-start-timed]').forEach(btn=>btn.addEventListener('click',()=>openTimedExercise(Number(btn.dataset.startTimed))));
    $$('[data-classic-check]').forEach(btn=>btn.addEventListener('click',()=>toggleClassicSet(Number(btn.dataset.exercise),Number(btn.dataset.classicCheck))));
    $$('[data-add-set]').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.addSet);state.classicExtra.set(i,(state.classicExtra.get(i)||0)+1);renderClient()}));
    $$('[data-finish-classic]').forEach(btn=>btn.addEventListener('click',()=>finishClassic(Number(btn.dataset.finishClassic))));
  }

  function startWorkoutPrototype(){
    state.clientMode='active';state.activeOpen=0;state.activeStartedAt=Date.now();state.completed.clear();state.classicDone.clear();state.classicExtra.clear();renderClient();
  }

  function finishClassic(i){
    const x=exercises()[i];if(!x)return;
    const total=x.sets+(state.classicExtra.get(i)||0);
    let done=state.classicDone.get(i)||new Set();
    if(done.size<total)return alert('Познач виконані підходи.');
    state.completed.add(i);state.activeOpen=nextUnfinished(i);stopRestTimer();renderClient();
  }

  function nextUnfinished(after){
    const xs=exercises();
    for(let i=after+1;i<xs.length;i++)if(!state.completed.has(i))return i;
    for(let i=0;i<xs.length;i++)if(!state.completed.has(i))return i;
    return null;
  }

  function toggleClassicSet(exerciseIndex,setNumber){
    const x=exercises()[exerciseIndex];if(!x)return;
    let set=state.classicDone.get(exerciseIndex);if(!set){set=new Set();state.classicDone.set(exerciseIndex,set)}
    if(set.has(setNumber)){set.delete(setNumber);stopRestTimer()}
    else{set.add(setNumber);pulse();const total=x.sets+(state.classicExtra.get(exerciseIndex)||0);if(set.size<total)startRestTimer(x.rest)}
    renderClient();
  }

  function quickMode(){return true}

  function openTimedExercise(index){
    const x=exercises()[index];if(!x||x.format!=='time')return;
    state.timed.exerciseIndex=index;state.timed.phase='idle';state.timed.currentSet=1;state.timed.paused=false;
    const d=timedDurations(x);state.timed.totalMs=d.work*1000;state.timed.remainingMs=d.work*1000;state.timed.endsAt=0;
    stopTimedRAF();clearTimeout(state.timed.autoClose);
    $('#modalExerciseName').textContent=x.name;$('#loadChip').textContent=x.load||'Без ваги';$('#workPlan').textContent=x.work+' сек';$('#restPlan').textContent=x.rest+' сек';
    $('#timedExerciseModal')?.classList.remove('hidden');$('#timedExerciseModal')?.setAttribute('aria-hidden','false');renderTimedTimer();
  }

  function closeTimedExercise(){stopTimedRAF();clearTimeout(state.timed.autoClose);$('#timedExerciseModal')?.classList.add('hidden');$('#timedExerciseModal')?.setAttribute('aria-hidden','true');state.timed.exerciseIndex=null}
  function timedDurations(x){return quickMode()?{work:5,rest:3}:{work:+x.work||30,rest:+x.rest||0}}
  function stopTimedRAF(){if(state.timed.raf)cancelAnimationFrame(state.timed.raf);state.timed.raf=0}

  function setTimedPhase(phase,seconds){
    stopTimedRAF();const ms=Math.max(0,+seconds||0)*1000;state.timed.phase=phase;state.timed.paused=false;state.timed.totalMs=Math.max(1,ms);state.timed.remainingMs=ms;state.timed.endsAt=performance.now()+ms;renderTimedTimer();
  }

  function startTimedWork(){const x=exercises()[state.timed.exerciseIndex];if(!x)return;setTimedPhase('work',timedDurations(x).work);pulse();state.timed.raf=requestAnimationFrame(timedFrame)}
  function startTimedRest(){const x=exercises()[state.timed.exerciseIndex];if(!x)return;const rest=timedDurations(x).rest;if(rest<=0){state.timed.currentSet++;startTimedWork();return}setTimedPhase('rest',rest);pulse();state.timed.raf=requestAnimationFrame(timedFrame)}

  function timedFrame(now){
    if(state.timed.paused||!['work','rest'].includes(state.timed.phase)){state.timed.raf=0;return}
    state.timed.remainingMs=Math.max(0,state.timed.endsAt-now);renderTimedFrame();
    if(state.timed.remainingMs<=0){state.timed.raf=0;advanceTimed();return}
    state.timed.raf=requestAnimationFrame(timedFrame);
  }

  function advanceTimed(){
    const x=exercises()[state.timed.exerciseIndex];if(!x)return;
    if(state.timed.phase==='work'){if(state.timed.currentSet>=x.sets)finishTimedExercise();else startTimedRest()}
    else if(state.timed.phase==='rest'){state.timed.currentSet++;startTimedWork()}
  }

  function finishTimedExercise(){
    const index=state.timed.exerciseIndex;stopTimedRAF();state.timed.phase='done';state.timed.remainingMs=0;state.completed.add(index);pulse([120,80,120]);renderTimedTimer();
    state.timed.autoClose=setTimeout(()=>{closeTimedExercise();state.activeOpen=nextUnfinished(index);renderClient();requestAnimationFrame(()=>document.querySelector('.active-exercise-v3 .open')?.scrollIntoView({behavior:'smooth',block:'center'}))},900);
  }

  function toggleTimedTimer(){
    const x=exercises()[state.timed.exerciseIndex];if(!x)return;
    if(state.timed.phase==='idle'||state.timed.phase==='done'){state.timed.currentSet=1;startTimedWork();return}
    if(state.timed.paused){state.timed.paused=false;state.timed.endsAt=performance.now()+state.timed.remainingMs;renderTimedTimer();state.timed.raf=requestAnimationFrame(timedFrame)}
    else{state.timed.remainingMs=Math.max(0,state.timed.endsAt-performance.now());state.timed.paused=true;stopTimedRAF();renderTimedTimer()}
  }

  function resetTimedTimer(){
    const x=exercises()[state.timed.exerciseIndex];if(!x)return;stopTimedRAF();clearTimeout(state.timed.autoClose);state.timed.phase='idle';state.timed.currentSet=1;state.timed.paused=false;
    const d=timedDurations(x);state.timed.totalMs=d.work*1000;state.timed.remainingMs=d.work*1000;state.timed.endsAt=0;renderTimedTimer();
  }

  function renderTimedTimer(){
    const x=exercises()[state.timed.exerciseIndex];if(!x)return;
    const t=state.timed,ring=$('#timerRing'),phase=$('#phaseLabel'),hint=$('#timerHint'),progress=$('#setProgressText'),primary=$('#timerPrimary');if(!ring||!phase||!hint||!progress||!primary)return;
    progress.textContent=t.phase==='done'?`Завершено · ${x.sets} з ${x.sets}`:`Підхід ${Math.min(t.currentSet,x.sets)} з ${x.sets}`;
    ring.classList.remove('work','rest','done');if(t.phase==='work')ring.classList.add('work');if(t.phase==='rest')ring.classList.add('rest');if(t.phase==='done')ring.classList.add('done');
    if(t.phase==='idle'){phase.textContent='ГОТОВА';hint.textContent='натисни «Старт»';primary.textContent='Старт'}
    else if(t.phase==='work'){phase.textContent='РОБОТА';hint.textContent=t.paused?'таймер на паузі':'виконуй вправу';primary.textContent=t.paused?'Продовжити':'Пауза'}
    else if(t.phase==='rest'){phase.textContent='ВІДПОЧИНОК';hint.textContent=t.paused?'таймер на паузі':'далі автоматично';primary.textContent=t.paused?'Продовжити':'Пауза'}
    else{phase.textContent='ГОТОВО';hint.textContent='вправу завершено';primary.textContent='Готово'}
    renderTimedFrame();
  }

  function renderTimedFrame(){
    const value=$('#timerValue'),circle=$('#timerProgressCircle');if(!value||!circle)return;
    const t=state.timed;value.textContent=formatMs(t.remainingMs);
    let ratio=0;if(t.phase==='work'||t.phase==='rest')ratio=t.totalMs?(t.totalMs-t.remainingMs)/t.totalMs:0;else if(t.phase==='done')ratio=1;
    ratio=Math.max(0,Math.min(1,ratio));circle.style.strokeDasharray=String(CIRC);circle.style.strokeDashoffset=String(CIRC*(1-ratio));
  }

  function startRestTimer(seconds){
    stopRestTimer();const actual=5;state.restTimer.totalMs=actual*1000;state.restTimer.remainingMs=actual*1000;state.restTimer.endsAt=performance.now()+state.restTimer.totalMs;
    $('#restTimerBar')?.classList.remove('hidden');renderRestTimer();state.restTimer.raf=requestAnimationFrame(restTimerFrame);
  }
  function stopRestTimer(){if(state.restTimer.raf)cancelAnimationFrame(state.restTimer.raf);state.restTimer.raf=0;$('#restTimerBar')?.classList.add('hidden');const h=$('#headerRestTimer');if(h)h.textContent='Таймер'}
  function restTimerFrame(now){state.restTimer.remainingMs=Math.max(0,state.restTimer.endsAt-now);renderRestTimer();if(state.restTimer.remainingMs<=0){state.restTimer.raf=0;pulse([90,70,90]);setTimeout(stopRestTimer,350);return}state.restTimer.raf=requestAnimationFrame(restTimerFrame)}
  function renderRestTimer(){const val=$('#restTimerValue'),bar=$('#restTimerProgress'),header=$('#headerRestTimer');if(val)val.textContent=formatMs(state.restTimer.remainingMs);if(header)header.textContent=formatMs(state.restTimer.remainingMs);if(bar){const ratio=state.restTimer.totalMs?1-state.restTimer.remainingMs/state.restTimer.totalMs:0;bar.style.width=(Math.max(0,Math.min(1,ratio))*100)+'%'}}

  function startDurationTicker(){stopDurationTicker();updateDuration();state.durationTicker=setInterval(updateDuration,15000)}
  function stopDurationTicker(){if(state.durationTicker)clearInterval(state.durationTicker);state.durationTicker=0}
  function updateDuration(){const el=$('#prototypeDuration');if(!el||!state.activeStartedAt)return;const sec=Math.max(0,Math.floor((Date.now()-state.activeStartedAt)/1000));const min=Math.floor(sec/60);el.textContent='⏱ '+min+' хв'}

  function formatMs(ms){const sec=Math.max(0,Math.ceil((+ms||0)/1000));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
  function pulse(pattern=40){try{if('vibrate'in navigator)navigator.vibrate(pattern)}catch(_){}}

  $$('.role-switch button').forEach(btn=>btn.addEventListener('click',()=>setRole(btn.dataset.role)));
  $$('#formatSwitch button').forEach(btn=>btn.addEventListener('click',()=>setFormat(btn.dataset.format)));
  $$('#placeChips button').forEach(btn=>btn.addEventListener('click',()=>setPlace(btn.dataset.place)));
  ['exerciseName','setCount','workSeconds','restSeconds','loadLabel','repRange','rirValue'].forEach(id=>$('#'+id)?.addEventListener('input',()=>{readBuilder();renderTrainerPreview();if(state.role==='client')renderClient()}));
  $('#saveExercise')?.addEventListener('click',()=>{readBuilder();renderTrainerPreview();if(state.role==='client')renderClient();const n=$('#savedNotice');if(n){n.classList.add('show');setTimeout(()=>n.classList.remove('show'),1600)}});
  $('#openClient')?.addEventListener('click',()=>setRole('client'));
  $('#timerPrimary')?.addEventListener('click',toggleTimedTimer);
  $('#timerReset')?.addEventListener('click',resetTimedTimer);
  $('#closeTimedModal')?.addEventListener('click',closeTimedExercise);
  $('#skipRestTimer')?.addEventListener('click',stopRestTimer);
  $('#timedExerciseModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeTimedExercise()});

  renderTrainerPreview();
})();