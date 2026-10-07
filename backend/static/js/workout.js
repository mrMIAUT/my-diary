// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function workoutHistoryNameKey(value){
 return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('uk-UA');
}

function workoutHistoryExerciseName(d,pid,exerciseName=''){
 let explicit=String(exerciseName||'').trim();
 if(explicit)return explicit;
 let x=(d?.program||[]).find(v=>+v.id===+pid);
 return x?workoutExerciseName(x):'';
}

function workoutHistoryRows(d,pid,exerciseName=''){
 let name=workoutHistoryExerciseName(d,pid,exerciseName),nameKey=workoutHistoryNameKey(name);
 return (d?.result_sets||[]).filter(r=>{
   if(!r?.day)return false;
   let rowKey=workoutHistoryNameKey(r.exercise);
   // Exercise identity is the performed exercise name, not the current program row id.
   // This keeps history when a trainer replaces a program and the same exercise is assigned again.
   if(nameKey&&rowKey)return rowKey===nameKey;
   // Legacy rows without a saved exercise name keep the old program-id fallback.
   return +r.program_id===+pid;
 });
}

function exerciseHistoryDates(d,pid,exerciseName=''){
 return [...new Set(workoutHistoryRows(d,pid,exerciseName).map(r=>r.day))].sort();
}

function workoutDataDay(d){
 let active=(d?.workout_sessions||[]).find(x=>x.status==='training');
 let day=String(active?.workout_day||'').slice(0,10);
 return day||isoToday();
}

function previousExerciseHTML(d,pid){
 let history=workoutHistoryRows(d,pid),dates=[...new Set(history.map(r=>r.day))].sort().filter(day=>day<workoutDataDay(d));
 if(!dates.length)return '<div class="muted" style="margin-top:10px">Попередніх результатів ще немає.</div>';

 let latest=dates[dates.length-1];
 let previous=dates.length>1?dates[dates.length-2]:null;
 let cur=history.filter(r=>r.day===latest).sort((a,b)=>a.set_number-b.set_number);
 let prev=previous?history.filter(r=>r.day===previous).sort((a,b)=>a.set_number-b.set_number):[];

 return `<div class="exercise" style="margin-top:12px">
   <div class="muted">Останнє виконання · ${esc(latest)}${previous?` · порівняно з ${esc(previous)}`:''}</div>
   ${cur.map(s=>{
      let p=prev.find(z=>z.set_number===s.set_number&&normalizeRepeatMode(z.repeat_mode)===normalizeRepeatMode(s.repeat_mode));
      if(!p)return `<div style="margin-top:7px">Підхід ${s.set_number}: <strong>${s.weight} кг × ${repeatResultText(s.reps,s.repeat_mode)}</strong> · RIR ${s.rir}${+s.rest_seconds>0?` · ⏱ ${formatSetRest(s.rest_seconds)}`:''}</div>`;
      return `<div style="margin-top:9px">
        <div>Підхід ${s.set_number}: <strong>${s.weight} кг × ${repeatResultText(s.reps,s.repeat_mode)}</strong> · RIR ${s.rir}${+s.rest_seconds>0?` · ⏱ ${formatSetRest(s.rest_seconds)}`:''}</div>
        <div class="muted" style="margin-top:3px">Минулого: ${p.weight} кг × ${repeatResultText(p.reps,p.repeat_mode)} · RIR ${p.rir}${+p.rest_seconds>0?` · ⏱ ${formatSetRest(p.rest_seconds)}`:''}</div>
        <div class="muted" style="margin-top:3px">Різниця: вага ${signedDelta((+s.weight)-(+p.weight))} кг · повтори ${signedDelta((+s.reps)-(+p.reps))}</div>
      </div>`;
   }).join('')}
 </div>`;
}

function completedComparisonHTML(x,d){
 let history=workoutHistoryRows(d,x.id,workoutExerciseName(x)),dates=[...new Set(history.map(r=>r.day))].sort();
 if(dates.length<2)return '';
 let currentDay=dates[dates.length-1],previousDay=dates[dates.length-2];
 let cur=history.filter(r=>r.day===currentDay).sort((a,b)=>a.set_number-b.set_number);
 let prev=history.filter(r=>r.day===previousDay).sort((a,b)=>a.set_number-b.set_number);
 return `<div class="exercise" style="margin-top:12px"><strong>Порівняння з ${esc(previousDay)}</strong>${cur.map(s=>{
   let p=prev.find(z=>z.set_number===s.set_number&&normalizeRepeatMode(z.repeat_mode||x.repeat_mode)===normalizeRepeatMode(s.repeat_mode||x.repeat_mode));if(!p)return '';
   return `<div class="muted" style="margin-top:6px">Підхід ${s.set_number}: вага ${signedDelta((+s.weight)-(+p.weight))} кг · повтори ${signedDelta((+s.reps)-(+p.reps))}${+s.rest_seconds>0||+p.rest_seconds>0?` · відпочинок ${+p.rest_seconds>0?formatSetRest(p.rest_seconds):'—'} → ${+s.rest_seconds>0?formatSetRest(s.rest_seconds):'—'}`:''}</div>`;
 }).join('')}</div>`;
}




function todaySets(d,pid){
 let workoutDay=workoutDataDay(d);
 return uniqueResultSets((d?.result_sets||[])
   .filter(s=>+s.program_id===+pid&&s.day===workoutDay))
   .slice()
   .sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
}


