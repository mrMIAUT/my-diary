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
     setTimeout(()=>{
       document.getElementById('nextReviewModal')?.remove();
       document.body.insertAdjacentHTML('beforeend',`<div class="modal trainer-review-complete-modal" id="nextReviewModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-review-complete-card"><div class="trainer-review-complete-top"><div class="trainer-review-complete-icon">✓</div><button type="button" class="trainer-review-complete-close" aria-label="Закрити" onclick="nextReviewModal.remove()">✕</button></div><span class="trainer-review-complete-kicker">ПЕРЕВІРКА ЗАВЕРШЕНА</span><h2>Тренування перевірено</h2><p>У цього клієнта все перевірено.</p><div class="trainer-review-complete-next"><span>Ще очікують перевірки</span><strong>${remaining}</strong></div><div class="trainer-review-complete-actions"><button type="button" class="trainer-review-complete-primary" onclick="nextReviewModal.remove();openNextPendingClient(${cid})">Наступний клієнт <span>→</span></button><button type="button" class="trainer-review-complete-secondary" onclick="nextReviewModal.remove()">Залишитися тут</button></div></div></div>`);
     },120);
   }
 }catch(e){restore();alert(e.message||'Не вдалося позначити тренування перевіреним. Спробуй ще раз.')}
}

async function openNextPendingClient(currentCid){
 let cs=await loadClients(),next=cs.find(c=>c.id!==currentCid&&(+c.needs_review_count||0)>0)||cs.find(c=>(+c.needs_review_count||0)>0);
 if(!next)return trainerHome();
 await openClient(next.id,'program');
 setTimeout(openFirstPendingWorkout,180);
}


function trainerPreviousSameWorkoutDay(d,session){
 let day=sessionDay(session),dayName=String(session?.day_name||'').trim();
 if(!day||!dayName)return '';
 let days=(d.workout_sessions||[])
   .filter(x=>x.status==='finished'&&String(x.day_name||'').trim()===dayName&&sessionDay(x)&&sessionDay(x)<day)
   .map(sessionDay).filter(Boolean).sort().reverse();
 return days[0]||'';
}

function trainerWorkoutClientCommentHTML(d,session){
 let day=sessionDay(session);
 if(!day)return '';
 let comments=(d.comments||[])
   .filter(x=>x.day===day&&x.author==='client'&&(+x.program_id||0)===0&&!String(x.exercise||'').trim())
   .slice()
   .sort((a,b)=>(+a.id||0)-(+b.id||0));
 if(!comments.length)return '';
 return '<div class="trainer-review-client-comment"><div class="trainer-review-client-comment-head"><span>Коментар клієнта</span><small>після тренування</small></div>'
   +comments.map(x=>'<p>'+esc(x.body||'')+'</p>').join('')
   +'</div>';
}

