// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function exerciseHistoryDates(d,pid){
 return [...new Set((d.result_sets||[]).filter(r=>r.program_id===pid).map(r=>r.day))].sort();
}

function previousExerciseHTML(d,pid){
 let dates=exerciseHistoryDates(d,pid).filter(day=>day<isoToday());
 if(!dates.length)return '<div class="muted" style="margin-top:10px">Попередніх результатів ще немає.</div>';

 let latest=dates[dates.length-1];
 let previous=dates.length>1?dates[dates.length-2]:null;
 let cur=(d.result_sets||[]).filter(r=>r.program_id===pid&&r.day===latest).sort((a,b)=>a.set_number-b.set_number);
 let prev=previous?(d.result_sets||[]).filter(r=>r.program_id===pid&&r.day===previous).sort((a,b)=>a.set_number-b.set_number):[];

 return `<div class="exercise" style="margin-top:12px">
   <div class="muted">Останнє виконання · ${esc(latest)}${previous?` · порівняно з ${esc(previous)}`:''}</div>
   ${cur.map(s=>{
      let p=prev.find(z=>z.set_number===s.set_number);
      if(!p)return `<div style="margin-top:7px">Підхід ${s.set_number}: <strong>${s.weight} кг × ${s.reps}</strong> · RIR ${s.rir}</div>`;
      return `<div style="margin-top:9px">
        <div>Підхід ${s.set_number}: <strong>${s.weight} кг × ${s.reps}</strong> · RIR ${s.rir}</div>
        <div class="muted" style="margin-top:3px">Різниця: вага ${signedDelta((+s.weight)-(+p.weight))} кг · повтори ${signedDelta((+s.reps)-(+p.reps))}</div>
      </div>`;
   }).join('')}
 </div>`;
}

function completedComparisonHTML(x,d){
 let dates=exerciseHistoryDates(d,x.id);
 if(dates.length<2)return '';
 let currentDay=dates[dates.length-1],previousDay=dates[dates.length-2];
 let cur=(d.result_sets||[]).filter(r=>r.program_id===x.id&&r.day===currentDay).sort((a,b)=>a.set_number-b.set_number);
 let prev=(d.result_sets||[]).filter(r=>r.program_id===x.id&&r.day===previousDay).sort((a,b)=>a.set_number-b.set_number);
 return `<div class="exercise" style="margin-top:12px"><strong>Порівняння з ${esc(previousDay)}</strong>${cur.map(s=>{
   let p=prev.find(z=>z.set_number===s.set_number);if(!p)return '';
   return `<div class="muted" style="margin-top:6px">Підхід ${s.set_number}: вага ${signedDelta((+s.weight)-(+p.weight))} кг · повтори ${signedDelta((+s.reps)-(+p.reps))}</div>`;
 }).join('')}</div>`;
}




function todaySets(d,pid){
 return uniqueResultSets((d?.result_sets||[])
   .filter(s=>+s.program_id===+pid&&s.day===isoToday()))
   .slice()
   .sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
}


function completedExerciseHTML(x,d,cid){
 let done=todaySets(d,x.id);
 if(!done.length)return setRows(x,d)+`<br><button class="workout-finish-exercise" data-exercise="${esc(workoutExerciseName(x))}" onclick="saveSets(${cid},${x.id},this.dataset.exercise,${x.sets})">Закінчити вправу</button>`;
 let performed=done[0]?.exercise||x.exercise;return `<div class="exercise" style="margin-top:12px"><strong class="workout-completed-label">Вправу завершено</strong>${performed!==x.exercise?`<div class="muted" style="margin-top:5px">Виконано: <strong>${esc(performed)}</strong> · за планом ${esc(x.exercise)}</div>`:``}${done.map(s=>`<div class="muted" style="margin-top:6px">Підхід ${s.set_number}: ${s.weight} кг × ${s.reps} · RIR ${s.rir}</div>`).join('')}<div style="margin-top:12px"><button class="dark" data-exercise="${esc(x.exercise)}" data-reps="${esc(x.reps)}" onclick="editCompletedExercise(${cid},${x.id},this.dataset.exercise,${x.sets},this.dataset.reps,${x.target_rir})">Редагувати</button></div></div>`;
}

