// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function clientProgressHTML(d){
 let period=window.clientProgressPeriod||'90',from=periodStart(period);
 let inPeriod=day=>!from||!day||day>=from;
 let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished'&&inPeriod(sessionDay(x)));
 let measures=(d.measurements||[]).filter(x=>x.day&&inPeriod(x.day)).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let allMeasures=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let firstM=measures[0],lastM=measures[measures.length-1];
 let weightNow=lastM&&+lastM.weight>0?+lastM.weight:null;
 let weightDelta=firstM&&lastM&&+firstM.weight>0&&+lastM.weight>0?(+lastM.weight-+firstM.weight):null;

 let programGroups={};(d.program||[]).forEach(x=>{let day=x.day_name||'День';(programGroups[day]??=[]).push(x)});
 let programDays=Object.keys(programGroups);
 if(window.clientProgressDay && !programGroups[window.clientProgressDay]) window.clientProgressDay=null;
 let selectedDay=window.clientProgressDay||null;
 let selectedProgram=selectedDay?(programGroups[selectedDay]||[]):[];
 let selectedIds=new Set(selectedProgram.map(x=>+x.id).filter(Boolean));
 let currentProgramById=Object.fromEntries(selectedProgram.map(x=>[+x.id,x]));

 let sets=(d.result_sets||[]).filter(x=>x.day&&inPeriod(x.day)&&(selectedDay?selectedIds.has(+x.program_id):false));
 let byExercise={};
 sets.forEach(s=>{
   let key=(+s.program_id)+'::'+String(s.exercise||'');
   (byExercise[key]||(byExercise[key]=[])).push(s);
 });
 let exerciseRows=Object.entries(byExercise).map(([programKey,xs])=>{
   let pid=+String(programKey).split('::')[0],current=currentProgramById[pid]||{},performedName=xs[xs.length-1]?.exercise||current.exercise||'Вправа';
   let dates=[...new Set(xs.map(x=>x.day))].sort();
   let firstDay=dates[0],lastDay=dates[dates.length-1];
   let firstSets=xs.filter(x=>x.day===firstDay),lastSets=xs.filter(x=>x.day===lastDay);
   let best=a=>a.slice().sort((x,y)=>(+y.weight||0)-(+x.weight||0)||(+y.reps||0)-(+x.reps||0))[0]||{};
   let a=best(firstSets),b=best(lastSets);
   return {program_id:pid,name:performedName,exercise_name:performedName,dates,first:a,last:b,change:(+b.weight||0)-(+a.weight||0),count:dates.length};
 }).sort((a,b)=>{
   let order=selectedProgram.findIndex(x=>+x.id===+a.program_id);
   let orderB=selectedProgram.findIndex(x=>+x.id===+b.program_id);
   return order-orderB;
 });

 let statWeight=weightNow!==null?`${fmtProgress(weightNow)} кг`:'—';
 let statDelta=weightDelta!==null?`${weightDelta>0?'+':''}${fmtProgress(weightDelta)} кг`:'—';
 let periodLabel=period==='30'?'30 днів':period==='90'?'3 місяці':period==='180'?'6 місяців':'Весь час';
 let dayButtons=programDays.map(day=>`<button class="progress-day-btn ${selectedDay===day?'active':''}" onclick="window.clientProgressDay=(window.clientProgressDay==='${esc(day).replace(/'/g,"&#39;")}'?null:'${esc(day).replace(/'/g,"&#39;")}');refreshClientProgress()">${esc(day)}</button>`).join('');
 let hasAnyProgress=sessions.length||(d.result_sets||[]).length||allMeasures.length;

 return `<div id="clientProgress" class="client-progress-new">
  ${!hasAnyProgress?`<div class="card"><div class="empty-state"><strong>Тут з’являться твої результати після першого тренування.</strong>Після перших записів ти побачиш силові показники, вагу та зміни тіла.</div></div>`:''}
  <div class="progress-hero">
   <div><h2>Мій прогрес</h2><p class="muted">Головне про твої результати в одному місці.</p></div>
   <div class="progress-periods">${[['30','1 міс.'],['90','3 міс.'],['180','6 міс.'],['all','Увесь час']].map(([v,t])=>`<button class="${period===v?'':'dark'}" onclick="window.clientProgressPeriod='${v}';refreshClientProgress()">${t}</button>`).join('')}</div>
  </div>

  <div class="progress-stats">
   <div class="progress-stat"><span>Тренувань</span><strong>${sessions.length}</strong><small>${periodLabel}</small></div>
   <div class="progress-stat"><span>Вага</span><strong>${statWeight}</strong><small>${lastM?.day?formatProgressDate(lastM.day):'Немає даних'}</small></div>
   <div class="progress-stat"><span>Зміна ваги</span><strong class="${weightDelta!==null&&weightDelta<0?'good':''}">${statDelta}</strong><small>за період</small></div>
  </div>

  <div class="card progress-section">
   <div class="progress-section-head"><div><h2>Силові показники</h2><p class="muted">Обери тренувальний день і подивись прогрес вправ за вибраний період.</p></div></div>
   ${programDays.length?`<div class="progress-day-grid">${dayButtons}</div>`:'<div class="progress-empty">Тренувальна програма ще не додана. Після призначення програми тут з’являться тренувальні дні.</div>'}
   ${selectedDay?`<div class="progress-selected-day"><div><strong>${esc(selectedDay)}</strong>${programDayTitle(d,selectedDay)?`<small class="progress-day-title">${esc(programDayTitle(d,selectedDay))}</small>`:''}</div><span>${periodLabel}</span></div>${exerciseRows.length?`<div class="strength-list">${exerciseRows.map((x,i)=>strengthProgressCard(x,i)).join('')}</div>`:'<div class="progress-empty">Для вправ цього дня ще немає результатів. Вони з’являться після першого виконаного тренування.</div>'}`:(programDays.length?'<div class="progress-empty progress-day-hint">Обери день тренування вище.</div>':'')}
  </div>

  <div class="card progress-section">
   <button class="exercise-toggle" onclick="toggleCalendar('bodyProgressDetails',this)">
    <span><strong>Зміни тіла</strong><span class="muted" style="display:block;margin-top:5px">${lastM?'Останні актуальні заміри':'Заміри ще не додані'}</span></span><span class="arrow">⌄</span>
   </button>
   <div id="bodyProgressDetails" class="hidden" style="margin-top:14px">${bodyProgressHTML(allMeasures,period)}</div>
  </div>
 </div>`;
}