function trainerReviewExerciseRowsHTML(d,session,previousDay=''){
 let day=sessionDay(session),dayName=session.day_name||'Тренування';
 let snap=sessionProgramForDate(d,dayName,day);
 let sets=(d.result_sets||[]).filter(x=>x.day===day);
 let prevSets=previousDay?(d.result_sets||[]).filter(x=>x.day===previousDay):[];
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
 let norm=v=>String(v||'').trim().toLocaleLowerCase('uk-UA');
 return exercises.map(x=>{
   let cur=uniqueResultSets(sets.filter(s=>+s.program_id===+x.id)).sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   if(!cur.length){
     cur=uniqueResultSets(sets.filter(s=>norm(s.exercise)===norm(x.exercise))).sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   }
   let prev=uniqueResultSets(prevSets.filter(s=>+s.program_id===+x.id||norm(s.exercise)===norm(x.exercise))).sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
   let aux=(d.aux_sets||[]).filter(a=>a.day===day&&(+a.program_id===+x.id||norm(a.exercise)===norm(x.exercise)));
   let warm=aux.filter(a=>a.kind==='warmup').sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));
   return '<div class="trainer-review-exercise">'
     +'<div class="trainer-review-exercise-head"><div><strong>'+esc(x.exercise||'Вправа')+'</strong>'+(previousDay?'<small>Попереднє: '+esc(formatProgressDate(previousDay))+'</small>':'')+'</div><span>'+cur.length+' підходи</span></div>'
     +(warm.length?'<div class="trainer-review-aux warmup"><small>Розминка</small>'+warm.map(a=>'<span>'+esc(String(a.weight??0))+' кг × '+esc(repeatResultText(a.reps,a.repeat_mode||cur[0]?.repeat_mode||x.repeat_mode))+'</span>').join('')+'</div>':'')
     +'<div class="trainer-review-sets">'+cur.map(s=>{
       let mode=normalizeRepeatMode(s.repeat_mode||x.repeat_mode),p=prev.find(z=>+z.set_number===+s.set_number&&normalizeRepeatMode(z.repeat_mode||x.repeat_mode)===mode),deltaHTML='';
       if(p){
         let dw=(+s.weight||0)-(+p.weight||0),dr=(+s.reps||0)-(+p.reps||0),deltas=[];
         if(dw!==0)deltas.push('<i class="'+(dw>0?'delta-up':'delta-down')+'">'+(dw>0?'+':'')+fmtProgress(dw)+' кг</i>');
         if(dr!==0)deltas.push('<i class="'+(dr>0?'delta-up':'delta-down')+'">'+(dr>0?'+':'')+fmtProgress(dr)+' повт.</i>');
         if(!deltas.length)deltas.push('<i class="delta-same">без змін</i>');
         deltaHTML='<span class="trainer-review-set-deltas">'+deltas.join('')+'</span>';
       }
       let currentMeta='<span class="trainer-review-set-meta"><span class="trainer-review-rir">RIR '+esc(String(s.rir??'—'))+'</span>'+(+s.rest_seconds>0?'<span class="trainer-review-meta-separator">|</span><span class="trainer-review-rest">⏱ '+esc(formatSetRest(s.rest_seconds))+'</span>':'')+'</span>';
       let previousMeta=p?'<span class="trainer-review-set-meta previous"><span class="trainer-review-rir">RIR '+esc(String(p.rir??'—'))+'</span>'+(+p.rest_seconds>0?'<span class="trainer-review-meta-separator">|</span><span class="trainer-review-rest">⏱ '+esc(formatSetRest(p.rest_seconds))+'</span>':'')+'</span>':'';
       let drops=aux.filter(a=>a.kind==='drop'&&+a.parent_set_number===+s.set_number).sort((a,b)=>(+a.aux_number||0)-(+b.aux_number||0));
       return '<section class="trainer-review-set-block"><div class="trainer-review-set-current"><small>Підхід '+esc(String(s.set_number||''))+'</small><b>'+esc(String(s.weight??0))+' кг × '+esc(repeatResultText(s.reps,mode))+'</b>'+currentMeta+'</div>'
         +(drops.length?'<div class="trainer-review-drop-list">'+drops.map((a,i)=>'<div><span>↳ Дроп '+(i+1)+'</span><strong>'+esc(String(a.weight??0))+' кг × '+esc(repeatResultText(a.reps,a.repeat_mode||mode))+'</strong></div>').join('')+'</div>':'')
         +(p?'<div class="trainer-review-set-previous"><span>Попереднє</span><strong>'+esc(String(p.weight??0))+' кг × '+esc(repeatResultText(p.reps,p.repeat_mode||mode))+'</strong>'+previousMeta+deltaHTML+'</div>':'')
       +'</section>';
     }).join('')+'</div>'
   +'</div>';
 }).join('');
}

function trainerPendingReviewsHTML(d){
 if(!clientAccess(d.client).features?.trainer_review)return '';
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
         +trainerWorkoutClientCommentHTML(d,s)
         +trainerReviewExerciseRowsHTML(d,s)
         +'<label class="trainer-review-comment"><span>Коментар клієнту <small>необов’язково</small></span><textarea id="reviewComment'+s.id+'" placeholder="Наприклад: у жимі ногами наступного разу залиш 1–2 повтори в запасі..."></textarea></label>'
         +'<div class="trainer-review-actions"><button onclick="reviewWorkout('+s.id+','+d.client.id+',true,event.currentTarget)">Надіслати та перевірити</button><button class="dark" onclick="reviewWorkout('+s.id+','+d.client.id+',false,event.currentTarget)">Без коментаря</button></div>'
       +'</div>'
     +'</div>';
   }).join('')+'</div>'
 +'</section>';
}