function editCompletedExercise(cid,pid,exercise,count,reps,targetRir){
 let d=window.currentClientData||{},done=todaySets(d,pid),body=$('#exerciseBody'+pid);if(!body)return;
 let h=`<div class="setrow"><div></div><div class="sethead">Вага, кг</div><div class="sethead">Повтори</div><div class="sethead">RIR</div></div>`;
 for(let n=1;n<=count;n++){let s=done.find(z=>z.set_number===n)||{};h+=`<div class="setrow"><div class="setnum">${n}</div><input id="w${pid}_${n}" type="number" step="0.5" value="${s.weight??''}" placeholder="кг"><input id="r${pid}_${n}" type="number" value="${s.reps??''}" placeholder="${esc(reps)}"><input id="i${pid}_${n}" type="number" value="${s.rir??targetRir}" min="0" max="10"></div>`}
 body.innerHTML=h+`<br><button data-exercise="${esc(exercise)}" onclick="saveSets(${cid},${pid},this.dataset.exercise,${count})">Зберегти зміни</button>`;
 body.classList.remove('hidden');
}


function previousSets(d,pid){
 let all=(d.result_sets||[]).filter(x=>x.program_id===pid);
 if(!all.length)return '';
 let latest=all.map(x=>x.day).sort().reverse()[0];
 let xs=all.filter(x=>x.day===latest).sort((a,b)=>a.set_number-b.set_number);
 return `<div class="exercise workout-previous" style="margin-top:12px"><div class="muted">Попереднє тренування · ${esc(latest)}</div>${xs.map(s=>`<div style="margin-top:6px">Підхід ${s.set_number}: <strong>${s.weight} кг × ${s.reps}</strong> · RIR ${s.rir}</div>`).join('')}</div>`;
}

function formatWorkoutDuration(seconds){
 let sec=Math.max(0,Math.floor(+seconds||0)),min=Math.floor(sec/60),h=Math.floor(min/60),m=min%60;
 if(h>0)return m?String(h)+' год '+String(m)+' хв':String(h)+' год';
 return String(min)+' хв';
}
function workoutDurationBadgeHTML(s,extraClass=''){
 if(!s||s.duration_seconds===undefined||s.duration_seconds===null)return '';
 let active=s.status==='training';
 return '<span class="workout-duration-badge '+(active?'live ':'')+extraClass+'" data-workout-duration="'+Math.max(0,+s.duration_seconds||0)+'" data-workout-live="'+(active?'1':'0')+'" data-workout-rendered="'+Date.now()+'">⏱ '+formatWorkoutDuration(s.duration_seconds)+'</span>';
}
function refreshWorkoutDurationBadges(){
 document.querySelectorAll('[data-workout-duration]').forEach(el=>{
   let base=+el.dataset.workoutDuration||0,live=el.dataset.workoutLive==='1',rendered=+el.dataset.workoutRendered||Date.now();
   let sec=base+(live?Math.max(0,Math.floor((Date.now()-rendered)/1000)):0);
   el.textContent='⏱ '+formatWorkoutDuration(sec);
 });
}
if(!window.__eplanWorkoutDurationTicker){
 window.__eplanWorkoutDurationTicker=setInterval(refreshWorkoutDurationBadges,15000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshWorkoutDurationBadges()});
}

function workoutDraftSessionId(d){return (d?.workout_sessions||[]).find(x=>x.status==='training')?.id||0}

function workoutDraftKey(sid,pid){let scope=offlineLocalScopeKey();return scope?`eplanWorkoutDraftV2_${scope}_${sid}_${pid}`:''}

function readWorkoutDraft(sid,pid){try{let k=workoutDraftKey(sid,pid);return k?(JSON.parse(localStorage.getItem(k)||'{}')||{}):{}}catch(e){return {}}}

function saveWorkoutDraft(sid,pid,n,field,value){if(!sid)return;let k=workoutDraftKey(sid,pid);if(!k)return;let d=readWorkoutDraft(sid,pid);d[n]=d[n]||{};d[n][field]=value;try{localStorage.setItem(k,JSON.stringify(d))}catch(e){}}

function clearWorkoutDraft(sid,pid){if(!sid)return;try{let k=workoutDraftKey(sid,pid);if(k)localStorage.removeItem(k)}catch(e){}}

function clearWorkoutDraftsForSession(sid){if(!sid)return;try{let scope=offlineLocalScopeKey(),prefix=scope?`eplanWorkoutDraftV2_${scope}_${sid}_`:'';for(let i=localStorage.length-1;i>=0;i--){let k=localStorage.key(i);if(k&&prefix&&k.startsWith(prefix))localStorage.removeItem(k)}}catch(e){}}

