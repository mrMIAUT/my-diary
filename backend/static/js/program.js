// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.
// H02: user strings belong in quoted, HTML-escaped data-* attributes.
// Fixed handlers read dataset values; never interpolate those strings into JS.

function rirPlan(x){
 let a=String(x?.rir_by_set||'').split(',').map(v=>v.trim()).filter(Boolean);
 return Array.from({length:+x.sets||0},(_,i)=>a[i]!==undefined?+a[i]:(+x.target_rir||0));
}

function restLabel(x){let t=String(x.rest_text||'').trim();if(t)return t.replace(/\s*(хв|min|мин)\.?$/i,'')+' хв';let s=+x.rest_seconds||0;if(!s)return '';let m=s/60;return (Number.isInteger(m)?m:m.toFixed(1))+' хв'}

function exerciseAlternatives(x){try{let a=JSON.parse(x?.alternatives_json||'[]');return Array.isArray(a)?a.filter(Boolean):[]}catch(e){return []}}

function libraryExerciseByName(name){
 let q=String(name||'').trim().toLowerCase();
 let matches=(window.exerciseLibrary?.exercises||[]).filter(x=>String(x.name||'').trim().toLowerCase()===q);
 return matches.find(x=>x.scope==='trainer')||matches[0]||null;
}

function exerciseTechniqueUrl(name,fallback=''){
 let lib=libraryExerciseByName(name);
 return safeTechniqueUrl(lib?.technique_url||fallback||'');
}

function alternativesInputValue(x){return exerciseAlternatives(x).join(', ')}

function parseAlternatives(v,main=''){let seen=new Set(),m=String(main||'').trim().toLowerCase();return String(v||'').split(',').map(x=>x.trim()).filter(x=>x&&x.toLowerCase()!==m&&!seen.has(x.toLowerCase())&&seen.add(x.toLowerCase()))}

function alternativesTrainerHTML(x){let a=exerciseAlternatives(x);return a.length?`<div class="exercise-alternatives"><strong>Альтернативи</strong><div>${a.map(v=>{let tech=exerciseTechniqueUrl(v);return `<span class="alternative-chip"><span class="alternative-name">${esc(v)}</span>${tech?'<span class="alternative-divider" aria-hidden="true"></span>'+techniqueLinkHTML(tech,'Техніка',true,'alternative-tech-link'):''}</span>`}).join('')}</div></div>`:''}

function programExtraHTML(x){
 let rest=restLabel(x),rp=rirPlan(x);
 return `<div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>`;
}

function autofillTechnique(name,targetId){
 let item=libraryExerciseByName(name);
 let el=document.getElementById(targetId);if(el)el.value=item?.technique_url||'';
}

function programExercisePickerStored(key,limit=60){
 try{
  let a=JSON.parse(localStorage.getItem(key)||'[]');
  return Array.isArray(a)?a.map(x=>String(x||'').trim()).filter(Boolean).slice(0,limit):[];
 }catch(e){return []}
}
function programExercisePickerWrite(key,items,limit=60){
 try{localStorage.setItem(key,JSON.stringify((items||[]).slice(0,limit)))}catch(e){}
}
function programExercisePickerFavorites(){return programExercisePickerStored('eplanTrainerExerciseFavoritesV1')}
function programExercisePickerRecent(){return programExercisePickerStored('eplanTrainerExerciseRecentV1',20)}
function rememberProgramExercise(name){
 let value=String(name||'').trim();if(!value)return;
 let next=[value,...programExercisePickerRecent().filter(x=>x.toLowerCase()!==value.toLowerCase())];
 programExercisePickerWrite('eplanTrainerExerciseRecentV1',next,20);
}
function programExercisePickerUniqueExercises(){
 let map=new Map();
 (window.exerciseLibrary?.exercises||[]).forEach(x=>{
  let name=String(x.name||'').trim();if(!name)return;
  let key=name.toLowerCase(),current=map.get(key);
  if(!current||String(x.scope||'platform')==='trainer')map.set(key,x);
 });
 return [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'uk'));
}
function programExercisePickerPrimaryMuscleIds(x){
 return (x?.primary_muscle_ids||[]).map(Number).filter(Boolean);
}
function programExercisePickerMuscleIds(x){
 return [...(x?.primary_muscle_ids||[]),...(x?.secondary_muscle_ids||[])].map(Number).filter(Boolean);
}
function programExercisePickerMuscleNames(x){
 let ids=programExercisePickerMuscleIds(x),seen=new Set(),names=[];
 ids.forEach(id=>{
  let name=(window.exerciseLibrary?.muscles||[]).find(m=>+m.id===+id)?.name||'';
  if(name&&!seen.has(name)){seen.add(name);names.push(name)}
 });
 return names;
}
function programExercisePickerMatchStored(exercise,names){
 let key=String(exercise?.name||'').trim().toLowerCase();
 return (names||[]).some(x=>String(x||'').trim().toLowerCase()===key);
}
function programExercisePickerState(){return window.__programExercisePickerState||null}

