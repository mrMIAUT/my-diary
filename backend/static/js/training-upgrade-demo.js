(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const CIRCUMFERENCE = 2 * Math.PI * 54;

  const state = {
    role: 'trainer',
    format: 'time',
    place: 'Дім',
    exercise: 'Присідання з резинкою',
    sets: 3,
    work: 30,
    rest: 30,
    load: 'Резинка',
    reps: '10–15',
    rir: 2,
    previous: 25,
    selectedExercise: 0,
    completed: new Set(),
    timer: {
      phase: 'idle',
      currentSet: 1,
      totalMs: 30000,
      remainingMs: 30000,
      endsAt: 0,
      raf: 0,
      paused: false
    }
  };

  function clamp(n,min,max,fallback){
    n = Number(n);
    return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback;
  }

  function readBuilder(){
    state.exercise = ($('#exerciseName')?.value || 'Вправа').trim() || 'Вправа';
    state.sets = clamp($('#setCount')?.value,1,10,3);
    state.work = clamp($('#workSeconds')?.value,5,600,30);
    state.rest = clamp($('#restSeconds')?.value,0,600,30);
    state.load = ($('#loadLabel')?.value || '').trim();
    state.reps = ($('#repRange')?.value || '10–15').trim() || '10–15';
    state.rir = clamp($('#rirValue')?.value,0,10,2);
  }

  function clientExercises(){
    return [
      {
        name: state.exercise,
        format: state.format,
        place: state.place,
        sets: state.sets,
        work: state.work,
        rest: state.rest,
        load: state.load,
        reps: state.reps,
        rir: state.rir,
        previous: state.previous
      },
      {
        name: 'Віджимання від підлоги',
        format: 'reps',
        place: 'Дім',
        sets: 3,
        reps: '8–12',
        rir: 2,
        load: 'Власна вага'
      },
      {
        name: 'Ягодичний міст з резинкою',
        format: 'time',
        place: 'Дім',
        sets: 3,
        work: 35,
        rest: 25,
        load: 'Резинка',
        previous: 30
      }
    ];
  }

  function selectedExercise(){
    const list = clientExercises();
    state.selectedExercise = Math.max(0,Math.min(list.length - 1,state.selectedExercise));
    return list[state.selectedExercise];
  }

  function setRole(role){
    state.role = role;
    $$('.role-switch button').forEach(b => b.classList.toggle('active', b.dataset.role === role));
    $('#trainerView')?.classList.toggle('active', role === 'trainer');
    $('#clientView')?.classList.toggle('active', role === 'client');
    if(role === 'client'){
      readBuilder();
      resetTimer();
      renderClient();
      window.scrollTo({top:0,behavior:'smooth'});
    }else{
      stopTimerAnimation();
    }
  }

  function setFormat(format){
    state.format = format;
    $$('#formatSwitch button').forEach(b => b.classList.toggle('active', b.dataset.format === format));
    $$('.timed-field').forEach(el => el.classList.toggle('hidden', format !== 'time'));
    $$('.classic-field').forEach(el => el.classList.toggle('hidden', format !== 'reps'));
    const help = $('#formatHelp');
    if(help){
      help.textContent = format === 'time'
        ? 'Підходи виконуються за таймером. Після роботи відпочинок запускається автоматично.'
        : 'Звичайні робочі підходи: вага, повтори та RIR — як у поточному ЄПЛАН.';
    }
    readBuilder();
    renderTrainerPreview();
    if(state.role === 'client'){
      resetTimer();
      renderClient();
    }
  }

  function setPlace(place){
    state.place = place;
    $$('#placeChips button').forEach(b => b.classList.toggle('active', b.dataset.place === place));
    renderTrainerPreview();
    if(state.role === 'client') renderClientExerciseList();
  }

  function renderTrainerPreview(){
    readBuilder();
    const root = $('#trainerExercisePreview');
    if(!root) return;
    const mode = state.format === 'time' ? 'За часом' : 'Класичне';
    const details = state.format === 'time'
      ? [
          `${state.sets} підходи`,
          `${state.work} сек робота`,
          `${state.rest} сек відпочинок`,
          state.load || 'без додаткової ваги'
        ]
      : [
          `${state.sets} підходи`,
          `${state.reps} повторів`,
          `RIR ${state.rir}`,
          state.load || 'вага за потреби'
        ];
    root.innerHTML = `
      <div class="exercise-preview">
        <div class="exercise-preview-head">
          <div>
            <strong>${escapeHtml(state.exercise)}</strong>
            <small>${escapeHtml(state.place)}</small>
          </div>
          <span class="exercise-preview-badge">${mode}</span>
        </div>
        <div class="exercise-preview-meta">
          ${details.map(v => `<span>${escapeHtml(v)}</span>`).join('')}
        </div>
      </div>`;
  }

  function renderClientExerciseList(){
    const root = $('#clientExerciseList');
    const list = clientExercises();
    if($('#clientExerciseCount')) $('#clientExerciseCount').textContent = String(list.length);
    if(!root) return;
    root.innerHTML = list.map((x,i) => {
      const done = state.completed.has(i);
      const meta = x.format === 'time'
        ? `${x.sets} підх. · ${x.work} сек / ${x.rest} сек`
        : `${x.sets} підх. · ${x.reps} повт. · RIR ${x.rir}`;
      return `
        <button type="button" class="client-exercise-choice${i===state.selectedExercise?' active':''}${done?' done':''}" data-client-exercise="${i}">
          <span class="client-exercise-choice-main">
            <strong>${escapeHtml(x.name)}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
          <span class="client-exercise-choice-mode">${done?'Виконано':(x.format==='time'?'За часом':'Класичне')}</span>
          <span class="client-exercise-choice-arrow">›</span>
        </button>`;
    }).join('');
    $$('[data-client-exercise]',root).forEach(btn => {
      btn.addEventListener('click', () => selectClientExercise(Number(btn.dataset.clientExercise)));
    });
  }

  function selectClientExercise(index){
    const list = clientExercises();
    if(!Number.isInteger(index) || index < 0 || index >= list.length) return;
    state.selectedExercise = index;
    resetTimer();
    renderClient();
    requestAnimationFrame(() => {
      document.querySelector('.selected-exercise-title')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }

  function renderClient(){
    readBuilder();
    renderClientExerciseList();
    const x = selectedExercise();

    if($('#clientExerciseName')) $('#clientExerciseName').textContent = x.name;
    if($('#classicExerciseTitle')) $('#classicExerciseTitle').textContent = x.name;

    const timed = x.format === 'time';
    $('#timedWorkoutCard')?.classList.toggle('hidden', !timed);
    $('#progressionCard')?.classList.toggle('hidden', !timed);
    $('#classicWorkoutCard')?.classList.toggle('hidden', timed);

    if($('#loadChip')) $('#loadChip').textContent = x.load || 'Без ваги';
    if($('#workPlan')) $('#workPlan').textContent = (x.work || 0) + ' сек';
    if($('#restPlan')) $('#restPlan').textContent = (x.rest || 0) + ' сек';

    const previous = Number.isFinite(+x.previous) ? +x.previous : Math.max(5,(+x.work || 30)-5);
    if($('#previousTime')) $('#previousTime').textContent = previous + ' сек';
    if($('#todayTime')) $('#todayTime').textContent = (+x.work || 0) + ' сек';
    const delta = (+x.work || 0) - previous;
    if($('#progressDelta')){
      $('#progressDelta').textContent = (delta >= 0 ? '+' : '') + delta + ' сек';
      $('#progressDelta').style.opacity = delta === 0 ? '.55' : '1';
    }

    renderClassicRows(x);
    if(timed) renderTimer(true);
  }

  function renderClassicRows(x){
    const root = $('#classicRows');
    if(!root || x.format !== 'reps') return;
    root.innerHTML = Array.from({length:x.sets},(_,i) => `
      <div class="classic-row">
        <span>${i+1}</span>
        <input type="number" step="0.5" placeholder="кг" aria-label="Вага, підхід ${i+1}">
        <input type="number" placeholder="${escapeHtml(x.reps)}" aria-label="Повтори, підхід ${i+1}">
        <button type="button" data-classic-set="${i+1}">✓</button>
      </div>`).join('');
    $$('[data-classic-set]',root).forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('done')));
  }

  function timerDurations(){
    const x = selectedExercise();
    const quick = !!$('#quickTest')?.checked;
    return quick ? {work:5,rest:3} : {work:+x.work || 30,rest:+x.rest || 0};
  }

  function stopTimerAnimation(){
    if(state.timer.raf) cancelAnimationFrame(state.timer.raf);
    state.timer.raf = 0;
  }

  function setTimerPhase(phase, seconds){
    stopTimerAnimation();
    const ms = Math.max(0,Number(seconds) || 0) * 1000;
    state.timer.phase = phase;
    state.timer.paused = false;
    state.timer.totalMs = Math.max(1,ms);
    state.timer.remainingMs = ms;
    state.timer.endsAt = performance.now() + ms;
    renderTimer(true);
  }

  function startTimerAnimation(){
    stopTimerAnimation();
    state.timer.raf = requestAnimationFrame(timerFrame);
  }

  function timerFrame(now){
    if(state.timer.paused || !['work','rest'].includes(state.timer.phase)){
      state.timer.raf = 0;
      return;
    }
    state.timer.remainingMs = Math.max(0,state.timer.endsAt - now);
    renderTimerFrame();
    if(state.timer.remainingMs <= 0){
      state.timer.raf = 0;
      advanceTimer();
      return;
    }
    state.timer.raf = requestAnimationFrame(timerFrame);
  }

  function startWork(){
    const d = timerDurations();
    setTimerPhase('work', d.work);
    pulse();
    startTimerAnimation();
  }

  function startRest(){
    const d = timerDurations();
    if(d.rest <= 0){
      state.timer.currentSet += 1;
      startWork();
      return;
    }
    setTimerPhase('rest', d.rest);
    pulse();
    startTimerAnimation();
  }

  function advanceTimer(){
    stopTimerAnimation();
    const x = selectedExercise();
    if(state.timer.phase === 'work'){
      if(state.timer.currentSet >= x.sets){
        state.timer.phase = 'done';
        state.timer.remainingMs = 0;
        state.completed.add(state.selectedExercise);
        pulse([120,80,120]);
        renderTimer(true);
        renderClientExerciseList();
      }else{
        startRest();
      }
    }else if(state.timer.phase === 'rest'){
      state.timer.currentSet += 1;
      startWork();
    }
  }

  function toggleTimer(){
    if(state.timer.phase === 'idle' || state.timer.phase === 'done'){
      state.timer.currentSet = 1;
      startWork();
      return;
    }

    if(state.timer.paused){
      state.timer.paused = false;
      state.timer.endsAt = performance.now() + state.timer.remainingMs;
      renderTimer(true);
      startTimerAnimation();
    }else{
      state.timer.remainingMs = Math.max(0,state.timer.endsAt - performance.now());
      state.timer.paused = true;
      stopTimerAnimation();
      renderTimer(true);
    }
  }

  function resetTimer(){
    stopTimerAnimation();
    const d = timerDurations();
    state.timer.phase = 'idle';
    state.timer.currentSet = 1;
    state.timer.paused = false;
    state.timer.totalMs = Math.max(1,d.work * 1000);
    state.timer.remainingMs = d.work * 1000;
    state.timer.endsAt = 0;
    renderTimer(true);
  }

  function renderTimer(full=false){
    const ring = $('#timerRing');
    const phase = $('#phaseLabel');
    const hint = $('#timerHint');
    const progress = $('#setProgressText');
    const primary = $('#timerPrimary');
    if(!ring || !phase || !hint || !progress || !primary) return;

    const x = selectedExercise();
    const t = state.timer;
    progress.textContent = t.phase === 'done'
      ? `Завершено · ${x.sets} з ${x.sets}`
      : `Підхід ${Math.min(t.currentSet,x.sets)} з ${x.sets}`;

    ring.classList.remove('work','rest','done');
    if(t.phase === 'work') ring.classList.add('work');
    if(t.phase === 'rest') ring.classList.add('rest');
    if(t.phase === 'done') ring.classList.add('done');

    if(t.phase === 'idle'){
      phase.textContent = 'ГОТОВА';
      hint.textContent = 'натисни «Почати»';
      primary.textContent = 'Почати';
    }else if(t.phase === 'work'){
      phase.textContent = 'РОБОТА';
      hint.textContent = t.paused ? 'таймер на паузі' : 'працюємо';
      primary.textContent = t.paused ? 'Продовжити' : 'Пауза';
    }else if(t.phase === 'rest'){
      phase.textContent = 'ВІДПОЧИНОК';
      hint.textContent = t.paused ? 'таймер на паузі' : 'наступний підхід автоматично';
      primary.textContent = t.paused ? 'Продовжити' : 'Пауза';
    }else{
      phase.textContent = 'ГОТОВО';
      hint.textContent = 'усі підходи виконано';
      primary.textContent = 'Повторити';
    }

    renderTimerFrame(full);
  }

  function renderTimerFrame(){
    const value = $('#timerValue');
    const circle = $('#timerProgressCircle');
    if(!value || !circle) return;

    const t = state.timer;
    const idleMs = timerDurations().work * 1000;
    const shownMs = t.phase === 'idle' ? idleMs : t.remainingMs;
    value.textContent = formatMilliseconds(shownMs);

    let ratio = 0;
    if(t.phase === 'work' || t.phase === 'rest'){
      ratio = t.totalMs ? (t.totalMs - t.remainingMs) / t.totalMs : 0;
    }else if(t.phase === 'done'){
      ratio = 1;
    }
    ratio = Math.max(0,Math.min(1,ratio));
    circle.style.strokeDasharray = String(CIRCUMFERENCE);
    circle.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));
  }

  function pulse(pattern=40){
    try{
      if('vibrate' in navigator) navigator.vibrate(pattern);
    }catch(_){}
  }

  function formatMilliseconds(ms){
    const sec = Math.max(0,Math.ceil((Number(ms) || 0) / 1000));
    const m = Math.floor(sec/60);
    const s = sec%60;
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function escapeHtml(v){
    return String(v ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[ch]);
  }

  $$('.role-switch button').forEach(btn => btn.addEventListener('click', () => setRole(btn.dataset.role)));
  $$('#formatSwitch button').forEach(btn => btn.addEventListener('click', () => setFormat(btn.dataset.format)));
  $$('#placeChips button').forEach(btn => btn.addEventListener('click', () => setPlace(btn.dataset.place)));

  ['exerciseName','setCount','workSeconds','restSeconds','loadLabel','repRange','rirValue'].forEach(id => {
    $('#' + id)?.addEventListener('input', () => {
      readBuilder();
      renderTrainerPreview();
      if(state.role === 'client'){
        resetTimer();
        renderClient();
      }
    });
  });

  $('#saveExercise')?.addEventListener('click', () => {
    readBuilder();
    renderTrainerPreview();
    resetTimer();
    renderClient();
    const notice = $('#savedNotice');
    if(notice){
      notice.classList.add('show');
      setTimeout(() => notice.classList.remove('show'),1600);
    }
  });

  $('#openClient')?.addEventListener('click', () => setRole('client'));
  $('#backTrainer')?.addEventListener('click', () => setRole('trainer'));
  $('#timerPrimary')?.addEventListener('click', toggleTimer);
  $('#timerReset')?.addEventListener('click', resetTimer);
  $('#quickTest')?.addEventListener('change', resetTimer);
  $('#completeClassic')?.addEventListener('click', () => {
    $$('[data-classic-set]').forEach(btn => btn.classList.add('done'));
    state.completed.add(state.selectedExercise);
    renderClientExerciseList();
    pulse([100,80,100]);
  });

  renderTrainerPreview();
  resetTimer();
  renderClient();
})();