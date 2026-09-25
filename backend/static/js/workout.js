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
 if(!done.length)return setRows(x,d)+`<br><button onclick="saveSets(${cid},${x.id},'${esc(workoutExerciseName(x)).replace(/'/g,"&#39;")}',${x.sets})">Закінчити вправу</button>`;
 let performed=done[0]?.exercise||x.exercise;return `<div class="exercise" style="margin-top:12px"><strong style="color:var(--yellow)">Виконано ✓</strong>${performed!==x.exercise?`<div class="muted" style="margin-top:5px">Виконано: <strong>${esc(performed)}</strong> · за планом ${esc(x.exercise)}</div>`:``}${done.map(s=>`<div class="muted" style="margin-top:6px">Підхід ${s.set_number}: ${s.weight} кг × ${s.reps} · RIR ${s.rir}</div>`).join('')}<div style="margin-top:12px"><button class="dark" onclick="editCompletedExercise(${cid},${x.id},'${esc(x.exercise).replace(/'/g,"&#39;")}',${x.sets},'${esc(x.reps)}',${x.target_rir})">Редагувати</button></div></div>`;
}

function editCompletedExercise(cid,pid,exercise,count,reps,targetRir){
 let d=window.currentClientData||{},done=todaySets(d,pid),body=$('#exerciseBody'+pid);if(!body)return;
 let h=`<div class="setrow"><div></div><div class="sethead">Вага, кг</div><div class="sethead">Повтори</div><div class="sethead">RIR</div></div>`;
 for(let n=1;n<=count;n++){let s=done.find(z=>z.set_number===n)||{};h+=`<div class="setrow"><div class="setnum">${n}</div><input id="w${pid}_${n}" type="number" step="0.5" value="${s.weight??''}" placeholder="кг"><input id="r${pid}_${n}" type="number" value="${s.reps??''}" placeholder="${esc(reps)}"><input id="i${pid}_${n}" type="number" value="${s.rir??targetRir}" min="0" max="10"></div>`}
 body.innerHTML=h+`<br><button onclick="saveSets(${cid},${pid},'${exercise.replace(/'/g,"&#39;")}',${count})">Зберегти зміни</button>`;
 body.classList.remove('hidden');
}


function previousSets(d,pid){
 let all=(d.result_sets||[]).filter(x=>x.program_id===pid);
 if(!all.length)return '';
 let latest=all.map(x=>x.day).sort().reverse()[0];
 let xs=all.filter(x=>x.day===latest).sort((a,b)=>a.set_number-b.set_number);
 return `<div class="exercise" style="margin-top:12px"><div class="muted">Попереднє тренування · ${esc(latest)}</div>${xs.map(s=>`<div style="margin-top:6px">Підхід ${s.set_number}: <strong>${s.weight} кг × ${s.reps}</strong> · RIR ${s.rir}</div>`).join('')}</div>`;
}

function workoutDraftSessionId(d){return (d?.workout_sessions||[]).find(x=>x.status==='training')?.id||0}

function workoutDraftKey(sid,pid){return `eplanWorkoutDraft_${sid}_${pid}`}

function readWorkoutDraft(sid,pid){try{return JSON.parse(localStorage.getItem(workoutDraftKey(sid,pid))||'{}')||{}}catch(e){return {}}}

function saveWorkoutDraft(sid,pid,n,field,value){if(!sid)return;let d=readWorkoutDraft(sid,pid);d[n]=d[n]||{};d[n][field]=value;try{localStorage.setItem(workoutDraftKey(sid,pid),JSON.stringify(d))}catch(e){}}

function clearWorkoutDraft(sid,pid){if(!sid)return;try{localStorage.removeItem(workoutDraftKey(sid,pid))}catch(e){}}

function clearWorkoutDraftsForSession(sid){if(!sid)return;try{for(let i=localStorage.length-1;i>=0;i--){let k=localStorage.key(i);if(k&&k.startsWith(`eplanWorkoutDraft_${sid}_`))localStorage.removeItem(k)}}catch(e){}}

