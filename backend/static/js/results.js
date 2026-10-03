// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function fmtProgress(v){return Number(v).toFixed(1).replace('.0','')}

function formatProgressDate(s){try{return new Date(s+'T12:00:00').toLocaleDateString('uk-UA',{day:'numeric',month:'short'})}catch(e){return s}}

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
   let clients=await loadClients();
   let current=clients.find(c=>+c.id===+cid),currentRemaining=+current?.needs_review_count||0;
   let remaining=clients.reduce((s,c)=>s+(+c.needs_review_count||0),0);
   await openClient(cid,'program');
   if(currentRemaining>0){
     setTimeout(openFirstPendingWorkout,160);
   }else if(remaining>0){
     setTimeout(()=>{document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="nextReviewModal"><div class="card"><h2>Тренування перевірено ✓</h2><p class="muted">У цього клієнта все перевірено. Ще очікують перевірки: ${remaining}</p><button style="width:100%" onclick="nextReviewModal.remove();openNextPendingClient(${cid})">Наступний клієнт →</button><button class="dark" style="width:100%;margin-top:8px" onclick="nextReviewModal.remove()">Залишитися тут</button></div></div>`)},120);
   }
 }catch(e){restore();alert(e.message||'Не вдалося позначити тренування перевіреним. Спробуй ще раз.')}
}

async function openNextPendingClient(currentCid){
 let cs=await loadClients(),next=cs.find(c=>c.id!==currentCid&&(+c.needs_review_count||0)>0)||cs.find(c=>(+c.needs_review_count||0)>0);
 if(!next)return trainerHome();
 await openClient(next.id,'program');
 setTimeout(openFirstPendingWorkout,180);
}


function trainerReviewExerciseRowsHTML(d,session){
 let day=sessionDay(session),dayName=session.day_name||'Тренування';
 let snap=sessionProgramForDate(d,dayName,day);
 let sets=(d.result_sets||[]).filter(x=>x.day===day);
 let exercises=(snap||[]).filter(x=>sets.some(s=>+s.program_id===+x.id));
 if(!exercises.length){
   let grouped={};
   sets.forEach(s=>{
     let key=String(+s.program_id||0)+'::'+String(s.exercise||'Вправа');
     if(!grouped[key])grouped[key]={id:+s.program_id||0,exercise:s.exercise||'Вправа'};
   });
   exercises=Object.values(grouped);
 }
 if(!exercises.length)return '<div class="trainer-review-empty-detail">Немає збережених підходів для цього тренування.</div>';
 return exercises.map(x=>{
   let cur=uniqueResultSets(sets.filter(s=>+s.program_id===+x.id)).sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   return '<div class="trainer-review-exercise">'
     +'<div class="trainer-review-exercise-head"><strong>'+esc(x.exercise||'Вправа')+'</strong><span>'+cur.length+' підходи</span></div>'
     +'<div class="trainer-review-sets">'+cur.map(s=>'<div><small>Підхід '+esc(String(s.set_number||''))+'</small><b>'+esc(String(s.weight??0))+' кг × '+esc(String(s.reps??0))+'</b><em>RIR '+esc(String(s.rir??'—'))+'</em></div>').join('')+'</div>'
   +'</div>';
 }).join('');
}

function trainerPendingReviewsHTML(d){
 let pending=(d.workout_sessions||[]).filter(x=>x.status==='finished'&&!x.trainer_reviewed)
   .slice().sort((a,b)=>String(b.finished_at||b.started_at||'').localeCompare(String(a.finished_at||a.started_at||''))||(+b.id||0)-(+a.id||0));
 if(!pending.length)return '';
 return '<section id="trainerPendingReviewQueue" class="trainer-review-queue">'
   +'<div class="trainer-review-queue-head"><div><small>ПОТРЕБУЄ УВАГИ</small><h2>Тренування до перевірки</h2><p>Перевір завершені тренування клієнта й за потреби залиш коментар.</p></div><span>'+pending.length+'</span></div>'
   +'<div class="trainer-review-list">'+pending.map((s,i)=>{
     let day=sessionDay(s)||'—',name=s.day_name||'Тренування',bodyId='trainerPendingReview_'+s.id;
     return '<div class="trainer-review-card" data-pending="1" data-session="'+(+s.id||0)+'">'
       +'<button type="button" class="trainer-review-toggle" data-target="'+bodyId+'" onclick="toggleTrainerPendingReview(this)">'
         +'<span class="trainer-review-main"><small>'+esc(day)+'</small><strong>'+esc(name)+'</strong></span>'
         +(s.duration_seconds!==undefined?workoutDurationBadgeHTML(s,'trainer-review-duration'):'')
         +'<span class="trainer-review-badge">До перевірки</span><b class="trainer-review-arrow">⌄</b>'
       +'</button>'
       +'<div id="'+bodyId+'" class="trainer-review-detail hidden">'
         +trainerReviewExerciseRowsHTML(d,s)
         +'<label class="trainer-review-comment"><span>Коментар клієнту <small>необов’язково</small></span><textarea id="reviewComment'+s.id+'" placeholder="Наприклад: у жимі ногами наступного разу залиш 1–2 повтори в запасі..."></textarea></label>'
         +'<div class="trainer-review-actions"><button onclick="reviewWorkout('+s.id+','+d.client.id+',true,event.currentTarget)">Надіслати та перевірити</button><button class="dark" onclick="reviewWorkout('+s.id+','+d.client.id+',false,event.currentTarget)">Без коментаря</button></div>'
       +'</div>'
     +'</div>';
   }).join('')+'</div>'
 +'</section>';
}

function trainerTrainingTabHTML(d){
 return trainerPendingReviewsHTML(d)+programHTML(d);
}

function toggleTrainerPendingReview(btn){
 let id=btn?.dataset?.target,body=id?document.getElementById(id):null,card=btn?.closest('.trainer-review-card');
 if(!body)return;
 let open=body.classList.contains('hidden');
 body.classList.toggle('hidden',!open);
 card?.classList.toggle('is-open',open);
 let arrow=btn.querySelector('.trainer-review-arrow');if(arrow)arrow.textContent=open?'⌃':'⌄';
}

function openFirstPendingWorkout(){
 let card=document.querySelector('#trainerPendingReviewQueue .trainer-review-card[data-pending="1"]');
 if(!card)return;
 let btn=card.querySelector('.trainer-review-toggle'),body=card.querySelector('.trainer-review-detail');
 if(body?.classList.contains('hidden'))toggleTrainerPendingReview(btn);
 setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),40);
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
 let el=document.getElementById(id);if(!el)return;
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
 let el=document.getElementById(id);if(!el)return;
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
    <button class="exercise-toggle" data-target="${esc(workoutBodyId)}" onclick="toggleWorkoutResult(this.dataset.target,this)" style="padding:20px 24px">
      <span><strong style="font-size:18px">${esc(dayName)} · ${esc(day)}</strong><span class="trainer-workout-meta">${cardSession?.duration_seconds!==undefined?workoutDurationBadgeHTML(cardSession,'trainer-history-duration'):''}${previous?`<span class="muted">порівняно з ${esc(previous)}</span>`:''}</span></span>
      <span class="arrow">⌄</span>
    </button>
    <div id="${esc(workoutBodyId)}" class="hidden" style="padding:0 24px 22px">
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
       <button class="exercise-toggle" data-target="${esc(bodyId)}" onclick="toggleResultExercise(this.dataset.target,this)">
        <span><strong>${esc(x.exercise)}</strong>${x.technique_url?` ${techniqueLinkHTML(x.technique_url,'Техніка',true)}`:'' }${x.superset_group?`<span class="badge" style="margin-left:8px;color:var(--yellow)">Суперсет</span>`:''}<span class="muted" style="display:block;margin-top:5px">${cur.length} підходи</span></span><span class="arrow">⌄</span>
       </button>
       <div id="${esc(bodyId)}" class="hidden" style="margin-top:10px">${cur.map(s=>{
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
 let dayButtons=programDays.map(day=>{return `<button class="progress-day-btn ${selectedDay===day?'active':''}" data-day="${esc(day)}" onclick="window.trainerResultsDay=(window.trainerResultsDay===this.dataset.day?null:this.dataset.day);refreshTrainerResults()">${esc(day)}</button>`}).join('');

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
 let xs=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day)||(+a.id||0)-(+b.id||0));
 let last=xs[xs.length-1],prev=xs[xs.length-2];
 if(!last){
   return '<div class="measurements-page trainer-measurements-page"><div class="card trainer-measure-empty"><strong>Заміри ще не додані</strong><p class="muted">Коли клієнт внесе перші заміри, вони з’являться тут.</p></div></div>';
 }
 return '<div class="measurements-page trainer-measurements-page">'
   +'<div class="measurement-visual-overview">'
     +'<div class="measurement-section-title"><div><h2>Останні заміри</h2><p class="muted">'+esc(formatProgressDate(last.day))+'</p></div><span class="trainer-measure-count">'+xs.length+' '+(xs.length===1?'запис':'записів')+'</span></div>'
     +measurementWeightVisual(last,prev,d)
     +'<div class="measurement-visual-subhead"><h3>Вимірювання тіла</h3><span>Останні значення</span></div>'
     +measurementVisualCards(last,prev,d)
   +'</div>'
   +(xs.length>1?measurementComparisonHTML(xs):'')
   +(xs.length?'<div id="measurementHistoryCalendar">'+measurementHistoryCalendarHTML(xs,cid)+'</div>':'')
 +'</div>';
}
