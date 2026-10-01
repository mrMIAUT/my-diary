// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function dailyDraftKey(kind,cid){let scope=offlineLocalScopeKey();return scope?`eplanDailyDraftV2_${scope}_${kind}_${cid}_${isoToday()}`:''}

function getDailyDraft(kind,cid){try{let k=dailyDraftKey(kind,cid);return k?JSON.parse(localStorage.getItem(k)||'null'):null}catch(e){return null}}

function clearDailyDraft(kind,cid){try{let k=dailyDraftKey(kind,cid);if(k)localStorage.removeItem(k)}catch(e){}}

function storeDailyDraft(kind,cid){if(!cid)return;let k=dailyDraftKey(kind,cid);if(!k)return;let data={};for(let id of dailyDraftFields[kind]){let el=document.getElementById(id);if(el)data[id]=el.value}if(!Object.keys(data).length)return;try{localStorage.setItem(k,JSON.stringify(data))}catch(e){}}

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
 if(saved)return `<div class="card client-collapsible done cardio-activity-card"><button class="exercise-toggle" onclick="toggleClientPanel('cardioPanel',this)"><span><strong>Кардіо та активність сьогодні</strong><span class="client-status" style="display:block;margin-top:5px">Виконано ✓</span></span><span class="arrow">⌄</span></button><div id="cardioPanel" class="client-collapsible-body hidden"><div class="cardio-summary">${cur.cardio_type?`<div class="cardio-chip">${esc(cur.cardio_type)}</div><div class="cardio-chip">${cur.minutes||0} хв</div>${cardioMetricHTML(cur,true)}`:''}${cur.steps?`<div class="cardio-chip">${cur.steps} кроків</div>`:''}</div><button class="dark compact-edit" style="margin-top:14px" onclick="event.stopPropagation();editCardio(${cid})">Редагувати</button></div></div>`;
 return `<div class="card client-collapsible cardio-activity-card"><button class="exercise-toggle" onclick="toggleClientPanel('cardioPanel',this)"><span><strong>Кардіо та активність сьогодні</strong></span><span class="arrow">⌄</span></button><div id="cardioPanel" class="client-collapsible-body hidden">${cardioEditHTML(cid,cur).replace(/^<div class="card">|<\/div>$/g,'')}</div></div>`;
}

function activityIcon(kind){
 const icons={
  steps:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 3.5c1.6.4 2.6 2.1 2.2 3.8-.4 1.7-2 2.8-3.6 2.4-1.6-.4-2.6-2.1-2.2-3.8.4-1.7 2-2.8 3.6-2.4Zm7.6 10.8c1.6.4 2.6 2.1 2.2 3.8-.4 1.7-2 2.8-3.6 2.4-1.6-.4-2.6-2.1-2.2-3.8.4-1.7 2-2.8 3.6-2.4ZM9.6 11.1c1.3.8 2 2 1.8 3.2-.3 1.5-1.9 2.2-3.6 1.6-1.8-.6-3-2.3-2.7-3.8.3-1.4 2-2 4.5-1Zm6.7-6c1.7.6 3 2.3 2.7 3.8-.3 1.5-1.9 2.2-3.6 1.6-1.8-.6-3-2.3-2.7-3.8.3-1.5 1.9-2.2 3.6-1.6Z"/></svg>',
  treadmill:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h13M7 19l2-7h8l2 7M15 12l2-6h3M18 6h3M10 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 1.5-2 3 3 2 1.5 4M10 10l3 2 2-2"/></svg>',
  elliptical:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14M8 20l2-8m6 8-2-8M7 12h10M12 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 1.5v5m0-3-4-2m4 2 4-2M8 9l-2-4m10 4 2-4"/></svg>',
  bike:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="m6 17 4-7 3 7h5l-4-7h-4m2-3h3"/></svg>'
 };return icons[kind]||'';
}
function cardioMetricsHTML(type,cur={}){
 const treadmill=type==='Доріжка';
 return `<div class="cardio-inline-editor"><div class="activity-metric-cards cardio-metric-inputs"><div class="activity-field-card"><div><label for="cardioMinutes">Тривалість</label><input id="cardioMinutes" type="number" inputmode="decimal" min="0" value="${cur.minutes||''}" placeholder="0"></div></div>${treadmill?`<div class="activity-field-card" id="cardioSpeedWrap"><div><label for="cardioSpeed">Швидкість</label><input id="cardioSpeed" type="number" inputmode="decimal" min="0" step="0.1" value="${cur.speed||''}" placeholder="0"></div></div>`:''}<div class="activity-field-card"><div><label id="cardioMetricLabel" for="cardioIncline">${treadmill?'Нахил, %':'Опір'}</label><input id="cardioIncline" type="number" inputmode="decimal" min="0" step="${treadmill?'0.5':'1'}" value="${cur.incline||''}" placeholder="0"></div></div></div></div>`;
}
function cardioEditHTML(cid,cur={}){
 let cards=[['Доріжка','treadmill','Швидкість · нахил · час'],['Орбітрек','elliptical','Опір · час'],['Велосипед','bike','Опір · час']];
 return `<div class="card cardio-editor-card"><h2>Активність за сьогодні</h2><p class="muted">Додай кроки та кардіо за сьогодні.</p><div class="activity-field-card activity-steps-card"><span class="activity-field-icon activity-svg-icon">${activityIcon('steps')}</span><div><label for="dailySteps">Кроки</label><input id="dailySteps" type="number" min="0" value="${cur.steps||''}" placeholder="0"></div></div><div class="activity-section-label">Кардіо</div><div class="cardio-entry-cards">${cards.map(([v,icon,sub])=>`<div class="cardio-entry-wrap"><button type="button" class="cardio-entry-card ${cur.cardio_type===v?'selected':''}" data-cardio-type="${v}" onclick="openCardioEntry(this)"><span class="cardio-entry-icon activity-svg-icon">${activityIcon(icon)}</span><span><strong>${v}</strong><small>${sub}</small></span><b>›</b></button>${cur.cardio_type===v?cardioMetricsHTML(v,cur):''}</div>`).join('')}</div><select id="cardioType" class="cardio-type-native"><option value=""></option>${cards.map(([v])=>`<option value="${v}" ${cur.cardio_type===v?'selected':''}>${v}</option>`).join('')}</select><button class="cardio-save-neutral" onclick="saveCardio(${cid},event.currentTarget)">Зберегти активність</button></div>`;
}
function openCardioEntry(button){
 let select=$('#cardioType');if(!select)return;
 const type=button.dataset.cardioType||'',wrap=button.closest('.cardio-entry-wrap'),already=button.classList.contains('selected');
 document.querySelectorAll('.cardio-inline-editor').forEach(x=>x.remove());
 document.querySelectorAll('.cardio-entry-card').forEach(x=>x.classList.remove('selected'));
 if(already){select.value='';return}
 select.value=type;button.classList.add('selected');wrap.insertAdjacentHTML('beforeend',cardioMetricsHTML(type,{}));
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
 let speedWrap=$('#cardioSpeedWrap'),metricLabel=$('#cardioMetricLabel');
 if(speed){speed.style.display='block';if(speedWrap)speedWrap.style.display=treadmill?'flex':'none';speed.placeholder='0';if(!treadmill)speed.value=''}
 if(metric){metric.placeholder='0';metric.step=treadmill?'0.5':'1';if(metricLabel)metricLabel.textContent=treadmill?'Нахил, %':'Опір'}
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