function setRows(x,d){
 let h=`<div class="setrow"><div></div><div class="sethead">Вага, кг</div><div class="sethead">Повтори</div><div class="sethead">RIR</div></div>`,rp=rirPlan(x),sid=workoutDraftSessionId(d),draft=readWorkoutDraft(sid,x.id);
 for(let n=1;n<=x.sets;n++){let q=draft[n]||{},wv=q.weight??'',rv=q.reps??'',iv=q.rir??rp[n-1];h+=`<div class="setrow"><div class="setnum">${n}</div><input id="w${x.id}_${n}" type="number" step="0.5" value="${esc(String(wv))}" placeholder="кг" oninput="saveWorkoutDraft(${sid},${x.id},${n},'weight',this.value)"><input id="r${x.id}_${n}" type="number" value="${esc(String(rv))}" placeholder="${esc(x.reps)}" oninput="saveWorkoutDraft(${sid},${x.id},${n},'reps',this.value)"><input id="i${x.id}_${n}" type="number" value="${esc(String(iv))}" min="0" max="10" oninput="saveWorkoutDraft(${sid},${x.id},${n},'rir',this.value)"></div>`}
 return previousSets(d,x.id)+h
}

function previewWorkout(day,cid){
 previewWorkoutDay=previewWorkoutDay===day?null:day;
 clientCabinet(cid)
}