function trainerWorkoutCalendarDates(d){
 let sessionDates=(d.workout_sessions||[]).filter(x=>x.status==='finished').map(sessionDay).filter(Boolean);
 let setDates=(d.result_sets||[]).map(x=>x.day).filter(Boolean);
 return [...new Set([...sessionDates,...setDates])].sort().reverse();
}

function trainerWorkoutCalendarState(d){
 let cid=+d?.client?.id||0,st=window.trainerWorkoutCalendarViewState;
 if(!st||+st.cid!==cid){
   let dates=trainerWorkoutCalendarDates(d),latest=dates[0]||isoToday();
   st={cid,month:String(latest).slice(0,7),day:'',sid:0};
   window.trainerWorkoutCalendarViewState=st;
 }
 return st;
}

function trainerWorkoutCalendarDayHTML(d,day,targetSid=0){
 if(!day)return '<div class="trainer-workout-calendar-empty">Обери дату з позначкою, щоб переглянути тренування.</div>';
 let canReview=!!clientAccess(d.client).features?.trainer_review;
 let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished'&&sessionDay(x)===day).slice().sort((a,b)=>(+b.id||0)-(+a.id||0));
 if(targetSid)sessions.sort((a,b)=>(+b.id===+targetSid)-(+a.id===+targetSid));
 if(!sessions.length){
   let hasSets=(d.result_sets||[]).some(x=>x.day===day);
   if(!hasSets)return '<div class="trainer-workout-calendar-empty">На цю дату тренування не знайдено.</div>';
   sessions=[{id:0,day_name:'Тренування',workout_day:day,status:'finished',trainer_reviewed:true}];
 }
 return '<div class="trainer-workout-calendar-day-head"><div><small>ОБРАНА ДАТА</small><strong>'+esc(formatProgressDate(day))+'</strong></div><span>'+sessions.length+' '+(sessions.length===1?'тренування':'тренування')+'</span></div>'
   +trainerCalendarDayVolumeMiniHTML(d,day)
   +'<div class="trainer-workout-calendar-sessions">'+sessions.map(s=>{
      let reviewed=!!s.trainer_reviewed,sid=+s.id||0,previousDay=trainerPreviousSameWorkoutDay(d,s);
      return '<article class="trainer-workout-calendar-session" data-session="'+sid+'">'
        +'<div class="trainer-workout-calendar-session-head">'
          +'<div><strong>'+esc(s.day_name||'Тренування')+'</strong><span>'+esc(day)+(previousDay?' · попереднє '+esc(formatProgressDate(previousDay)):'')+'</span></div>'
          +'<div class="trainer-workout-calendar-session-meta">'
            +(s.duration_seconds!==undefined&&s.duration_seconds!==null?workoutDurationBadgeHTML(s,'trainer-calendar-duration'):'')
            +'<span class="trainer-workout-calendar-status '+(reviewed||!canReview?'reviewed':'pending')+'">'+(reviewed?'Перевірено ✓':canReview?'До перевірки':'Завершено')+'</span>'
          +'</div>'
        +'</div>'
        +trainerWorkoutClientCommentHTML(d,s)
        +'<div class="trainer-workout-calendar-exercises">'+trainerReviewExerciseRowsHTML(d,s,previousDay)+'</div>'
        +(reviewed&&s.trainer_comment?'<div class="trainer-workout-calendar-comment"><small>Коментар тренера</small><p>'+esc(s.trainer_comment)+'</p></div>':'')
        +(canReview&&!reviewed&&sid?'<button class="trainer-workout-calendar-review-link" onclick="focusTrainerPendingSession('+sid+')">Перейти до перевірки →</button>':'')
      +'</article>';
   }).join('')+'</div>';
}