async function openProgramExercisePicker(targetId,techId=''){
 if(!window.exerciseLibrary?.exercises?.length)await loadExerciseLibrary();
 document.getElementById('programExercisePickerModal')?.remove();
 let recents=programExercisePickerRecent();
 window.__programExercisePickerState={targetId:String(targetId||''),techId:String(techId||''),mode:recents.length?'recent':'all',muscleScope:'primary',muscleId:0,query:''};
 document.body.insertAdjacentHTML('beforeend',`<div class="modal trainer-program-picker-modal" id="programExercisePickerModal" onclick="if(event.target===this)closeProgramExercisePicker()"><div class="card trainer-program-picker-card">
   <div class="trainer-program-picker-head"><div><small>БІБЛІОТЕКА ВПРАВ</small><h2>Обрати вправу</h2><p>За замовчуванням фільтруємо за основними м’язами.</p></div><button type="button" class="trainer-program-picker-close" onclick="closeProgramExercisePicker()" aria-label="Закрити">✕</button></div>
   <label class="trainer-program-picker-search"><span>⌕</span><input id="programExercisePickerSearch" type="search" placeholder="Пошук вправи..." autocomplete="off" oninput="programExercisePickerSetQuery(this.value)"></label>
   <div class="trainer-program-picker-modes" id="programExercisePickerModes"></div>
   <div class="trainer-program-picker-scope" id="programExercisePickerScope"></div>
   <div class="trainer-program-picker-muscles" id="programExercisePickerMuscles"></div>
   <div class="trainer-program-picker-results" id="programExercisePickerResults"></div>
   <button type="button" class="trainer-program-picker-manual" onclick="useManualProgramExercise()">Не знайшли вправу? <strong>Ввести вручну</strong></button>
 </div></div>`);
 renderProgramExercisePicker();
 setTimeout(()=>document.getElementById('programExercisePickerSearch')?.focus(),40);
}
function closeProgramExercisePicker(){
 document.getElementById('programExercisePickerModal')?.remove();
 window.__programExercisePickerState=null;
}
function programExercisePickerSetQuery(value){
 let s=programExercisePickerState();if(!s)return;s.query=String(value||'').trim().toLowerCase();renderProgramExercisePickerResults();
}
function programExercisePickerSetMode(button){
 let s=programExercisePickerState();if(!s)return;s.mode=String(button?.dataset?.pickerMode||'all');renderProgramExercisePicker();
}
function programExercisePickerSetMuscleScope(button){
 let s=programExercisePickerState();if(!s)return;
 s.muscleScope=String(button?.dataset?.muscleScope||'primary');
 renderProgramExercisePicker();
}
function programExercisePickerSetMuscle(button){
 let s=programExercisePickerState();if(!s)return;s.muscleId=+(button?.dataset?.muscleId||0);renderProgramExercisePicker();
}
function toggleProgramExerciseFavorite(button){
 let name=String(button?.dataset?.exerciseName||'').trim();if(!name)return;
 let items=programExercisePickerFavorites(),exists=items.some(x=>x.toLowerCase()===name.toLowerCase());
 items=exists?items.filter(x=>x.toLowerCase()!==name.toLowerCase()):[name,...items.filter(x=>x.toLowerCase()!==name.toLowerCase())];
 programExercisePickerWrite('eplanTrainerExerciseFavoritesV1',items,60);
 renderProgramExercisePicker();
}
function chooseProgramLibraryExercise(button){
 let s=programExercisePickerState(),name=String(button?.dataset?.exerciseName||'').trim();if(!s||!name)return;
 let target=document.getElementById(s.targetId),item=libraryExerciseByName(name);
 if(target){target.value=name;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}))}
 if(s.techId){
  let tech=document.getElementById(s.techId);
  if(tech)tech.value=item?.technique_url||'';
 }
 rememberProgramExercise(name);
 closeProgramExercisePicker();
 target?.focus();
}
function useManualProgramExercise(){
 let s=programExercisePickerState(),target=s?document.getElementById(s.targetId):null;
 closeProgramExercisePicker();
 setTimeout(()=>target?.focus(),30);
}
function renderProgramExercisePicker(){
 let s=programExercisePickerState();if(!s)return;
 let modes=document.getElementById('programExercisePickerModes'),scope=document.getElementById('programExercisePickerScope'),muscles=document.getElementById('programExercisePickerMuscles');
 let recentCount=programExercisePickerRecent().length,favCount=programExercisePickerFavorites().length;
 if(modes)modes.innerHTML=[
   ['all','Усі'],
   ['favorite','★ Обране'+(favCount?' · '+favCount:'')],
   ['recent','Нещодавні'+(recentCount?' · '+recentCount:'')]
 ].map(([mode,label])=>`<button type="button" class="${s.mode===mode?'active':''}" data-picker-mode="${mode}" onclick="programExercisePickerSetMode(this)">${esc(label)}</button>`).join('');
 if(scope)scope.innerHTML=[
   ['primary','Основні м’язи'],
   ['all','Основні + додаткові']
 ].map(([value,label])=>`<button type="button" class="${s.muscleScope===value?'active':''}" data-muscle-scope="${value}" onclick="programExercisePickerSetMuscleScope(this)">${label}</button>`).join('');
 if(muscles){
  let ms=(window.exerciseLibrary?.muscles||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'uk'));
  muscles.innerHTML=`<button type="button" class="${!s.muscleId?'active':''}" data-muscle-id="0" onclick="programExercisePickerSetMuscle(this)">Усі м’язи</button>`
    +ms.map(m=>`<button type="button" class="${+s.muscleId===+m.id?'active':''}" data-muscle-id="${m.id}" onclick="programExercisePickerSetMuscle(this)">${esc(m.name)}</button>`).join('');
 }
 renderProgramExercisePickerResults();
}
function renderProgramExercisePickerResults(){
 let s=programExercisePickerState(),host=document.getElementById('programExercisePickerResults');if(!s||!host)return;
 let favs=programExercisePickerFavorites(),recents=programExercisePickerRecent(),all=programExercisePickerUniqueExercises(),rows=all.filter(x=>{
   if(s.mode==='favorite'&&!programExercisePickerMatchStored(x,favs))return false;
   if(s.mode==='recent'&&!programExercisePickerMatchStored(x,recents))return false;
   if(s.muscleId){
     let muscleIds=s.muscleScope==='all'?programExercisePickerMuscleIds(x):programExercisePickerPrimaryMuscleIds(x);
     if(!muscleIds.includes(+s.muscleId))return false;
   }
   if(s.query&&!String(x.name||'').toLowerCase().includes(s.query))return false;
   return true;
 });
 if(s.mode==='recent'){
  let order=new Map(recents.map((x,i)=>[x.toLowerCase(),i]));
  rows.sort((a,b)=>(order.get(String(a.name||'').toLowerCase())??999)-(order.get(String(b.name||'').toLowerCase())??999));
 }
 if(!rows.length){
  host.innerHTML='<div class="trainer-program-picker-empty"><strong>Нічого не знайдено</strong><span>Зміни фільтр або введи назву вправи вручну.</span></div>';
  return;
 }
 let favoriteKeys=new Set(favs.map(x=>x.toLowerCase()));
 host.innerHTML=rows.map(x=>{
   let names=programExercisePickerMuscleNames(x).slice(0,4),isFav=favoriteKeys.has(String(x.name||'').toLowerCase()),hasTech=!!safeTechniqueUrl(x.technique_url||'');
   return `<div class="trainer-program-picker-row">
     <button type="button" class="trainer-program-picker-pick" data-exercise-name="${esc(x.name)}" onclick="chooseProgramLibraryExercise(this)">
       <span class="trainer-program-picker-copy"><strong>${esc(x.name)}</strong><small>${names.length?esc(names.join(' · ')):'М’язи не вказані'}${hasTech?' · є техніка':''}</small></span><span class="trainer-program-picker-select">Обрати ›</span>
     </button>
     <button type="button" class="trainer-program-picker-fav ${isFav?'active':''}" data-exercise-name="${esc(x.name)}" onclick="toggleProgramExerciseFavorite(this)" aria-label="${isFav?'Прибрати з обраного':'Додати в обране'}">★</button>
   </div>`;
 }).join('');
}