async function startWorkout(cid,day,btn=null){
 let button=btn||(typeof event!=='undefined'?event.currentTarget:null);
 if(button?.dataset.starting==='1')return;
 if(button){button.dataset.starting='1';button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='Запускаємо…'}
 try{
   let s=await api('/workout/start',{method:'POST',body:JSON.stringify({client_id:cid,day_name:day})});
   if(!s?.id)throw new Error('Не вдалося отримати тренування від сервера.');
   localStorage.setItem('activeWorkout_'+cid,JSON.stringify(s));
   previewWorkoutDay=null;
   await clientCabinet(cid);
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
 localStorage.removeItem('activeWorkout_'+cid);previewWorkoutDay=null;window.workoutExerciseChoices={};
 let d=await api('/client/'+cid);window.currentClientData=d;
 let s=(d.workout_sessions||[]).find(x=>x.id===sid)||{},sets=uniqueResultSets((d.result_sets||[]).filter(x=>x.day===sessionDay(s)));
 let exercises=new Set(sets.map(x=>x.program_id)).size,cycle=workoutCycleState(d,(d.program||[]).reduce((g,x)=>((g[x.day_name]??=[]).push(x),g),{}));
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="finishSummaryModal"><div class="card finish-summary"><h2>Тренування завершено ✓</h2><p class="muted">${esc(s.day_name||'Тренування')} автоматично надіслано тренеру на перевірку.</p><div class="finish-summary-grid"><div><span class="muted">Вправ</span><div class="summary-number">${exercises}</div></div><div><span class="muted">Робочих підходів</span><div class="summary-number">${sets.length}</div></div></div>${cycle.next?`<p class="muted">Наступне за планом: <strong>${esc(cycle.next)}</strong></p>`:''}<button style="width:100%" onclick="finishSummaryModal.remove();clientCabinet(${cid})">Готово</button></div></div>`);
 }catch(e){
  alert(e?.message||'Не вдалося завершити тренування. Перевір інтернет і спробуй ще раз.');
  if(button){button.dataset.finishing='0';button.disabled=false;button.textContent=button.dataset.oldText||'Завершити тренування'}
 }
}

function workoutCycleState(d,groups){
 let days=Object.keys(groups||{}),done=[];
 if(!days.length)return {done,next:null};
 let idx=0;
 let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished').slice().sort((a,b)=>new Date(a.finished_at||a.started_at||0)-new Date(b.finished_at||b.started_at||0));
 for(let x of sessions){
   let day=x.day_name;
   if(day===days[idx]){
     idx++;
     if(idx===days.length)idx=0;
   }else if(day===days[0]) idx=1;
 }
 done=days.slice(0,idx);
 return {done,next:days[idx]||days[0]};
}

function workoutDayButtons(d,cid,groups){
 let cycle=workoutCycleState(d,groups);
 return Object.keys(groups).map(day=>{
   let cls=previewWorkoutDay===day?'preview-selected':cycle.done.includes(day)?'workout-cycle-done':day===cycle.next?'dark workout-cycle-next':'dark';
   let mark=cycle.done.includes(day)?' ✓':'';
   return `<button class="${cls}" onclick="previewWorkout('${esc(day).replace(/'/g,"&#39;")}',${cid})">${esc(day)}${mark}</button>`;
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
 if(active)return `<div class="card next-action-card"><span class="next-action-kicker">Наступна дія</span><h2>Продовжити ${esc(active.day_name)}</h2><p class="muted">Тренування вже триває. Продовжуй з того місця, де зупинився.</p><button class="primary-wide" onclick="document.querySelector('.training-live')?.scrollIntoView({behavior:'smooth',block:'start'})">Продовжити тренування →</button></div>`;
 if(todaySession&&todaySession.status==='finished')return `<div class="card next-action-card today-done-card"><span class="next-action-kicker done">На сьогодні все ✓</span><h2>Тренування виконано</h2><p class="muted">${esc(todaySession.day_name||'Тренування')} завершено. Наступне тренування буде доступне завтра.</p><div class="today-mini-status"><div><span>Харчування</span><strong>${nutritionDone?'Заповнено ✓':'Ще не заповнено'}</strong></div><div><span>Заміри</span><strong>${esc(m.text)}</strong></div></div>${m.due?`<button class="dark" style="width:100%;margin-top:9px" onclick="showClientSection('measurements')">Зробити заміри →</button>`:''}</div>`;
 if(cycle.next)return `<div class="card next-action-card"><span class="next-action-kicker">Наступна дія</span><h2>🏋️ ${esc(cycle.next)}</h2><p class="muted">Це наступне тренування за твоїм планом.</p><button class="primary-wide" onclick="startWorkout(${cid},'${esc(cycle.next).replace(/'/g,"&#39;")}')">Почати тренування</button><div class="today-mini-status"><div><span>Харчування</span><strong>${nutritionDone?'Заповнено ✓':'Ще не заповнено'}</strong></div><div><span>Заміри</span><strong>${esc(m.text)}</strong></div></div>${m.due?`<button class="dark" style="width:100%;margin-top:9px" onclick="showClientSection('measurements')">Зробити заміри →</button>`:''}</div>`;
 return '';
}


function clientTrainingProgramHTML(d,cid,groups){
 let days=Object.entries(groups||{});
 if(!days.length)return `<div class="card"><h2>Твоя програма тренувань</h2><p class="muted">Тренер ще не додав тренування до програми.</p></div>`;
 if(previewWorkoutDay && !groups[previewWorkoutDay]) previewWorkoutDay=null;
 let buttons=days.map(([day])=>`<button type="button" class="client-program-tab ${previewWorkoutDay===day?'active':''}" onclick="selectClientProgramDay('${esc(day).replace(/'/g,"&#39;")}',${cid})">${esc(day)}</button>`).join('');
 let selected='';
 if(previewWorkoutDay){
   let xs=groups[previewWorkoutDay]||[],used=new Set(),exercises='';
   for(let i=0;i<xs.length;i++){
     let x=xs[i];if(used.has(x.id))continue;
     if(x.superset_group){
       let pair=xs.filter(y=>y.superset_group===x.superset_group);pair.forEach(y=>used.add(y.id));
       exercises+=`<div class="exercise" style="border-color:#6b5b00;padding:0;overflow:hidden;margin-top:12px"><div style="padding:12px 16px;background:#232116;border-bottom:1px solid #4d4300"><strong style="color:var(--yellow)">Суперсет</strong></div><div style="padding:4px 16px">${pair.map((y,pi)=>{let rest=restLabel(y),rp=rirPlan(y),num=xs.indexOf(y)+1;return `<div class="client-program-exercise" style="${pi?'border-top:1px solid var(--line)':'border-top:0'}"><div class="client-program-exercise-top"><strong>${num}. ${esc(y.exercise)}</strong></div><div class="muted">${y.sets} підходи × ${esc(y.reps)}</div><div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>${y.technique_url?`<a href="${esc(y.technique_url)}" target="_blank" rel="noopener" class="tech-link">Техніка</a>`:''}</div>`}).join('')}</div></div>`;
     }else{
       used.add(x.id);let rest=restLabel(x),rp=rirPlan(x);
       exercises+=`<div class="client-program-exercise"><div class="client-program-exercise-top"><strong>${i+1}. ${esc(x.exercise)}</strong></div><div class="muted">${x.sets} підходи × ${esc(x.reps)}</div><div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>${x.technique_url?`<a href="${esc(x.technique_url)}" target="_blank" rel="noopener" class="tech-link">Техніка</a>`:''}</div>`;
     }
   }
   let dayTitle=programDayTitle(d,previewWorkoutDay);
   selected=`<div class="client-program-selected"><div class="client-program-selected-title"><div><strong>${esc(previewWorkoutDay)}</strong>${dayTitle?`<small class="client-program-day-title">${esc(dayTitle)}</small>`:''}</div><span>${xs.length} ${xs.length===1?'вправа':(xs.length<5?'вправи':'вправ')}</span></div>${exercises}</div>`;
 }
 return `<div class="card client-training-program"><h2>Твоя програма тренувань</h2><p class="muted">Обери тренувальний день, щоб переглянути вправи.</p><div class="client-program-tabs">${buttons}</div>${selected}</div>`;
}

function trainingTermsHelpHTML(){
 return `<div class="card client-collapsible training-terms-card"><button class="exercise-toggle" onclick="toggleClientPanel('trainingTermsPanel',this)"><span><strong>Як читати програму тренувань?</strong><span class="muted" style="display:block;margin-top:5px">RIR та суперсети — коротке пояснення</span></span><span class="arrow">⌄</span></button><div id="trainingTermsPanel" class="client-collapsible-body hidden"><div class="rir-help"><strong>RIR (Reps In Reserve)</strong> — скільки повторів залишилося б у запасі до відмови. Наприклад, RIR 2 = ти міг би зробити ще приблизно 2 повтори.</div><div class="rir-help" style="margin-top:10px"><strong>Суперсет</strong> — дві вправи виконуються одна за одною без звичайного відпочинку між ними. Відпочинок — після завершення обох вправ.</div></div></div>`;
}

function selectClientProgramDay(day,cid){
 previewWorkoutDay=previewWorkoutDay===day?null:day;
 clientCabinet(cid);
}

function workoutExerciseName(x){return window.workoutExerciseChoices[x.id]||x.exercise}

function chooseWorkoutExercise(pid,cid){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let opts=[x.exercise,...exerciseAlternatives(x)],cur=workoutExerciseName(x);
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="alternativeExerciseModal"><div class="card"><div class="edit-exercise-head"><div><h2>Обрати вправу</h2><p class="muted" style="margin:4px 0 0">Заміна діє тільки для цього тренування.</p></div><button class="dark edit-exercise-close" onclick="alternativeExerciseModal.remove()">✕</button></div><div class="alternative-modal-list">${opts.map((v,i)=>`<button class="${v===cur?'alternative-current':'dark'}" onclick="selectWorkoutExercise(${pid},${cid},${i})">${i===0?'За планом: ':''}${esc(v)}</button>`).join('')}</div></div></div>`);
}

async function selectWorkoutExercise(pid,cid,index){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let opts=[x.exercise,...exerciseAlternatives(x)];
 window.workoutExerciseChoices[pid]=opts[index]||x.exercise;
 alternativeExerciseModal.remove();
 await clientCabinet(cid);
 requestAnimationFrame(()=>{
   let body=document.getElementById('exerciseBody'+pid);
   if(!body)return;
   body.classList.remove('hidden');
   let toggle=body.previousElementSibling;
   if(toggle){toggle.classList.add('open');let a=toggle.querySelector('.arrow');if(a)a.textContent='⌃'}
   setTimeout(()=>toggle?.scrollIntoView({behavior:'smooth',block:'center'}),60);
 });
}

function activeExercisesHTML(items,d,cid){
 let used=new Set(),html='';
 function card(x,inner=false){
  return `<div class="${inner?'':'exercise'}" style="${inner?'padding:12px 0;':''}"><button class="exercise-toggle" onclick="toggleExercise('exerciseBody${x.id}',this)"><span><strong>${esc(workoutExerciseName(x))}</strong>${workoutExerciseName(x)!==x.exercise?`<span class="muted" style="display:block;margin-top:3px">Замість: ${esc(x.exercise)}</span>`:``}${(x.technique_url||(d.result_sets||[]).some(r=>r.program_id===x.id&&r.day===isoToday()))?`<span class="exercise-meta-row">${x.technique_url?`<a href="${esc(x.technique_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="tech-link">Техніка</a>`:''}${(d.result_sets||[]).some(r=>r.program_id===x.id&&r.day===isoToday())?'<span class="exercise-done-badge">Виконано&nbsp;✓</span>':''}</span>`:''}<span class="muted" style="display:block;margin-top:5px">План: ${x.sets} × ${esc(x.reps)}${restLabel(x)?` · Відпочинок ${esc(restLabel(x))}`:``}<span style="display:block;margin-top:3px">RIR ${rirPlan(x).join(' / ')}</span></span></span><span class="arrow">⌄</span></button><div id="exerciseBody${x.id}" class="exercise-body hidden">${exerciseAlternatives(x).length&&!todaySets(d,x.id).length?`<button class="dark swap-exercise-btn" onclick="chooseWorkoutExercise(${x.id},${cid})">⇄ Замінити вправу</button>`:``}${completedExerciseHTML(x,d,cid)}</div></div>`;
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
 return `<div class="card"><h2>Коментарі</h2>${xs.length?xs.map(x=>`<div class="exercise comment-row"><strong>${x.author==='trainer'?'Тренер':'Клієнт'}</strong><div style="margin-top:6px">${esc(x.body)}</div>${session?.role==='trainer'||session?.role===x.author?`<button class="danger comment-delete" onclick="deleteComment(${x.id},${cid},'${day}')">Видалити</button>`:''}</div>`).join(''):'<p class="muted">Коментарів ще немає.</p>'}<textarea id="commentText" placeholder="Написати коментар..." style="width:100%;min-height:90px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:14px;font:inherit;resize:vertical"></textarea><br><br><button onclick="saveComment(${cid},'${day}')">Надіслати</button></div>`;
}

async function deleteComment(id,cid,day){
 if(!confirm('Видалити цей коментар?'))return;
 await api('/comments/'+id,{method:'DELETE'});
 let d=await api('/client/'+cid);window.currentClientData=d;
 if(history.state?.eplanPage==='calendarDay'){showCalendarDay(day,null,false);return}
 if(session.role==='trainer'){await openClient(cid,'comments');return}
 showClientSection('comments');
}

async function saveComment(cid,day){
 let t=$('#commentText');if(!t||!t.value.trim())return alert('Напиши коментар');
 await api('/comments',{method:'POST',body:JSON.stringify({client_id:cid,day,program_id:0,exercise:'',author:session.role,body:t.value.trim()})});
 let d=await api('/client/'+cid);window.currentClientData=d;
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
   html+=`<div class="exercise"><strong>${esc(x.exercise)}</strong>${x.technique_url?` <a href="${esc(x.technique_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="tech-link">Техніка</a>`:'' }<div class="muted">План: ${x.sets} × ${esc(x.reps)}${restLabel(x)?` · Відпочинок ${esc(restLabel(x))}`:``}<span style="display:block;margin-top:3px">RIR ${rirPlan(x).join(' / ')}</span></div></div>`;
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
   body.innerHTML=`<div class="exercise" style="margin-top:12px"><strong>Виконано ✓</strong>${sets.map(s=>`<div class="muted" style="margin-top:6px">Підхід ${s.set_number}: ${s.weight} кг × ${s.reps} · RIR ${s.rir}</div>`).join('')}<div style="margin-top:12px"><button class="dark" onclick="clientCabinet(${cid})">Редагувати</button></div></div>`;
   body.classList.add('hidden');
   let toggle=body.previousElementSibling;if(toggle)toggle.classList.remove('open');
 }
 let d=await api('/client/'+cid);window.currentClientData=d;
 let cal=$('#clientCalendar');if(cal)cal.innerHTML=calendarHTML(d,'client');
 setTimeout(async()=>{await clientCabinet(cid);focusNextUnfinishedExercise(pid)},250);
}
