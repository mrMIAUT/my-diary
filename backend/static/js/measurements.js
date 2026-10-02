// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function measurementMetricConfig(){
 return [
  ['weight','Вага','кг'],['shoulders','Плечі','см'],['neck','Шия','см'],['chest','Груди','см'],
  ['waist','Талія','см'],['hips','Стегна','см'],['thighs','Стегно','см'],['calves','Гомілки','см'],
  ['arms','Руки','см'],['forearms','Передпліччя','см']
 ];
}
function measurementPairConfig(){
 return {
  thighs:{label:'Стегно',left:'thighs_left',right:'thighs_right',legacy:'thighs'},
  calves:{label:'Гомілка',left:'calves_left',right:'calves_right',legacy:'calves'},
  arms:{label:'Рука',left:'arms_left',right:'arms_right',legacy:'arms'},
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
   let sideNames=k==='thighs'?['Праве','Ліве']:k==='forearms'?['Праве','Ліве']:['Права','Ліва'];
   let sideDelta=(value,prevValue)=>{
    if(!(value>0)||!(prevValue>0))return '';
    let delta=value-prevValue,cls=delta<0?'down':delta>0?'up':'';
    return '<em class="measurement-side-delta neutral-change">'+(delta===0?'без змін':(delta>0?'+':'')+fmtProgress(delta)+' '+u)+'</em>';
   };
   let pairHtml=hasPair
    ?'<div class="measurement-side-values">'
      +(cur.right?'<span><small>'+sideNames[0]+'</small><b>'+fmtProgress(cur.right)+' '+u+'</b>'+sideDelta(cur.right,old.right)+'</span>':'')
      +(cur.left?'<span><small>'+sideNames[1]+'</small><b>'+fmtProgress(cur.left)+' '+u+'</b>'+sideDelta(cur.left,old.left)+'</span>':'')
     +'</div>'
    :(cur.legacy?'<strong>'+fmtProgress(cur.legacy)+' <small>'+u+'</small></strong>':'<strong>—</strong>');
   let note=!hasPair?(cur.legacy?'<em>Старий замір</em>':'<em>Ще не додано</em>'):'';
   return '<div class="measurement-place-card metric-'+k+'"><div class="measurement-place-top">'+measurementVisualIcon(k,d)+'<span>'+n+'</span></div>'+pairHtml+note+'</div>';
  }
  let v=+last?.[k]||0,pv=+prev?.[k]||0,delta=(v>0&&pv>0)?v-pv:null;
  return '<div class="measurement-place-card metric-'+k+'"><div class="measurement-place-top">'+measurementVisualIcon(k,d)+'<span>'+n+'</span></div><strong>'+(v>0?fmtProgress(v)+' <small>'+u+'</small>':'—')+'</strong>'+(v<=0?'<em>Ще не додано</em>':delta===null?'<em>Без порівняння</em>':'<em class="neutral-change">'+(delta>0?'+':'')+fmtProgress(delta)+' '+u+'</em>')+'</div>';
 }).join('');
 return '<div class="measurement-places-grid">'+cards+'</div>';
}

function measurementWeightVisual(last,prev,d=window.currentClientData||{}){
 let v=+last?.weight||0,pv=+prev?.weight||0,delta=(v>0&&pv>0)?v-pv:null;
 return '<div class="measurement-weight-visual"><div class="measurement-place-top">'+measurementVisualIcon('weight',d)+'<span>Вага</span></div><div><strong>'+(v>0?fmtProgress(v)+' <small>кг</small>':'—')+'</strong>'+(v<=0?'<em>Ще не додано</em>':delta===null?'<em>Без порівняння</em>':'<em class="neutral-change">'+(delta>0?'+':'')+fmtProgress(delta)+' кг</em>')+'</div></div>';
}