function setRows(x,d){
 let h=`<div class="setrow"><div></div><div class="sethead">Вага, кг</div><div class="sethead">Повтори</div><div class="sethead">RIR</div><div></div></div>`,rp=rirPlan(x),sid=workoutDraftSessionId(d),draft=readWorkoutDraft(sid,x.id);
 for(let n=1;n<=x.sets;n++){let q=draft[n]||{},wv=q.weight??'',rv=q.reps??'',iv=q.rir??rp[n-1];h+=`<div class="setrow"><div class="setnum">${n}</div><input id="w${x.id}_${n}" type="number" step="0.5" value="${esc(String(wv))}" placeholder="кг" oninput="saveWorkoutDraft(${sid},${x.id},${n},'weight',this.value)"><input id="r${x.id}_${n}" type="number" value="${esc(String(rv))}" placeholder="${esc(x.reps)}" oninput="saveWorkoutDraft(${sid},${x.id},${n},'reps',this.value)"><input id="i${x.id}_${n}" type="number" value="${esc(String(iv))}" min="0" max="10" oninput="saveWorkoutDraft(${sid},${x.id},${n},'rir',this.value)"><button type="button" class="workout-set-check" onclick="completeWorkoutSetAndStartTimer(${x.id},${n},this)" aria-label="Завершити підхід ${n}">✓</button></div>`}
 return previousSets(d,x.id)+h
}

function previewWorkout(day,cid){
 previewWorkoutDay=previewWorkoutDay===day?null:day;
 showClientTraining(cid)
}

async function startWorkout(cid,day,btn=null){
 let button=btn||(typeof event!=='undefined'?event.currentTarget:null);
 if(button?.dataset.starting==='1')return;
 if(button){button.dataset.starting='1';button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='Запускаємо…'}
 try{
   let s=await api('/workout/start',{method:'POST',body:JSON.stringify({client_id:cid,day_name:day})});
   if(!s?.id)throw new Error('Не вдалося отримати тренування від сервера.');
   {let k=offlineLocalScopeKey();if(k)localStorage.setItem(`eplanActiveWorkoutV2_${k}_${cid}`,JSON.stringify(s));}
   previewWorkoutDay=null;
   await showClientTraining(cid);
   requestAnimationFrame(()=>{
     let live=document.querySelector('.training-live');
     if(live)live.scrollIntoView({behavior:'smooth',block:'start'});
   });
 }catch(e){
   alert(e?.message||'Не вдалося почати тренування. Спробуй ще раз.');
   if(button){button.disabled=false;button.dataset.starting='0';button.textContent=button.dataset.oldText||'Почати тренування'}
 }
}

