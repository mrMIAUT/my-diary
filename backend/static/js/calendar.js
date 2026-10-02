// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function toggleExercise(id,btn){let b=document.getElementById(id);if(!b)return;b.classList.toggle('hidden');btn.classList.toggle('open')}

function kyivTodayLong(){
 const text=new Intl.DateTimeFormat('uk-UA',{
  timeZone:'Europe/Kyiv',weekday:'long',day:'numeric',month:'long',year:'numeric'
 }).format(new Date());
 return text.charAt(0).toUpperCase()+text.slice(1);
}

function isoToday(){
 try{
   let parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
   let p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
   return `${p.year}-${p.month}-${p.day}`;
 }catch(e){let x=new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
}

function diaryDayParts(day){
 try{
  let [y,m,d]=String(day||'').split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d,12));
  let date=new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(dt);
  let weekday=new Intl.DateTimeFormat('uk-UA',{weekday:'long',timeZone:'UTC'}).format(dt);
  return {date,weekday:weekday.charAt(0).toUpperCase()+weekday.slice(1)};
 }catch(e){return {date:String(day||''),weekday:''}}
}

function sessionDay(s){return String(s?.workout_day||s?.started_at||s?.finished_at||'').slice(0,10)}

function monthKey(day){return day ? day.slice(0,7) : ''}

function calendarHTML(d,mode='trainer'){
 let days=[...(d.result_sets||[]).map(x=>x.day),...(d.results||[]).map(x=>x.day),...(d.nutrition||[]).map(x=>x.day),...(d.measurements||[]).map(x=>x.day),...(d.cardio||[]).map(x=>x.day)].filter(Boolean);
 let unique=[...new Set(days)];
 if(!calendarMonth) calendarMonth=(unique.sort().reverse()[0]||isoToday()).slice(0,7);
 let ym=calendarMonth,[yy,mm]=ym.split('-').map(Number);
 let first=new Date(yy,mm-1,1),count=new Date(yy,mm,0).getDate(),start=(first.getDay()+6)%7;
 let cells='';for(let i=0;i<start;i++)cells+='<button class="calendar-day empty"></button>';
 for(let n=1;n<=count;n++){let day=ym+'-'+String(n).padStart(2,'0'),has=unique.includes(day);cells+=`<button class="calendar-day ${has?'has-data':''}" data-day="${esc(day)}" onclick="showCalendarDay(this.dataset.day,this)">${n}</button>`}
 let monthNames=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
 return `<div class="card"><div class="calendar-head"><button class="dark" onclick="changeCalendarMonth(-1,'${mode}')">←</button><div style="text-align:center"><h2 style="margin-bottom:4px">${monthNames[mm-1]} ${yy}</h2></div><button class="dark" onclick="changeCalendarMonth(1,'${mode}')">→</button></div><div class="calendar-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(x=>`<div class="calendar-weekday">${x}</div>`).join('')}${cells}</div><div id="calendarDetails" class="day-details muted">${unique.length?'Натисни на день, щоб переглянути записи.':'Тут з’явиться історія після першого тренування, запису харчування, активності або замірів.'}</div></div>`;
}