function measurementMetricCards(last,prev){
 let single=[['weight','Вага','кг'],['shoulders','Плечі','см'],['neck','Шия','см'],['chest','Груди','см'],['waist','Талія','см'],['hips','Стегна','см']];
 let html=single.filter(([k])=>+last?.[k]>0).map(([k,n,u])=>{
  let v=+last[k],pv=+prev?.[k],delta=pv>0?v-pv:null;
  return '<div class="measurement-metric"><span>'+n+'</span><strong>'+fmtProgress(v)+' <small>'+u+'</small></strong>'+(delta===null?'<em>—</em>':'<em class="neutral-change">'+(delta>0?'+':'')+fmtProgress(delta)+' '+u+'</em>')+'</div>';
 }).join('');
 Object.entries(measurementPairConfig()).forEach(([key,p])=>{
  let cur=measurementPairValues(last,key);if(!(cur.left||cur.right||cur.legacy))return;
  html+='<div class="measurement-metric paired"><span>'+p.label+'</span>'+(cur.right||cur.left?'<div class="measurement-metric-sides">'+(cur.right?'<b><small>Права</small>'+fmtProgress(cur.right)+' см</b>':'')+(cur.left?'<b><small>Ліва</small>'+fmtProgress(cur.left)+' см</b>':'')+'</div>':'<strong>'+fmtProgress(cur.legacy)+' <small>см</small></strong>')+'</div>';
 });
 return '<div class="measurement-metric-grid">'+html+'</div>';
}

function measurementFormHTML(cid,early=false,existing=null){
 const isEdit=!!existing,mid=existing?.id||0,day=existing?.day||isoToday();
 const single=[
  ['mWeight','Вага, кг','89','weight'],['mShoulders','Плечі, см','118','shoulders'],['mNeck','Шия, см','39','neck'],
  ['mChest','Груди, см','108','chest'],['mWaist','Талія, см','82','waist'],['mHips','Стегна, см','98','hips']
 ];
 const pairs=[
  ['Стегно','mThighsRight','mThighsLeft','60','thighs_right','thighs_left'],
  ['Гомілка','mCalvesRight','mCalvesLeft','39','calves_right','calves_left'],
  ['Рука','mArmsRight','mArmsLeft','39','arms_right','arms_left'],
  ['Передпліччя','mForearmsRight','mForearmsLeft','31','forearms_right','forearms_left']
 ];
 let singleHtml=single.map(([id,label,ph,key])=>'<div><label>'+label+'</label><input id="'+id+'" type="number" step="0.1" placeholder="Напр. '+ph+'" value="'+esc(existing?.[key]||'')+'"></div>').join('');
 let pairSideLabels=label=>label==='Стегно'?['Стегно праве','Стегно ліве']:label==='Рука'?['Рука права','Рука ліва']:label==='Гомілка'?['Гомілка права','Гомілка ліва']:['Передпліччя праве','Передпліччя ліве'];
 let pairHtml=pairs.map(([label,rid,lid,ph,rkey,lkey])=>{let sides=pairSideLabels(label);return '<div class="measurement-pair-group"><div class="measurement-pair-title">'+label+'</div><div class="measurement-pair-inputs"><label><span>'+sides[0]+'</span><input id="'+rid+'" type="number" step="0.1" placeholder="'+ph+'" value="'+esc(existing?.[rkey]||'')+'"></label><label><span>'+sides[1]+'</span><input id="'+lid+'" type="number" step="0.1" placeholder="'+ph+'" value="'+esc(existing?.[lkey]||'')+'"></label></div></div>'}).join('');
 return '<div class="measurement-form '+(early?'early':'')+'"><div class="measurement-tip"><strong>'+(isEdit?'Редагування замірів':'Як робити заміри')+'</strong><span>'+(isEdit?'Зміни значення або дату та збережи.':'Вранці, натщесерце та в однакових умовах. Бажано — раз на 30 днів.')+'</span></div><div class="measurement-date-row"><label>Дата замірів</label><input id="mDay" type="date" max="'+isoToday()+'" value="'+esc(day)+'"></div><div class="measurement-form-section"><h3>Основні заміри</h3><div class="measure-grid measurement-input-grid">'+singleHtml+'</div></div><div class="measurement-form-section"><h3>Парні заміри</h3><p class="muted">Записуй праву та ліву сторону окремо — так легше бачити асиметрію.</p><div class="measurement-pair-list">'+pairHtml+'</div></div><div class="measurement-form-actions"><button onclick="saveMeasurement('+cid+',event,'+mid+')">'+(isEdit?'Зберегти зміни':'Зберегти заміри')+'</button>'+(isEdit?'<button class="dark" onclick="measurementEditModal.remove()">Скасувати</button>':early?'<button class="dark" onclick="document.getElementById(\'earlyMeasurementForm\').classList.add(\'hidden\')">Скасувати</button>':'')+'</div></div>';
}