function completedExerciseHTML(x,d,cid){
 x=workoutEffectiveExercise(x);
 let done=todaySets(d,x.id),total=workoutExerciseSetCount(x,d);
 if(!done.length)return setRows(x,d,cid)+`<br><button class="workout-finish-exercise" data-exercise="${esc(workoutExerciseName(x))}" onclick="saveSets(${cid},${x.id},this.dataset.exercise,${total})">Закінчити вправу</button>`;
 let performed=done[0]?.exercise||x.exercise;
 return `<div class="workout-completed-summary">
   <div class="workout-completed-summary-head">
     <span class="workout-completed-summary-icon">✓</span>
     <div><strong>Виконано</strong><small>Результати вправи збережено</small></div>
   </div>
   ${performed!==x.exercise?`<div class="workout-completed-replacement">Виконано: <strong>${esc(performed)}</strong><span>за планом ${esc(x.exercise)}</span></div>`:``}
   ${(()=>{let aux=workoutAuxSetsFor(d,x.id),warm=aux.filter(a=>a.kind==='warmup').sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));return warm.length?`<div class="workout-completed-aux warmup"><small>Розминка</small>${warm.map(a=>`<span>${a.weight} кг × ${repeatResultText(a.reps,x.repeat_mode)}</span>`).join('')}</div>`:''})()}
   <div class="workout-completed-sets">
     ${done.map(s=>{let drops=workoutAuxSetsFor(d,x.id).filter(a=>a.kind==='drop'&&+a.parent_set_number===+s.set_number).sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));return `<div class="workout-completed-set-group"><div class="workout-completed-set"><span>Підхід ${s.set_number}</span><strong>${s.weight} кг × ${repeatResultText(s.reps,s.repeat_mode||x.repeat_mode)}</strong><em>RIR ${s.rir}${+s.rest_seconds>0?` · ⏱ ${formatSetRest(s.rest_seconds)}`:''}</em></div>${drops.map((a,i)=>`<div class="workout-completed-drop"><span>↳ Дроп ${i+1}</span><strong>${a.weight} кг × ${repeatResultText(a.reps,x.repeat_mode)}</strong></div>`).join('')}</div>`}).join('')}
   </div>
   <button class="workout-completed-edit" data-exercise="${esc(x.exercise)}" data-reps="${esc(x.reps)}" onclick="editCompletedExercise(${cid},${x.id},this.dataset.exercise,${Math.max(+x.sets||1,...done.map(s=>+s.set_number||0))},this.dataset.reps,${x.target_rir})">Редагувати результати</button>
 </div>`;
}