function programDayTitle(d,day){
 let x=(d?.program_days||[]).find(v=>v.day_name===day);
 return String(x?.title||'').trim();
}

function trainerProgramExerciseTitleHTML(name){
 let value=String(name||'').trim(),long=value.length>24;
 return '<span class="trainer-program-name-marquee'+(long?' is-long':'')+'" title="'+esc(value)+'"><span class="trainer-program-name-track"><strong>'+esc(value)+'</strong>'+(long?'<strong aria-hidden="true">'+esc(value)+'</strong>':'')+'</span></span>';
}

function programHTML(d){
 let groups={}; d.program.forEach(x=>(groups[x.day_name]??=[]).push(x));
 let form=`<div class="card trainer-program-editor">
   <div class="trainer-program-editor-head"><h2>Програма тренувань</h2><p>Додай вправу до потрібного тренувального дня.</p></div>
   <div class="trainer-program-editor-grid">
     <label class="wide"><span>День</span><input id="dn" placeholder="Напр. День 1"></label>
     <label class="wide"><span>Назва дня</span><input id="dntitle" placeholder="Напр. Ноги або Плечі + руки"></label>
     <label class="wide"><span>Вправа</span><div class="trainer-program-exercise-field"><input id="ex" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,'tech')" placeholder="Оберіть або введіть вправу"><button type="button" onclick="openProgramExercisePicker('ex','tech')">Обрати з бібліотеки</button></div></label>
     <label class="wide"><span>Техніка</span><input id="tech" placeholder="https://..."></label>
     <label><span>Підходи</span><input id="st" type="number" value="3" placeholder="3"></label>
     <label><span>Повтори</span><input id="rp" value="8-12" placeholder="8-12"></label>
     <label><span>RIR по підходах</span><input id="rirset" value="2,2,2" placeholder="2,2,1"></label>
     <label><span>Відпочинок</span><input id="resttext" value="2" placeholder="2 хв"></label>
     <label class="wide"><span>Альтернативи</span><input id="alternatives" list="exerciseLibraryNames" placeholder="Напр. Гак-присідання, Сміт"></label>
   </div>
   <datalist id="exerciseLibraryNames">${[...new Map((window.exerciseLibrary?.exercises||[]).map(x=>[String(x.name||'').trim().toLowerCase(),x])).values()].map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist>
   <button class="trainer-program-add" onclick="addExercise(event.currentTarget)">＋ Додати вправу</button>
 </div>`;
 let entries=Object.entries(groups);
 let list=entries.length?entries.map(([day,xs],di)=>{
   let bodyId='programDay_'+di,title=programDayTitle(d,day),blocks=[];
   xs.forEach(x=>{
     if(x.superset_group){
       let b=blocks.find(v=>v.group===x.superset_group);
       if(b)b.items.push(x);else blocks.push({group:x.superset_group,items:[x]});
     }else blocks.push({group:'',items:[x]});
   });
   let rows=blocks.map((b,bi)=>{
     let first=b.items[0],isSuper=!!b.group;
     let moveUp=bi>0?`<button class="dark move-btn" data-day="${esc(day)}" onclick="event.stopPropagation();moveProgramBlock(this.dataset.day,${bi},'up')" aria-label="Перемістити вище">↑</button>`:'';
     let moveDown=bi<blocks.length-1?`<button class="dark move-btn" data-day="${esc(day)}" onclick="event.stopPropagation();moveProgramBlock(this.dataset.day,${bi},'down')" aria-label="Перемістити нижче">↓</button>`:'';
     let addToSuperset=!isSuper?`<button class="dark trainer-exercise-add-super" title="Додати вправу в суперсет" data-day="${esc(first.day_name)}" onclick="event.stopPropagation();addSupersetExercise(${first.id},this.dataset.day)" aria-label="Додати вправу в суперсет">＋</button>`:'';
     let normalBlockActions=!isSuper?`<span class="trainer-exercise-head-actions">${moveUp}${moveDown}${addToSuperset}</span>`:'';
     let supersetMoveActions=isSuper?`<span class="trainer-exercise-head-actions trainer-superset-inline-move">${moveUp}${moveDown}</span>`:'';
     let superHead=isSuper?`<div class="trainer-superset-head"><span>Суперсет</span></div>`:'';
     let info=superHead+b.items.map((x,xi)=>{
       let tech=exerciseTechniqueUrl(x.exercise,x.technique_url);
       let itemActions=!isSuper&&xi===0?normalBlockActions:(isSuper&&xi===0?supersetMoveActions:'');
       return `<div class="${isSuper?'superset-inner':'trainer-exercise-shell'}">
         <div class="trainer-exercise-head">
           <div class="trainer-program-title-line ${isSuper?'superset-title-line':''}">${trainerProgramExerciseTitleHTML(x.exercise)}${tech?techniqueLinkHTML(tech,'Техніка',true,'alternative-tech-link'):''}</div>
           ${itemActions}
         </div>
         <div class="trainer-exercise-body">
           <div class="muted">${x.sets} підходи × ${esc(x.reps)}</div>
           ${programExtraHTML(x)}
           ${alternativesTrainerHTML(x)}
           <div class="inner-actions"><button class="dark" onclick="event.stopPropagation();editExercise(${x.id})">✏️ Редагувати</button><button class="danger" onclick="event.stopPropagation();deleteExercise(${x.id})">Видалити</button></div>
         </div>
       </div>`;
     }).join('');
     return `<div class="exercise program-block trainer-exercise-card ${isSuper?'superset-block':''}"><div class="program-block-info">${info}</div></div>`;
   }).join('');
   return `<div class="card program-day-card" data-program-day="${esc(day)}">
     <div class="program-day-header-row">
       <button class="program-day-head" data-day="${esc(day)}" onclick="toggleProgramDay('${bodyId}',this)">
         <span class="program-day-heading"><h2>${esc(day)}</h2>${title?`<small>${esc(title)}</small>`:''}</span>
         <span class="program-day-arrow">⌄</span>
       </button>
       <button class="dark program-day-title-edit" title="Назва дня" data-day="${esc(day)}" onclick="event.stopPropagation();editProgramDayTitle(this.dataset.day)">✎</button>
     </div>
     <div id="${bodyId}" data-program-day-body="${esc(day)}" class="hidden" style="margin-top:18px">${rows}</div>
   </div>`;
 }).join(''):'<div class="card muted">Програма ще порожня.</div>';
 return form+list;
}