function measurementHistoryCard(x,prev,cid=null){
 let ownerId=+(cid||((session&&session.role==='client')?session.client_id:0)||0),canEdit=ownerId>0&&session&&session.role==='client'&&x.id;
 let basics=[['weight','Вага','кг'],['shoulders','Плечі','см'],['neck','Шия','см'],['chest','Груди','см'],['waist','Талія','см'],['hips','Стегна','см']];
 let basicHtml=basics.filter(([k])=>+x[k]>0).map(([k,n,u])=>{
  return '<div class="measurement-history-metric"><span>'+n+'</span><strong>'+fmtProgress(x[k])+' '+u+'</strong></div>';
 }).join('');
 let pairedHtml=Object.entries(measurementPairConfig()).map(([key,p])=>{
  let cur=measurementPairValues(x,key);if(!(cur.left||cur.right||cur.legacy))return '';
  if(cur.left||cur.right){
   let sideNames=key==='thighs'?['Стегно праве','Стегно ліве']:key==='arms'?['Рука права','Рука ліва']:key==='calves'?['Гомілка права','Гомілка ліва']:['Передпліччя праве','Передпліччя ліве'];
   return '<div class="measurement-history-pair"><div class="measurement-history-pair-title">'+p.label+'</div><div class="measurement-history-pair-sides">'+(cur.right?'<span><small>'+sideNames[0]+'</small><b>'+fmtProgress(cur.right)+' см</b></span>':'')+(cur.left?'<span><small>'+sideNames[1]+'</small><b>'+fmtProgress(cur.left)+' см</b></span>':'')+'</div></div>';
  }
  return '<div class="measurement-history-pair"><div class="measurement-history-pair-title">'+p.label+'</div><div class="measurement-history-legacy">'+fmtProgress(cur.legacy)+' см <small>старий формат</small></div></div>';
 }).join('');
 return '<div class="measurement-history-card redesigned-history"><div class="measurement-history-head"><div><span class="measurement-history-caption">Контрольна точка</span><strong>'+formatProgressDate(x.day)+'</strong></div>'+(canEdit?'<div class="measurement-history-actions"><button type="button" class="measurement-edit" aria-label="Редагувати замір" title="Редагувати замір" onclick="openMeasurementEditor('+ownerId+','+(+x.id)+')">✎</button><button type="button" class="measurement-delete" aria-label="Видалити замір" title="Видалити замір" data-day="'+esc(x.day)+'" onclick="deleteMeasurement('+ownerId+','+(+x.id)+',this.dataset.day)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div>':'')+'</div>'+(basicHtml?'<div class="measurement-history-section"><h4>Основні</h4><div class="measurement-history-grid">'+basicHtml+'</div></div>':'')+(pairedHtml?'<div class="measurement-history-section"><h4>Права / ліва</h4><div class="measurement-history-pair-grid">'+pairedHtml+'</div></div>':'')+'</div>';
}

function measurementHistoryCalendarState(xs){
 let rows=(xs||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day));
 let latest=rows[rows.length-1]?.day||isoToday();
 let month=String(window.measurementHistoryMonth||latest.slice(0,7));
 if(!/^\d{4}-\d{2}$/.test(month))month=latest.slice(0,7);
 let selected=String(window.measurementHistorySelectedDay||'');
 if(!rows.some(x=>x.day===selected)||selected.slice(0,7)!==month){
   let inMonth=rows.filter(x=>x.day.slice(0,7)===month);
   selected=inMonth[inMonth.length-1]?.day||'';
 }
 window.measurementHistoryMonth=month;
 window.measurementHistorySelectedDay=selected;
 return {rows,month,selected};
}