function fmtProgress(v){return Number(v).toFixed(1).replace('.0','')}

function formatProgressDate(s){try{return new Date(s+'T12:00:00').toLocaleDateString(appLanguage==='en'?'en-GB':'uk-UA',{day:'numeric',month:'short'})}catch(e){return s}}

function strengthProgressCard(x,i){
 let last=x.last||{},first=x.first||{},delta=x.change||0;
 let lastText=(+last.weight||0)>0?`${fmtProgress(last.weight)} кг × ${last.reps||0}`:`${last.reps||0} повт.`;
 let firstText=(+first.weight||0)>0?`${fmtProgress(first.weight)} кг × ${first.reps||0}`:`${first.reps||0} повт.`;
 let trend=x.dates.length>1?(delta>0?`+${fmtProgress(delta)} кг ↑`:delta<0?`${fmtProgress(delta)} кг ↓`:'без зміни'):'перше тренування';
 let details=x.dates.slice().reverse().map(day=>{
   let rows=(window.currentClientData.result_sets||[]).filter(s=>+s.program_id===+x.program_id&&s.day===day&&(!x.exercise_name||s.exercise===x.exercise_name)).sort((a,b)=>a.set_number-b.set_number);
   return `<div class="strength-history-row"><div><strong>${formatProgressDate(day)}</strong><span>${rows.map(s=>`${fmtProgress(s.weight||0)} кг × ${s.reps} · RIR ${s.rir}`).join(' · ')}</span></div></div>`;
 }).join('');
 return `<div class="strength-card">
  <button class="strength-main" onclick="toggleCalendar('strengthDetail${i}',this)">
   <span><strong>${esc(x.name)}</strong><small>${firstText} → ${lastText}</small></span>
   <span class="strength-change ${delta>0?'up':delta<0?'down':''}">${trend}</span>
   <span class="arrow">⌄</span>
  </button>
  <div id="strengthDetail${i}" class="hidden strength-detail">${details}</div>
 </div>`;
}