async function finishWorkout(cid,sid,button=null){
 if(button?.dataset.finishing==='1')return;
 if(!confirm('Завершити тренування?'))return;
 if(button){button.dataset.finishing='1';button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='Завершуємо…'}
 try{
 await api('/workout/'+sid+'/finish',{method:'POST'});
 clearWorkoutDraftsForSession(sid);
 {let k=offlineLocalScopeKey();if(k)localStorage.removeItem(`eplanActiveWorkoutV2_${k}_${cid}`)}previewWorkoutDay=null;window.workoutExerciseChoices={};
 let d=await loadClientData(cid);window.currentClientData=d;
 let s=(d.workout_sessions||[]).find(x=>x.id===sid)||{},sets=uniqueResultSets((d.result_sets||[]).filter(x=>x.day===sessionDay(s)));
 let exercises=new Set(sets.map(x=>x.program_id)).size,cycle=workoutCycleState(d,(d.program||[]).reduce((g,x)=>((g[x.day_name]??=[]).push(x),g),{}));
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="finishSummaryModal"><div class="card finish-summary"><h2>Тренування завершено ✓</h2><p class="muted">${esc(s.day_name||'Тренування')} автоматично надіслано тренеру на перевірку.</p><div class="finish-summary-grid workout-finish-summary-grid"><div><span class="muted">Вправ</span><div class="summary-number">${exercises}</div></div><div><span class="muted">Підходів</span><div class="summary-number">${sets.length}</div></div><div><span class="muted">Тривалість</span><div class="summary-number duration">${formatWorkoutDuration(s.duration_seconds||0)}</div></div></div>${cycle.next?`<p class="muted">Наступне за планом: <strong>${esc(cycle.next)}</strong></p>`:''}<button style="width:100%" onclick="finishSummaryModal.remove();clientCabinet(${cid})">Готово</button></div></div>`);
 }catch(e){
  alert(e?.message||'Не вдалося завершити тренування. Перевір інтернет і спробуй ще раз.');
  if(button){button.dataset.finishing='0';button.disabled=false;button.textContent=button.dataset.oldText||'Завершити тренування'}
 }
}

function workoutCycleState(d,groups){
 let days=Object.keys(groups||{}),done=[];
 if(!days.length)return {done,next:null};
 let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished'&&days.includes(x.day_name)).slice().sort((a,b)=>new Date(a.finished_at||a.started_at||0)-new Date(b.finished_at||b.started_at||0));
 if(!sessions.length)return {done,next:days[0]};
 // A cycle is complete once every planned day has been performed once.
 // Walk backwards: the distinct days after the latest completed cycle are the current progress.
 let seen=new Set();
 for(let i=sessions.length-1;i>=0;i--){
   let day=sessions[i].day_name;
   if(seen.has(day))continue;
   if(seen.size===days.length-1){
     // Including this session completes the previous cycle, so none of it belongs to the new cycle.
     seen.clear();
     break;
   }
   seen.add(day);
 }
 // If the latest session itself would close a cycle, it should still be shown as completed until
 // the next workout starts; otherwise the UI jumps from 100% straight to 0%.
 if(!seen.size){
   let tail=new Set();
   for(let i=sessions.length-1;i>=0&&tail.size<days.length;i--)tail.add(sessions[i].day_name);
   if(tail.size===days.length)seen=tail;
 }
 done=days.filter(day=>seen.has(day));
 let next=days.find(day=>!seen.has(day))||days[0];
 return {done,next};
}
function workoutDayButtons(d,cid,groups){
 let cycle=workoutCycleState(d,groups);
 return Object.keys(groups).map(day=>{
   let cls=previewWorkoutDay===day?'preview-selected':cycle.done.includes(day)?'workout-cycle-done':day===cycle.next?'dark workout-cycle-next':'dark';
   let mark=cycle.done.includes(day)?' ✓':'';
   return `<button class="${cls}" data-day="${esc(day)}" onclick="previewWorkout(this.dataset.day,${cid})">${esc(day)}${mark}</button>`;
 }).join('');
}


function measurementReminderState(d){
 let xs=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let last=xs[xs.length-1];if(!last)return {due:true,text:'Потрібні перші заміри'};
 let left=measurementDaysLeft(last.day);return {due:left<=0,text:left<=0?'Час зробити заміри':`Заміри через ${left} ${ukDays(left)}`};
}

function todayGuidanceHTML(d,cid,groups){
 let today=isoToday(),sessions=(d.workout_sessions||[]),active=sessions.find(x=>x.status==='training'),
     todaySetsAll=(d.result_sets||[]).filter(x=>x.day===today),
     todaySession=sessions.find(x=>sessionDay(x)===today)
       ||(todaySetsAll.length?sessions.filter(x=>x.status==='finished').slice().sort((a,b)=>(+b.id||0)-(+a.id||0))[0]:null),
     cycle=workoutCycleState(d,groups),m=measurementReminderState(d),
     nutritionDone=(d.nutrition||[]).some(x=>x.day===today);
 if(active)return `<div class="card next-action-card"><span class="next-action-kicker">Наступна дія</span><div class="next-action-title-row"><h2>Продовжити ${esc(active.day_name)}</h2>${workoutDurationBadgeHTML(active)}</div><p class="muted">Тренування вже триває. Продовжуй з того місця, де зупинився.</p><button class="primary-wide" onclick="document.querySelector('.training-live')?.scrollIntoView({behavior:'smooth',block:'start'})">Продовжити тренування →</button></div>`;
 if(todaySession&&todaySession.status==='finished')return `<div class="card next-action-card today-done-card"><span class="next-action-kicker done">На сьогодні все ✓</span><h2>Тренування виконано</h2><p class="muted">${esc(todaySession.day_name||'Тренування')} завершено. Наступне тренування буде доступне завтра.</p><div class="today-mini-status"><div><span>Харчування</span><strong>${nutritionDone?'Заповнено ✓':'Ще не заповнено'}</strong></div><div><span>Заміри</span><strong>${esc(m.text)}</strong></div></div>${m.due?`<button class="dark" style="width:100%;margin-top:9px" onclick="showClientSection('measurements')">Зробити заміри →</button>`:''}</div>`;
 if(cycle.next)return `<div class="card next-action-card"><span class="next-action-kicker">Наступна дія</span><h2>🏋️ ${esc(cycle.next)}</h2><p class="muted">Це наступне тренування за твоїм планом.</p><button class="primary-wide" data-day="${esc(cycle.next)}" onclick="startWorkout(${cid},this.dataset.day)">Почати тренування</button><div class="today-mini-status"><div><span>Харчування</span><strong>${nutritionDone?'Заповнено ✓':'Ще не заповнено'}</strong></div><div><span>Заміри</span><strong>${esc(m.text)}</strong></div></div>${m.due?`<button class="dark" style="width:100%;margin-top:9px" onclick="showClientSection('measurements')">Зробити заміри →</button>`:''}</div>`;
 return '';
}


function clientTrainingProgramHTML(d,cid,groups){
 let days=Object.entries(groups||{});
 if(!days.length)return `<div class="card"><h2>Твоя програма тренувань</h2><p class="muted">Тренер ще не додав тренування до програми.</p></div>`;
 if(previewWorkoutDay && !groups[previewWorkoutDay]) previewWorkoutDay=null;
 let buttons=days.map(([day])=>`<button type="button" class="client-program-tab ${previewWorkoutDay===day?'active':''}" data-day="${esc(day)}" onclick="selectClientProgramDay(this.dataset.day,${cid})">${esc(day)}</button>`).join('');
 let selected='';
 if(previewWorkoutDay){
   let xs=groups[previewWorkoutDay]||[],used=new Set(),exercises='';
   for(let i=0;i<xs.length;i++){
     let x=xs[i];if(used.has(x.id))continue;
     if(x.superset_group){
       let pair=xs.filter(y=>y.superset_group===x.superset_group);pair.forEach(y=>used.add(y.id));
       exercises+=`<div class="exercise" style="border-color:#6b5b00;padding:0;overflow:hidden;margin-top:12px"><div style="padding:12px 16px;background:#232116;border-bottom:1px solid #4d4300"><strong style="color:var(--yellow)">Суперсет</strong></div><div style="padding:4px 16px">${pair.map((y,pi)=>{let rest=restLabel(y),rp=rirPlan(y),num=xs.indexOf(y)+1;return `<div class="client-program-exercise" style="${pi?'border-top:1px solid var(--line)':'border-top:0'}"><div class="client-program-exercise-top"><strong>${num}. ${esc(y.exercise)}</strong></div><div class="muted">${y.sets} підходи × ${esc(y.reps)}</div><div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>${y.technique_url?techniqueLinkHTML(y.technique_url):''}</div>`}).join('')}</div></div>`;
     }else{
       used.add(x.id);let rest=restLabel(x),rp=rirPlan(x);
       exercises+=`<div class="client-program-exercise"><div class="client-program-exercise-top"><strong>${i+1}. ${esc(x.exercise)}</strong></div><div class="muted">${x.sets} підходи × ${esc(x.reps)}</div><div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>${x.technique_url?techniqueLinkHTML(x.technique_url):''}</div>`;
     }
   }
   let dayTitle=programDayTitle(d,previewWorkoutDay);
   selected=`<div class="client-program-selected"><div class="client-program-selected-title"><div><strong>${esc(previewWorkoutDay)}</strong>${dayTitle?`<small class="client-program-day-title">${esc(dayTitle)}</small>`:''}</div><span>${xs.length} ${xs.length===1?'вправа':(xs.length<5?'вправи':'вправ')}</span></div>${exercises}</div>`;
 }
 return `<div class="card client-training-program"><h2>Твоя програма тренувань</h2><p class="muted">Обери тренувальний день, щоб переглянути вправи.</p><div class="client-program-tabs">${buttons}</div>${selected}</div>`;
}

function trainingTermsHelpHTML(){
 return `<div class="card client-collapsible training-terms-card"><button class="exercise-toggle" onclick="toggleClientPanel('trainingTermsPanel',this)"><span><strong>Як читати програму тренувань?</strong><span class="muted" style="display:block;margin-top:5px">Коротка інструкція перед тренуванням</span></span><span class="arrow">⌄</span></button><div id="trainingTermsPanel" class="client-collapsible-body hidden"><div class="rir-help"><strong>1. Розминка</strong><br>Перед кожним тренуванням обов’язково виконуємо загальну розминку. Перед кожною вправою за потреби робимо розминочні підходи, поступово підводячись до робочої ваги.</div><div class="rir-help" style="margin-top:10px"><strong>2. Робочі підходи</strong><br>У програму вносимо <strong>тільки робочі підходи</strong>. Розминочні підходи записувати не потрібно.</div><div class="rir-help" style="margin-top:10px"><strong>3. RIR (Reps In Reserve)</strong><br>Показує, скільки повторів залишилося б у запасі до відмови. Наприклад, <strong>RIR 2</strong> — ти міг би виконати ще приблизно 2 повтори.</div><div class="rir-help" style="margin-top:10px"><strong>4. Суперсет</strong><br>Дві вправи виконуються одна за одною без звичайного відпочинку між ними. Відпочинок — після виконання обох вправ.</div></div></div>`;
}

function selectClientProgramDay(day,cid){
 previewWorkoutDay=previewWorkoutDay===day?null:day;
 showClientTraining(cid);
}

function workoutExerciseName(x){return window.workoutExerciseChoices[x.id]||x.exercise}

function chooseWorkoutExercise(pid,cid){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let opts=[x.exercise,...exerciseAlternatives(x)],cur=workoutExerciseName(x);
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="alternativeExerciseModal"><div class="card swap-choice-card"><div class="edit-exercise-head"><div><h2>Замінити вправу</h2><p class="muted" style="margin:4px 0 0">Обери один із дозволених варіантів.</p></div><button class="dark edit-exercise-close" onclick="alternativeExerciseModal.remove()">✕</button></div><div class="alternative-modal-list">${opts.map((v,i)=>`<button class="${v===cur?'alternative-current':'dark'}" onclick="pickWorkoutExerciseScope(${pid},${cid},${i})">${i===0?'За планом: ':''}${esc(v)}</button>`).join('')}</div></div></div>`);
}