function toggleProgramDay(id,btn){
 let el=$('#'+id);if(!el)return;el.classList.toggle('hidden');
 let a=btn.querySelector('.program-day-arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';
}

function reopenTrainerProgramDay(dayName){
 let pane=document.getElementById('program');if(!pane)return;
 let cards=[...pane.querySelectorAll('.program-day-card')];
 let card=cards.find(x=>x.dataset.programDay===String(dayName||''));
 if(!card)return;
 let body=card.querySelector('[data-program-day-body]');
 let btn=card.querySelector('.program-day-head');
 if(body)body.classList.remove('hidden');
 let arrow=btn?.querySelector('.program-day-arrow');
 if(arrow)arrow.textContent='⌃';
}

function editProgramDayTitle(day){
 let d=window.currentClientData||{},current=programDayTitle(d,day);
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="dayTitleModal"><div class="card edit-exercise-card"><div class="edit-exercise-head"><div><h2>Назва тренувального дня</h2><div class="muted">${esc(day)}</div></div><button class="dark edit-exercise-close" onclick="dayTitleModal.remove()">✕</button></div><input id="dayTitleInput" value="${esc(current)}" placeholder="Напр. Груди + Спина"><p class="muted" style="margin-top:10px">Клієнт побачить цю назву після вибору тренувального дня.</p><button style="width:100%;margin-top:14px" data-day="${esc(day)}" onclick="saveProgramDayTitle(this.dataset.day,event.currentTarget)">Зберегти назву</button></div></div>`);
 setTimeout(()=>document.getElementById('dayTitleInput')?.focus(),30);
}

async function saveProgramDayTitle(day,button=null){let restore=setActionLoading(button,'Зберігаємо…');
 let d=window.currentClientData||{},cid=d.client?.id||selected,title=(document.getElementById('dayTitleInput')?.value||'').trim();
 try{
   await api('/program-day-title',{method:'PUT',body:JSON.stringify({client_id:cid,day_name:day,title})});
   dayTitleModal.remove();
   await openClient(cid,'program');
 }catch(e){alert(e.message||'Не вдалося зберегти назву дня')}
}


async function moveProgramBlock(dayName,blockIndex,direction){
 try{
   let d=window.currentClientData||{}, xs=(d.program||[]).filter(x=>x.day_name===dayName);
   let blocks=[];
   xs.forEach(x=>{
     if(x.superset_group){
       let b=blocks.find(v=>v.group===x.superset_group);
       if(b)b.ids.push(x.id);else blocks.push({group:x.superset_group,ids:[x.id]});
     }else blocks.push({group:'',ids:[x.id]});
   });
   let j=direction==='up'?blockIndex-1:blockIndex+1;
   if(j<0||j>=blocks.length)return;
   [blocks[blockIndex],blocks[j]]=[blocks[j],blocks[blockIndex]];
   let ordered_ids=blocks.flatMap(b=>b.ids);
   let cid=d.client.id;
   await api('/program/reorder',{method:'POST',body:JSON.stringify({client_id:cid,day_name:dayName,ordered_ids})});
   let byId=new Map((d.program||[]).map(x=>[x.id,x]));
   let daySet=new Set(ordered_ids), reordered=ordered_ids.map(id=>byId.get(id)).filter(Boolean), pos=0;
   d.program=(d.program||[]).map(x=>x.day_name===dayName?reordered[pos++]:x);
   window.currentClientData=d;
   let programPane=$('#program');
   if(programPane){
     programPane.innerHTML=programHTML(d);
     reopenTrainerProgramDay(dayName);
   }
 }catch(e){alert(e.message||'Не вдалося змінити порядок вправ')}
}

function editExercise(pid){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>v.id===pid);
 if(!x)return alert('Вправу не знайдено');
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="editExerciseModal"><div class="card edit-exercise-card"><div class="edit-exercise-head"><h2>Редагувати вправу</h2><button class="dark edit-exercise-close" onclick="editExerciseModal.remove()">✕</button></div><div class="grid"><input id="editDay" value="${esc(x.day_name)}" placeholder="День"><div class="trainer-program-exercise-field"><input id="editName" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,\'editTech\')" value="${esc(x.exercise)}" placeholder="Вправа"><button type="button" onclick="openProgramExercisePicker('editName','editTech')">Обрати з бібліотеки</button></div><input id="editTech" value="${esc(x.technique_url||'')}" placeholder="Посилання на техніку"><input id="editSets" type="number" min="1" value="${x.sets||3}" placeholder="Підходи"><input id="editReps" value="${esc(x.reps||'')}" placeholder="Повтори"><input id="editRirSet" value="${esc(x.rir_by_set||rirPlan(x).join(','))}" placeholder="RIR по підходах"><input id="editRest" value="${esc(x.rest_text||((+x.rest_seconds||0)?String((+x.rest_seconds/60)).replace(/\.0$/,""):""))}" placeholder="Відпочинок, хв (напр. 2-3)"><input id="editAlternatives" list="exerciseLibraryNames" value="${esc(alternativesInputValue(x))}" placeholder="Альтернативи через кому"></div><br><button class="trainer-edit-exercise-primary" onclick="saveExerciseEdit(${pid},${x.client_id})">Зберегти зміни</button></div></div>`);
}

