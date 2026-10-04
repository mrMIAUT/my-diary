// Lyfta-inspired workout UX for EPLAN redesign.
// Reuses existing workout data/API; adds previous-result context, quick set completion,
// rest auto-start and exercise history/PR visualization.

function lyftaHistoryExerciseName(d,pid){
  let x=(d?.program||[]).find(v=>+v.id===+pid);
  return x?workoutExerciseName(x):'';
}

function lyftaHistoryRows(d,pid,exerciseName=''){
  let name=String(exerciseName||lyftaHistoryExerciseName(d,pid)||'').trim();
  return (d?.result_sets||[])
    .filter(s=>+s.program_id===+pid && s.day && (!name||String(s.exercise||'').trim()===name))
    .slice()
    .sort((a,b)=>a.day.localeCompare(b.day)||(+a.set_number||0)-(+b.set_number||0));
}

function lyftaPreviousDaySets(d,pid,exerciseName=''){
  let rows=lyftaHistoryRows(d,pid,exerciseName).filter(s=>s.day<workoutDataDay(d));
  if(!rows.length)return [];
  let day=rows[rows.length-1].day;
  return rows.filter(s=>s.day===day).sort((a,b)=>(+a.set_number||0)-(+b.set_number||0));
}

function lyftaAllTimeBestWeight(d,pid,exerciseName=''){
  return Math.max(0,...lyftaHistoryRows(d,pid,exerciseName).filter(s=>s.day<workoutDataDay(d)).map(s=>+s.weight||0));
}

function lyftaRestSeconds(x){
  let s=+x.rest_seconds||0;
  if(s>0)return s;
  let t=String(x.rest_text||'').match(/(\d+(?:[.,]\d+)?)/);
  if(!t)return 90;
  let n=parseFloat(t[1].replace(',','.'));
  return Math.max(30,Math.round(n*60));
}

function lyftaCopyPrevious(pid,n){
  let d=window.currentClientData||{},prev=lyftaPreviousDaySets(d,pid),p=prev.find(x=>+x.set_number===+n);
  if(!p)return;
  let w=document.getElementById('w'+pid+'_'+n),r=document.getElementById('r'+pid+'_'+n),i=document.getElementById('i'+pid+'_'+n);
  if(w){w.value=p.weight;w.dispatchEvent(new Event('input',{bubbles:true}))}
  if(r){r.value=p.reps;r.dispatchEvent(new Event('input',{bubbles:true}))}
  if(i){i.value=p.rir;i.dispatchEvent(new Event('input',{bubbles:true}))}
  lyftaUpdatePR(pid,n);
}

function lyftaCopyAllPrevious(pid){
  let d=window.currentClientData||{},prev=lyftaPreviousDaySets(d,pid);
  prev.forEach(p=>lyftaCopyPrevious(pid,+p.set_number));
}

function lyftaUpdatePR(pid,n){
  let d=window.currentClientData||{},best=lyftaAllTimeBestWeight(d,pid);
  let w=+(document.getElementById('w'+pid+'_'+n)?.value||0);
  let badge=document.getElementById('pr'+pid+'_'+n);
  if(badge)badge.classList.toggle('show',best>0&&w>best);
}

function lyftaShouldStartRestAfterSet(x,d){
  if(!x?.superset_group)return true;
  let peers=(d?.program||[])
    .filter(v=>v.day_name===x.day_name&&v.superset_group===x.superset_group)
    .slice()
    .sort((a,b)=>(+a.superset_order||0)-(+b.superset_order||0)||(+a.id||0)-(+b.id||0));
  if(peers.length<2)return true;
  return +peers[peers.length-1].id===+x.id;
}

async function lyftaCompleteSet(pid,n,total,restSeconds,btn){
  if(btn?.classList.contains('done'))return;
  let w=document.getElementById('w'+pid+'_'+n),r=document.getElementById('r'+pid+'_'+n),i=document.getElementById('i'+pid+'_'+n);
  if(!w?.value||!r?.value||!i?.value){alert('Заповни вагу, повтори та RIR у цьому підході.');return}
  let row=btn?.closest('.lyfta-set-row'),wrap=btn?.closest('.lyfta-set-wrap');
  row?.classList.add('is-complete');
  wrap?.classList.add('is-complete');
  if(btn){btn.textContent='✓';btn.classList.add('done')}
  let sid=workoutDraftSessionId(window.currentClientData||{});
  if(sid)saveWorkoutDraft(sid,pid,n,'done',true);
  if(restSeconds>0){
    let tracking=n<total?{sid,pid,set_number:n}:false;
    await startRestTimer(restSeconds,null,tracking);
  }
}

function lyftaExerciseChartData(d,pid,exerciseName=''){
  let rows=lyftaHistoryRows(d,pid,exerciseName),by={};
  rows.forEach(s=>{
    by[s.day]=Math.max(by[s.day]||0,+s.weight||0);
  });
  return Object.entries(by).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
}

