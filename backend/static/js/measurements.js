// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function measurementMetricConfig(){
 return [
  ['weight','Вага','кг'],['shoulders','Плечі','см'],['neck','Шия','см'],['chest','Груди','см'],
  ['waist','Талія','см'],['hips','Таз','см'],['thighs','Стегна','см'],['calves','Гомілки','см'],
  ['arms','Руки','см'],['forearms','Передпліччя','см']
 ];
}
function measurementPairConfig(){
 return {
  thighs:{label:'Стегна',left:'thighs_left',right:'thighs_right',legacy:'thighs'},
  calves:{label:'Гомілки',left:'calves_left',right:'calves_right',legacy:'calves'},
  arms:{label:'Руки',left:'arms_left',right:'arms_right',legacy:'arms'},
  forearms:{label:'Передпліччя',left:'forearms_left',right:'forearms_right',legacy:'forearms'}
 };
}
function measurementPairValues(x,key){
 let p=measurementPairConfig()[key];if(!p)return null;
 let l=+x?.[p.left]||0,r=+x?.[p.right]||0,legacy=+x?.[p.legacy]||0;
 return {left:l,right:r,legacy};
}

function measurementRowHTML(x){
 let vals=[];
 measurementMetricConfig().forEach(([k,n,u])=>{
  let pair=measurementPairConfig()[k];
  if(pair){
   let pv=measurementPairValues(x,k);
   if(pv.left||pv.right) vals.push(n+' '+(pv.right?'права '+fmtProgress(pv.right)+' '+u:'')+(pv.left&&pv.right?' · ':'')+(pv.left?'ліва '+fmtProgress(pv.left)+' '+u:''));
   else if(pv.legacy) vals.push(n+' '+fmtProgress(pv.legacy)+' '+u);
  }else if(+x[k]) vals.push(k==='weight'?'<strong>'+x[k]+' '+u+'</strong>':n+' '+x[k]+' '+u);
 });
 return '<div class="exercise">'+(x.day?'<div class="muted" style="margin-bottom:7px">'+esc(x.day)+'</div>':'')+(vals.join(' · ')||'<span class="muted">Немає значень</span>')+'</div>';
}

function measureHTML(d){return `<div class="card"><h2>Заміри клієнта</h2><p class="muted">Ці дані заповнює клієнт у своєму кабінеті. Тут доступний лише перегляд історії.</p>${d.measurements.length?d.measurements.slice().reverse().map(x=>measurementRowHTML(x)).join(''):'<div class="empty-state"><strong>Заміри ще не додані.</strong>Коли клієнт внесе перші заміри, вони з’являться тут.</div>'}</div>`}

function measurementDaysLeft(lastDay){
 if(!lastDay)return 0;
 let last=new Date(lastDay+'T12:00:00'),next=new Date(last);next.setDate(next.getDate()+30);
 return Math.ceil((next-new Date())/86400000);
}


function measurementGender(d=window.currentClientData||{}){
 let raw=String(d?.client?.sex||'').trim().toLowerCase();
 if(/жіноч|жен|female|woman|girl|дів/.test(raw))return 'female';
 if(/чолов|муж|male|man|хлоп/.test(raw))return 'male';
 return 'male';
}
function measurementSpritePosition(key){
 return ({weight:[0,0],shoulders:[25,0],neck:[50,0],chest:[75,0],waist:[100,0],hips:[0,100],thighs:[25,100],calves:[50,100],arms:[75,100],forearms:[100,100]})[key]||[0,0];
}
function measurementVisualIcon(key,d=window.currentClientData||{}){
 let sex=measurementGender(d),p=measurementSpritePosition(key);
 return '<span class="measurement-generated-art sex-'+sex+' metric-art-'+key+'" style="--mx:'+p[0]+'%;--my:'+p[1]+'%" aria-hidden="true"></span>';
}