function editCompletedExercise(cid,pid,exercise,count,reps,targetRir){
 let d=window.currentClientData||{},done=todaySets(d,pid),body=$('#exerciseBody'+pid);if(!body)return;
 let h=`<div class="setrow"><div></div><div class="sethead">Вага, кг</div><div class="sethead">Повтори</div><div class="sethead">RIR</div></div>`;
 for(let n=1;n<=count;n++){let s=done.find(z=>z.set_number===n)||{};h+=`<div class="setrow"><div class="setnum">${n}</div><input id="w${pid}_${n}" type="number" step="0.5" value="${s.weight??''}" placeholder="кг"><input id="r${pid}_${n}" type="number" value="${s.reps??''}" placeholder="${esc(reps)}"><input id="i${pid}_${n}" type="number" value="${s.rir??''}" placeholder="${esc(String(targetRir??''))}" min="0" max="10"></div>`}
 body.innerHTML=h+`<br><button data-exercise="${esc(exercise)}" onclick="saveSets(${cid},${pid},this.dataset.exercise,${count})">Зберегти зміни</button>`;
 body.classList.remove('hidden');
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

function persistWorkoutDraft(sid,pid,draft){
 if(!sid)return;
 try{let k=workoutDraftKey(sid,pid);if(k)localStorage.setItem(k,JSON.stringify(draft||{}))}catch(e){}
}
function workoutAuxSetsFor(d,pid,day=workoutDataDay(d)){
 return (d?.aux_sets||[]).filter(x=>+x.program_id===+pid&&x.day===day);
}
function workoutAuxDraftState(d,pid){
 let sid=workoutDraftSessionId(d),draft=readWorkoutDraft(sid,pid),persisted=workoutAuxSetsFor(d,pid);
 let warmups=Array.isArray(draft.__warmups)
   ?draft.__warmups
   :persisted.filter(x=>x.kind==='warmup').sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0)).map(x=>({weight:x.weight,reps:x.reps}));
 let drops=draft.__drops&&typeof draft.__drops==='object'?draft.__drops:{};
 if(!(draft.__drops&&typeof draft.__drops==='object')){
   persisted.filter(x=>x.kind==='drop').sort((a,b)=>(+a.parent_set_number||0)-(+b.parent_set_number||0)||(+a.aux_number||0)-(+b.aux_number||0)).forEach(x=>{
     let key=String(+x.parent_set_number||0);(drops[key]??=[]).push({weight:x.weight,reps:x.reps});
   });
 }
 return {sid,draft,warmups,drops};
}
function saveWorkoutAuxValue(pid,kind,parent,index,field,value){
 let d=window.currentClientData||{},state=workoutAuxDraftState(d,pid);
 if(!state.sid)return;
 if(kind==='warmup'){
   while(state.warmups.length<=index)state.warmups.push({});
   state.warmups[index][field]=value;
   state.draft.__warmups=state.warmups;
 }else{
   let key=String(parent),rows=state.drops[key]||[];
   while(rows.length<=index)rows.push({});
   rows[index][field]=value;
   state.drops[key]=rows;state.draft.__drops=state.drops;
 }
 persistWorkoutDraft(state.sid,pid,state.draft);
}
function addWorkoutWarmupSet(cid,pid){
 let d=window.currentClientData||{},state=workoutAuxDraftState(d,pid);
 if(!state.sid)return;
 if(state.warmups.length>=20)return alert('Максимум 20 розминочних підходів.');
 state.warmups.push({});state.draft.__warmups=state.warmups;persistWorkoutDraft(state.sid,pid,state.draft);
 let x=(d.program||[]).find(v=>+v.id===+pid),body=document.getElementById('exerciseBody'+pid);
 if(x&&body){body.innerHTML=completedExerciseHTML(x,d,cid);body.classList.remove('hidden')}
}
function removeWorkoutWarmupSet(cid,pid,index){
 let d=window.currentClientData||{},state=workoutAuxDraftState(d,pid);
 if(!state.sid||!state.warmups[index])return;
 state.warmups.splice(index,1);state.draft.__warmups=state.warmups;persistWorkoutDraft(state.sid,pid,state.draft);
 let x=(d.program||[]).find(v=>+v.id===+pid),body=document.getElementById('exerciseBody'+pid);
 if(x&&body){body.innerHTML=completedExerciseHTML(x,d,cid);body.classList.remove('hidden')}
}
function addWorkoutDropSet(cid,pid,parent){
 let d=window.currentClientData||{},state=workoutAuxDraftState(d,pid);
 if(!state.sid)return;
 let key=String(parent),rows=state.drops[key]||[];
 if(rows.length>=10)return alert('Максимум 10 дроп-сетів після одного підходу.');
 rows.push({});state.drops[key]=rows;state.draft.__drops=state.drops;persistWorkoutDraft(state.sid,pid,state.draft);
 let x=(d.program||[]).find(v=>+v.id===+pid),body=document.getElementById('exerciseBody'+pid);
 if(x&&body){body.innerHTML=completedExerciseHTML(x,d,cid);body.classList.remove('hidden')}
}
function removeWorkoutDropSet(cid,pid,parent,index){
 let d=window.currentClientData||{},state=workoutAuxDraftState(d,pid);
 if(!state.sid)return;
 let key=String(parent),rows=state.drops[key]||[];if(!rows[index])return;
 rows.splice(index,1);if(rows.length)state.drops[key]=rows;else delete state.drops[key];
 state.draft.__drops=state.drops;persistWorkoutDraft(state.sid,pid,state.draft);
 let x=(d.program||[]).find(v=>+v.id===+pid),body=document.getElementById('exerciseBody'+pid);
 if(x&&body){body.innerHTML=completedExerciseHTML(x,d,cid);body.classList.remove('hidden')}
}
function collectWorkoutAuxSets(d,pid){
 let state=workoutAuxDraftState(d,pid),out=[];
 for(let i=0;i<state.warmups.length;i++){
   let row=state.warmups[i]||{},w=String(row.weight??'').trim(),r=String(row.reps??'').trim();
   if(!w&&!r)continue;
   if(!w||!r)throw new Error('Заповни вагу та повтори у розминочному підході '+(i+1));
   out.push({kind:'warmup',parent_set_number:null,aux_number:i+1,weight:+w,reps:+r});
 }
 Object.keys(state.drops).sort((a,b)=>(+a)-(+b)).forEach(key=>{
   (state.drops[key]||[]).forEach((row,i)=>{
     let w=String(row?.weight??'').trim(),r=String(row?.reps??'').trim();
     if(!w&&!r)return;
     if(!w||!r)throw new Error('Заповни вагу та повтори у дроп-сеті після підходу '+key);
     out.push({kind:'drop',parent_set_number:+key,aux_number:i+1,weight:+w,reps:+r});
   });
 });
 return out;
}

function saveWorkoutDraftSetCount(sid,pid,count){
 if(!sid)return;
 let k=workoutDraftKey(sid,pid);if(!k)return;
 let d=readWorkoutDraft(sid,pid);d.__set_count=Math.max(1,Math.min(100,+count||1));
 try{localStorage.setItem(k,JSON.stringify(d))}catch(e){}
}
function workoutExerciseSetCount(x,d){
 x=workoutEffectiveExercise(x);
 let planned=Math.max(1,+x?.sets||1),sid=workoutDraftSessionId(d),draft=readWorkoutDraft(sid,x?.id),draftCount=+draft.__set_count||0;
 let actual=Math.max(0,...todaySets(d,x?.id).map(s=>+s.set_number||0));
 return Math.max(planned,draftCount,actual);
}
function addWorkoutExtraSet(cid,pid){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid),sid=workoutDraftSessionId(d);
 if(!x||!sid)return;
 x=workoutEffectiveExercise(x);
 let count=workoutExerciseSetCount(x,d);
 if(count>=100)return alert('Досягнуто максимальну кількість підходів.');
 saveWorkoutDraftSetCount(sid,pid,count+1);
 let body=document.getElementById('exerciseBody'+pid);
 if(body){
   body.innerHTML=completedExerciseHTML(x,d,cid);
   body.classList.remove('hidden');
 }
}
function removeWorkoutExtraSet(cid,pid){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid),sid=workoutDraftSessionId(d);
 if(!x||!sid)return;
 x=workoutEffectiveExercise(x);
 let planned=Math.max(1,+x.sets||1),count=workoutExerciseSetCount(x,d);
 if(count<=planned)return;
 let draft=readWorkoutDraft(sid,pid),row=draft[count]||{};
 if(row.done)return alert('Завершений додатковий підхід спочатку потрібно відредагувати.');
 let hasValues=['weight','reps','rir'].some(k=>row[k]!==undefined&&row[k]!==null&&String(row[k]).trim()!=='');
 if(hasValues&&!confirm('Прибрати додатковий підхід разом із введеними даними?'))return;
 delete draft[count];draft.__set_count=count-1;
 try{let k=workoutDraftKey(sid,pid);if(k)localStorage.setItem(k,JSON.stringify(draft))}catch(e){}
 let body=document.getElementById('exerciseBody'+pid);
 if(body){
   body.innerHTML=completedExerciseHTML(x,d,cid);
   body.classList.remove('hidden');
 }
}

