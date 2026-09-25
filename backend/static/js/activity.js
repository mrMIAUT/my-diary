// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function dailyDraftKey(kind,cid){return 'eplanDailyDraftV1_'+kind+'_'+cid+'_'+isoToday()}

function getDailyDraft(kind,cid){try{return JSON.parse(localStorage.getItem(dailyDraftKey(kind,cid))||'null')}catch(e){return null}}

function clearDailyDraft(kind,cid){try{localStorage.removeItem(dailyDraftKey(kind,cid))}catch(e){}}

function storeDailyDraft(kind,cid){if(!cid)return;let data={};for(let id of dailyDraftFields[kind]){let el=document.getElementById(id);if(el)data[id]=el.value}if(!Object.keys(data).length)return;try{localStorage.setItem(dailyDraftKey(kind,cid),JSON.stringify(data))}catch(e){}}

function restoreDailyDraft(kind,cid){let data=getDailyDraft(kind,cid);if(!data)return false;let any=false;for(let id of dailyDraftFields[kind]){let el=document.getElementById(id);if(el&&Object.prototype.hasOwnProperty.call(data,id)){el.value=data[id];any=true}}if(kind==='cardio')toggleCardioFields();return any}

function restoreTodayDrafts(cid,hasCardio,hasNutrition){
 if(hasCardio&&getDailyDraft('cardio',cid)){let p=document.getElementById('cardioPanel');if(p){p.classList.remove('hidden');let t=p.closest('.client-collapsible')?.querySelector('.exercise-toggle');t?.classList.add('open');let a=t?.querySelector('.arrow');if(a)a.textContent='⌃';restoreDailyDraft('cardio',cid)}}
 if(hasNutrition&&getDailyDraft('nutrition',cid)){let p=document.getElementById('bjuPanel');if(p){p.classList.remove('hidden');let t=p.closest('.client-collapsible')?.querySelector('.exercise-toggle');t?.classList.add('open');let a=t?.querySelector('.arrow');if(a)a.textContent='⌃';restoreDailyDraft('nutrition',cid)}}
}

function captureDailyDraft(e){if(session?.role!=='client')return;let id=e.target?.id,cid=session.client_id;if(!cid||!id)return;if(dailyDraftFields.cardio.includes(id))storeDailyDraft('cardio',cid);else if(dailyDraftFields.nutrition.includes(id))storeDailyDraft('nutrition',cid)}

function cardioMetricHTML(x,chip=false){
 let parts=[];
 if(x.speed&&x.cardio_type==='Доріжка')parts.push(chip?`<div class="cardio-chip">Швидкість ${x.speed}</div>`:` · швидкість ${x.speed}`);
 if(x.incline){
  let label=x.cardio_type==='Доріжка'?'Нахил':'Опір',suffix=x.cardio_type==='Доріжка'?'%':'';
  parts.push(chip?`<div class="cardio-chip">${label} ${x.incline}${suffix}</div>`:` · ${label.toLowerCase()} ${x.incline}${suffix}`);
 }
 return parts.join('');
}

function cardioHTML(d,cid,readonly=false){
 let today=isoToday(),xs=d.cardio||[],cur=xs.find(x=>x.day===today)||{},saved=!!cur.id;
 if(readonly)return `<div class="card"><h2>Кардіо та активність</h2>${xs.length?xs.slice(0,30).map(x=>`<div class="exercise"><div class="between"><strong>${esc(x.day)}</strong><span>${x.steps||0} кроків</span></div>${x.cardio_type?`<div class="muted" style="margin-top:6px">${esc(x.cardio_type)} · ${x.minutes||0} хв${cardioMetricHTML(x)}</div>`:'<div class="muted" style="margin-top:6px">Без окремого кардіо</div>'}</div>`).join(''):'<p class="muted">Даних ще немає.</p>'}</div>`;
 if(saved)return `<div class="card client-collapsible done"><button class="exercise-toggle" onclick="toggleClientPanel('cardioPanel',this)"><span><strong>Кардіо та активність сьогодні</strong><span class="client-status" style="display:block;margin-top:5px">Виконано ✓</span></span><span class="arrow">⌄</span></button><div id="cardioPanel" class="client-collapsible-body hidden"><div class="cardio-summary">${cur.cardio_type?`<div class="cardio-chip">${esc(cur.cardio_type)}</div><div class="cardio-chip">${cur.minutes||0} хв</div>${cardioMetricHTML(cur,true)}`:''}${cur.steps?`<div class="cardio-chip">${cur.steps} кроків</div>`:''}</div><button class="dark compact-edit" style="margin-top:14px" onclick="event.stopPropagation();editCardio(${cid})">Редагувати</button></div></div>`;
 return `<div class="card client-collapsible"><button class="exercise-toggle" onclick="toggleClientPanel('cardioPanel',this)"><span><strong>Кардіо та активність сьогодні</strong></span><span class="arrow">⌄</span></button><div id="cardioPanel" class="client-collapsible-body hidden">${cardioEditHTML(cid,cur).replace(/^<div class="card">|<\/div>$/g,'')}</div></div>`;
}

