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

function cardioDisplayType(type){return type==='Велосипед'?'Велотренажер':type}
function activityIconKindForCardio(type){
 let t=cardioDisplayType(type||'');
 if(t==='Доріжка')return 'treadmill';
 if(t==='Орбітрек')return 'elliptical';
 if(t==='Велотренажер')return 'bike';
 return 'other';
}
function savedActivityHTML(cur,cid){
 let type=cardioDisplayType(cur.cardio_type||''),hasCardio=!!cur.cardio_type,metrics=[];
 if(hasCardio&&cur.minutes)metrics.push(['Тривалість',cur.minutes+' хв']);
 if(hasCardio&&cur.speed&&cur.cardio_type==='Доріжка')metrics.push(['Швидкість',String(cur.speed)]);
 if(hasCardio&&cur.incline){
  let label=cur.cardio_type==='Доріжка'?'Нахил':'Опір',suffix=cur.cardio_type==='Доріжка'?'%':'';
  metrics.push([label,String(cur.incline)+suffix]);
 }
 if(cur.steps&&hasCardio)metrics.push(['Кроки',Number(cur.steps).toLocaleString('uk-UA')]);
 let heroLabel=hasCardio?type:'Кроки';
 let heroSub=hasCardio?(cur.minutes?cur.minutes+' хв':'Кардіо'):(cur.steps?Number(cur.steps).toLocaleString('uk-UA')+' кроків':'');
 let icon=hasCardio?activityIcon(activityIconKindForCardio(cur.cardio_type)):activityIcon('steps');
 return `<div class="card cardio-activity-card activity-saved-card">
   <div class="activity-saved-top">
     <div><span class="activity-saved-kicker">Активність за сьогодні</span><strong>Готово</strong></div>
     <span class="activity-saved-status">Виконано ✓</span>
   </div>
   <div id="cardioPanel" class="client-collapsible-body">
     <div class="activity-saved-hero">
       <span class="activity-saved-icon activity-svg-icon">${icon}</span>
       <div><strong>${esc(heroLabel)}</strong><small>${esc(heroSub)}</small></div>
     </div>
     ${metrics.length?`<div class="activity-saved-metrics">${metrics.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`:''}
     <button class="activity-saved-edit" onclick="event.stopPropagation();editCardio(${cid})">${uiIcon('edit')} Редагувати активність</button>
   </div>
 </div>`;
}
function cardioHTML(d,cid,readonly=false){
 let today=isoToday(),xs=d.cardio||[],cur=xs.find(x=>x.day===today)||{},saved=!!cur.id;
 if(readonly)return `<div class="card"><h2>Кардіо та активність</h2>${xs.length?xs.slice(0,30).map(x=>`<div class="exercise"><div class="between"><strong>${esc(x.day)}</strong><span>${x.steps||0} кроків</span></div>${x.cardio_type?`<div class="muted" style="margin-top:6px">${esc(cardioDisplayType(x.cardio_type))} · ${x.minutes||0} хв${cardioMetricHTML(x)}</div>`:'<div class="muted" style="margin-top:6px">Без окремого кардіо</div>'}</div>`).join(''):'<p class="muted">Даних ще немає.</p>'}</div>`;
 if(saved)return savedActivityHTML(cur,cid);
 return `<div class="card client-collapsible cardio-activity-card activity-always-open"><div id="cardioPanel" class="client-collapsible-body">${cardioEditHTML(cid,cur).replace(/^<div class="card">|<\/div>$/g,'')}</div></div>`;
}

function activityIcon(kind){
 const files={steps:'steps.svg',treadmill:'treadmill.svg',elliptical:'elliptical.svg',bike:'bike.svg',other:'other.svg'};
 return files[kind]?`<img src="/static/icons/activity/${files[kind]}" alt="" aria-hidden="true" class="activity-approved-icon">`:'';
}
function cardioMetricsHTML(type,cur={}){
 const treadmill=type==='Доріжка',other=type==='Інше';
 return `<div class="cardio-inline-editor">${other?`<div class="activity-custom-cardio"><label for="cardioCustomName">Вид активності</label><input id="cardioCustomName" type="text" maxlength="60" value="${esc(cur.custom_name||'')}" placeholder="Наприклад: теніс, футбол, плавання"></div>`:''}<div class="activity-metric-cards cardio-metric-inputs"><div class="activity-field-card"><div><label for="cardioMinutes">Тривалість</label><input id="cardioMinutes" type="number" inputmode="decimal" min="0" value="${cur.minutes||''}" placeholder="0"></div></div>${treadmill?`<div class="activity-field-card" id="cardioSpeedWrap"><div><label for="cardioSpeed">Швидкість</label><input id="cardioSpeed" type="number" inputmode="decimal" min="0" step="0.1" value="${cur.speed||''}" placeholder="0"></div></div>`:''}${other?'':`<div class="activity-field-card"><div><label id="cardioMetricLabel" for="cardioIncline">${treadmill?'Нахил, %':'Опір'}</label><input id="cardioIncline" type="number" inputmode="decimal" min="0" step="${treadmill?'0.5':'1'}" value="${cur.incline||''}" placeholder="0"></div></div>`}</div></div>`;
}
function cardioEditHTML(cid,cur={}){
 const storedType=cardioDisplayType(cur.cardio_type||''),known=['Доріжка','Орбітрек','Велотренажер'],isOther=!!storedType&&!known.includes(storedType),selectedType=isOther?'Інше':storedType;
 const editCur={...cur,cardio_type:storedType,custom_name:isOther?cur.cardio_type:''};
 let cards=[['Доріжка','treadmill','Швидкість · нахил · час'],['Орбітрек','elliptical','Опір · час'],['Велотренажер','bike','Опір · час'],['Інше','other','Свій вид активності']];
 return `<div class="card cardio-editor-card"><h2>Активність за сьогодні</h2><p class="muted">Додай кроки та кардіо за сьогодні.</p><div class="activity-field-card activity-steps-card"><span class="activity-field-icon activity-svg-icon">${activityIcon('steps')}</span><div><label for="dailySteps">Кроки</label><input id="dailySteps" type="number" min="0" value="${cur.steps||''}" placeholder="0"></div></div><div class="activity-section-label">Кардіо</div><div class="cardio-entry-cards">${cards.map(([v,icon,sub])=>`<div class="cardio-entry-wrap"><button type="button" class="cardio-entry-card ${selectedType===v?'selected':''}" data-cardio-type="${v}" onclick="openCardioEntry(this)"><span class="cardio-entry-icon activity-svg-icon">${activityIcon(icon)}</span><span><strong>${v}</strong><small>${sub}</small></span><b>›</b></button>${selectedType===v?cardioMetricsHTML(v,editCur):''}</div>`).join('')}</div><select id="cardioType" class="cardio-type-native"><option value=""></option>${cards.map(([v])=>`<option value="${v}" ${selectedType===v?'selected':''}>${v}</option>`).join('')}</select><button class="cardio-save-neutral" onclick="saveCardio(${cid},event.currentTarget)">Зберегти активність</button></div>`;
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
 let selected=cardioType.value,treadmill=selected==='Доріжка',other=selected==='Інше';
 let custom=other?(document.getElementById('cardioCustomName')?.value||'').trim():'';
 if(other&&!custom)return alert('Вкажи вид активності');
 let minutesEl=document.getElementById('cardioMinutes'),speedEl=document.getElementById('cardioSpeed'),inclineEl=document.getElementById('cardioIncline');
 let storedType=selected==='Велотренажер'?'Велосипед':selected;
 let body={client_id:cid,day:isoToday(),cardio_type:other?custom:storedType,minutes:+(minutesEl?.value||0),speed:treadmill?(+(speedEl?.value||0)):0,incline:other?0:+(inclineEl?.value||0),steps:+dailySteps.value||0};
 if(!body.cardio_type&&!body.steps)return alert('Вкажи кроки або обери вид кардіо');
 if(body.cardio_type&&!body.minutes)return alert('Вкажи тривалість кардіо');
 let restore=setActionLoading(button,'Зберігаємо…');
 try{
  await api('/cardio',{method:'POST',body:JSON.stringify(body)});
  clearDailyDraft('cardio',cid);
  let d=await loadClientData(cid);
  window.currentClientData=d;
  window.clientTrainingTab='activity';
  await showClientTraining(cid);
 }catch(e){restore();alert(e.message||'Не вдалося зберегти активність. Перевір інтернет і спробуй ще раз.')}
}
