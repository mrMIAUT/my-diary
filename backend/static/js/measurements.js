// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function measurementRowHTML(x){let vals=[];if(+x.weight)vals.push(`<strong>${x.weight} кг</strong>`);if(+x.waist)vals.push(`Талія ${x.waist} см`);if(+x.hips)vals.push(`Таз ${x.hips} см`);if(+x.thighs)vals.push(`Стегна ${x.thighs} см`);if(+x.arms)vals.push(`Руки ${x.arms} см`);if(+x.chest)vals.push(`Груди ${x.chest} см`);return `<div class="exercise">${x.day?`<div class="muted" style="margin-bottom:7px">${esc(x.day)}</div>`:''}${vals.join(' · ')||'<span class="muted">Немає значень</span>'}</div>`}

function measureHTML(d){return `<div class="card"><h2>Заміри клієнта</h2><p class="muted">Ці дані заповнює клієнт у своєму кабінеті. Тут доступний лише перегляд історії.</p>${d.measurements.length?d.measurements.slice().reverse().map(x=>measurementRowHTML(x)).join(''):'<div class="empty-state"><strong>Заміри ще не додані.</strong>Коли клієнт внесе перші заміри, вони з’являться тут.</div>'}</div>`}

function measurementDaysLeft(lastDay){
 if(!lastDay)return 0;
 let last=new Date(lastDay+'T12:00:00'),next=new Date(last);next.setDate(next.getDate()+30);
 return Math.ceil((next-new Date())/86400000);
}

function measurementMetricCards(last,prev){
 let metrics=[['weight','Вага','кг'],['waist','Талія','см'],['hips','Таз','см'],['thighs','Стегна','см'],['arms','Руки','см'],['chest','Груди','см']];
 return `<div class="measurement-metric-grid">${metrics.filter(([k])=>+last?.[k]>0).map(([k,n,u])=>{
   let v=+last[k],pv=+prev?.[k],delta=pv>0?v-pv:null;
   return `<div class="measurement-metric"><span>${n}</span><strong>${fmtProgress(v)} <small>${u}</small></strong>${delta===null?'<em>—</em>':`<em class="${delta<0?'down':delta>0?'up':''}">${delta>0?'+':''}${fmtProgress(delta)} ${u}</em>`}</div>`;
 }).join('')}</div>`;
}

function measurementFormHTML(cid,early=false){
 return `<div class="measurement-form ${early?'early':''}">
  <div class="measurement-tip"><strong>Як робити заміри</strong><span>Вранці, натщесерце та в однакових умовах. Бажано — раз на 30 днів.</span></div>
  <div class="measure-grid"><div><label>Вага, кг</label><input id="mWeight" type="number" step="0.1" placeholder="Напр. 89"></div><div><label>Талія, см</label><input id="mWaist" type="number" step="0.1" placeholder="Напр. 82"></div><div><label>Таз, см</label><input id="mHips" type="number" step="0.1" placeholder="Напр. 98"></div><div><label>Стегна, см</label><input id="mThighs" type="number" step="0.1" placeholder="Напр. 60"></div><div><label>Руки, см</label><input id="mArms" type="number" step="0.1" placeholder="Напр. 39"></div><div><label>Груди, см</label><input id="mChest" type="number" step="0.1" placeholder="Напр. 108"></div></div>
  <div class="measurement-form-actions"><button onclick="saveMeasurement(${cid},event)">Зберегти заміри</button>${early?`<button class="dark" onclick="document.getElementById('earlyMeasurementForm').classList.add('hidden')">Скасувати</button>`:''}</div>
 </div>`;
}