function cardioEditHTML(cid,cur={}){
 return `<div class="card"><h2>Кардіо та активність за сьогодні</h2><p class="muted">Можна заповнити кроки, кардіо або обидва.</p><div class="grid"><select id="cardioType" onchange="toggleCardioFields()"><option value="">Без окремого кардіо</option>${['Доріжка','Орбітрек','Велосипед'].map(v=>`<option value="${v}" ${cur.cardio_type===v?'selected':''}>${v}</option>`).join('')}</select><input id="dailySteps" type="number" min="0" value="${cur.steps||''}" placeholder="Кроків за день"></div><div id="cardioFields" class="grid" style="margin-top:12px"><input id="cardioMinutes" type="number" min="0" value="${cur.minutes||''}" placeholder="Хвилин"><input id="cardioSpeed" type="number" min="0" step="0.1" value="${cur.speed||''}" placeholder="Швидкість"><input id="cardioIncline" type="number" min="0" step="0.5" value="${cur.incline||''}" placeholder="Нахил, %"></div><button style="margin-top:12px" onclick="saveCardio(${cid},event.currentTarget)">Зберегти активність</button></div>`;
}

function editCardio(cid){
 let d=window.clientData||window.currentClientData;
 if(!d)return clientCabinet(cid);
 let cur=(d.cardio||[]).find(x=>x.day===isoToday())||{};
 let panel=document.getElementById('cardioPanel');
 if(!panel)return clientCabinet(cid);
 panel.classList.remove('hidden');
 panel.innerHTML=cardioEditHTML(cid,cur).replace(/^<div class="card">|<\/div>$/g,'');
 let toggle=panel.closest('.client-collapsible')?.querySelector('.exercise-toggle');
 if(toggle){toggle.classList.add('open');let arrow=toggle.querySelector('.arrow');if(arrow)arrow.textContent='⌃'}
 setTimeout(()=>{restoreDailyDraft('cardio',cid);toggleCardioFields()},0);
}

function toggleCardioFields(){
 let f=$('#cardioFields'),t=$('#cardioType'),speed=$('#cardioSpeed'),metric=$('#cardioIncline');if(!f||!t)return;
 f.style.display=t.value?'grid':'none';if(!t.value)return;
 let treadmill=t.value==='Доріжка';
 if(speed){speed.style.display=treadmill?'block':'none';speed.placeholder='Швидкість';if(!treadmill)speed.value=''}
 if(metric){metric.placeholder=treadmill?'Нахил, %':'Опір';metric.step=treadmill?'0.5':'1'}
}

async function saveCardio(cid,button=null){
 let type=cardioType.value,treadmill=type==='Доріжка';let body={client_id:cid,day:isoToday(),cardio_type:type,minutes:+cardioMinutes.value||0,speed:treadmill?(+cardioSpeed.value||0):0,incline:+cardioIncline.value||0,steps:+dailySteps.value||0};
 if(!body.cardio_type&&!body.steps)return alert('Вкажи кроки або обери вид кардіо');
 if(body.cardio_type&&!body.minutes)return alert('Вкажи тривалість кардіо');
 let restore=setActionLoading(button,'Зберігаємо…');
 try{
  await api('/cardio',{method:'POST',body:JSON.stringify(body)});
  clearDailyDraft('cardio',cid);
  await clientCabinet(cid);
 }catch(e){restore();alert(e.message||'Не вдалося зберегти активність. Перевір інтернет і спробуй ще раз.')}
}