function clearWorkoutDraft(sid,pid){if(!sid)return;try{let k=workoutDraftKey(sid,pid);if(k)localStorage.removeItem(k)}catch(e){}}

function clearWorkoutDraftsForSession(sid){if(!sid)return;try{let scope=offlineLocalScopeKey(),prefix=scope?`eplanWorkoutDraftV2_${scope}_${sid}_`:'';for(let i=localStorage.length-1;i>=0;i--){let k=localStorage.key(i);if(k&&prefix&&k.startsWith(prefix))localStorage.removeItem(k)}}catch(e){}}

function previewWorkout(day,cid){
 previewWorkoutDay=previewWorkoutDay===day?null:day;
 showClientTraining(cid)
}

function startWorkout(cid,day,btn=null){
 document.getElementById('workoutStartConfirmModal')?.remove();
 let count=(window.currentClientData?.program||[]).filter(x=>x.day_name===day).length;
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="workoutStartConfirmModal" onclick="if(event.target===this)this.remove()"><div class="card workout-start-confirm"><button type="button" class="workout-confirm-close" aria-label="Закрити" onclick="workoutStartConfirmModal.remove()">✕</button><span class="workout-confirm-icon">🏋️</span><h2>Почати тренування?</h2><p><strong>${esc(day)}</strong>${count?' · '+count+' '+(count===1?'вправа':count<5?'вправи':'вправ'):''}</p><small>Таймер тренування запуститься одразу після підтвердження.</small><div class="workout-confirm-actions"><button type="button" class="workout-confirm-secondary" onclick="workoutStartConfirmModal.remove()">Скасувати</button><button type="button" class="workout-confirm-primary" data-cid="${cid}" data-day="${esc(day)}" onclick="confirmWorkoutStart(this)">Почати</button></div></div></div>`);
}

async function confirmWorkoutStart(button){
 let cid=+button.dataset.cid,day=button.dataset.day;
 if(button.dataset.starting==='1')return;
 button.dataset.starting='1';button.disabled=true;button.textContent='Запускаємо…';
 try{
   let s=await api('/workout/start',{method:'POST',body:JSON.stringify({client_id:cid,day_name:day})});
   if(!s?.id)throw new Error('Не вдалося отримати тренування від сервера.');
   document.getElementById('workoutStartConfirmModal')?.remove();
   {let k=offlineLocalScopeKey();if(k)localStorage.setItem(`eplanActiveWorkoutV2_${k}_${cid}`,JSON.stringify(s));}
   previewWorkoutDay=null;
   window.currentClientData=await loadClientData(cid);
   await showClientTraining(cid);
   requestAnimationFrame(()=>{
     let live=document.querySelector('.training-live');
     if(live)live.scrollIntoView({behavior:'smooth',block:'start'});
   });
 }catch(e){
   alert(e?.message||'Не вдалося почати тренування. Спробуй ще раз.');
   button.disabled=false;button.dataset.starting='0';button.textContent='Почати';
 }
}

async function cancelWorkout(cid,sid,button=null){
 if(button?.dataset.cancelling==='1')return;
 if(!confirm('Скасувати це тренування? Воно не буде зараховане.'))return;
 if(button){button.dataset.cancelling='1';button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='Скасовуємо…'}
 try{
   await api('/workout/'+sid+'/cancel',{method:'POST'});
   cancelRestTimer();
   clearWorkoutDraftsForSession(sid);
   {let k=offlineLocalScopeKey();if(k)localStorage.removeItem(`eplanActiveWorkoutV2_${k}_${cid}`)}
   previewWorkoutDay=null;window.workoutExerciseChoices={};window.clientTrainingTab='program';
   window.currentClientData=await loadClientData(cid);
   await showClientTraining(cid);
 }catch(e){
   alert(e?.message||'Не вдалося скасувати тренування.');
   if(button){button.dataset.cancelling='0';button.disabled=false;button.textContent=button.dataset.oldText||'Скасувати тренування'}
   window.currentClientData=await loadClientData(cid);
   await showClientTraining(cid);
 }
}

function closeFinishWorkoutSummary(cid){
 document.getElementById('finishSummaryModal')?.remove();
 window.clientTrainingTab='program';
 showClientTraining(cid);
}

async function saveFinishWorkoutComment(cid,day,button=null){
 let input=document.getElementById('finishWorkoutComment');
 let body=String(input?.value||'').trim();
 if(!body){alert('Напиши коментар або обери «Без коментаря».');return}
 let restore=setActionLoading(button,'Надсилаємо…');
 try{
   await api('/comments',{method:'POST',body:JSON.stringify({client_id:cid,day,program_id:0,exercise:'',author:'client',body})});
   closeFinishWorkoutSummary(cid);
 }catch(e){
   restore();
   alert(e?.message||'Не вдалося надіслати коментар. Спробуй ще раз.');
 }
}

async function finishWorkout(cid,sid,button=null){
 if(button?.dataset.finishing==='1')return;
 if(!confirm('Завершити тренування?'))return;
 if(button){button.dataset.finishing='1';button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='Завершуємо…'}
 try{
 await api('/workout/'+sid+'/finish',{method:'POST'});
 cancelRestTimer();
 clearWorkoutDraftsForSession(sid);
 {let k=offlineLocalScopeKey();if(k)localStorage.removeItem(`eplanActiveWorkoutV2_${k}_${cid}`)}previewWorkoutDay=null;window.workoutExerciseChoices={};
 let d=await loadClientData(cid);window.currentClientData=d;
 let s=(d.workout_sessions||[]).find(x=>x.id===sid)||{},sets=uniqueResultSets((d.result_sets||[]).filter(x=>x.day===sessionDay(s)));
 let exercises=new Set(sets.map(x=>x.program_id)).size,cycle=workoutCycleState(d,(d.program||[]).reduce((g,x)=>((g[x.day_name]??=[]).push(x),g),{})),canComment=!!clientAccess(d.client).features?.trainer_review;
 let workoutDay=sessionDay(s)||isoToday();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="finishSummaryModal"><div class="card finish-summary"><h2>Тренування завершено ✓</h2><p class="muted">${esc(s.day_name||'Тренування')} автоматично надіслано тренеру на перевірку.</p><div class="finish-summary-grid workout-finish-summary-grid"><div><span class="muted">Вправ</span><div class="summary-number">${exercises}</div></div><div><span class="muted">Підходів</span><div class="summary-number">${sets.length}</div></div><div><span class="muted">Тривалість</span><div class="summary-number duration">${formatWorkoutDuration(s.duration_seconds||0)}</div></div></div>${cycle.next?`<p class="muted">Наступне за планом: <strong>${esc(cycle.next)}</strong></p>`:''}${canComment?`<div class="finish-workout-comment"><div class="finish-workout-comment-head"><strong>Коментар тренеру</strong><span>необов’язково</span></div><textarea id="finishWorkoutComment" maxlength="5000" placeholder="Як пройшло тренування? Щось боліло, було занадто легко або важко?"></textarea><div class="finish-workout-comment-actions"><button onclick="saveFinishWorkoutComment(${cid},'${esc(workoutDay)}',this)">Надіслати коментар</button><button class="dark" onclick="closeFinishWorkoutSummary(${cid})">Без коментаря</button></div></div>`:`<button style="width:100%" onclick="closeFinishWorkoutSummary(${cid})">Готово</button>`}<div class="finish-summary-recovery-actions"><button type="button" class="dark" onclick="document.getElementById('finishSummaryModal')?.remove();openCompletedWorkoutEditor(${sid})">Редагувати тренування</button><button type="button" class="finish-summary-reopen" onclick="reopenCompletedWorkout(${sid},this)">Скасувати завершення</button></div></div></div>`);
 }catch(e){
  alert(e?.message||'Не вдалося завершити тренування. Перевір інтернет і спробуй ще раз.');
  if(button){button.dataset.finishing='0';button.disabled=false;button.textContent=button.dataset.oldText||'Завершити тренування'}
 }
}