function pickWorkoutExerciseScope(pid,cid,index){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let opts=[x.exercise,...exerciseAlternatives(x)],chosen=opts[index]||x.exercise;
 let card=document.querySelector('#alternativeExerciseModal .swap-choice-card');if(!card)return;
 card.innerHTML=`<div class="edit-exercise-head"><div><span class="swap-step-label">Обрана вправа</span><h2>${esc(chosen)}</h2><p class="muted" style="margin:4px 0 0">Як застосувати цю заміну?</p></div><button class="dark edit-exercise-close" onclick="alternativeExerciseModal.remove()">✕</button></div><div class="swap-scope-actions"><button onclick="applyWorkoutExerciseChoice(${pid},${cid},${index},'today')"><strong>Тільки сьогодні</strong><span>Поточна програма не зміниться</span></button><button onclick="applyWorkoutExerciseChoice(${pid},${cid},${index},'program')"><strong>Замінити в програмі</strong><span>Ця вправа стане основною надалі</span></button></div><button class="dark swap-back-btn" onclick="alternativeExerciseModal.remove();chooseWorkoutExercise(${pid},${cid})">← Назад до вправ</button>`;
}

async function applyWorkoutExerciseChoice(pid,cid,index,scope){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let opts=[x.exercise,...exerciseAlternatives(x)],chosen=opts[index]||x.exercise;
 if(scope==='program'){
   try{
     await api('/program/'+pid+'/client-exercise',{method:'PATCH',body:JSON.stringify({exercise:chosen})});
     window.workoutExerciseChoices[pid]=chosen;
     window.currentClientData=await loadClientData(cid);
   }catch(e){
     alert(e?.message||'Не вдалося змінити вправу в програмі.');
     return;
   }
 }else{
   window.workoutExerciseChoices[pid]=chosen;
 }
 alternativeExerciseModal?.remove();
 await showClientTraining(cid);
 requestAnimationFrame(()=>{
   let body=document.getElementById('exerciseBody'+pid);
   if(!body)return;
   body.classList.remove('hidden');
   let toggle=body.previousElementSibling;
   if(toggle){toggle.classList.add('open');let a=toggle.querySelector('.arrow');if(a)a.textContent='⌃'}
   setTimeout(()=>toggle?.scrollIntoView({behavior:'smooth',block:'center'}),60);
 });
}