function toggleCalendar(id,btn){
 let el=$('#'+id);if(!el)return;
 el.classList.toggle('hidden');
 btn.classList.toggle('open');
 let a=btn.querySelector('.arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';
}

function changeCalendarMonth(delta,mode){
 let [y,m]=calendarMonth.split('-').map(Number),d=new Date(y,m-1+delta,1);
 calendarMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
 let data=window.currentClientData||{};
 if(mode==='trainer'){let el=$('#trainerCalendarBody');if(el)el.innerHTML=calendarHTML(data,'trainer')}
 else {let el=$('#clientCalendar');if(el)el.innerHTML=calendarHTML(data,'client')}
}


function historyNutritionForm(day,cid){
 return `<div class="exercise history-nutrition-empty"><span>Харчування за цей день не внесено.</span><button class="history-nutrition-add" data-day="${esc(day)}" onclick="openHistoryNutritionEntry(this.dataset.day,${cid})">Додати БЖВ</button></div>`;
}

function openHistoryNutritionEntry(day,cid){
 document.getElementById('historyNutritionModal')?.remove();
 let pretty=formatProgressDate(day);
 document.body.insertAdjacentHTML('beforeend',
  '<div class="modal" id="historyNutritionModal"><div class="card redesign-nutrition-modal history-nutrition-modal">'
  +'<div class="history-nutrition-head"><div><h2>БЖВ за '+esc(pretty)+'</h2><p class="muted">Внеси підсумок харчування за цей день.</p></div><button class="history-nutrition-close" onclick="historyNutritionModal.remove()" aria-label="Закрити">×</button></div>'
  +'<div class="grid"><input id="hkcal" type="number" inputmode="decimal" placeholder="Ккал"><input id="hprotein" type="number" inputmode="decimal" placeholder="Білки, г"><input id="hfat" type="number" inputmode="decimal" placeholder="Жири, г"><input id="hcarbs" type="number" inputmode="decimal" placeholder="Вуглеводи, г"></div>'
  +'<button class="history-nutrition-save" data-day="'+esc(day)+'" onclick="saveHistoryNutrition(this.dataset.day,'+cid+',this)">Зберегти БЖВ</button>'
  +'</div></div>');
}

async function saveHistoryNutrition(day,cid,button=null){
 let els=['hkcal','hprotein','hfat','hcarbs'].map(id=>document.getElementById(id));
 if(els.some(el=>!el||String(el.value).trim()===''))return alert('Заповни калорії, білки, жири та вуглеводи.');
 let [kcal,protein,fat,carbs]=els.map(el=>+el.value);
 if([kcal,protein,fat,carbs].some(v=>!Number.isFinite(v)||v<0))return alert('Перевір значення БЖВ.');
 if(kcal>10000)return alert('Перевір калорії: значення понад 10 000 ккал виглядає помилковим.');
 if(protein>1000||fat>1000||carbs>1000)return alert('Перевір БЖВ: значення понад 1000 г виглядає помилковим.');
 if(button){button.disabled=true;button.textContent='Зберігаємо…'}
 try{
  let body={client_id:cid,day,kcal,protein,fat,carbs};
  await api('/history/nutrition',{method:'POST',body:JSON.stringify(body)});
  document.getElementById('historyNutritionModal')?.remove();
  let d=await loadClientData(cid);window.currentClientData=d;showCalendarDay(day,null,false);
 }catch(e){
  if(button){button.disabled=false;button.textContent='Зберегти БЖВ'}
  alert(e.message||'Не вдалося зберегти БЖВ.');
 }
}

function historyWorkoutForm(day,cid,d){
 let groups={};(d.program||[]).forEach(x=>(groups[x.day_name]??=[]).push(x));
 return `<div class="exercise"><div class="muted">Додати пропущене тренування</div><select id="historyDaySelect" data-day="${esc(day)}" onchange="renderHistoryWorkoutExercises(this.dataset.day,${cid})" style="width:100%;margin-top:10px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:14px"><option value="">Оберіть тренування</option>${Object.keys(groups).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select><div id="historyWorkoutExercises"></div></div>`;
}

function renderHistoryWorkoutExercises(day,cid){
 let d=window.currentClientData||{},name=$('#historyDaySelect').value,items=(d.program||[]).filter(x=>x.day_name===name),box=$('#historyWorkoutExercises');if(!box)return;
 box.innerHTML=items.map(x=>`<div class="exercise"><strong>${esc(x.exercise)}</strong>${x.technique_url?` ${techniqueLinkHTML(x.technique_url,'Техніка',true)}`:'' }${x.superset_group?`<span class="badge" style="margin-left:8px;color:var(--yellow)">Суперсет</span>`:''}${Array.from({length:x.sets},(_,i)=>`<div class="setrow"><div class="setnum">${i+1}</div><input id="hw${x.id}_${i+1}" type="number" step="0.5" placeholder="кг"><input id="hr${x.id}_${i+1}" type="number" placeholder="${esc(x.reps)}"><input id="hi${x.id}_${i+1}" type="number" value="${x.target_rir}" min="0" max="10"></div>`).join('')}</div>`).join('')+`<button data-day="${esc(day)}" data-day-name="${esc(name)}" onclick="saveHistoryWorkout(this.dataset.day,${cid},this.dataset.dayName)">Зберегти тренування</button>`;
}

async function saveHistoryWorkout(day,cid,name){
 let d=window.currentClientData||{},items=(d.program||[]).filter(x=>x.day_name===name),sets=[];
 for(let x of items){for(let n=1;n<=x.sets;n++){let w=$('#hw'+x.id+'_'+n),r=$('#hr'+x.id+'_'+n),i=$('#hi'+x.id+'_'+n);if(!w||(!w.value&&!r.value))continue;if(!w.value||!r.value)return alert('Заповни вагу та повтори');sets.push({program_id:x.id,exercise:x.exercise,set_number:n,weight:+w.value,reps:+r.value,rir:+i.value||0})}}
 if(!sets.length)return alert('Додай хоча б один підхід');
 await api('/history/workout',{method:'POST',body:JSON.stringify({client_id:cid,day,day_name:name,sets})});
 let nd=await loadClientData(cid);window.currentClientData=nd;showCalendarDay(day,null,false)
}


function showCalendarDay(day,btn,pushHistory=true,targetSessionId=0){
 if(pushHistory){
   let base=session?.role==='trainer'?{eplanPage:'client',eplanClient:selected,eplanTab:'calendar'}:{eplanPage:'clientHome',eplanClient:session?.client_id,eplanSection:'history'};
   history.replaceState(base,'',location.href);
   history.pushState({...base,eplanPage:'calendarDay',eplanDay:day},'',location.pathname+location.search+'#day-'+day);
 }
 let d=window.currentClientData||{};
 let sets=uniqueResultSets((d.result_sets||[]).filter(x=>x.day===day));
 let old=(d.results||[]).filter(x=>x.day===day);
 let nut=(d.nutrition||[]).filter(x=>x.day===day).sort((a,b)=>b.id-a.id);
 let cardio=(d.cardio||[]).filter(x=>x.day===day).sort((a,b)=>(+b.id||0)-(+a.id||0));
 let sessions=(d.workout_sessions||[]).filter(x=>sessionDay(x)===day).sort((a,b)=>b.id-a.id);
 let workoutSession=(targetSessionId?sessions.find(s=>+s.id===+targetSessionId):null)||sessions[0]||null;
 let meas=(d.measurements||[]).filter(x=>x.day===day);

 let by={};sets.forEach(x=>{let k=x.program_id+'|'+x.exercise;(by[k]??=[]).push(x)});
 let workoutGroups=Object.values(by),workoutHTML='';
 if(workoutGroups.length){
   let programById=Object.fromEntries((d.program||[]).map(x=>[+x.id,x])),used=new Set(),chunks=[];
   workoutGroups.forEach((xs,gi)=>{
     if(used.has(gi))return;
     let px=programById[+xs[0].program_id],sg=px?.superset_group;
     if(sg){
       let pair=workoutGroups.map((ys,j)=>({ys,j,p:programById[+ys[0].program_id]})).filter(o=>o.p?.superset_group===sg);
       pair.forEach(o=>used.add(o.j));
       chunks.push(`<div class="calendar-workout-superset"><div class="calendar-workout-superset-head"><strong>Суперсет</strong><span>виконати вправи по черзі</span></div><div class="calendar-workout-superset-body">${pair.map((o,pi)=>{let ys=o.ys.slice().sort((a,b)=>a.set_number-b.set_number),bid=`calWorkout_${day.replaceAll('-','_')}_${o.j}`,planned=o.p?.exercise||'',performed=ys[0].exercise||'';return `<div class="calendar-workout-exercise ${pi?'with-divider':''}"><button class="exercise-toggle calendar-workout-toggle" data-target="${esc(bid)}" onclick="toggleExercise(this.dataset.target,this)"><span><strong>${esc(performed)}</strong>${planned&&planned!==performed?`<span class="calendar-workout-replacement">За планом: ${esc(planned)}</span>`:''}<span class="calendar-workout-count">${ys.length} підходи</span></span><span class="arrow">⌄</span></button><div id="${esc(bid)}" class="calendar-workout-details hidden">${ys.map(s=>`<div class="calendar-workout-set"><span>Підхід ${s.set_number}</span><strong>${s.weight} кг × ${s.reps}</strong><em>RIR ${s.rir}</em></div>`).join('')}</div></div>`}).join('')}</div></div>`);
     }else{
       used.add(gi);let ys=xs.slice().sort((a,b)=>a.set_number-b.set_number),bid=`calWorkout_${day.replaceAll('-','_')}_${gi}`,planned=px?.exercise||'',performed=ys[0].exercise||'';
       chunks.push(`<div class="calendar-workout-exercise standalone"><button class="exercise-toggle calendar-workout-toggle" data-target="${esc(bid)}" onclick="toggleExercise(this.dataset.target,this)"><span><strong>${esc(performed)}</strong>${planned&&planned!==performed?`<span class="calendar-workout-replacement">За планом: ${esc(planned)}</span>`:''}<span class="calendar-workout-count">${ys.length} підходи</span></span><span class="arrow">⌄</span></button><div id="${esc(bid)}" class="calendar-workout-details hidden">${ys.map(s=>`<div class="calendar-workout-set"><span>Підхід ${s.set_number}</span><strong>${s.weight} кг × ${s.reps}</strong><em>RIR ${s.rir}</em></div>`).join('')}</div></div>`);
     }
   });
   workoutHTML=chunks.join('');
 }else if(old.length){
   workoutHTML=old.map((x,gi)=>{let bid=`calOldWorkout_${day.replaceAll('-','_')}_${gi}`;return `<div class="calendar-workout-exercise standalone"><button class="exercise-toggle calendar-workout-toggle" data-target="${esc(bid)}" onclick="toggleExercise(this.dataset.target,this)"><span><strong>${esc(x.exercise)}</strong><span class="calendar-workout-count">${x.sets} підходи</span></span><span class="arrow">⌄</span></button><div id="${esc(bid)}" class="calendar-workout-details hidden">${x.technique_url?techniqueLinkHTML(x.technique_url):''}<div class="calendar-workout-set"><strong>${x.weight} кг × ${x.reps}</strong><em>RIR ${x.rir}</em></div></div></div>`}).join('');
 }else workoutHTML='<div class="exercise muted">Тренування за цей день не записано.</div>'+((session?.role==='trainer')?'':(d.client.status==='Заморожений'?'<div class="exercise muted">Акаунт на паузі: доступний лише перегляд історії.</div>':day<=isoToday()?historyWorkoutForm(day,d.client.id,d):'<div class="exercise muted">На майбутню дату дані додавати не можна.</div>'));

 let sessionHTML=workoutSession?`<div class="calendar-workout-session ${workoutSession.status==='finished'?'is-finished':'is-active'}" id="calendarWorkoutSession_${workoutSession.id}"><div class="calendar-workout-session-top"><strong>${esc(workoutSession.day_name)}</strong><span class="calendar-workout-session-status">${workoutSession.status==='finished'?'Завершено':'Тренування триває'}</span></div>${(+workoutSession.duration_seconds||0)>0?`<div class="calendar-workout-session-meta"><span class="calendar-workout-session-duration"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"/><path d="M12 13V9M9 3h6M12 6V3"/></svg><span>Тривалість</span><strong>${esc(formatWorkoutDuration(+workoutSession.duration_seconds||0))}</strong></span></div>`:''}${workoutSession.trainer_reviewed?`<div class="calendar-review-done"><strong>Перевірено тренером ✓</strong>${workoutSession.trainer_comment?`<div>${esc(workoutSession.trainer_comment)}</div>`:''}</div>`:(session?.role==='trainer'&&workoutSession.status==='finished'?`<div class="trainer-calendar-review"><strong>Потрібно перевірити</strong><textarea id="reviewComment${workoutSession.id}" placeholder="Коментар клієнту (необов’язково)..."></textarea><div class="review-actions"><button data-day="${esc(day)}" onclick="reviewWorkoutFromCalendar(${workoutSession.id},${d.client.id},this.dataset.day,true,event.currentTarget)">Надіслати та позначити перевіреним</button><button class="dark" data-day="${esc(day)}" onclick="reviewWorkoutFromCalendar(${workoutSession.id},${d.client.id},this.dataset.day,false,event.currentTarget)">Перевірено без коментаря</button></div></div>`:'')}</div>`:'';
 let nutritionHTML=nut.length?`<div class="exercise"><strong>${nut[0].kcal} ккал</strong><div class="muted">Б ${nut[0].protein} г · Ж ${nut[0].fat} г · В ${nut[0].carbs} г</div></div>`:((session?.role==='client'&&d.client.status!=='Заморожений'&&day<=isoToday())?historyNutritionForm(day,d.client.id):'<div class="exercise muted">Харчування за цей день не внесено.</div>');
 let cardioHTMLDay=cardio.length?(()=>{let x=cardio[0],parts=[];if(x.cardio_type)parts.push(esc(x.cardio_type));if(x.minutes)parts.push(`${x.minutes} хв`);if(x.speed&&x.cardio_type==='Доріжка')parts.push(`Швидкість ${x.speed}`);if(x.incline)parts.push(`${x.cardio_type==='Доріжка'?'Нахил':'Опір'} ${x.incline}${x.cardio_type==='Доріжка'?'%':''}`);if(x.steps)parts.push(`${x.steps} кроків`);return `<div class="exercise">${parts.length?`<div class="cardio-summary">${parts.map(v=>`<div class="cardio-chip">${v}</div>`).join('')}</div>`:'<div class="muted">Активність за цей день не внесено.</div>'}</div>`})():'<div class="exercise muted">Активність за цей день не внесено.</div>';
 let measures=meas.length?`<div class="card"><h2>Заміри</h2>${meas.map(x=>measurementRowHTML(x)).join('')}</div>`:'';

 let diaryDate=diaryDayParts(day);
 let content=`<button class="unified-back-button" onclick="returnFromCalendarDay()" aria-label="Назад до календаря">‹</button><div style="height:16px"></div><div class="card diary-day-hero"><div class="diary-day-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg></div><div class="diary-day-copy"><span class="diary-day-kicker">Щоденник</span><h1>${esc(diaryDate.date)}</h1><span class="diary-day-weekday">${esc(diaryDate.weekday)}</span></div></div><div class="card"><h2>Тренування</h2>${sessionHTML}${workoutHTML}</div><div class="card"><h2>Харчування</h2>${nutritionHTML}</div><div class="card"><h2>Активність</h2>${cardioHTMLDay}</div>${measures}`;
 window.calendarReturnHTML=app.innerHTML;
 app.innerHTML=shell(content);
}

async function reviewWorkoutFromCalendar(sid,cid,day,useComment=true,button=null){
 let restore=setActionLoading(button,'Перевіряємо…');
 let t=$('#reviewComment'+sid),comment=useComment&&t?t.value.trim():'';
 try{
  await api('/workout/'+sid+'/review',{method:'PATCH',body:JSON.stringify({comment})});
  let nd=await loadClientData(cid);window.currentClientData=nd;
  showCalendarDay(day,null,false,sid);refreshTrainerGlobalBadge();
 }catch(e){restore();alert(e.message||'Не вдалося позначити тренування перевіреним. Спробуй ще раз.')}
}

async function returnFromCalendarDay(){if(history.state?.eplanPage==='calendarDay'){history.back();return}if(session&&session.role==='trainer'&&selected){openClient(selected,'calendar');return}if(session&&session.role==='client'&&session.client_id){await clientCabinet(session.client_id);showClientSection('history');return}route()}