function showExerciseProgressHistory(pid){
  let d=window.currentClientData||{},x=(d.program||[]).find(v=>+v.id===+pid),exerciseName=x?workoutExerciseName(x):'',data=lyftaExerciseChartData(d,pid,exerciseName);
  let max=Math.max(1,...data.map(v=>v[1])),min=Math.min(...data.map(v=>v[1]),max),range=Math.max(1,max-min);
  let points=data.map((v,i)=>{
    let px=7+i*(86/Math.max(1,data.length-1));
    let py=72-((v[1]-min)/range)*48;
    return [px,py];
  });
  let chart=data.length>1
    ?'<div class="lyfta-history-chart"><svg viewBox="0 0 100 80" preserveAspectRatio="none"><polyline points="'+points.map(p=>p.join(',')).join(' ')+'" class="lyfta-history-line"/>'+points.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.7" class="lyfta-history-dot"/>').join('')+'</svg><div><span>'+esc(formatProgressDate(data[0][0]))+'</span><span>'+esc(formatProgressDate(data[data.length-1][0]))+'</span></div></div>'
    :'<div class="redesign-progress-empty-chart">Потрібно щонайменше два тренування цієї вправи для графіка.</div>';
  let rows=data.slice().reverse().map(v=>'<div class="lyfta-history-item"><span>'+esc(formatProgressDate(v[0]))+'</span><strong>'+fmtProgress(v[1])+' кг</strong></div>').join('');
  document.getElementById('exerciseHistoryModal')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div class="modal" id="exerciseHistoryModal" onclick="if(event.target===this)this.remove()"><div class="card lyfta-history-modal"><div class="between"><div><span class="lyfta-history-kicker">Історія вправи</span><h2>'+esc(exerciseName||x?.exercise||'Вправа')+'</h2></div><button class="dark" onclick="exerciseHistoryModal.remove()">✕</button></div>'+chart+'<div class="lyfta-history-list">'+rows+'</div></div></div>');
}

function setRows(x,d,cid){
  let rp=rirPlan(x),sid=workoutDraftSessionId(d),draft=readWorkoutDraft(sid,x.id),exerciseName=workoutExerciseName(x);
  let prev=lyftaPreviousDaySets(d,x.id,exerciseName),rest=lyftaRestSeconds(x);
  let restAfterSet=lyftaShouldStartRestAfterSet(x,d)?rest:0;
  let hasPrev=prev.length>0,total=workoutExerciseSetCount(x,d),planned=Math.max(1,+x.sets||1);
  let h='<div class="lyfta-set-head"><span>Підхід</span><span>Вага</span><span>Повтори</span><span>RIR</span><span></span></div>';
  for(let n=1;n<=total;n++){
    let q=draft[n]||{},p=prev.find(z=>+z.set_number===+n)||null,done=!!q.done,isExtra=n>planned;
    let wv=q.weight??'',rv=q.reps??'',iv=q.rir??'',rirHint=rp[n-1]??rp[rp.length-1]??'';
    h+='<div class="lyfta-set-wrap'+(done?' is-complete':'')+(isExtra?' is-extra':'')+'">'
      +'<div class="lyfta-prev-line"><span>'+(isExtra?'Додатковий · ':'')+'Попередньо</span><strong>'+(p?fmtProgress(p.weight)+' кг × '+p.reps+' · RIR '+p.rir+(+p.rest_seconds>0?' · ⏱ '+formatSetRest(p.rest_seconds):''):'—')+'</strong>'+(p?'<button onclick="lyftaCopyPrevious('+x.id+','+n+')">Повторити</button>':'')+'</div>'
      +'<div class="lyfta-set-row'+(done?' is-complete':'')+(isExtra?' is-extra':'')+'"><div class="setnum">'+n+(isExtra?'<small>+</small>':'')+'</div>'
        +'<div class="lyfta-input-wrap"><input id="w'+x.id+'_'+n+'" type="number" step="0.5" value="'+esc(String(wv))+'" placeholder="кг" oninput="saveWorkoutDraft('+sid+','+x.id+','+n+',\'weight\',this.value);lyftaUpdatePR('+x.id+','+n+')"><span id="pr'+x.id+'_'+n+'" class="lyfta-pr-badge">PR</span></div>'
        +'<input id="r'+x.id+'_'+n+'" type="number" value="'+esc(String(rv))+'" placeholder="'+esc(x.reps)+'" oninput="saveWorkoutDraft('+sid+','+x.id+','+n+',\'reps\',this.value)">'
        +'<input id="i'+x.id+'_'+n+'" type="number" value="'+esc(String(iv))+'" placeholder="'+esc(String(rirHint))+'" min="0" max="10" oninput="saveWorkoutDraft('+sid+','+x.id+','+n+',\'rir\',this.value)">'
        +'<button class="lyfta-set-done'+(done?' done':'')+'" onclick="lyftaCompleteSet('+x.id+','+n+','+total+','+restAfterSet+',this)">✓</button>'
      +'</div>'
    +'</div>';
  }
  let extras=Math.max(0,total-planned);
  let extraActions='<div class="lyfta-extra-set-actions"><button type="button" class="lyfta-add-set" onclick="addWorkoutExtraSet('+cid+','+x.id+')">＋ Додати підхід</button>'
    +(extras?'<button type="button" class="lyfta-remove-set" onclick="removeWorkoutExtraSet('+cid+','+x.id+')">− Прибрати останній</button>':'')
    +'</div>';
  return '<div class="lyfta-workout-tools">'
    +(hasPrev?'<button class="dark" onclick="lyftaCopyAllPrevious('+x.id+')">Повторити минуле</button>':'')
    +'<button class="dark" onclick="showExerciseProgressHistory('+x.id+')">Історія та графік</button>'
    +'</div>'+h+extraActions;
}