function measurementVisualCards(last,prev,d=window.currentClientData||{}){
 let metrics=measurementMetricConfig().filter(([k])=>k!=='weight');
 let cards=metrics.map(([k,n,u])=>{
  let pair=measurementPairConfig()[k];
  if(pair){
   let cur=measurementPairValues(last,k),old=measurementPairValues(prev,k);
   let hasPair=cur.left>0||cur.right>0;
   let pairHtml=hasPair
    ?'<div class="measurement-side-values">'+(cur.right?'<span><small>Права</small><b>'+fmtProgress(cur.right)+' '+u+'</b></span>':'')+(cur.left?'<span><small>Ліва</small><b>'+fmtProgress(cur.left)+' '+u+'</b></span>':'')+'</div>'
    :(cur.legacy?'<strong>'+fmtProgress(cur.legacy)+' <small>'+u+'</small></strong>':'<strong>—</strong>');
   let note=hasPair?'<em>Права / ліва окремо</em>':cur.legacy?'<em>Старий замір</em>':'<em>Ще не додано</em>';
   return '<div class="measurement-place-card metric-'+k+'"><div class="measurement-place-top">'+measurementVisualIcon(k,d)+'<span>'+n+'</span></div>'+pairHtml+note+'</div>';
  }
  let v=+last?.[k]||0,pv=+prev?.[k]||0,delta=(v>0&&pv>0)?v-pv:null;
  return '<div class="measurement-place-card metric-'+k+'"><div class="measurement-place-top">'+measurementVisualIcon(k,d)+'<span>'+n+'</span></div><strong>'+(v>0?fmtProgress(v)+' <small>'+u+'</small>':'—')+'</strong>'+(v<=0?'<em>Ще не додано</em>':delta===null?'<em>Без порівняння</em>':'<em class="'+(delta<0?'down':delta>0?'up':'')+'">'+(delta>0?'+':'')+fmtProgress(delta)+' '+u+'</em>')+'</div>';
 }).join('');
 return '<div class="measurement-places-grid">'+cards+'</div>';
}

function measurementWeightVisual(last,prev,d=window.currentClientData||{}){
 let v=+last?.weight||0,pv=+prev?.weight||0,delta=(v>0&&pv>0)?v-pv:null;
 return '<div class="measurement-weight-visual"><div class="measurement-place-top">'+measurementVisualIcon('weight',d)+'<span>Вага</span></div><div><strong>'+(v>0?fmtProgress(v)+' <small>кг</small>':'—')+'</strong>'+(v<=0?'<em>Ще не додано</em>':delta===null?'<em>Без порівняння</em>':'<em class="'+(delta<0?'down':delta>0?'up':'')+'">'+(delta>0?'+':'')+fmtProgress(delta)+' кг</em>')+'</div></div>';
}


function measurementMetricCards(last,prev){
 let metrics=measurementMetricConfig();
 return '<div class="measurement-metric-grid">'+metrics.filter(([k])=>+last?.[k]>0).map(([k,n,u])=>{
  let v=+last[k],pv=+prev?.[k],delta=pv>0?v-pv:null;
  return '<div class="measurement-metric"><span>'+n+'</span><strong>'+fmtProgress(v)+' <small>'+u+'</small></strong>'+(delta===null?'<em>—</em>':'<em class="'+(delta<0?'down':delta>0?'up':'')+'">'+(delta>0?'+':'')+fmtProgress(delta)+' '+u+'</em>')+'</div>';
 }).join('')+'</div>';
}


