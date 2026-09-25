// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function toggleExercise(id,btn){let b=$('#'+id);if(!b)return;b.classList.toggle('hidden');btn.classList.toggle('open')}

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

function sessionDay(s){return String(s?.workout_day||s?.started_at||s?.finished_at||'').slice(0,10)}

function monthKey(day){return day ? day.slice(0,7) : ''}

function calendarHTML(d,mode='trainer'){
 let days=[...(d.result_sets||[]).map(x=>x.day),...(d.results||[]).map(x=>x.day),...(d.nutrition||[]).map(x=>x.day),...(d.measurements||[]).map(x=>x.day),...(d.cardio||[]).map(x=>x.day)].filter(Boolean);
 let unique=[...new Set(days)];
 if(!calendarMonth) calendarMonth=(unique.sort().reverse()[0]||isoToday()).slice(0,7);
 let ym=calendarMonth,[yy,mm]=ym.split('-').map(Number);
 let first=new Date(yy,mm-1,1),count=new Date(yy,mm,0).getDate(),start=(first.getDay()+6)%7;
 let cells='';for(let i=0;i<start;i++)cells+='<button class="calendar-day empty"></button>';
 for(let n=1;n<=count;n++){let day=ym+'-'+String(n).padStart(2,'0'),has=unique.includes(day);cells+=`<button class="calendar-day ${has?'has-data':''}" data-day="${day}" onclick="showCalendarDay('${day}',this)">${n}</button>`}
 let monthNames=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
 return `<div class="card"><div class="calendar-head"><button class="dark" onclick="changeCalendarMonth(-1,'${mode}')">←</button><div style="text-align:center"><h2 style="margin-bottom:4px">${monthNames[mm-1]} ${yy}</h2><div class="muted">жовта крапка = є записи</div></div><button class="dark" onclick="changeCalendarMonth(1,'${mode}')">→</button></div><div class="calendar-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(x=>`<div class="calendar-weekday">${x}</div>`).join('')}${cells}</div><div id="calendarDetails" class="day-details muted">${unique.length?'Натисни на день, щоб переглянути записи.':'Тут з’явиться історія після першого тренування, запису харчування, активності або замірів.'}</div></div>`;
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
 return `<div class="exercise"><div class="grid"><input id="hkcal" type="number" placeholder="Ккал"><input id="hprotein" type="number" placeholder="Білки, г"><input id="hfat" type="number" placeholder="Жири, г"><input id="hcarbs" type="number" placeholder="Вуглеводи, г"></div><br><button onclick="saveHistoryNutrition('${day}',${cid})">Додати харчування</button></div>`;
}

async function saveHistoryNutrition(day,cid){
 let body={client_id:cid,day,kcal:+hkcal.value||0,protein:+hprotein.value||0,fat:+hfat.value||0,carbs:+hcarbs.value||0};
 await api('/history/nutrition',{method:'POST',body:JSON.stringify(body)});
 let d=await api('/client/'+cid);window.currentClientData=d;showCalendarDay(day,null,false)
}

function historyWorkoutForm(day,cid,d){
 let groups={};(d.program||[]).forEach(x=>(groups[x.day_name]??=[]).push(x));
 return `<div class="exercise"><div class="muted">Додати пропущене тренування</div><select id="historyDaySelect" onchange="renderHistoryWorkoutExercises('${day}',${cid})" style="width:100%;margin-top:10px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:14px"><option value="">Оберіть тренування</option>${Object.keys(groups).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select><div id="historyWorkoutExercises"></div></div>`;
}

function renderHistoryWorkoutExercises(day,cid){
 let d=window.currentClientData||{},name=$('#historyDaySelect').value,items=(d.program||[]).filter(x=>x.day_name===name),box=$('#historyWorkoutExercises');if(!box)return;
 box.innerHTML=items.map(x=>`<div class="exercise"><strong>${esc(x.exercise)}</strong>${x.technique_url?` <a href="${esc(x.technique_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="tech-link">Техніка</a>`:'' }${x.superset_group?`<span class="badge" style="margin-left:8px;color:var(--yellow)">Суперсет</span>`:''}${Array.from({length:x.sets},(_,i)=>`<div class="setrow"><div class="setnum">${i+1}</div><input id="hw${x.id}_${i+1}" type="number" step="0.5" placeholder="кг"><input id="hr${x.id}_${i+1}" type="number" placeholder="${esc(x.reps)}"><input id="hi${x.id}_${i+1}" type="number" value="${x.target_rir}" min="0" max="10"></div>`).join('')}</div>`).join('')+`<button onclick="saveHistoryWorkout('${day}',${cid},'${esc(name).replace(/'/g,"&#39;")}')">Зберегти тренування</button>`;
}