function trainerWorkoutCalendarHTML(d){
 let st=trainerWorkoutCalendarState(d),dates=trainerWorkoutCalendarDates(d);
 if(!st.month)st.month=(dates[0]||isoToday()).slice(0,7);
 let [yy,mm]=st.month.split('-').map(Number);
 if(!yy||!mm){let now=isoToday();st.month=now.slice(0,7);[yy,mm]=st.month.split('-').map(Number)}
 let first=new Date(yy,mm-1,1),count=new Date(yy,mm,0).getDate(),start=(first.getDay()+6)%7,dateSet=new Set(dates),cells='';
 for(let i=0;i<start;i++)cells+='<span class="trainer-workout-calendar-cell empty"></span>';
 for(let n=1;n<=count;n++){
   let day=st.month+'-'+String(n).padStart(2,'0'),has=dateSet.has(day),selected=st.day===day;
   cells+='<button type="button" class="trainer-workout-calendar-cell '+(has?'has-workout ':'')+(selected?'selected':'')+'" '+(has?'data-day="'+esc(day)+'" onclick="selectTrainerWorkoutCalendarDay(this.dataset.day)"':'disabled')+'><span>'+n+'</span>'+(has?'<i></i>':'')+'</button>';
 }
 let monthNames=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
 return '<section class="trainer-workout-calendar-card">'
   +'<div class="trainer-workout-calendar-title"><div><small>ІСТОРІЯ</small><h2>Календар тренувань</h2><p>Завершені тренування клієнта за датами.</p></div><span>'+dates.length+'</span></div>'
   +'<div class="trainer-workout-calendar-nav"><button type="button" onclick="changeTrainerWorkoutCalendarMonth(-1)" aria-label="Попередній місяць">‹</button><strong>'+monthNames[mm-1]+' '+yy+' р.</strong><button type="button" onclick="changeTrainerWorkoutCalendarMonth(1)" aria-label="Наступний місяць">›</button></div>'
   +'<div class="trainer-workout-calendar-weekdays">'+['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(x=>'<span>'+x+'</span>').join('')+'</div>'
   +'<div class="trainer-workout-calendar-grid">'+cells+'</div>'
   +trainerProgressVolumePanelHTML(d)
   +'<div id="trainerWorkoutCalendarDetails" class="trainer-workout-calendar-details">'+trainerWorkoutCalendarDayHTML(d,st.day,st.sid)+'</div>'
 +'</section>';
}

function renderTrainerWorkoutCalendar(){
 let host=document.getElementById('trainerWorkoutHistory'),d=window.currentClientData||{};
 if(host)host.innerHTML=trainerWorkoutCalendarHTML(d);
}

function changeTrainerWorkoutCalendarMonth(delta){
 let d=window.currentClientData||{},st=trainerWorkoutCalendarState(d),parts=st.month.split('-').map(Number),dt=new Date(parts[0],parts[1]-1+delta,1);
 st.month=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');st.day='';st.sid=0;renderTrainerWorkoutCalendar();
}

function selectTrainerWorkoutCalendarDay(day,sid=0){
 let d=window.currentClientData||{},st=trainerWorkoutCalendarState(d);
 let same=st.day===day&&(!sid||+st.sid===+sid);
 st.day=same?'':(day||'');
 st.sid=same?0:(+sid||0);
 if(day)st.month=String(day).slice(0,7);
 if(!same)window.trainerProgressVolumeRange='day';
 renderTrainerWorkoutCalendar();
 if(!same)requestAnimationFrame(()=>document.getElementById('trainerWorkoutCalendarDetails')?.scrollIntoView({behavior:'smooth',block:'nearest'}));
}

function openTrainerWorkoutCalendar(day,sid=0){
 let d=window.currentClientData||{},st=trainerWorkoutCalendarState(d);
 if(day){st.month=String(day).slice(0,7);st.day=day}
 st.sid=+sid||0;renderTrainerWorkoutCalendar();
 setTimeout(()=>document.getElementById('trainerWorkoutHistory')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
}

function focusTrainerPendingSession(sid){
 let id=+sid||0;
 let programBtn=document.querySelector('.trainer-client-tabs [data-tab="program"]');
 if(programBtn)showTrainerClientTab('program',programBtn,false);
 let card=document.querySelector('#trainerPendingReviewQueue .trainer-review-card[data-session="'+id+'"]');
 if(!card)return;
 let btn=card.querySelector('.trainer-review-toggle'),body=card.querySelector('.trainer-review-detail');
 if(body?.classList.contains('hidden')&&btn)toggleTrainerPendingReview(btn);
 requestAnimationFrame(()=>setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),40));
}

function trainerTrainingTabHTML(d){
 return trainerPendingReviewsHTML(d)+programHTML(d);
}

function trainerProgressPeriodDays(){
 let p=window.trainerProgressPeriod||'90';
 return p==='30'?30:p==='180'?180:p==='all'?0:90;
}