function measurementHistoryCard(x,prev,cid=null){
 let metrics=[['weight','Вага','кг'],['waist','Талія','см'],['hips','Таз','см'],['thighs','Стегна','см'],['arms','Руки','см'],['chest','Груди','см']];
 let ownerId=+(cid||((session&&session.role==='client')?session.client_id:0)||0);
 let canDelete=ownerId>0&&session&&session.role==='client'&&x.id;
 return `<div class="measurement-history-card">
   <div class="measurement-history-date">${formatProgressDate(x.day)}</div>
   <div class="measurement-history-values">${metrics.filter(([k])=>+x[k]>0).map(([k,n,u])=>{let d=+prev?.[k]>0?(+x[k]-+prev[k]):null;return `<span><b>${n}</b> ${fmtProgress(x[k])} ${u}${d===null?'':` <small>${d>0?'+':''}${fmtProgress(d)}</small>`}</span>`}).join('')}</div>
   ${canDelete?`<button type="button" class="measurement-delete" aria-label="Видалити замір" title="Видалити замір" onclick="deleteMeasurement(${ownerId},${+x.id},'${x.day}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>`:''}
 </div>`;
}

function clientMeasurementsHTML(d,cid){
 let xs=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day)),last=xs[xs.length-1],prev=xs[xs.length-2],left=last?measurementDaysLeft(last.day):0,due=!last||left<=0;
 let nextDate=last?(()=>{let z=new Date(last.day+'T12:00:00');z.setDate(z.getDate()+30);return z.toISOString().slice(0,10)})():isoToday();
 return `<div class="measurements-page">
  <div class="card measurement-next ${due?'due':''}">
   <div><span class="measurement-kicker">${due?'Час зробити заміри':'Наступні заміри'}</span><h2>${due?'Можна оновити дані':`Через ${left} ${ukDays(left)}`}</h2><p class="muted">${last?`Орієнтовна дата: ${formatProgressDate(nextDate)}`:'Додай перші заміри, щоб почати відстежувати зміни.'}</p></div>
   ${due?`<button onclick="document.getElementById('dueMeasurementForm').classList.toggle('hidden')">Зробити заміри</button>`:''}
  </div>
  ${due?`<div id="dueMeasurementForm" class="hidden card">${measurementFormHTML(cid)}</div>`:''}
  ${last?`<div class="card"><div class="measurement-section-title"><div><h2>Останні заміри</h2><p class="muted">${formatProgressDate(last.day)}</p></div></div>${measurementMetricCards(last,prev)}</div>`:''}
  ${last&&prev?`<div class="card"><h2>Зміни з минулого разу</h2><p class="muted">Порівняно з ${formatProgressDate(prev.day)}</p>${measurementChangesHTML(last,prev)}</div>`:''}
  ${last&&!due?`<div class="card measurement-early"><p class="muted">Не обов’язково чекати 30 днів, якщо тренер попросив зробити контрольні заміри раніше.</p><button class="dark" onclick="document.getElementById('earlyMeasurementForm').classList.toggle('hidden')">Додати замір раніше</button><div id="earlyMeasurementForm" class="hidden" style="margin-top:14px">${measurementFormHTML(cid,true)}</div></div>`:''}
  ${xs.length?`<div class="card"><button class="exercise-toggle" onclick="toggleCalendar('measurementHistory',this)"><span><strong>Історія замірів</strong><span class="muted" style="display:block;margin-top:5px">${xs.length} ${xs.length===1?'запис':'записів'}</span></span><span class="arrow">⌄</span></button><div id="measurementHistory" class="hidden measurement-history">${xs.slice().reverse().map((x,i,rev)=>measurementHistoryCard(x,rev[i+1])).join('')}</div></div>`:''}
 </div>`;
}

function ukDays(n){let x=Math.abs(n)%100,y=x%10;return x>10&&x<20?'днів':y===1?'день':y>=2&&y<=4?'дні':'днів'}

function measurementChangesHTML(a,b){
 let metrics=[['weight','Вага','кг'],['waist','Талія','см'],['hips','Таз','см'],['thighs','Стегна','см'],['arms','Руки','см'],['chest','Груди','см']];
 return `<div class="measurement-changes">${metrics.filter(([k])=>+a[k]>0&&+b[k]>0).map(([k,n,u])=>{let d=+a[k]-+b[k];return `<div><span>${n}</span><strong>${fmtProgress(b[k])} → ${fmtProgress(a[k])} ${u}</strong><em class="${d<0?'down':d>0?'up':''}">${d===0?'без змін':`${d>0?'+':''}${fmtProgress(d)} ${u}`}</em></div>`}).join('')}</div>`;
}

async function saveMeasurement(cid,ev=null){
 let btn=ev?.currentTarget||null;
 let body={client_id:cid,weight:+mWeight.value||0,waist:+mWaist.value||0,hips:+mHips.value||0,thighs:+mThighs.value||0,arms:+mArms.value||0,chest:+mChest.value||0};
 if(!Object.values(body).slice(1).some(v=>v>0))return alert('Заповни хоча б один замір');
 if(btn?.disabled)return;
 if(btn){btn.disabled=true;btn.textContent='Зберігаємо…';btn.classList.add('measurement-saving')}
 try{
   await api('/measurements',{method:'POST',body:JSON.stringify(body)});
   if(btn){btn.textContent='✓ Замір збережено';btn.classList.add('measurement-saved')}
   let d=await api('/client/'+cid);window.currentClientData=d;
   setTimeout(()=>showClientSection('measurements'),250);
 }catch(e){
   if(btn){btn.disabled=false;btn.textContent='Зберегти заміри';btn.classList.remove('measurement-saving')}
   alert(e?.message||'Не вдалося зберегти заміри');
 }
}

async function deleteMeasurement(cid,mid,day){
 if(!confirm(`Видалити замір за ${formatProgressDate(day)}? Цю дію не можна скасувати.`))return;
 try{
   await api('/measurements/'+mid+'?client_id='+cid,{method:'DELETE'});
   let d=await api('/client/'+cid);window.currentClientData=d;
   showClientSection('measurements');
 }catch(e){alert(e?.message||'Не вдалося видалити замір')}
}