async function saveExerciseEdit(pid,cid){
 let body={client_id:cid,day_name:editDay.value.trim(),exercise:editName.value.trim(),sets:+editSets.value||1,reps:editReps.value.trim(),target_rir:+((editRirSet.value||'2').split(',')[0].trim())||2,superset_group:'',superset_order:0,technique_url:editTech.value.trim(),rest_seconds:0,rest_text:editRest.value.trim(),rir_by_set:editRirSet.value.trim(),alternatives_json:JSON.stringify(parseAlternatives(editAlternatives.value,editName.value))};
 if(!body.day_name||!body.exercise)return alert('Вкажи день та назву вправи');
 if(body.technique_url&&!safeTechniqueUrl(body.technique_url))return alert('Посилання на техніку має починатися з https://');
 body.technique_url=safeTechniqueUrl(body.technique_url);
 try{
   await api('/program/'+pid,{method:'PUT',body:JSON.stringify(body)});
   if(libraryExerciseByName(body.exercise))rememberProgramExercise(body.exercise);
   editExerciseModal.remove();
   await openClient(cid,'program');
   reopenTrainerProgramDay(body.day_name);
 }catch(e){alert(e.message||'Не вдалося зберегти зміни')}
}

async function addExercise(button=null){
 let day=dn.value.trim(),title=(document.getElementById('dntitle')?.value||'').trim(),exercise=ex.value.trim(),technique=(tech.value||'').trim();
 if(!day||!exercise)return alert('Вкажи день і вправу');
 if(technique&&!safeTechniqueUrl(technique))return alert('Посилання на техніку має починатися з https://');
 technique=safeTechniqueUrl(technique);
 let restore=setActionLoading(button,'Додаємо…');
 try{
  if(title)await api('/program-day-title',{method:'PUT',body:JSON.stringify({client_id:selected,day_name:day,title})});
  await api('/program',{method:'POST',body:JSON.stringify({client_id:selected,day_name:day,exercise,sets:+st.value||3,reps:rp.value||'8-12',target_rir:+((rirset.value||'2').split(',')[0].trim())||2,superset_group:'',superset_order:0,technique_url:technique,rest_seconds:0,rest_text:resttext.value.trim(),rir_by_set:rirset.value.trim(),alternatives_json:JSON.stringify(parseAlternatives(alternatives.value,exercise))})});
  if(libraryExerciseByName(exercise))rememberProgramExercise(exercise);
  await openClient(selected,'program');
 }catch(e){restore();alert(e.message||'Не вдалося додати вправу')}
}