function trainerProgressPeriodStart(){
 let days=trainerProgressPeriodDays();
 if(!days)return '';
 let d=new Date();
 d.setDate(d.getDate()-days);
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function trainerProgressInPeriod(day){
 let from=trainerProgressPeriodStart();
 return !from||!day||day>=from;
}

function trainerProgressSets(d){
 return uniqueResultSets((d.result_sets||[]).filter(x=>x.day&&trainerProgressInPeriod(x.day)));
}

function trainerProgressVolume(sets){
 // Same formula as client Progress: working weight × completed reps.
 return Math.round((sets||[]).reduce((sum,x)=>sum+(Math.max(0,+x.weight||0)*Math.max(0,+x.reps||0)),0));
}

function trainerProgressVolumeAnchor(d){
 let st=trainerWorkoutCalendarState(d),day=st.day;
 if(day)return day;
 let dates=trainerWorkoutCalendarDates(d);
 return dates[0]||isoToday();
}

function trainerProgressDateISO(dt){
 return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}

function trainerProgressVolumeBounds(d,mode){
 let anchor=trainerProgressVolumeAnchor(d),parts=anchor.split('-').map(Number),base=new Date(parts[0],parts[1]-1,parts[2]);
 let from=anchor,to=anchor,label=formatProgressDate(anchor);
 if(mode==='week'){
   let weekday=(base.getDay()+6)%7,start=new Date(base);start.setDate(base.getDate()-weekday);
   let end=new Date(start);end.setDate(start.getDate()+6);
   from=trainerProgressDateISO(start);to=trainerProgressDateISO(end);label=formatProgressDate(from)+' — '+formatProgressDate(to);
 }else if(mode==='month'){
   let start=new Date(base.getFullYear(),base.getMonth(),1),end=new Date(base.getFullYear(),base.getMonth()+1,0);
   from=trainerProgressDateISO(start);to=trainerProgressDateISO(end);
   label=base.toLocaleDateString('uk-UA',{month:'long',year:'numeric'});
 }else if(mode==='90'){
   let start=new Date(base);start.setDate(base.getDate()-89);
   from=trainerProgressDateISO(start);to=anchor;label='Останні 3 міс. до '+formatProgressDate(anchor);
 }
 return {from,to,label,anchor};
}

function trainerProgressVolumeSetsForBounds(d,bounds){
 return uniqueResultSets((d.result_sets||[]).filter(x=>x.day&&x.day>=bounds.from&&x.day<=bounds.to));
}

function trainerProgressMuscleVolumes(d,sets){
 let lib=window.exerciseLibrary||{},muscles=Array.isArray(lib.muscles)?lib.muscles:[],exercises=Array.isArray(lib.exercises)?lib.exercises:[];
 let names=new Map(muscles.map(m=>[+m.id,m.name||'М’яз']));
 let byName=new Map(exercises.map(x=>[String(x.name||'').trim().toLocaleLowerCase('uk-UA'),x]));
 let programById=new Map((d.program||[]).map(x=>[+x.id,x.exercise||'']));
 let totals=new Map();
 (sets||[]).forEach(s=>{
   let vol=(Math.max(0,+s.weight||0)*Math.max(0,+s.reps||0));if(!(vol>0))return;
   let performed=String(s.exercise||programById.get(+s.program_id)||'').trim().toLocaleLowerCase('uk-UA');
   let found=byName.get(performed);
   let ids=[...new Set((found?.primary_muscle_ids||[]).map(Number).filter(Boolean))];
   if(ids.length){
     let share=vol/ids.length;
     ids.forEach(id=>{let name=names.get(id)||'Без групи';totals.set(name,(totals.get(name)||0)+share)});
   }else totals.set('Без групи',(totals.get('Без групи')||0)+vol);
 });
 return [...totals.entries()].map(([name,volume])=>({name,volume})).sort((a,b)=>b.volume-a.volume||a.name.localeCompare(b.name,'uk-UA'));
}

function trainerCalendarDayVolumeMiniHTML(d,day){
 if(!day)return '';
 let sets=uniqueResultSets((d.result_sets||[]).filter(x=>x.day===day)),volume=trainerProgressVolume(sets);
 if(!sets.length)return '';
 return '<div class="trainer-calendar-day-volume"><div><small>Обсяг дня</small><strong>'+volume.toLocaleString('uk-UA')+' кг</strong></div><div><small>Робочих підходів</small><strong>'+sets.length+'</strong></div></div>';
}

function trainerProgressVolumePanelHTML(d){
 let mode=window.trainerProgressVolumeRange||'day',bounds=trainerProgressVolumeBounds(d,mode),sets=trainerProgressVolumeSetsForBounds(d,bounds);
 let volume=trainerProgressVolume(sets),muscles=trainerProgressMuscleVolumes(d,sets),expanded=!!window.trainerProgressMusclesExpanded;
 let shown=expanded?muscles:muscles.slice(0,4),max=Math.max(0,...muscles.map(x=>x.volume));
 let tabs=[['day','День'],['week','Тиждень'],['month','Місяць'],['90','3 міс.']];
 let muscleHTML=shown.length?shown.map(x=>{
   let pct=max>0?Math.max(4,Math.min(100,(x.volume/max)*100)):0;
   return '<div class="trainer-volume-muscle-row"><div><span>'+esc(x.name)+'</span><strong>'+Math.round(x.volume).toLocaleString('uk-UA')+' кг</strong></div><i><b style="width:'+pct.toFixed(1)+'%"></b></i></div>';
 }).join(''):'<div class="trainer-progress-empty compact">Немає даних про обсяг за цей період.</div>';
 return '<section class="trainer-volume-panel">'
   +'<div class="trainer-volume-head"><div><small>ТРЕНУВАЛЬНИЙ ОБСЯГ</small><h3>'+esc(bounds.label)+'</h3></div></div>'
   +'<div class="trainer-volume-tabs">'+tabs.map(([v,label])=>'<button class="'+(mode===v?'active':'')+'" onclick="setTrainerProgressVolumeRange(\''+v+'\')">'+label+'</button>').join('')+'</div>'
   +'<div class="trainer-volume-kpis"><div><span>Загальний обсяг</span><strong>'+volume.toLocaleString('uk-UA')+' кг</strong></div><div><span>Робочих підходів</span><strong>'+sets.length+'</strong></div></div>'
   +'<div class="trainer-volume-muscles-head"><span>Обсяг за м’язами</span><small>основні м’язи</small></div>'
   +'<div class="trainer-volume-muscles">'+muscleHTML+'</div>'
   +(muscles.length>4?'<button type="button" class="trainer-volume-more" onclick="toggleTrainerProgressMuscles()">'+(expanded?'Згорнути':'Усі м’язи · '+muscles.length)+'</button>':'')
  +'</section>';
}

function setTrainerProgressVolumeRange(mode){
 window.trainerProgressVolumeRange=mode||'day';
 renderTrainerWorkoutCalendar();
}

function toggleTrainerProgressMuscles(){
 window.trainerProgressMusclesExpanded=!window.trainerProgressMusclesExpanded;
 renderTrainerWorkoutCalendar();
}

function trainerProgressExerciseStats(d){
 let sets=trainerProgressSets(d),groups={};
 sets.forEach(x=>{
   let name=String(x.exercise||'Вправа').trim()||'Вправа';
   (groups[name]||(groups[name]=[])).push(x);
 });
 return Object.entries(groups).map(([name,xs])=>{
   xs.sort((a,b)=>String(a.day||'').localeCompare(String(b.day||''))||(+a.set_number||0)-(+b.set_number||0));
   let best=xs.slice().sort((a,b)=>(+b.weight||0)-(+a.weight||0)||(+b.reps||0)-(+a.reps||0))[0]||{};
   let dates=[...new Set(xs.map(x=>x.day).filter(Boolean))].sort();
   let firstDay=dates[0]||'',lastDay=dates[dates.length-1]||'';
   let first=xs.filter(x=>x.day===firstDay).slice().sort((a,b)=>(+b.weight||0)-(+a.weight||0)||(+b.reps||0)-(+a.reps||0))[0]||{};
   let last=xs.filter(x=>x.day===lastDay).slice().sort((a,b)=>(+b.weight||0)-(+a.weight||0)||(+b.reps||0)-(+a.reps||0))[0]||{};
   return {
     name, bestWeight:+best.weight||0,bestReps:+best.reps||0,bestDay:best.day||'',
     firstWeight:+first.weight||0,lastWeight:+last.weight||0,
     delta:(+last.weight||0)-(+first.weight||0),sessions:dates.length,lastDay
   };
 }).sort((a,b)=>b.bestWeight-a.bestWeight||b.sessions-a.sessions);
}

function trainerProgressActivityDetail(x){
 let type=cardioDisplayType(x.cardio_type||''),parts=[];
 if(+x.minutes>0)parts.push((+x.minutes)+' хв');
 if(type==='Доріжка'&&+x.speed>0)parts.push(fmtProgress(x.speed)+' км/год');
 if(+x.incline>0)parts.push((type==='Доріжка'?'нахил ':'опір ')+fmtProgress(x.incline)+(type==='Доріжка'?'%':''));
 return parts.join(' · ');
}

function toggleTrainerProgressActivity(){
 window.trainerProgressActivityExpanded=!window.trainerProgressActivityExpanded;
 let box=document.getElementById('progress');
 if(box)box.innerHTML=trainerProgressHTML(window.currentClientData||{});
}

function trainerProgressActivityHTML(d){
 let xs=(d.cardio||[]).filter(x=>x.day&&trainerProgressInPeriod(x.day)).slice().sort((a,b)=>String(b.day).localeCompare(String(a.day)));
 if(!xs.length)return '<div class="trainer-progress-empty">Клієнт ще не додавав активність за цей період.</div>';
 let totalSteps=xs.reduce((s,x)=>s+(+x.steps||0),0);
 let cardio=xs.filter(x=>x.cardio_type);
 let totalMinutes=cardio.reduce((s,x)=>s+(+x.minutes||0),0);
 let avgSteps=Math.round(totalSteps/Math.max(1,xs.length));
 let latest=xs[0]||{},expanded=!!window.trainerProgressActivityExpanded,shown=expanded?xs:xs.slice(0,3);
 return '<div class="trainer-progress-activity-stats">'
   +'<div><span>Середні кроки</span><strong>'+avgSteps.toLocaleString('uk-UA')+'</strong><small>'+xs.length+' дн. з даними</small></div>'
   +'<div><span>Кардіо</span><strong>'+totalMinutes+' хв</strong><small>'+cardio.length+' записів</small></div>'
   +'<div><span>Остання активність</span><strong>'+esc(formatProgressDate(latest.day))+'</strong><small>'+(latest.cardio_type?esc(cardioDisplayType(latest.cardio_type)):((+latest.steps||0).toLocaleString('uk-UA')+' кроків'))+'</small></div>'
  +'</div>'
  +'<div class="trainer-progress-activity-list '+(expanded?'expanded':'')+'">'+shown.map(x=>{
    let detail=trainerProgressActivityDetail(x),steps=(+x.steps||0)?Number(x.steps).toLocaleString('uk-UA')+' кроків':'';
    return '<div><span><strong>'+esc(formatProgressDate(x.day))+'</strong><small>'+esc(x.cardio_type?cardioDisplayType(x.cardio_type):'Кроки')+(detail?' · '+esc(detail):'')+'</small></span>'+(steps?'<b>'+steps+'</b>':'')+'</div>';
  }).join('')+'</div>'
  +(xs.length>3?'<button type="button" class="trainer-activity-more" onclick="toggleTrainerProgressActivity()">'+(expanded?'Згорнути':'Уся активність · '+xs.length)+'</button>':'');
}

function trainerProgressPRHTML(d){
 let stats=trainerProgressExerciseStats(d).filter(x=>x.bestWeight>0);
 if(!stats.length)return '<div class="trainer-progress-empty">PR з’являться після перших тренувань із записаною вагою.</div>';
 return '<div class="trainer-progress-pr-grid">'+stats.slice(0,6).map(x=>'<div class="trainer-progress-pr-card"><span>PR</span><strong>'+esc(x.name)+'</strong><b>'+fmtProgress(x.bestWeight)+' кг'+(x.bestReps?' × '+x.bestReps:'')+'</b><small>'+esc(formatProgressDate(x.bestDay))+'</small></div>').join('')+'</div>';
}

function trainerProgressCompareHTML(d){
 let stats=trainerProgressExerciseStats(d).filter(x=>x.sessions>=2);
 if(!stats.length)return '<div class="trainer-progress-empty">Потрібно щонайменше два тренування вправи для порівняння.</div>';
 return '<div class="trainer-progress-compare-list">'+stats.slice(0,8).map(x=>{
   let cls=x.delta>0?'up':x.delta<0?'down':'same',sign=x.delta>0?'+':'';
   return '<div><span><strong>'+esc(x.name)+'</strong><small>'+x.sessions+' тренувань · останнє '+esc(formatProgressDate(x.lastDay))+'</small></span><b class="'+cls+'">'+fmtProgress(x.firstWeight)+' → '+fmtProgress(x.lastWeight)+' кг <em>'+sign+fmtProgress(x.delta)+'</em></b></div>';
 }).join('')+'</div>';
}

function trainerProgressSummaryHTML(d){
 let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished'&&trainerProgressInPeriod(sessionDay(x)));
 let sets=trainerProgressSets(d),volume=trainerProgressVolume(sets),prs=trainerProgressExerciseStats(d).filter(x=>x.bestWeight>0).length;
 return '<div class="trainer-progress-summary">'
   +'<div><span>Тренувань</span><strong>'+sessions.length+'</strong><small>за період</small></div>'
   +'<div><span>Робочий обсяг</span><strong>'+volume.toLocaleString('uk-UA')+' кг</strong><small>вага × повтори</small></div>'
   +'<div><span>PR вправ</span><strong>'+prs+'</strong><small>особисті максимуми</small></div>'
  +'</div>';
}

function trainerProgressHTML(d){
 let period=window.trainerProgressPeriod||'90';
 let labels=[['30','1 міс.'],['90','3 міс.'],['180','6 міс.'],['all','Увесь час']];
 return '<div class="trainer-progress-page">'
   +'<div class="trainer-progress-hero"><div><small>ДИНАМІКА КЛІЄНТА</small><h2>Прогрес</h2><p>Тренування, активність, PR та порівняння результатів.</p></div>'
     +'<div class="trainer-progress-periods">'+labels.map(([v,label])=>'<button class="'+(period===v?'active':'')+'" onclick="setTrainerProgressPeriod(\''+v+'\')">'+label+'</button>').join('')+'</div>'
   +'</div>'
   +trainerProgressSummaryHTML(d)
   +'<div id="trainerWorkoutHistory">'+trainerWorkoutCalendarHTML(d)+'</div>'
   +'<section id="trainerProgressActivity" class="trainer-progress-section"><div class="trainer-progress-section-head"><div><h3>Активність</h3><p>Кроки та кардіо клієнта.</p></div></div>'+trainerProgressActivityHTML(d)+'</section>'
   +'<section class="trainer-progress-section"><div class="trainer-progress-section-head"><div><h3>Особисті рекорди</h3><p>Найбільша робоча вага по вправах.</p></div></div>'+trainerProgressPRHTML(d)+'</section>'

  +'</div>';
}

function setTrainerProgressPeriod(period){
 window.trainerProgressPeriod=period||'90';
 let box=document.getElementById('progress');
 if(box)box.innerHTML=trainerProgressHTML(window.currentClientData||{});
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
   let key=`${r.program_id}|${r.day}|${r.set_number}|${r.weight}|${r.reps}|${r.rir}|${r.rest_seconds??''}`;
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
        let mode=normalizeRepeatMode(s.repeat_mode||x.repeat_mode),p=prev.find(z=>z.set_number===s.set_number&&normalizeRepeatMode(z.repeat_mode||x.repeat_mode)===mode);
        return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div>Підхід ${s.set_number}: <strong>${s.weight} кг × ${repeatResultText(s.reps,mode)}</strong> · RIR ${s.rir}${+s.rest_seconds>0?` · ⏱ ${formatSetRest(s.rest_seconds)}`:''}</div>${p?`<div class="muted" style="margin-top:4px">Минулого ${p.weight} кг × ${repeatResultText(p.reps,p.repeat_mode||mode)} · RIR ${p.rir}${+p.rest_seconds>0?` · ⏱ ${formatSetRest(p.rest_seconds)}`:''} · різниця: вага ${resultDelta((+s.weight)-(+p.weight))} кг · повтори ${resultDelta((+s.reps)-(+p.reps))}</div>`:'<div class="muted" style="margin-top:4px">Немає попереднього результату для порівняння.</div>'}</div>`;
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