async function saveHistoryWorkout(day,cid,name){
 let d=window.currentClientData||{},items=(d.program||[]).filter(x=>x.day_name===name),sets=[];
 for(let x of items){for(let n=1;n<=x.sets;n++){let w=$('#hw'+x.id+'_'+n),r=$('#hr'+x.id+'_'+n),i=$('#hi'+x.id+'_'+n);if(!w||(!w.value&&!r.value))continue;if(!w.value||!r.value)return alert('Заповни вагу та повтори');sets.push({program_id:x.id,exercise:x.exercise,set_number:n,weight:+w.value,reps:+r.value,rir:+i.value||0})}}
 if(!sets.length)return alert('Додай хоча б один підхід');
 await api('/history/workout',{method:'POST',body:JSON.stringify({client_id:cid,day,day_name:name,sets})});
 let nd=await api('/client/'+cid);window.currentClientData=nd;showCalendarDay(day,null,false)
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
       chunks.push(`<div class="exercise" style="border-color:#6b5b00;padding:0;overflow:hidden"><div style="padding:12px 16px;background:#232116;border-bottom:1px solid #4d4300"><strong style="color:var(--yellow)">Суперсет</strong></div><div style="padding:4px 16px">${pair.map((o,pi)=>{let ys=o.ys.slice().sort((a,b)=>a.set_number-b.set_number),bid=`calWorkout_${day.replaceAll('-','_')}_${o.j}`;return `<div style="padding:10px 0;${pi<pair.length-1?'border-bottom:1px solid var(--line)':''}"><button class="exercise-toggle" onclick="toggleExercise('${bid}',this)"><span><strong>${esc(ys[0].exercise)}</strong><span class="muted" style="display:block;margin-top:5px">${ys.length} підходи</span></span><span class="arrow">⌄</span></button><div id="${bid}" class="hidden">${ys.map(s=>`<div class="muted" style="margin-top:8px">Підхід ${s.set_number}: ${s.weight} кг × ${s.reps} · RIR ${s.rir}</div>`).join('')}</div></div>`}).join('')}</div></div>`);
     }else{
       used.add(gi);let ys=xs.slice().sort((a,b)=>a.set_number-b.set_number),bid=`calWorkout_${day.replaceAll('-','_')}_${gi}`;
       chunks.push(`<div class="exercise"><button class="exercise-toggle" onclick="toggleExercise('${bid}',this)"><span><strong>${esc(ys[0].exercise)}</strong><span class="muted" style="display:block;margin-top:5px">${ys.length} підходи</span></span><span class="arrow">⌄</span></button><div id="${bid}" class="hidden">${ys.map(s=>`<div class="muted" style="margin-top:8px">Підхід ${s.set_number}: ${s.weight} кг × ${s.reps} · RIR ${s.rir}</div>`).join('')}</div></div>`);
     }
   });
   workoutHTML=chunks.join('');
 }else if(old.length){
   workoutHTML=old.map((x,gi)=>{let bid=`calOldWorkout_${day.replaceAll('-','_')}_${gi}`;return `<div class="exercise"><button class="exercise-toggle" onclick="toggleExercise('${bid}',this)"><span><strong>${esc(x.exercise)}</strong></span><span class="arrow">⌄</span></button><div id="${bid}" class="hidden">${x.technique_url?`<a href="${esc(x.technique_url)}" target="_blank" rel="noopener" class="tech-link">Техніка</a>`:''}<div class="muted">${x.weight} кг × ${x.reps} · ${x.sets} підходи · RIR ${x.rir}</div></div></div>`}).join('');
 }else workoutHTML='<div class="exercise muted">Тренування за цей день не записано.</div>'+((session?.role==='trainer')?'':(d.client.status==='Заморожений'?'<div class="exercise muted">Акаунт на паузі: доступний лише перегляд історії.</div>':day<=isoToday()?historyWorkoutForm(day,d.client.id,d):'<div class="exercise muted">На майбутню дату дані додавати не можна.</div>'));

 let sessionHTML=workoutSession?`<div class="exercise" id="calendarWorkoutSession_${workoutSession.id}"><div class="muted">Тренування</div><strong>${esc(workoutSession.day_name)}</strong><div class="muted" style="margin-top:5px">${workoutSession.status==='finished'?'Завершено':'Тренування триває'}</div>${workoutSession.trainer_reviewed?`<div style="margin-top:10px"><strong style="color:#6ee787">Перевірено тренером ✓</strong>${workoutSession.trainer_comment?`<div style="margin-top:6px">${esc(workoutSession.trainer_comment)}</div>`:''}</div>`:(session?.role==='trainer'&&workoutSession.status==='finished'?`<div class="trainer-calendar-review"><strong style="color:var(--yellow)">Потрібно перевірити</strong><textarea id="reviewComment${workoutSession.id}" placeholder="Коментар клієнту (необов’язково)..." style="width:100%;min-height:75px;margin-top:10px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:12px;font:inherit"></textarea><div class="review-actions"><button onclick="reviewWorkoutFromCalendar(${workoutSession.id},${d.client.id},'${day}',true,event.currentTarget)">Надіслати та позначити перевіреним</button><button class="dark" onclick="reviewWorkoutFromCalendar(${workoutSession.id},${d.client.id},'${day}',false,event.currentTarget)">Перевірено без коментаря</button></div></div>`:'')}</div>`:'';
 let nutritionHTML=nut.length?`<div class="exercise"><strong>${nut[0].kcal} ккал</strong><div class="muted">Б ${nut[0].protein} г · Ж ${nut[0].fat} г · В ${nut[0].carbs} г</div></div>`:'<div class="exercise muted">Харчування за цей день не внесено.</div>'+((session?.role==='client'&&d.client.status!=='Заморожений'&&day<=isoToday())?historyNutritionForm(day,d.client.id):'');
 let cardioHTMLDay=cardio.length?(()=>{let x=cardio[0],parts=[];if(x.cardio_type)parts.push(esc(x.cardio_type));if(x.minutes)parts.push(`${x.minutes} хв`);if(x.speed&&x.cardio_type==='Доріжка')parts.push(`Швидкість ${x.speed}`);if(x.incline)parts.push(`${x.cardio_type==='Доріжка'?'Нахил':'Опір'} ${x.incline}${x.cardio_type==='Доріжка'?'%':''}`);if(x.steps)parts.push(`${x.steps} кроків`);return `<div class="exercise">${parts.length?`<div class="cardio-summary">${parts.map(v=>`<div class="cardio-chip">${v}</div>`).join('')}</div>`:'<div class="muted">Активність за цей день не внесено.</div>'}</div>`})():'<div class="exercise muted">Активність за цей день не внесено.</div>';
 let measures=meas.length?`<div class="card"><h2>Заміри</h2>${meas.map(x=>measurementRowHTML(x)).join('')}</div>`:'';

 let content=`<button class="dark" onclick="returnFromCalendarDay()">← До календаря</button><div style="height:16px"></div><div class="card"><div class="muted">Щоденник</div><h1>${esc(day)}</h1></div><div class="card"><h2>Тренування</h2>${sessionHTML}${workoutHTML}</div><div class="card"><h2>Харчування</h2>${nutritionHTML}</div><div class="card"><h2>Активність</h2>${cardioHTMLDay}</div>${measures}`;
 window.calendarReturnHTML=app.innerHTML;
 app.innerHTML=shell(content);
}

async function reviewWorkoutFromCalendar(sid,cid,day,useComment=true,button=null){
 let restore=setActionLoading(button,'Перевіряємо…');
 let t=$('#reviewComment'+sid),comment=useComment&&t?t.value.trim():'';
 try{
  await api('/workout/'+sid+'/review',{method:'PATCH',body:JSON.stringify({comment})});
  let nd=await api('/client/'+cid);window.currentClientData=nd;
  showCalendarDay(day,null,false,sid);refreshTrainerGlobalBadge();
 }catch(e){restore();alert(e.message||'Не вдалося позначити тренування перевіреним. Спробуй ще раз.')}
}

async function returnFromCalendarDay(){if(history.state?.eplanPage==='calendarDay'){history.back();return}if(session&&session.role==='trainer'&&selected){openClient(selected,'calendar');return}if(session&&session.role==='client'&&session.client_id){await clientCabinet(session.client_id);showClientSection('history');return}route()}