function addSupersetExercise(sourceId,dayName){
 document.getElementById('supersetModal')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="supersetModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-superset-modal"><div class="edit-exercise-head"><div><h2>Додати вправу в суперсет</h2><div class="muted">${esc(dayName)}</div></div><button class="dark edit-exercise-close" type="button" onclick="supersetModal.remove()">✕</button></div><p class="muted trainer-superset-modal-copy">Обери вправу з бібліотеки або введи свою. Посилання на техніку підтягнеться автоматично, якщо воно є в бібліотеці.</p><div class="trainer-superset-modal-grid"><label class="wide"><span>Вправа</span><div class="trainer-program-exercise-field"><input id="ssex" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,'sstech')" placeholder="Оберіть або введіть вправу"><button type="button" onclick="openProgramExercisePicker('ssex','sstech')">Обрати з бібліотеки</button></div></label><label class="wide"><span>Техніка</span><input id="sstech" placeholder="https://..."></label><label><span>Підходи</span><input id="sssets" type="number" min="1" value="3" placeholder="3"></label><label><span>Повтори</span><input id="ssreps" value="8-12" placeholder="8-12"></label><label><span>RIR</span><input id="ssrir" type="number" min="0" max="10" value="2" placeholder="2"></label><label><span>RIR по підходах</span><input id="ssrirset" value="2,2,2" placeholder="2,2,1"></label><label class="wide"><span>Відпочинок</span><input id="ssrest" value="2" placeholder="2 хв"></label></div><button class="trainer-superset-primary" type="button" data-day="${esc(dayName)}" onclick="saveSupersetExercise(${sourceId},this.dataset.day,this)">＋ Додати в суперсет</button></div></div>`);
 setTimeout(()=>document.getElementById('ssex')?.focus(),30);
}

