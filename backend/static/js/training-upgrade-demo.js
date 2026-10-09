(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

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
    timer: {
      phase: 'idle',
      currentSet: 1,
      remaining: 30,
      total: 30,
      handle: null,
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
    renderClient();
  }

  function setPlace(place){
    state.place = place;
    $$('#placeChips button').forEach(b => b.classList.toggle('active', b.dataset.place === place));
    renderTrainerPreview();
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

  function renderClient(){
    readBuilder();
    if($('#clientExerciseName')) $('#clientExerciseName').textContent = state.exercise;
    if($('#classicExerciseTitle')) $('#classicExerciseTitle').textContent = state.exercise;

    const timed = state.format === 'time';
    $('#timedWorkoutCard')?.classList.toggle('hidden', !timed);
    $('#progressionCard')?.classList.toggle?.('hidden', !timed);
    $('#classicWorkoutCard')?.classList.toggle('hidden', timed);

    if($('#loadChip')) $('#loadChip').textContent = state.load || 'Без ваги';
    if($('#workPlan')) $('#workPlan').textContent = state.work + ' сек';
    if($('#restPlan')) $('#restPlan').textContent = state.rest + ' сек';
    if($('#previousTime')) $('#previousTime').textContent = state.previous + ' сек';
    if($('#todayTime')) $('#todayTime').textContent = state.work + ' сек';
    const delta = state.work - state.previous;
    if($('#progressDelta')){
      $('#progressDelta').textContent = (delta >= 0 ? '+' : '') + delta + ' сек';
      $('#progressDelta').style.opacity = delta === 0 ? '.55' : '1';
    }
    renderClassicRows();
    if(timed) renderTimer();
  }

  function renderClassicRows(){
    const root = $('#classicRows');
    if(!root) return;
    root.innerHTML = Array.from({length:state.sets},(_,i) => `
      <div class="classic-row">
        <span>${i+1}</span>
        <input type="number" step="0.5" placeholder="кг" aria-label="Вага, підхід ${i+1}">
        <input type="number" placeholder="${escapeHtml(state.reps)}" aria-label="Повтори, підхід ${i+1}">
        <button type="button" data-classic-set="${i+1}">✓</button>
      </div>`).join('');
    $$('[data-classic-set]').forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('done')));
  }

  function timerDurations(){
    const quick = !!$('#quickTest')?.checked;
    return quick ? {work:5,rest:3} : {work:state.work,rest:state.rest};
  }

  function setTimerPhase(phase, seconds){
    clearInterval(state.timer.handle);
    state.timer.handle = null;
    state.timer.phase = phase;
    state.timer.paused = false;
    state.timer.total = Math.max(1,seconds || 1);
    state.timer.remaining = Math.max(0,seconds || 0);
    renderTimer();
  }

  function startInterval(){
    clearInterval(state.timer.handle);
    state.timer.handle = setInterval(() => {
      if(state.timer.paused) return;
      state.timer.remaining -= 1;
      if(state.timer.remaining <= 0){
        state.timer.remaining = 0;
        renderTimer();
        advanceTimer();
        return;
      }
      renderTimer();
    },1000);
  }

  function startWork(){
    const d = timerDurations();
    setTimerPhase('work', d.work);
    pulse();
    startInterval();
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
    startInterval();
  }

  function advanceTimer(){
    clearInterval(state.timer.handle);
    state.timer.handle = null;
    if(state.timer.phase === 'work'){
      if(state.timer.currentSet >= state.sets){
        state.timer.phase = 'done';
        state.timer.remaining = 0;
        pulse([120,80,120]);
        renderTimer();
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
    state.timer.paused = !state.timer.paused;
    if(!state.timer.paused && !state.timer.handle) startInterval();
    renderTimer();
  }

  function resetTimer(){
    clearInterval(state.timer.handle);
    state.timer.handle = null;
    state.timer.phase = 'idle';
    state.timer.currentSet = 1;
    state.timer.paused = false;
    state.timer.total = state.work;
    state.timer.remaining = state.work;
    renderTimer();
  }

  function renderTimer(){
    const ring = $('#timerRing');
    const value = $('#timerValue');
    const phase = $('#phaseLabel');
    const hint = $('#timerHint');
    const progress = $('#setProgressText');
    const primary = $('#timerPrimary');
    if(!ring || !value || !phase || !hint || !progress || !primary) return;

    const t = state.timer;
    let shown = t.phase === 'idle' ? (timerDurations().work) : t.remaining;
    value.textContent = formatSeconds(shown);
    progress.textContent = t.phase === 'done'
      ? `Завершено · ${state.sets} з ${state.sets}`
      : `Підхід ${Math.min(t.currentSet,state.sets)} з ${state.sets}`;

    ring.classList.remove('work','rest','done');
    if(t.phase === 'work') ring.classList.add('work');
    if(t.phase === 'rest') ring.classList.add('rest');
    if(t.phase === 'done') ring.classList.add('done');

    let ratio = 0;
    if(t.phase === 'work' || t.phase === 'rest'){
      ratio = t.total ? (t.total - t.remaining) / t.total : 0;
    }else if(t.phase === 'done'){
      ratio = 1;
    }
    ring.style.setProperty('--progress', Math.max(0,Math.min(360,ratio*360)) + 'deg');

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
  }

  function pulse(pattern=40){
    try{
      if('vibrate' in navigator) navigator.vibrate(pattern);
    }catch(_){}
  }

  function formatSeconds(sec){
    sec = Math.max(0,Math.floor(sec || 0));
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
      if(state.role === 'client') renderClient();
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
    pulse([100,80,100]);
  });

  renderTrainerPreview();
  resetTimer();
  renderClient();
})();