function measurementFormHTML(cid,early=false){
 const single=[
  ['mWeight','Вага, кг','89'],['mShoulders','Плечі, см','118'],['mNeck','Шия, см','39'],
  ['mChest','Груди, см','108'],['mWaist','Талія, см','82'],['mHips','Таз, см','98']
 ];
 const pairs=[
  ['Стегна','mThighsRight','mThighsLeft','60'],
  ['Гомілки','mCalvesRight','mCalvesLeft','39'],
  ['Руки','mArmsRight','mArmsLeft','39'],
  ['Передпліччя','mForearmsRight','mForearmsLeft','31']
 ];
 let singleHtml=single.map(([id,label,ph])=>'<div><label>'+label+'</label><input id="'+id+'" type="number" step="0.1" placeholder="Напр. '+ph+'"></div>').join('');
 let pairHtml=pairs.map(([label,rid,lid,ph])=>'<div class="measurement-pair-group"><div class="measurement-pair-title">'+label+'</div><div class="measurement-pair-inputs"><label><span>Права</span><input id="'+rid+'" type="number" step="0.1" placeholder="'+ph+'"></label><label><span>Ліва</span><input id="'+lid+'" type="number" step="0.1" placeholder="'+ph+'"></label></div></div>').join('');
 return '<div class="measurement-form '+(early?'early':'')+'"><div class="measurement-tip"><strong>Як робити заміри</strong><span>Вранці, натщесерце та в однакових умовах. Бажано — раз на 30 днів.</span></div><div class="measurement-form-section"><h3>Основні заміри</h3><div class="measure-grid measurement-input-grid">'+singleHtml+'</div></div><div class="measurement-form-section"><h3>Парні заміри</h3><p class="muted">Записуй праву та ліву сторону окремо — так легше бачити асиметрію.</p><div class="measurement-pair-list">'+pairHtml+'</div></div><div class="measurement-form-actions"><button onclick="saveMeasurement('+cid+',event)">Зберегти заміри</button>'+(early?'<button class="dark" onclick="document.getElementById(\'earlyMeasurementForm\').classList.add(\'hidden\')">Скасувати</button>':'')+'</div></div>';
}