function workoutWeekStartISO(day=isoToday()){
 let raw=String(day||isoToday()).slice(0,10),d=new Date(raw+'T12:00:00');
 if(Number.isNaN(d.getTime()))return raw;
 let weekday=(d.getDay()+6)%7;
 d.setDate(d.getDate()-weekday);
 let local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,10);
}

function workoutSessionProgramIds(session){
 try{
   let snapshot=JSON.parse(session?.program_snapshot||'[]');
   if(!Array.isArray(snapshot))return [];
   return snapshot.map(x=>+x.id).filter(x=>Number.isInteger(x)&&x>0).sort((a,b)=>a-b);
 }catch(e){return []}
}

function workoutSessionMatchesCurrentProgram(d,session){
 let dayName=String(session?.day_name||'').trim();
 if(!dayName)return false;
 let current=(d?.program||[]).filter(x=>String(x.day_name||'').trim()===dayName);
 if(!current.length)return false;

 let currentIds=current.map(x=>+x.id).filter(x=>Number.isInteger(x)&&x>0).sort((a,b)=>a-b);
 let snapshotIds=workoutSessionProgramIds(session);
 if(snapshotIds.length&&currentIds.length){
   return snapshotIds.length===currentIds.length&&snapshotIds.every((id,i)=>id===currentIds[i]);
 }

 // Legacy/manual fallback: if a session has no usable snapshot, only count it
 // when its saved result rows still point at exercises from the current day.
 let workoutDay=sessionDay(session);
 if(workoutDay&&currentIds.length){
   let currentSet=new Set(currentIds);
   let performed=[...new Set((d?.result_sets||[])
     .filter(x=>x.day===workoutDay)
     .map(x=>+x.program_id)
     .filter(x=>Number.isInteger(x)&&x>0))];
   if(performed.length)return performed.every(id=>currentSet.has(id));
 }
 return false;
}