function bodyProgressHTML(xs,period){
 if(!xs.length)return `<div class="progress-empty">Додай перші заміри — і тут з’явиться динаміка.</div>`;
 let from=periodStart(period),f=xs.filter(x=>!from||x.day>=from),a=f[0]||xs[0],b=f[f.length-1]||xs[xs.length-1];
 let metrics=[['weight','Вага','кг'],['waist','Талія','см'],['chest','Груди','см'],['hips','Таз','см'],['thighs','Бедра','см'],['arms','Руки','см']];
 return `<div class="body-progress-grid">${metrics.filter(([k])=>+b[k]>0).map(([k,n,u])=>{let dv=(+a[k]>0)?(+b[k]-+a[k]):null;return `<div class="body-progress-item"><span>${n}</span><strong>${fmtProgress(b[k])} ${u}</strong><small>${dv===null?'':`${dv>0?'+':''}${fmtProgress(dv)} ${u}`}</small></div>`}).join('')}</div><div class="muted" style="margin-top:12px">Останній замір: ${formatProgressDate(b.day)}</div>`;
}

function refreshClientProgress(){let el=$('#clientProgress');if(!el)return;let tmp=document.createElement('div');tmp.innerHTML=clientProgressHTML(window.currentClientData||{});el.replaceWith(tmp.firstElementChild)}

function applyClientProgressPeriod(){window.clientProgressFrom=$('#clientProgressFrom')?.value||'';window.clientProgressTo=$('#clientProgressTo')?.value||'';window.clientProgressPeriod='custom';refreshClientProgress()}

function openClientHistory(){let head=document.querySelector('#clientCalendarBody')?.previousElementSibling;if(head){let body=document.querySelector('#clientCalendarBody');if(body?.classList.contains('hidden'))toggleCalendar('clientCalendarBody',head);head.scrollIntoView({behavior:'smooth',block:'start'})}}

function sessionProgramForDate(d,dayName,day){
 let sessions=(d.workout_sessions||[]).filter(s=>s.day_name===dayName&&sessionDay(s)===day).sort((a,b)=>b.id-a.id);
 if(sessions.length&&sessions[0].program_snapshot){
  try{let snap=JSON.parse(sessions[0].program_snapshot);if(Array.isArray(snap)&&snap.length)return snap}catch(e){}
 }
 return (d.program||[]).filter(x=>x.day_name===dayName);
}