async function selectWorkoutExercise(pid,cid,index){
 return applyWorkoutExerciseChoice(pid,cid,index,'today');
}

function activeExercisesHTML(items,d,cid){
 let used=new Set(),active=(d.workout_sessions||[]).find(x=>x.status==='training');
 let html=active?'<div class="workout-duration-strip"><span>Тривалість тренування</span>'+workoutDurationBadgeHTML(active)+'</div>':'';
 function card(x,inner=false){
  let doneToday=(d.result_sets||[]).some(r=>r.program_id===x.id&&r.day===isoToday());
  return `<div class="${inner?'workout-live-exercise workout-live-exercise-inner':'exercise workout-live-exercise'}" style="${inner?'padding:12px 0;':''}"><button class="exercise-toggle workout-live-toggle" onclick="toggleExercise('exerciseBody${x.id}',this)"><span><span class="workout-exercise-title-line"><strong>${esc(workoutExerciseName(x))}</strong>${doneToday?'<span class="exercise-done-badge compact" title="Вправу завершено" aria-label="Вправу завершено">✓</span>':''}</span>${workoutExerciseName(x)!==x.exercise?`<span class="muted workout-replacement-note">Замість: ${esc(x.exercise)}</span>`:``}${x.technique_url?`<span class="exercise-meta-row workout-technique-row">${techniqueLinkHTML(x.technique_url,'Техніка',true)}</span>`:``}<span class="muted workout-plan-line">План: ${x.sets} × ${esc(x.reps)}${restLabel(x)?` · Відпочинок ${esc(restLabel(x))}`:``}<span>RIR ${rirPlan(x).join(' / ')}</span></span></span><span class="arrow">⌄</span></button><div id="exerciseBody${x.id}" class="exercise-body workout-live-body hidden">${exerciseAlternatives(x).length&&!todaySets(d,x.id).length?`<button class="dark swap-exercise-btn" onclick="chooseWorkoutExercise(${x.id},${cid})">⇄ Замінити вправу</button>`:``}${completedExerciseHTML(x,d,cid)}</div></div>`;
 }
 for(let x of items){
  if(used.has(x.id))continue;
  if(x.superset_group){
   let pair=items.filter(y=>y.superset_group===x.superset_group);pair.forEach(y=>used.add(y.id));
   html+=`<div class="exercise" style="border-color:#6b5b00;padding:0;overflow:hidden"><div style="padding:12px 16px;background:#232116;border-bottom:1px solid #4d4300"><strong style="color:var(--yellow)">Суперсет</strong></div><div style="padding:4px 16px">${pair.map((y,i)=>card(y,true)+(i<pair.length-1?'<div style="border-bottom:1px solid var(--line)"></div>':'')).join('')}</div></div>`;
  }else{used.add(x.id);html+=card(x)}
 }
 return html;
}