function workoutCycleState(d,groups){
 let days=Object.keys(groups||{}),done=[];
 if(!days.length)return {done,next:null};

 // A training cycle is the current calendar week (Monday-Sunday).
 // Previous weeks never carry completion into a fresh week.
 let weekStart=workoutWeekStartISO(),today=isoToday();
 let sessions=(d.workout_sessions||[]).filter(x=>{
   let day=sessionDay(x);
   return x.status==='finished'
     &&days.includes(x.day_name)
     &&day&&day>=weekStart&&day<=today
     &&workoutSessionMatchesCurrentProgram(d,x);
 });

 let seen=new Set(sessions.map(x=>x.day_name));
 done=days.filter(day=>seen.has(day));
 return {done,next:days.find(day=>!seen.has(day))||null};
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
       exercises+=`<div class="exercise" style="border-color:#6b5b00;padding:0;overflow:hidden;margin-top:12px"><div style="padding:12px 16px;background:#232116;border-bottom:1px solid #4d4300"><strong style="color:var(--yellow)">Суперсет</strong></div><div style="padding:4px 16px">${pair.map((y,pi)=>{let rest=restLabel(y),rp=rirPlan(y),num=xs.indexOf(y)+1;return `<div class="client-program-exercise" style="${pi?'border-top:1px solid var(--line)':'border-top:0'}"><div class="client-program-exercise-top"><strong>${num}. ${esc(y.exercise)}</strong></div><div class="muted">${y.sets} підходи × ${esc(repeatPlanText(y))}</div><div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>${y.technique_url?techniqueLinkHTML(y.technique_url):''}</div>`}).join('')}</div></div>`;
     }else{
       used.add(x.id);let rest=restLabel(x),rp=rirPlan(x);
       exercises+=`<div class="client-program-exercise"><div class="client-program-exercise-top"><strong>${i+1}. ${esc(x.exercise)}</strong></div><div class="muted">${x.sets} підходи × ${esc(repeatPlanText(x))}</div><div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>${x.technique_url?techniqueLinkHTML(x.technique_url):''}</div>`;
     }
   }
   let dayTitle=programDayTitle(d,previewWorkoutDay);
   selected=`<div class="client-program-selected"><div class="client-program-selected-title"><div><strong>${esc(previewWorkoutDay)}</strong>${dayTitle?`<small class="client-program-day-title">${esc(dayTitle)}</small>`:''}</div><span>${xs.length} ${xs.length===1?'вправа':(xs.length<5?'вправи':'вправ')}</span></div>${exercises}</div>`;
 }
 return `<div class="card client-training-program"><h2>Твоя програма тренувань</h2><p class="muted">Обери тренувальний день, щоб переглянути вправи.</p><div class="client-program-tabs">${buttons}</div>${selected}</div>`;
}

function trainingTermsHelpHTML(){
 return `<div class="card client-collapsible training-terms-card"><button class="exercise-toggle" onclick="toggleClientPanel('trainingTermsPanel',this)"><span><strong>Як читати програму тренувань?</strong><span class="muted" style="display:block;margin-top:5px">Коротка інструкція перед тренуванням</span></span><span class="arrow">⌄</span></button><div id="trainingTermsPanel" class="client-collapsible-body hidden"><div class="rir-help"><strong>1. Розминка</strong><br>Перед кожним тренуванням обов’язково виконуємо загальну розминку. Перед кожною вправою за потреби робимо розминочні підходи, поступово підводячись до робочої ваги.</div><div class="rir-help" style="margin-top:10px"><strong>2. Робочі підходи</strong><br>У програмі вказані робочі підходи. Розминочні підходи можна вносити за бажанням — вони не враховуються як робочі та не впливають на прогресію.</div><div class="rir-help" style="margin-top:10px"><strong>3. RIR (Reps In Reserve)</strong><br>Показує, скільки повторів залишилося б у запасі до відмови. Наприклад, <strong>RIR 2</strong> — ти міг би виконати ще приблизно 2 повтори.</div><div class="rir-help" style="margin-top:10px"><strong>4. Дроп-сет</strong><br>Після робочого підходу зменшуємо вагу й без звичайного відпочинку продовжуємо вправу. За потреби можна додати кілька дропів.</div><div class="rir-help" style="margin-top:10px"><strong>5. Суперсет</strong><br>Дві вправи виконуються одна за одною без звичайного відпочинку між ними. Відпочинок — після виконання обох вправ.</div></div></div>`;
}

function selectClientProgramDay(day,cid){
 previewWorkoutDay=previewWorkoutDay===day?null:day;
 showClientTraining(cid);
}

function workoutExerciseName(x){return window.workoutExerciseChoices[x.id]||x.exercise}

function workoutEffectiveExercise(x){
 let chosen=workoutExerciseName(x);
 if(!chosen||chosen===x.exercise)return x;
 let alt=exerciseAlternativeConfigs(x).find(v=>v.exercise===chosen);
 if(!alt)return {...x,exercise:chosen};
 return {...x,...alt,exercise:chosen,id:x.id,client_id:x.client_id,day_name:x.day_name,superset_group:x.superset_group,superset_order:x.superset_order};
}

function workoutChoiceSummary(v){
 let rest=restLabel(v),rir=rirPlan(v).join(' / ');
 return v.sets+' × '+esc(repeatPlanText(v))+' · RIR '+esc(rir)+(rest?' · '+esc(rest):'');
}