function measurementHistoryCalendarHTML(xs,cid){
 let {rows,month,selected}=measurementHistoryCalendarState(xs);
 if(!rows.length)return '';
 let [year,mon]=month.split('-').map(Number);
 let first=new Date(year,mon-1,1),daysInMonth=new Date(year,mon,0).getDate();
 let offset=(first.getDay()+6)%7;
 let byDay=new Map(rows.map(x=>[x.day,x]));
 let title=new Intl.DateTimeFormat('uk-UA',{month:'long',year:'numeric'}).format(new Date(year,mon-1,1));
 title=title.charAt(0).toUpperCase()+title.slice(1);
 let cells=Array.from({length:offset},()=>'<span class="measurement-calendar-day empty"></span>');
 for(let day=1;day<=daysInMonth;day++){
   let iso=month+'-'+String(day).padStart(2,'0'),has=byDay.has(iso),active=selected===iso;
   cells.push('<button type="button" class="measurement-calendar-day '+(has?'has-data ':'')+(active?'active':'')+'" '+(has?'onclick="selectMeasurementHistoryDay(\''+iso+'\')"':'disabled')+'><span>'+day+'</span></button>');
 }
 let picked=rows.find(x=>x.day===selected)||null;
 let previous=picked?rows[rows.findIndex(x=>x.day===picked.day)-1]||null:null;
 return '<div class="card measurement-history-calendar-card">'
  +'<div class="measurement-history-calendar-title"><div><strong>Історія замірів</strong><span>'+rows.length+' '+(rows.length===1?'запис':'записів')+'</span></div></div>'
  +'<div class="measurement-calendar-head"><button type="button" aria-label="Попередній місяць" onclick="shiftMeasurementHistoryMonth(-1)">‹</button><strong>'+esc(title)+'</strong><button type="button" aria-label="Наступний місяць" onclick="shiftMeasurementHistoryMonth(1)">›</button></div>'
  +'<div class="measurement-calendar-weekdays">'+['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(x=>'<span>'+x+'</span>').join('')+'</div>'
  +'<div class="measurement-calendar-grid">'+cells.join('')+'</div>'
  +(picked?'<div class="measurement-calendar-selected">'+measurementHistoryCard(picked,previous,cid)+'</div>':'<div class="measurement-calendar-empty">У цьому місяці немає замірів.</div>')
 +'</div>';
}

function renderMeasurementHistoryCalendar(){
 let box=document.getElementById('measurementHistoryCalendar');
 if(!box)return;
 let d=window.currentClientData||{},cid=+(d.client?.id||session?.client_id||0);
 box.innerHTML=measurementHistoryCalendarHTML(d.measurements||[],cid);
}

function shiftMeasurementHistoryMonth(step){
 let d=window.currentClientData||{},xs=(d.measurements||[]).filter(x=>x.day);
 if(!xs.length)return;
 let state=measurementHistoryCalendarState(xs),parts=state.month.split('-').map(Number);
 let next=new Date(parts[0],parts[1]-1+(+step||0),1);
 window.measurementHistoryMonth=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0');
 window.measurementHistorySelectedDay='';
 renderMeasurementHistoryCalendar();
}

function selectMeasurementHistoryDay(day){
 window.measurementHistorySelectedDay=String(day||'');
 window.measurementHistoryMonth=String(day||'').slice(0,7)||window.measurementHistoryMonth;
 renderMeasurementHistoryCalendar();
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
  ${xs.length>1?measurementComparisonHTML(xs):''}
  <div class="card measurement-early"><p class="muted">Можеш додати контрольні заміри раніше або внести старі заміри за будь-яку минулу дату.</p><button class="dark" onclick="document.getElementById('earlyMeasurementForm').classList.toggle('hidden')">Додати заміри за іншу дату</button><div id="earlyMeasurementForm" class="hidden" style="margin-top:14px">${measurementFormHTML(cid,true)}</div></div>
  ${xs.length?`<div id="measurementHistoryCalendar">${measurementHistoryCalendarHTML(xs,cid)}</div>`:''}
 </div>`;
}

function ukDays(n){let x=Math.abs(n)%100,y=x%10;return x>10&&x<20?'днів':y===1?'день':y>=2&&y<=4?'дні':'днів'}



function measurementCompareKey(x){return String(x?.id||x?.day||'')}

function measurementComparisonHTML(xs){
 let rows=(xs||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day)||(+a.id||0)-(+b.id||0));
 if(rows.length<2)return '';
 let valid=new Set(rows.map(measurementCompareKey));
 let fromKey=String(window.measureCompareFrom||''),toKey=String(window.measureCompareTo||'');
 if(!valid.has(fromKey))fromKey=measurementCompareKey(rows[rows.length-2]);
 if(!valid.has(toKey))toKey=measurementCompareKey(rows[rows.length-1]);
 let from=rows.find(x=>measurementCompareKey(x)===fromKey)||rows[rows.length-2];
 let to=rows.find(x=>measurementCompareKey(x)===toKey)||rows[rows.length-1];
 window.measureCompareFrom=measurementCompareKey(from);
 window.measureCompareTo=measurementCompareKey(to);
 let opts=selected=>rows.map(x=>'<option value="'+esc(measurementCompareKey(x))+'" '+(measurementCompareKey(x)===selected?'selected':'')+'>'+esc(formatProgressDate(x.day))+'</option>').join('');
 return '<div class="card measurement-compare-card">'
  +'<div class="measurement-compare-head"><div><h2>Порівняння замірів</h2><p class="muted">Обери дві контрольні точки.</p></div></div>'
  +'<div class="measurement-compare-selects">'
    +'<label><span>Від</span><select onchange="setMeasurementComparison(\'from\',this.value)">'+opts(window.measureCompareFrom)+'</select></label>'
    +'<span class="measurement-compare-arrow">→</span>'
    +'<label><span>До</span><select onchange="setMeasurementComparison(\'to\',this.value)">'+opts(window.measureCompareTo)+'</select></label>'
  +'</div>'
  +'<div id="measurementCompareBody">'+measurementCompactChangesHTML(to,from)+'</div>'
 +'</div>';
}

function setMeasurementComparison(which,value){
 if(which==='from')window.measureCompareFrom=String(value);
 else window.measureCompareTo=String(value);
 let d=window.currentClientData||{},xs=(d.measurements||[]).filter(x=>x.day).slice().sort((a,b)=>a.day.localeCompare(b.day)||(+a.id||0)-(+b.id||0));
 let from=xs.find(x=>measurementCompareKey(x)===String(window.measureCompareFrom));
 let to=xs.find(x=>measurementCompareKey(x)===String(window.measureCompareTo));
 let box=document.getElementById('measurementCompareBody');
 if(box&&from&&to)box.innerHTML=measurementCompactChangesHTML(to,from);
}

function measurementCompactDelta(current,previous,unit){
 if(!(current>0)||!(previous>0))return '<small class="muted">—</small>';
 let d=current-previous;
 return '<small class="neutral-change">'+(d===0?'без змін':(d>0?'+':'')+fmtProgress(d)+' '+unit)+'</small>';
}

function measurementCompactChangesHTML(a,b){
 let items=[];
 [['weight','Вага','кг'],['shoulders','Плечі','см'],['neck','Шия','см'],['chest','Груди','см'],['waist','Талія','см'],['hips','Стегна','см']].forEach(([k,n,u])=>{
  if(+a?.[k]>0&&+b?.[k]>0)items.push('<div class="measurement-compare-item"><span>'+n+'</span><strong>'+fmtProgress(b[k])+' → '+fmtProgress(a[k])+' '+u+'</strong>'+measurementCompactDelta(+a[k],+b[k],u)+'</div>');
 });
 Object.entries(measurementPairConfig()).forEach(([key,p])=>{
  let cur=measurementPairValues(a,key),old=measurementPairValues(b,key);
  let names=key==='thighs'?['Стегно праве','Стегно ліве']:key==='arms'?['Рука права','Рука ліва']:key==='calves'?['Гомілка права','Гомілка ліва']:['Передпліччя праве','Передпліччя ліве'];
  if(cur.right&&old.right)items.push('<div class="measurement-compare-item"><span>'+names[0]+'</span><strong>'+fmtProgress(old.right)+' → '+fmtProgress(cur.right)+' см</strong>'+measurementCompactDelta(cur.right,old.right,'см')+'</div>');
  if(cur.left&&old.left)items.push('<div class="measurement-compare-item"><span>'+names[1]+'</span><strong>'+fmtProgress(old.left)+' → '+fmtProgress(cur.left)+' см</strong>'+measurementCompactDelta(cur.left,old.left,'см')+'</div>');
 });
 return items.length?'<div class="measurement-compare-grid">'+items.join('')+'</div>':'<div class="redesign-progress-empty-chart">Для цих двох дат немає однакових замірів для порівняння.</div>';
}

function measurementChangesHTML(a,b){
 let single=[['weight','Вага','кг'],['shoulders','Плечі','см'],['neck','Шия','см'],['chest','Груди','см'],['waist','Талія','см'],['hips','Стегна','см']];
 let html=single.filter(([k])=>+a[k]>0&&+b[k]>0).map(([k,n,u])=>{let d=+a[k]-+b[k];return '<div><span>'+n+'</span><strong>'+fmtProgress(b[k])+' → '+fmtProgress(a[k])+' '+u+'</strong><em class="neutral-change">'+(d===0?'без змін':(d>0?'+':'')+fmtProgress(d)+' '+u)+'</em></div>'}).join('');
 Object.entries(measurementPairConfig()).forEach(([key,p])=>{
  let cur=measurementPairValues(a,key),old=measurementPairValues(b,key);
  if(cur.right&&old.right){let d=cur.right-old.right;html+='<div><span>'+p.label+' · права</span><strong>'+fmtProgress(old.right)+' → '+fmtProgress(cur.right)+' см</strong><em class="neutral-change">'+(d===0?'без змін':(d>0?'+':'')+fmtProgress(d)+' см')+'</em></div>'}
  if(cur.left&&old.left){let d=cur.left-old.left;html+='<div><span>'+p.label+' · ліва</span><strong>'+fmtProgress(old.left)+' → '+fmtProgress(cur.left)+' см</strong><em class="neutral-change">'+(d===0?'без змін':(d>0?'+':'')+fmtProgress(d)+' см')+'</em></div>'}
 });
 return '<div class="measurement-changes">'+html+'</div>';
}

function openMeasurementEditor(cid,mid){
 let d=window.currentClientData||{},x=(d.measurements||[]).find(v=>+v.id===+mid);if(!x)return;
 document.getElementById('measurementEditModal')?.remove();
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="measurementEditModal" onclick="if(event.target===this)this.remove()"><div class="card measurement-edit-modal"><div class="between"><div><span class="measurement-history-caption">Редагування</span><h2 style="margin:3px 0 0">'+esc(formatProgressDate(x.day))+'</h2></div><button class="dark" onclick="measurementEditModal.remove()">✕</button></div>'+measurementFormHTML(cid,false,x)+'</div></div>');
}

async function saveMeasurement(cid,ev=null,mid=0){
 let btn=ev?.currentTarget||null;
 let form=btn?.closest('.measurement-form')||document;
 let val=id=>+(form.querySelector('#'+id)?.value||0);
 let day=form.querySelector('#mDay')?.value||isoToday();
 let body={
  client_id:cid,day,
  weight:val('mWeight'),shoulders:val('mShoulders'),neck:val('mNeck'),
  chest:val('mChest'),waist:val('mWaist'),hips:val('mHips'),
  thighs:0,calves:0,arms:0,forearms:0,
  thighs_right:val('mThighsRight'),thighs_left:val('mThighsLeft'),
  calves_right:val('mCalvesRight'),calves_left:val('mCalvesLeft'),
  arms_right:val('mArmsRight'),arms_left:val('mArmsLeft'),
  forearms_right:val('mForearmsRight'),forearms_left:val('mForearmsLeft')
 };
 if(body.day>isoToday())return alert('Не можна додати заміри на майбутню дату');
 if(!Object.entries(body).some(([k,v])=>!['client_id','day'].includes(k)&&Number(v)>0))return alert('Заповни хоча б один замір');
 if(btn?.disabled)return;
 if(btn){btn.disabled=true;btn.textContent=mid?'Зберігаємо зміни…':'Зберігаємо…';btn.classList.add('measurement-saving')}
 try{
  await api(mid?'/measurements/'+mid:'/measurements',{method:mid?'PATCH':'POST',body:JSON.stringify(body)});
  if(btn){btn.textContent=mid?'✓ Зміни збережено':'✓ Замір збережено';btn.classList.add('measurement-saved')}
  let d=await loadClientData(cid);window.currentClientData=d;
  if(mid) document.getElementById('measurementEditModal')?.remove();
  setTimeout(()=>showClientSection('measurements'),180);
 }catch(e){
  if(btn){btn.disabled=false;btn.textContent=mid?'Зберегти зміни':'Зберегти заміри';btn.classList.remove('measurement-saving')}
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