function commentsHTML(d,cid,day=isoToday()){
 let xs=(d.comments||[]).filter(x=>x.day===day);
 return `<div class="card"><h2>Коментарі</h2>${xs.length?xs.map(x=>`<div class="exercise comment-row"><strong>${x.author==='trainer'?'Тренер':'Клієнт'}</strong><div style="margin-top:6px">${esc(x.body)}</div>${session?.role==='trainer'||session?.role===x.author?`<button class="danger comment-delete" data-day="${esc(day)}" onclick="deleteComment(${x.id},${cid},this.dataset.day)">Видалити</button>`:''}</div>`).join(''):'<p class="muted">Коментарів ще немає.</p>'}<textarea id="commentText" placeholder="Написати коментар..." style="width:100%;min-height:90px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:14px;font:inherit;resize:vertical"></textarea><br><br><button data-day="${esc(day)}" onclick="saveComment(${cid},this.dataset.day)">Надіслати</button></div>`;
}

async function deleteComment(id,cid,day){
 if(!confirm('Видалити цей коментар?'))return;
 await api('/comments/'+id,{method:'DELETE'});
 let d=await loadClientData(cid);window.currentClientData=d;
 if(history.state?.eplanPage==='calendarDay'){showCalendarDay(day,null,false);return}
 if(session.role==='trainer'){await openClient(cid,'comments');return}
 showClientSection('comments');
}