function measurementHistoryCard(x,prev,cid=null){
 let ownerId=+(cid||((session&&session.role==='client')?session.client_id:0)||0),canDelete=ownerId>0&&session&&session.role==='client'&&x.id;
 let basics=[['weight','Вага','кг'],['shoulders','Плечі','см'],['neck','Шия','см'],['chest','Груди','см'],['waist','Талія','см'],['hips','Таз','см']];
 let basicHtml=basics.filter(([k])=>+x[k]>0).map(([k,n,u])=>{
  let d=+prev?.[k]>0?(+x[k]-+prev[k]):null;
  return '<div class="measurement-history-metric"><span>'+n+'</span><strong>'+fmtProgress(x[k])+' '+u+'</strong>'+(d===null?'':'<small class="'+(d<0?'down':d>0?'up':'')+'">'+(d>0?'+':'')+fmtProgress(d)+' '+u+'</small>')+'</div>';
 }).join('');
 let pairedHtml=Object.entries(measurementPairConfig()).map(([key,p])=>{
  let cur=measurementPairValues(x,key);if(!(cur.left||cur.right||cur.legacy))return '';
  if(cur.left||cur.right){
   return '<div class="measurement-history-pair"><div class="measurement-history-pair-title">'+p.label+'</div><div class="measurement-history-pair-sides">'+(cur.right?'<span><small>Права</small><b>'+fmtProgress(cur.right)+' см</b></span>':'')+(cur.left?'<span><small>Ліва</small><b>'+fmtProgress(cur.left)+' см</b></span>':'')+'</div></div>';
  }
  return '<div class="measurement-history-pair"><div class="measurement-history-pair-title">'+p.label+'</div><div class="measurement-history-legacy">'+fmtProgress(cur.legacy)+' см <small>старий формат</small></div></div>';
 }).join('');
 return '<div class="measurement-history-card redesigned-history"><div class="measurement-history-head"><div><span class="measurement-history-caption">Контрольна точка</span><strong>'+formatProgressDate(x.day)+'</strong></div>'+(canDelete?'<button type="button" class="measurement-delete" aria-label="Видалити замір" title="Видалити замір" data-day="'+esc(x.day)+'" onclick="deleteMeasurement('+ownerId+','+(+x.id)+',this.dataset.day)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>':'')+'</div>'+(basicHtml?'<div class="measurement-history-section"><h4>Основні</h4><div class="measurement-history-grid">'+basicHtml+'</div></div>':'')+(pairedHtml?'<div class="measurement-history-section"><h4>Права / ліва</h4><div class="measurement-history-pair-grid">'+pairedHtml+'</div></div>':'')+'</div>';
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
  ${last?`<div class="measurement-visual-overview"><div class="measurement-section-title"><div><h2>Останні заміри</h2><p class="muted">${formatProgressDate(last.day)}</p></div></div>${measurementWeightVisual(last,prev,d)}<div class="measurement-visual-subhead"><h3>Вимірювання тіла</h3><span>Останні значення</span></div>${measurementVisualCards(last,prev,d)}</div>`:''}
  ${last&&prev?`<div class="card"><h2>Зміни з минулого разу</h2><p class="muted">Порівняно з ${formatProgressDate(prev.day)}</p>${measurementChangesHTML(last,prev)}</div>`:''}
  ${last&&!due?`<div class="card measurement-early"><p class="muted">Не обов’язково чекати 30 днів, якщо тренер попросив зробити контрольні заміри раніше.</p><button class="dark" onclick="document.getElementById('earlyMeasurementForm').classList.toggle('hidden')">Додати замір раніше</button><div id="earlyMeasurementForm" class="hidden" style="margin-top:14px">${measurementFormHTML(cid,true)}</div></div>`:''}
  ${xs.length?`<div class="card"><button class="exercise-toggle" onclick="toggleCalendar('measurementHistory',this)"><span><strong>Історія замірів</strong><span class="muted" style="display:block;margin-top:5px">${xs.length} ${xs.length===1?'запис':'записів'}</span></span><span class="arrow">⌄</span></button><div id="measurementHistory" class="hidden measurement-history">${xs.slice().reverse().map((x,i,rev)=>measurementHistoryCard(x,rev[i+1])).join('')}</div></div>`:''}
 </div>`;
}

function ukDays(n){let x=Math.abs(n)%100,y=x%10;return x>10&&x<20?'днів':y===1?'день':y>=2&&y<=4?'дні':'днів'}


function measurementChangesHTML(a,b){
 let metrics=measurementMetricConfig();
 return '<div class="measurement-changes">'+metrics.filter(([k])=>+a[k]>0&&+b[k]>0).map(([k,n,u])=>{let d=+a[k]-+b[k];return '<div><span>'+n+'</span><strong>'+fmtProgress(b[k])+' → '+fmtProgress(a[k])+' '+u+'</strong><em class="'+(d<0?'down':d>0?'up':'')+'">'+(d===0?'без змін':(d>0?'+':'')+fmtProgress(d)+' '+u)+'</em></div>'}).join('')+'</div>';
}


async function saveMeasurement(cid,ev=null){
 let btn=ev?.currentTarget||null;
 let body={
  client_id:cid,weight:+mWeight.value||0,shoulders:+mShoulders.value||0,neck:+mNeck.value||0,
  chest:+mChest.value||0,waist:+mWaist.value||0,hips:+mHips.value||0,
  thighs:0,calves:0,arms:0,forearms:0,
  thighs_right:+mThighsRight.value||0,thighs_left:+mThighsLeft.value||0,
  calves_right:+mCalvesRight.value||0,calves_left:+mCalvesLeft.value||0,
  arms_right:+mArmsRight.value||0,arms_left:+mArmsLeft.value||0,
  forearms_right:+mForearmsRight.value||0,forearms_left:+mForearmsLeft.value||0
 };
 if(!Object.entries(body).some(([k,v])=>k!=='client_id'&&v>0))return alert('Заповни хоча б один замір');
 if(btn?.disabled)return;
 if(btn){btn.disabled=true;btn.textContent='Зберігаємо…';btn.classList.add('measurement-saving')}
 try{
  await api('/measurements',{method:'POST',body:JSON.stringify(body)});
  if(btn){btn.textContent='✓ Замір збережено';btn.classList.add('measurement-saved')}
  let d=await loadClientData(cid);window.currentClientData=d;
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
   let d=await loadClientData(cid);window.currentClientData=d;
   showClientSection('measurements');
 }catch(e){alert(e?.message||'Не вдалося видалити замір')}
}