function chooseWorkoutExercise(pid,cid){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let configs=[normalizeProgramAlternative({exercise:x.exercise,sets:x.sets,reps:x.reps,target_rir:x.target_rir,rir_by_set:x.rir_by_set,rest_seconds:x.rest_seconds,rest_text:x.rest_text},x),...exerciseAlternativeConfigs(x)],cur=workoutExerciseName(x);
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="alternativeExerciseModal"><div class="card swap-choice-card"><div class="edit-exercise-head"><div><h2>Замінити вправу</h2><p class="muted" style="margin:4px 0 0">Обери один із дозволених варіантів.</p></div><button class="dark edit-exercise-close" onclick="alternativeExerciseModal.remove()">✕</button></div><div class="alternative-modal-list">${configs.map((v,i)=>`<button class="${v.exercise===cur?'alternative-current':'dark'}" onclick="pickWorkoutExerciseScope(${pid},${cid},${i})"><strong>${i===0?'За планом: ':''}${esc(v.exercise)}</strong><small>${workoutChoiceSummary(v)}</small></button>`).join('')}</div></div></div>`);
}

function pickWorkoutExerciseScope(pid,cid,index){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let configs=[normalizeProgramAlternative({exercise:x.exercise,sets:x.sets,reps:x.reps,target_rir:x.target_rir,rir_by_set:x.rir_by_set,rest_seconds:x.rest_seconds,rest_text:x.rest_text},x),...exerciseAlternativeConfigs(x)],chosen=(configs[index]||configs[0]).exercise;
 let card=document.querySelector('#alternativeExerciseModal .swap-choice-card');if(!card)return;
 card.innerHTML=`<div class="edit-exercise-head"><div><span class="swap-step-label">Обрана вправа</span><h2>${esc(chosen)}</h2><p class="muted" style="margin:4px 0 0">Як застосувати цю заміну?</p></div><button class="dark edit-exercise-close" onclick="alternativeExerciseModal.remove()">✕</button></div><div class="swap-scope-actions"><button onclick="applyWorkoutExerciseChoice(${pid},${cid},${index},'today')"><strong>Тільки сьогодні</strong><span>Поточна програма не зміниться</span></button><button onclick="applyWorkoutExerciseChoice(${pid},${cid},${index},'program')"><strong>Замінити в програмі</strong><span>Ця вправа стане основною надалі</span></button></div><button class="dark swap-back-btn" onclick="alternativeExerciseModal.remove();chooseWorkoutExercise(${pid},${cid})">← Назад до вправ</button>`;
}

async function applyWorkoutExerciseChoice(pid,cid,index,scope){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid);if(!x)return;
 let configs=[normalizeProgramAlternative({exercise:x.exercise,sets:x.sets,reps:x.reps,target_rir:x.target_rir,rir_by_set:x.rir_by_set,rest_seconds:x.rest_seconds,rest_text:x.rest_text},x),...exerciseAlternativeConfigs(x)],chosen=(configs[index]||configs[0]).exercise;
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
 let used=new Set(),active=(d.workout_sessions||[]).find(x=>x.status==='training'),activeDay=workoutDataDay(d);
 let html=active?'<div class="workout-duration-strip"><span>Тривалість тренування</span>'+workoutDurationBadgeHTML(active)+'</div>':'';
 function card(x,inner=false,showRest=true){
  let effective=workoutEffectiveExercise(x),doneToday=(d.result_sets||[]).some(r=>r.program_id===x.id&&r.day===activeDay),shownName=effective.exercise,shownTech=exerciseTechniqueUrl(shownName,shownName===x.exercise?x.technique_url:'');
  let rest=showRest?restLabel(effective):'';
  return `<div class="${inner?'workout-live-exercise workout-live-exercise-inner':'exercise workout-live-exercise'}${doneToday?' is-exercise-complete':''}"><button class="exercise-toggle workout-live-toggle" onclick="toggleExercise('exerciseBody${x.id}',this)"><span><span class="workout-exercise-title-line"><strong>${esc(shownName)}</strong></span>${shownTech?`<span class="workout-technique-row">${techniqueLinkHTML(shownTech,'Техніка',true,'workout-live-tech-link')}</span>`:``}${shownName!==x.exercise?`<span class="muted workout-replacement-note">Замість: ${esc(x.exercise)}</span>`:``}<span class="muted workout-plan-line"><span class="workout-plan-meta">${effective.sets} × ${esc(repeatPlanText(effective))}</span>${rest?`<span class="workout-plan-meta">Відпочинок ${esc(rest)}</span>`:``}<span class="workout-plan-meta">RIR ${rirPlan(effective).join(' / ')}</span></span></span><span class="workout-live-toggle-side"><span class="arrow">⌄</span>${doneToday?'<span class="exercise-done-badge compact" title="Вправу завершено" aria-label="Вправу завершено">✓</span>':''}</span></button><div id="exerciseBody${x.id}" class="exercise-body workout-live-body hidden">${exerciseAlternatives(x).length&&!todaySets(d,x.id).length?`<button class="swap-exercise-btn" onclick="chooseWorkoutExercise(${x.id},${cid})">⇄ Замінити вправу</button>`:``}${completedExerciseHTML(effective,d,cid)}</div></div>`;
 }
 for(let x of items){
  if(used.has(x.id))continue;
  if(x.superset_group){
   let pair=orderedSupersetItems(items.filter(y=>y.superset_group===x.superset_group));pair.forEach(y=>used.add(y.id));
   let effectivePair=pair.map(workoutEffectiveExercise),superRest=supersetRestLabel(effectivePair);
   html+=`<div class="workout-live-superset"><div class="workout-live-superset-head"><strong>Суперсет</strong><span>виконати вправи по черзі${superRest?' · Відпочинок '+esc(superRest):''}</span></div><div class="workout-live-superset-body">${pair.map((y,i)=>card(y,true,false)+(i<pair.length-1?'<div class="workout-live-superset-divider"></div>':'')).join('')}</div></div>`;
  }else{used.add(x.id);html+=card(x,false,true)}
 }
 return html;
}




function commentsHTML(d,cid,day=isoToday()){
 let xs=(d.comments||[]).filter(x=>x.day===day),canComment=!!clientAccess(d.client).features?.trainer_review;
 let rows=xs.length?xs.map(x=>`<div class="exercise comment-row"><strong>${x.author==='trainer'?'Тренер':'Клієнт'}</strong><div style="margin-top:6px">${esc(x.body)}</div>${canComment&&(session?.role==='trainer'||session?.role===x.author)?`<button class="danger comment-delete" data-day="${esc(day)}" onclick="deleteComment(${x.id},${cid},this.dataset.day)">Видалити</button>`:''}</div>`).join(''):'<p class="muted">Коментарів ще немає.</p>';
 let composer=canComment?`<textarea id="commentText" placeholder="Написати коментар..." style="width:100%;min-height:90px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:14px;font:inherit;resize:vertical"></textarea><br><br><button data-day="${esc(day)}" onclick="saveComment(${cid},this.dataset.day)">Надіслати</button>`:'<p class="muted" style="margin-bottom:0">Коментарі доступні в тарифі «Онлайн-ведення».</p>';
 return `<div class="card"><h2>Коментарі</h2>${rows}${composer}</div>`;
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
   html+=`<div class="exercise" style="border-color:#6b5b00;padding:0;overflow:hidden"><div style="padding:12px 16px;background:#232116;border-bottom:1px solid #4d4300"><strong style="color:var(--yellow)">Суперсет</strong></div><div style="padding:6px 16px">${pair.map((y,i)=>`<div style="padding:12px 0;${i<pair.length-1?'border-bottom:1px solid var(--line)':''}"><strong>${esc(y.exercise)}</strong><div class="muted">План: ${y.sets} × ${esc(repeatPlanText(y))}${restLabel(y)?` · Відпочинок ${esc(restLabel(y))}`:``}<span style="display:block;margin-top:3px">RIR ${rirPlan(y).join(' / ')}</span></div></div>`).join('')}</div></div>`;
  }else{
   used.add(x.id);
   html+=`<div class="exercise"><strong>${esc(x.exercise)}</strong>${x.technique_url?` ${techniqueLinkHTML(x.technique_url,'Техніка',true)}`:'' }<div class="muted">План: ${x.sets} × ${esc(repeatPlanText(x))}${restLabel(x)?` · Відпочинок ${esc(restLabel(x))}`:``}<span style="display:block;margin-top:3px">RIR ${rirPlan(x).join(' / ')}</span></div></div>`;
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
 let raw=[];
 for(let n=1;n<=count;n++){
  let w=$(`#w${pid}_${n}`),r=$(`#r${pid}_${n}`),i=$(`#i${pid}_${n}`);
  if(!w.value&&!r.value&&!i.value)continue;
  if(!w.value||!r.value||!i.value)return alert(`Заповни вагу, повтори та RIR у підході ${n}`);
  raw.push({set_number:n,weight:+w.value,reps:+r.value,rir:+i.value});
 }
 if(!raw.length)return alert('Заповни хоча б один підхід');
 let currentData=window.currentClientData||{},sid=workoutDraftSessionId(currentData);
 // Finalize the currently running rest timer before reading the draft so the
 // last measured rest interval is included in the saved exercise.
 cancelRestTimer();
 let draft=readWorkoutDraft(sid,pid),day=workoutDataDay(currentData);
 let existing=(currentData.result_sets||[]).filter(s=>+s.program_id===+pid&&s.day===day);
 let sets=raw.map(s=>{
   let prior=existing.find(x=>+x.set_number===+s.set_number),rest=draft[s.set_number]?.rest_seconds;
   if(rest===undefined||rest===null||rest==='')rest=prior?.rest_seconds;
   let restSeconds=rest===undefined||rest===null||rest===''?null:Math.max(0,Math.min(3600,Math.round(+rest||0)));
   return {...s,rest_seconds:restSeconds};
 });
 let auxSets=[];
 try{auxSets=collectWorkoutAuxSets(currentData,pid)}catch(e){return alert(e.message||'Перевір додаткові підходи')}
 let planned=(currentData.program||[]).find(v=>+v.id===+pid),effective=planned?workoutEffectiveExercise(planned):null,repeatMode=normalizeRepeatMode(effective?.repeat_mode);
 await api('/result-sets',{method:'POST',body:JSON.stringify({client_id:cid,program_id:pid,exercise,repeat_mode:repeatMode,sets,aux_sets:auxSets})});
 clearWorkoutDraft(sid,pid);
 let body=$('#exerciseBody'+pid);
 if(body){
   body.innerHTML=`<div class="exercise" style="margin-top:12px"><strong>Виконано ✓</strong>${sets.map(s=>`<div class="muted" style="margin-top:6px">Підхід ${s.set_number}: ${s.weight} кг × ${repeatResultText(s.reps,repeatMode)} · RIR ${s.rir}${+s.rest_seconds>0?` · ⏱ ${formatSetRest(s.rest_seconds)}`:''}</div>`).join('')}<div style="margin-top:12px"><button class="dark" onclick="showClientTraining(${cid})">Редагувати</button></div></div>`;
   body.classList.add('hidden');
   let toggle=body.previousElementSibling;if(toggle)toggle.classList.remove('open');
 }
 let d=await loadClientData(cid);window.currentClientData=d;
 let cal=$('#clientCalendar');if(cal)cal.innerHTML=calendarHTML(d,'client');
 setTimeout(async()=>{await showClientTraining(cid);focusNextUnfinishedExercise(pid)},250);
}