async function saveComment(cid,day){
 let t=$('#commentText');if(!t||!t.value.trim())return alert('Напиши коментар');
 await api('/comments',{method:'POST',body:JSON.stringify({client_id:cid,day,program_id:0,exercise:'',author:session.role,body:t.value.trim()})});
 let d=await loadClientData(cid);window.currentClientData=d;
 if(session.role==='trainer')openClient(cid);else clientCabinet(cid)
}

function previewExercisesHTML(items){
 let used=new Set(),html='';
 for(let x of items){
  if(used.has(x.id))continue;
  if(x.superset_group){
   let pair=items.filter(y=>y.superset_group===x.superset_group);
   pair.forEach(y=>used.add(y.id));
   html+=`<div class="exercise" style="border-color:#6b5b00;padding:0;overflow:hidden"><div style="padding:12px 16px;background:#232116;border-bottom:1px solid #4d4300"><strong style="color:var(--yellow)">Суперсет</strong></div><div style="padding:6px 16px">${pair.map((y,i)=>`<div style="padding:12px 0;${i<pair.length-1?'border-bottom:1px solid var(--line)':''}"><strong>${esc(y.exercise)}</strong><div class="muted">План: ${y.sets} × ${esc(y.reps)}${restLabel(y)?` · Відпочинок ${esc(restLabel(y))}`:``}<span style="display:block;margin-top:3px">RIR ${rirPlan(y).join(' / ')}</span></div></div>`).join('')}</div></div>`;
  }else{
   used.add(x.id);
   html+=`<div class="exercise"><strong>${esc(x.exercise)}</strong>${x.technique_url?` ${techniqueLinkHTML(x.technique_url,'Техніка',true)}`:'' }<div class="muted">План: ${x.sets} × ${esc(x.reps)}${restLabel(x)?` · Відпочинок ${esc(restLabel(x))}`:``}<span style="display:block;margin-top:3px">RIR ${rirPlan(x).join(' / ')}</span></div></div>`;
  }
 }
 return html;
}


function focusNextUnfinishedExercise(pid){
 let cards=[...document.querySelectorAll('[id^="exerciseBody"]')];
 let current=cards.findIndex(x=>x.id==='exerciseBody'+pid);
 let next=cards.slice(current+1).find(x=>!x.textContent.includes('Виконано ✓'))||cards.find(x=>!x.textContent.includes('Виконано ✓'));
 if(next){let btn=next.previousElementSibling;if(next.classList.contains('hidden'))btn?.click();setTimeout(()=>btn?.scrollIntoView({behavior:'smooth',block:'center'}),80)}
}


async function saveSets(cid,pid,exercise,count){
 let sets=[];
 for(let n=1;n<=count;n++){
  let w=$(`#w${pid}_${n}`),r=$(`#r${pid}_${n}`),i=$(`#i${pid}_${n}`);
  if(!w.value&&!r.value)continue;
  if(!w.value||!r.value)return alert(`Заповни вагу та повтори у підході ${n}`);
  sets.push({set_number:n,weight:+w.value,reps:+r.value,rir:+i.value||0})
 }
 if(!sets.length)return alert('Заповни хоча б один підхід');
 await api('/result-sets',{method:'POST',body:JSON.stringify({client_id:cid,program_id:pid,exercise,sets})});
 clearWorkoutDraft(workoutDraftSessionId(window.currentClientData||{}),pid);
 let body=$('#exerciseBody'+pid);
 if(body){
   body.innerHTML=`<div class="exercise" style="margin-top:12px"><strong>Виконано ✓</strong>${sets.map(s=>`<div class="muted" style="margin-top:6px">Підхід ${s.set_number}: ${s.weight} кг × ${s.reps} · RIR ${s.rir}</div>`).join('')}<div style="margin-top:12px"><button class="dark" onclick="showClientTraining(${cid})">Редагувати</button></div></div>`;
   body.classList.add('hidden');
   let toggle=body.previousElementSibling;if(toggle)toggle.classList.remove('open');
 }
 let d=await loadClientData(cid);window.currentClientData=d;
 let cal=$('#clientCalendar');if(cal)cal.innerHTML=calendarHTML(d,'client');
 setTimeout(async()=>{await showClientTraining(cid);focusNextUnfinishedExercise(pid)},250);
}