async function reviewWorkout(sid,cid,useComment=true,button=null){
 let restore=setActionLoading(button,'Перевіряємо…');
 try{
 let t=$('#reviewComment'+sid),comment=useComment&&t?t.value.trim():'';
 await api('/workout/'+sid+'/review',{method:'PATCH',body:JSON.stringify({comment})});
 let clients=await api('/clients'),remaining=clients.reduce((s,c)=>s+(+c.needs_review_count||0),0);
 await openClient(cid,'results');
 if(remaining>0)setTimeout(()=>{document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="nextReviewModal"><div class="card"><h2>Тренування перевірено ✓</h2><p class="muted">Ще очікують перевірки: ${remaining}</p><button style="width:100%" onclick="nextReviewModal.remove();openNextPendingClient(${cid})">Наступне →</button><button class="dark" style="width:100%;margin-top:8px" onclick="nextReviewModal.remove()">Залишитися тут</button></div></div>`)},120);
 }catch(e){restore();alert(e.message||'Не вдалося позначити тренування перевіреним. Спробуй ще раз.')}
}

async function openNextPendingClient(currentCid){
 let cs=await api('/clients'),next=cs.find(c=>c.id!==currentCid&&(+c.needs_review_count||0)>0)||cs.find(c=>(+c.needs_review_count||0)>0);
 if(!next)return trainerHome();
 await openClient(next.id,'results');setTimeout(openFirstPendingWorkout,180);
}


function uniqueResultSets(xs){
 let seen=new Set();
 return (xs||[]).filter(r=>{
   let key=`${r.program_id}|${r.day}|${r.set_number}|${r.weight}|${r.reps}|${r.rir}`;
   if(seen.has(key))return false;
   seen.add(key);return true;
 });
}

function resultDelta(v){
 let n=+v||0;
 if(n>0)return `<span class="delta-up">+${Number.isInteger(n)?n:n.toFixed(1)}</span>`;
 if(n<0)return `<span class="delta-down">${Number.isInteger(n)?n:n.toFixed(1)}</span>`;
 return `<span class="muted">0</span>`;
}

function toggleResultExercise(id,btn){
 let el=$('#'+id);if(!el)return;
 el.classList.toggle('hidden');
 let a=btn.querySelector('.arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';
}


function resultDelta(v){
 let n=+v||0;
 if(n>0)return `<span class="delta-up">+${Number.isInteger(n)?n:n.toFixed(1)}</span>`;
 if(n<0)return `<span class="delta-down">${Number.isInteger(n)?n:n.toFixed(1)}</span>`;
 return `<span class="muted">0</span>`;
}

function toggleResultExercise(id,btn){
 let el=$('#'+id);if(!el)return;
 el.classList.toggle('hidden');
 let a=btn.querySelector('.arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';
}

function trainerResultDates(d,dayName){
 let program=(d.program||[]).filter(x=>x.day_name===dayName),pids=new Set(program.map(x=>x.id));
 let ss=(d.workout_sessions||[]).filter(s=>s.day_name===dayName);
 ss.forEach(s=>{if(s.program_snapshot){try{JSON.parse(s.program_snapshot).forEach(x=>pids.add(x.id))}catch(e){}}});
 let sessions=(d.workout_sessions||[]).filter(s=>s.day_name===dayName&&s.status==='finished');
 let sessionDates=sessions.map(s=>sessionDay(s)).filter(Boolean);
 let setDates=(d.result_sets||[]).filter(r=>pids.has(r.program_id)).map(r=>r.day);
 return [...new Set([...sessionDates,...setDates])].sort().reverse();
}

function periodStart(period){
 let d=new Date();
 if(period==='30')d.setDate(d.getDate()-30);
 else if(period==='90')d.setDate(d.getDate()-90);
 else if(period==='180')d.setDate(d.getDate()-180);
 else return null;
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}


function toggleWorkoutResult(id,btn){
 let el=$('#'+id);if(!el)return;
 el.classList.toggle('hidden');
 let a=btn.querySelector('.arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';
}


function trainerDayResultsHTML(d,dayName){
 let baseProgram=(d.program||[]).filter(x=>x.day_name===dayName);
 let allDates=trainerResultDates(d,dayName);
 let period=window.trainerResultsPeriod||'90',from=periodStart(period);
 let customFrom=window.trainerResultsFrom||'',customTo=window.trainerResultsTo||'';
 let dates=allDates.filter(day=>{
   if(period==='custom')return (!customFrom||day>=customFrom)&&(!customTo||day<=customTo);
   return !from||day>=from;
 });
 let limit=window.trainerResultsLimit||5,shown=dates.slice(0,limit);

 if(!dates.length)return `<div class="card"><p class="muted">У вибраному періоді немає тренувань ${esc(dayName)}.</p></div>`;

 let cards=shown.map(day=>{
   let allIndex=allDates.indexOf(day),previous=allDates[allIndex+1]||null;
   let program=sessionProgramForDate(d,dayName,day);
   let exercises=program.filter(x=>(d.result_sets||[]).some(r=>r.program_id===x.id&&r.day===day));
   let workoutBodyId=`workoutResult_${dayName.replace(/[^a-zA-Z0-9]/g,'_')}_${day.replaceAll('-','_')}`;
   let cardSession=(d.workout_sessions||[]).filter(s=>s.day_name===dayName&&sessionDay(s)===day).sort((a,b)=>b.id-a.id)[0];
   return `<div class="card" data-workout-day="${esc(day)}" data-workout-session="${cardSession?.id||0}" style="padding:0;overflow:hidden">
    <button class="exercise-toggle" onclick="toggleWorkoutResult('${workoutBodyId}',this)" style="padding:20px 24px">
      <span><strong style="font-size:18px">${esc(dayName)} · ${esc(day)}</strong>${previous?`<span class="muted" style="display:block;margin-top:5px">порівняно з ${esc(previous)}</span>`:''}</span>
      <span class="arrow">⌄</span>
    </button>
    <div id="${workoutBodyId}" class="hidden" style="padding:0 24px 22px">
    ${(()=>{
      let ws=(d.workout_sessions||[]).filter(s=>s.day_name===dayName&&sessionDay(s)===day).sort((a,b)=>b.id-a.id)[0];
      if(!ws)return '';
      return `<div class="exercise" style="margin-bottom:14px">${ws.trainer_reviewed?`<strong style="color:#6ee787">Перевірено тренером ✓</strong>${ws.trainer_comment?`<div style="margin-top:7px">${esc(ws.trainer_comment)}</div>`:''}`:`<strong style="color:var(--yellow)">Нове тренування</strong><textarea id="reviewComment${ws.id}" placeholder="Коментар клієнту (необов’язково)..." style="width:100%;min-height:75px;margin-top:10px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:12px;font:inherit"></textarea><div class="review-actions"><button onclick="reviewWorkout(${ws.id},${d.client.id},true,event.currentTarget)">Надіслати та позначити перевіреним</button><button class="dark" onclick="reviewWorkout(${ws.id},${d.client.id},false,event.currentTarget)">Перевірено без коментаря</button></div>`}</div>`;
    })()}
    ${exercises.map(x=>{
      let cur=uniqueResultSets((d.result_sets||[]).filter(r=>r.program_id===x.id&&r.day===day)).sort((a,b)=>a.set_number-b.set_number);
      let prev=previous?uniqueResultSets((d.result_sets||[]).filter(r=>r.program_id===x.id&&r.day===previous)).sort((a,b)=>a.set_number-b.set_number):[];
      let bodyId=`trainerResult_${x.id}_${day.replaceAll('-','_')}`;
      return `<div class="exercise">
       <button class="exercise-toggle" onclick="toggleResultExercise('${bodyId}',this)">
        <span><strong>${esc(x.exercise)}</strong>${x.technique_url?` <a href="${esc(x.technique_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="tech-link">Техніка</a>`:'' }${x.superset_group?`<span class="badge" style="margin-left:8px;color:var(--yellow)">Суперсет</span>`:''}<span class="muted" style="display:block;margin-top:5px">${cur.length} підходи</span></span><span class="arrow">⌄</span>
       </button>
       <div id="${bodyId}" class="hidden" style="margin-top:10px">${cur.map(s=>{
        let p=prev.find(z=>z.set_number===s.set_number);
        return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div>Підхід ${s.set_number}: <strong>${s.weight} кг × ${s.reps}</strong> · RIR ${s.rir}</div>${p?`<div class="muted" style="margin-top:4px">Минулого ${p.weight} кг × ${p.reps} · різниця: вага ${resultDelta((+s.weight)-(+p.weight))} кг · повтори ${resultDelta((+s.reps)-(+p.reps))}</div>`:'<div class="muted" style="margin-top:4px">Немає попереднього результату для порівняння.</div>'}</div>`;
       }).join('')}</div>
      </div>`;
    }).join('')}
    </div>
   </div>`;
 }).join('');

 return cards+(dates.length>shown.length?`<div style="text-align:center;margin:16px 0 28px"><button class="dark" onclick="window.trainerResultsLimit=(window.trainerResultsLimit||5)+5;document.querySelector('#results').innerHTML=resultsHTML(window.currentClientData)">Показати ще (${dates.length-shown.length})</button></div>`:'');
}

function setResultsPeriod(p){
 window.trainerResultsPeriod=p;window.trainerResultsLimit=5;
 document.querySelector('#results').innerHTML=resultsHTML(window.currentClientData);
}

function applyCustomResultsPeriod(){
 window.trainerResultsFrom=$('#resultsFrom').value;window.trainerResultsTo=$('#resultsTo').value;
 window.trainerResultsPeriod='custom';window.trainerResultsLimit=5;
 document.querySelector('#results').innerHTML=resultsHTML(window.currentClientData);
}

function resetCustomResultsPeriod(){window.trainerResultsFrom='';window.trainerResultsTo='';window.trainerResultsPeriod='90';window.trainerResultsLimit=5;let box=$('#results');if(box)box.innerHTML=resultsHTML(window.currentClientData)}

function refreshTrainerResults(){let box=$('#results');if(box)box.innerHTML=resultsHTML(window.currentClientData||{})}

function resultsHTML(d){
 let c=d?.client||{};
 let period=window.trainerResultsPeriod||'90',from=periodStart(period);
 let inPeriod=day=>!from||!day||day>=from;
 let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished'&&inPeriod(sessionDay(x)));
 let measures=(d.measurements||[]).filter(x=>x.day&&inPeriod(x.day)).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let allMeasures=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let firstM=measures[0],lastM=measures[measures.length-1];
 let weightNow=lastM&&+lastM.weight>0?+lastM.weight:null;
 let weightDelta=firstM&&lastM&&+firstM.weight>0&&+lastM.weight>0?(+lastM.weight-+firstM.weight):null;

 let programGroups={};(d.program||[]).forEach(x=>{let day=x.day_name||'День';(programGroups[day]??=[]).push(x)});
 let programDays=Object.keys(programGroups);
 if(window.trainerResultsDay&&!programGroups[window.trainerResultsDay])window.trainerResultsDay=null;
 let selectedDay=window.trainerResultsDay||null;
 let selectedProgram=selectedDay?(programGroups[selectedDay]||[]):[];
 let selectedIds=new Set(selectedProgram.map(x=>+x.id).filter(Boolean));
 let currentProgramById=Object.fromEntries(selectedProgram.map(x=>[+x.id,x]));
 let sets=(d.result_sets||[]).filter(x=>x.day&&inPeriod(x.day)&&(selectedDay?selectedIds.has(+x.program_id):false));
 let byExercise={};
 sets.forEach(x=>{let key=(+x.program_id)+'::'+String(x.exercise||'');(byExercise[key]||(byExercise[key]=[])).push(x)});
 let exerciseRows=Object.entries(byExercise).map(([programKey,xs])=>{
   let pid=+String(programKey).split('::')[0],current=currentProgramById[pid]||{},performedName=xs[xs.length-1]?.exercise||current.exercise||'Вправа';
   let dates=[...new Set(xs.map(x=>x.day))].sort();
   let firstDay=dates[0],lastDay=dates[dates.length-1];
   let firstSets=xs.filter(x=>x.day===firstDay),lastSets=xs.filter(x=>x.day===lastDay);
   let best=a=>a.slice().sort((x,y)=>(+y.weight||0)-(+x.weight||0)||(+y.reps||0)-(+x.reps||0))[0]||{};
   let a=best(firstSets),b=best(lastSets);
   return {program_id:pid,name:performedName,exercise_name:performedName,dates,first:a,last:b,change:(+b.weight||0)-(+a.weight||0),count:dates.length};
 }).sort((a,b)=>selectedProgram.findIndex(x=>+x.id===+a.program_id)-selectedProgram.findIndex(x=>+x.id===+b.program_id));

 let periodLabel=period==='30'?'30 днів':period==='90'?'3 місяці':period==='180'?'6 місяців':'Весь час';
 let statWeight=weightNow!==null?`${fmtProgress(weightNow)} кг`:'—';
 let statDelta=weightDelta!==null?`${weightDelta>0?'+':''}${fmtProgress(weightDelta)} кг`:'—';
 let dayButtons=programDays.map(day=>{let safe=esc(day).replace(/'/g,"&#39;");return `<button class="progress-day-btn ${selectedDay===day?'active':''}" onclick="window.trainerResultsDay=(window.trainerResultsDay==='${safe}'?null:'${safe}');refreshTrainerResults()">${esc(day)}</button>`}).join('');

 return `<div id="trainerResultsProgress" class="client-progress-new">
  <div class="progress-hero">
   <div><h1>Результати${c.name?` · ${esc(c.name)}`:''}</h1><p class="muted">Головне про прогрес клієнта в одному місці.</p></div>
   <div class="progress-periods">${[['30','1 міс.'],['90','3 міс.'],['180','6 міс.'],['all','Увесь час']].map(([v,t])=>`<button class="${period===v?'':'dark'}" onclick="window.trainerResultsPeriod='${v}';refreshTrainerResults()">${t}</button>`).join('')}</div>
  </div>

  <div class="progress-stats">
   <div class="progress-stat"><span>Тренувань</span><strong>${sessions.length}</strong><small>${periodLabel}</small></div>
   <div class="progress-stat"><span>Вага</span><strong>${statWeight}</strong><small>${lastM?.day?formatProgressDate(lastM.day):'Немає даних'}</small></div>
   <div class="progress-stat"><span>Зміна ваги</span><strong class="${weightDelta!==null&&weightDelta<0?'good':''}">${statDelta}</strong><small>за період</small></div>
  </div>

  <div class="card progress-section">
   <div class="progress-section-head"><div><h2>Силові показники</h2><p class="muted">Обери тренувальний день і переглянь прогрес вправ за вибраний період.</p></div></div>
   ${programDays.length?`<div class="progress-day-grid">${dayButtons}</div>`:'<div class="progress-empty">Тренувальна програма ще не додана.</div>'}
   ${selectedDay?`<div class="progress-selected-day"><strong>${esc(selectedDay)}</strong><span>${periodLabel}</span></div>${exerciseRows.length?`<div class="strength-list">${exerciseRows.map((x,i)=>strengthProgressCard(x,'trainer'+i)).join('')}</div>`:'<div class="progress-empty">За цей період ще немає результатів для вправ цього дня.</div>'}`:(programDays.length?'<div class="progress-empty progress-day-hint">Обери день тренування вище.</div>':'')}
  </div>

  <div class="card progress-section">
   <button class="exercise-toggle" onclick="toggleCalendar('trainerBodyProgressDetails',this)">
    <span><strong>Зміни тіла</strong><span class="muted" style="display:block;margin-top:5px">${lastM?'Останні актуальні заміри':'Заміри ще не додані'}</span></span><span class="arrow">⌄</span>
   </button>
   <div id="trainerBodyProgressDetails" class="hidden" style="margin-top:14px">${bodyProgressHTML(allMeasures,period)}</div>
  </div>
 </div>`;
}



function trainerMeasurementsResultsHTML(d){
 let cid=d?.client?.id||0;
 let xs=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let last=xs[xs.length-1],prev=xs[xs.length-2];
 if(!last)return `<div class="card trainer-measure-results"><button class="exercise-toggle trainer-measure-summary-toggle" onclick="toggleCalendar('trainerMeasureSummary',this)"><span><strong>Заміри тіла</strong><span class="muted" style="display:block;margin-top:5px">Клієнт ще не додав заміри</span></span><span class="arrow">⌄</span></button><div id="trainerMeasureSummary" class="hidden" style="margin-top:16px"><p class="muted">Після першого заміру тут з’являться актуальні показники та історія змін.</p></div></div>`;
 return `<div class="card trainer-measure-results">
  <div class="results-measure-head"><div><h2>Заміри тіла</h2><p class="muted">Останній замір · ${formatProgressDate(last.day)}</p></div><span class="trainer-meta-chip ok">${xs.length} ${xs.length===1?'запис':'записів'}</span></div>
  ${measurementMetricCards(last,prev)}
  ${prev?`<div class="trainer-measure-change-title">Зміни з минулого разу <span>· ${formatProgressDate(prev.day)}</span></div>${measurementChangesHTML(last,prev)}`:''}
  <button class="exercise-toggle trainer-measure-history-toggle" onclick="toggleCalendar('trainerMeasurementHistory',this)"><span><strong>Історія замірів</strong><span class="muted" style="display:block;margin-top:5px">Переглянути всі контрольні точки</span></span><span class="arrow">⌄</span></button>
  <div id="trainerMeasurementHistory" class="hidden measurement-history">${xs.slice().reverse().map((x,i,rev)=>measurementHistoryCard(x,rev[i+1],cid)).join('')}</div>
 </div>`;
}