async function saveSupersetExercise(sourceId,dayName,button=null){
 let exercise=(document.getElementById('ssex')?.value||'').trim();
 if(!exercise)return alert('Вкажи вправу');
 let technique=(document.getElementById('sstech')?.value||'').trim();
 if(technique&&!safeTechniqueUrl(technique))return alert('Посилання на техніку має починатися з https://');
 technique=safeTechniqueUrl(technique);
 let restore=setActionLoading(button,'Додаємо…');
 try{
   let group='SS'+sourceId;
   await api('/program/'+sourceId+'/superset',{method:'PATCH',body:JSON.stringify({superset_group:group})});
   await api('/program',{method:'POST',body:JSON.stringify({client_id:selected,day_name:dayName,exercise,sets:+sssets.value||3,reps:ssreps.value||'8-12',target_rir:+ssrir.value||2,superset_group:group,superset_order:1,technique_url:technique,rest_seconds:0,rest_text:ssrest.value.trim(),rir_by_set:ssrirset.value.trim()})});
   if(libraryExerciseByName(exercise))rememberProgramExercise(exercise);
   supersetModal.remove();
   await openClient(selected,'program');
   reopenTrainerProgramDay(dayName);
 }catch(e){
   restore();
   alert(e.message||'Не вдалося додати вправу в суперсет');
 }
}


async function deleteExercise(id){if(confirm('Видалити вправу?')){await api('/program/'+id,{method:'DELETE'});openClient(selected)}}
