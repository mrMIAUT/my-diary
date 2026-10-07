// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.
// H02: user strings belong in quoted, HTML-escaped data-* attributes.
// Fixed handlers read dataset values; never interpolate those strings into JS.

function rirPlan(x){
 let a=String(x?.rir_by_set||'').split(',').map(v=>v.trim()).filter(Boolean);
 return Array.from({length:+x.sets||0},(_,i)=>a[i]!==undefined?+a[i]:(+x.target_rir||0));
}

function restLabel(x){let t=String(x.rest_text||'').trim();if(t)return t.replace(/\s*(хв|min|мин)\.?$/i,'')+' хв';let s=+x.rest_seconds||0;if(!s)return '';let m=s/60;return (Number.isInteger(m)?m:m.toFixed(1))+' хв'}

const REPEAT_MODE_OPTIONS=[
 ['normal','Звичайно'],
 ['total','Загалом'],
 ['per_leg','На кожну ногу'],
 ['per_arm','На кожну руку'],
 ['per_side','На кожну сторону']
];
function normalizeRepeatMode(value){
 let mode=String(value||'normal').trim();
 return REPEAT_MODE_OPTIONS.some(x=>x[0]===mode)?mode:'normal';
}
function repeatModeLabel(value){
 let mode=normalizeRepeatMode(value);
 return (REPEAT_MODE_OPTIONS.find(x=>x[0]===mode)||REPEAT_MODE_OPTIONS[0])[1];
}
function repeatModeSuffix(value){
 let mode=normalizeRepeatMode(value);
 return mode==='normal'?'':mode==='total'?' загалом':mode==='per_leg'?' на кожну ногу':mode==='per_arm'?' на кожну руку':' на кожну сторону';
}
function repeatModeShortLabel(value){
 let mode=normalizeRepeatMode(value);
 return mode==='normal'?'':mode==='total'?'загалом':mode==='per_leg'?'на кожну ногу':mode==='per_arm'?'на кожну руку':'на кожну сторону';
}
function repeatModeSelectHTML(id,value='normal',cls=''){
 let current=normalizeRepeatMode(value);
 return '<select'+(id?' id="'+esc(id)+'"':'')+(cls?' class="'+esc(cls)+'"':'')+'>'+REPEAT_MODE_OPTIONS.map(x=>'<option value="'+x[0]+'"'+(x[0]===current?' selected':'')+'>'+x[1]+'</option>').join('')+'</select>';
}
function repeatPlanText(x){
 return String(x?.reps??'')+repeatModeSuffix(x?.repeat_mode);
}
function repeatResultText(value,mode='normal'){
 return String(value??'')+repeatModeSuffix(mode);
}

function normalizeProgramAlternative(value,fallback={}){
 let raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{exercise:String(value||'')};
 let exercise=String(raw.exercise||raw.name||'').trim();
 let sets=Math.max(1,+raw.sets||+fallback.sets||3);
 let reps=String(raw.reps??fallback.reps??'8-12').trim()||'8-12';
 let repeatMode=normalizeRepeatMode(raw.repeat_mode??fallback.repeat_mode??'normal');
 let rirBySet=String(raw.rir_by_set??fallback.rir_by_set??'').trim();
 let target=Number.isFinite(+raw.target_rir)?+raw.target_rir:(Number.isFinite(+fallback.target_rir)?+fallback.target_rir:2);
 if(!rirBySet)rirBySet=Array.from({length:sets},()=>target).join(',');
 let first=rirBySet.split(',').map(v=>v.trim()).find(Boolean);
 if(first!==undefined&&first!==''&&Number.isFinite(+first))target=+first;
 return {
   exercise,
   sets,
   reps,
   repeat_mode:repeatMode,
   target_rir:Math.max(0,Math.min(10,target)),
   rir_by_set:rirBySet,
   rest_seconds:Math.max(0,+raw.rest_seconds||+fallback.rest_seconds||0),
   rest_text:String(raw.rest_text??fallback.rest_text??'').trim()
 };
}

function exerciseAlternativeConfigs(x){
 try{
   let a=JSON.parse(x?.alternatives_json||'[]');
   if(!Array.isArray(a))return [];
   return a.map(v=>normalizeProgramAlternative(v,x||{})).filter(v=>v.exercise);
 }catch(e){return []}
}
function exerciseAlternatives(x){return exerciseAlternativeConfigs(x).map(v=>v.exercise)}

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

function nextProgramAlternativeInputId(){
 window.__programAlternativeRowSeq=(+window.__programAlternativeRowSeq||0)+1;
 return 'programAlternative_'+window.__programAlternativeRowSeq;
}
function programAlternativeFallbackForContainer(containerId){
 if(containerId==='editAlternativesEditor'){
   return {
     sets:+document.getElementById('editSets')?.value||3,
     reps:document.getElementById('editReps')?.value||'8-12',
     repeat_mode:document.getElementById('editRepeatMode')?.value||'normal',
     rir_by_set:document.getElementById('editRirSet')?.value||'2,2,2',
     rest_text:document.getElementById('editRest')?.value||''
   };
 }
 if(containerId==='programSupersetAlternativesEditor'){
   return {
     sets:+document.getElementById('ssInlineSets')?.value||3,
     reps:document.getElementById('ssInlineReps')?.value||'8-12',
     repeat_mode:document.getElementById('ssInlineRepeatMode')?.value||'normal',
     rir_by_set:document.getElementById('ssInlineRirSet')?.value||'2,2,2',
     rest_text:document.getElementById('resttext')?.value||'2'
   };
 }
 return {
   sets:+document.getElementById('st')?.value||3,
   reps:document.getElementById('rp')?.value||'8-12',
   repeat_mode:document.getElementById('repeatmode')?.value||'normal',
   rir_by_set:document.getElementById('rirset')?.value||'2,2,2',
   rest_text:document.getElementById('resttext')?.value||'2'
 };
}
function programAlternativeRowHTML(value='',fallback={}){
 let inputId=nextProgramAlternativeInputId(),v=normalizeProgramAlternative(value,fallback);
 return `<div class="trainer-program-alternative-card trainer-program-alternative-row">
   <div class="trainer-program-alternative-main">
     <input id="${inputId}" class="trainer-program-alternative-input" list="exerciseLibraryNames" value="${esc(v.exercise)}" placeholder="Введіть вправу або оберіть з бібліотеки">
     <button type="button" class="trainer-program-alternative-pick" onclick="openProgramExercisePicker('${inputId}')">Обрати з бібліотеки</button>
     <button type="button" class="trainer-program-alternative-remove" onclick="removeProgramAlternativeRow(this)" aria-label="Прибрати альтернативу">×</button>
   </div>
   <div class="trainer-program-alternative-params">
     <label><span>Підходи</span><input class="trainer-program-alternative-sets" type="number" min="1" max="100" value="${esc(String(v.sets))}"></label>
     <label><span>Повтори</span><input class="trainer-program-alternative-reps" value="${esc(v.reps)}" placeholder="8-12"></label>
     <label><span>Як рахувати</span>${repeatModeSelectHTML('',v.repeat_mode,'trainer-program-alternative-repeat-mode')}</label>
     <label><span>RIR по підходах</span><input class="trainer-program-alternative-rir" value="${esc(v.rir_by_set)}" placeholder="2,2,1"></label>
     <label><span>Відпочинок</span><input class="trainer-program-alternative-rest" value="${esc(v.rest_text)}" placeholder="2-3 хв"></label>
   </div>
 </div>`;
}
function programAlternativeEditorHTML(containerId,values=[],fallback={}){
 let rows=(Array.isArray(values)?values:[]).map(v=>normalizeProgramAlternative(v,fallback)).filter(v=>v.exercise);
 if(!rows.length)rows=[normalizeProgramAlternative('',fallback)];
 return `<div id="${containerId}" class="trainer-program-alternatives-editor">${rows.map(v=>programAlternativeRowHTML(v,fallback)).join('')}</div>
   <button type="button" class="trainer-program-alternative-add" data-target="${containerId}" onclick="addProgramAlternativeRow(this.dataset.target)">＋ Додати альтернативу</button>`;
}
function addProgramAlternativeRow(containerId,value=''){
 let host=document.getElementById(containerId);if(!host)return;
 let fallback=programAlternativeFallbackForContainer(containerId);
 host.insertAdjacentHTML('beforeend',programAlternativeRowHTML(value,fallback));
 let input=host.lastElementChild?.querySelector('.trainer-program-alternative-input');
 input?.focus();
}
function removeProgramAlternativeRow(button){
 let row=button?.closest('.trainer-program-alternative-row'),host=row?.parentElement;if(!row||!host)return;
 let rows=[...host.querySelectorAll('.trainer-program-alternative-row')];
 if(rows.length<=1){
   let input=row.querySelector('.trainer-program-alternative-input');if(input){input.value='';input.focus()}
   return;
 }
 row.remove();
}
function collectProgramAlternatives(containerId,main=''){
 let host=document.getElementById(containerId),mainKey=String(main||'').trim().toLowerCase(),seen=new Set(),out=[];
 (host?[...host.querySelectorAll('.trainer-program-alternative-row')]:[]).forEach(row=>{
   let input=row.querySelector('.trainer-program-alternative-input'),value=String(input?.value||'').trim(),key=value.toLowerCase();
   if(!value||key===mainKey||seen.has(key))return;
   let sets=Math.max(1,+row.querySelector('.trainer-program-alternative-sets')?.value||1);
   let reps=String(row.querySelector('.trainer-program-alternative-reps')?.value||'8-12').trim()||'8-12';
   let repeat_mode=normalizeRepeatMode(row.querySelector('.trainer-program-alternative-repeat-mode')?.value);
   let rir=String(row.querySelector('.trainer-program-alternative-rir')?.value||'').trim();
   let first=rir.split(',').map(v=>v.trim()).find(Boolean),target=first!==undefined&&Number.isFinite(+first)?+first:2;
   let rest=String(row.querySelector('.trainer-program-alternative-rest')?.value||'').trim();
   seen.add(key);
   out.push({exercise:value,sets,reps,repeat_mode,target_rir:Math.max(0,Math.min(10,target)),rir_by_set:rir,rest_seconds:0,rest_text:rest});
 });
 return out;
}

function alternativesTrainerHTML(x){
 let a=exerciseAlternativeConfigs(x);
 if(!a.length)return '';
 let html=a.map(v=>{
   let tech=exerciseTechniqueUrl(v.exercise),rest=restLabel(v),rir=rirPlan(v).join(' / ');
   return '<span class="alternative-chip alternative-chip-detailed"><span class="alternative-chip-top"><span class="alternative-name">'+esc(v.exercise)+'</span>'+(tech?techniqueLinkHTML(tech,'Техніка',true,'alternative-tech-link'):'')+'</span><small>'+v.sets+' × '+esc(repeatPlanText(v))+' · RIR '+esc(rir)+(rest?' · '+esc(rest):'')+'</small></span>';
 }).join('');
 return '<div class="exercise-alternatives"><strong>Альтернативи</strong><div>'+html+'</div></div>';
}

function orderedSupersetItems(items){
 return (items||[]).slice().sort((a,b)=>(+a.superset_order||0)-(+b.superset_order||0)||(+a.sort||0)-(+b.sort||0)||(+a.id||0)-(+b.id||0));
}
function supersetRestLabel(items){
 let xs=orderedSupersetItems(items),last=xs[xs.length-1];
 return last?restLabel(last):'';
}
function programExtraHTML(x,showRest=true){
 let rest=showRest?restLabel(x):'',rp=rirPlan(x);
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
 window.__programExercisePickerState={targetId:String(targetId||''),techId:String(techId||''),mode:recents.length?'recent':'all',groupId:0,muscleScope:'primary',muscleId:0,query:''};
 document.body.insertAdjacentHTML('beforeend',`<div class="modal trainer-program-picker-modal" id="programExercisePickerModal" onclick="if(event.target===this)closeProgramExercisePicker()"><div class="card trainer-program-picker-card">
   <div class="trainer-program-picker-head"><div><small>БІБЛІОТЕКА ВПРАВ</small><h2>Обрати вправу</h2><p>За замовчуванням фільтруємо за основними м’язами.</p></div><button type="button" class="trainer-program-picker-close" onclick="closeProgramExercisePicker()" aria-label="Закрити">✕</button></div>
   <label class="trainer-program-picker-search"><span>⌕</span><input id="programExercisePickerSearch" type="search" placeholder="Пошук вправи..." autocomplete="off" oninput="programExercisePickerSetQuery(this.value)"></label>
   <div class="trainer-program-picker-modes" id="programExercisePickerModes"></div>
   <div class="trainer-program-picker-groups" id="programExercisePickerGroups"></div>
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
function programExercisePickerSetGroup(button){
 let s=programExercisePickerState();if(!s)return;
 s.groupId=+(button?.dataset?.groupId||0);
 renderProgramExercisePicker();
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
 let modes=document.getElementById('programExercisePickerModes'),groups=document.getElementById('programExercisePickerGroups'),scope=document.getElementById('programExercisePickerScope'),muscles=document.getElementById('programExercisePickerMuscles');
 let recentCount=programExercisePickerRecent().length,favCount=programExercisePickerFavorites().length;
 if(modes)modes.innerHTML=[
   ['all','Усі'],
   ['favorite','★ Обране'+(favCount?' · '+favCount:'')],
   ['recent','Нещодавні'+(recentCount?' · '+recentCount:'')]
 ].map(([mode,label])=>`<button type="button" class="${s.mode===mode?'active':''}" data-picker-mode="${mode}" onclick="programExercisePickerSetMode(this)">${esc(label)}</button>`).join('');
 if(groups){
  let gs=(window.exerciseLibrary?.groups||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'uk'));
  groups.innerHTML=`<button type="button" class="${!s.groupId?'active':''}" data-group-id="0" onclick="programExercisePickerSetGroup(this)">Усі групи</button>`
    +gs.map(g=>`<button type="button" class="${+s.groupId===+g.id?'active':''}" data-group-id="${g.id}" onclick="programExercisePickerSetGroup(this)">${esc(g.name)}</button>`).join('');
 }
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
   if(s.groupId&&+x.group_id!==+s.groupId)return false;
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

function programDayMeta(d,day){
 return (d?.program_days||[]).find(v=>String(v.day_name||'')===String(day||''))||null;
}
function programDayTitle(d,day){
 let x=programDayMeta(d,day);
 return String(x?.title||'').trim();
}
function programDayKind(d,day){return String(programDayMeta(d,day)?.kind||'standard').toLowerCase()}
function programDayIsExtra(d,day){return programDayKind(d,day)==='extra'}
function programDayIsAvailable(d,day){
 let m=programDayMeta(d,day);
 if(!m||String(m.kind||'standard').toLowerCase()!=='extra')return true;
 if(String(m.status||'active').toLowerCase()!=='active')return false;
 let until=String(m.active_until||'').slice(0,10);
 return !until||until>=isoToday();
}
function programDayExtraModeLabel(m){
 if(!m)return '';
 return String(m.extra_mode||'once').toLowerCase()==='temporary'?'Тимчасово':'Разово';
}
function programDayExtraStatusLabel(m){
 if(!m)return '';
 let until=String(m.active_until||'').slice(0,10),expired=until&&until<isoToday();
 if(expired)return 'Термін завершено';
 return String(m.status||'active').toLowerCase()==='active'?'Активне':'Призупинено';
}

function trainerProgramExerciseTitleHTML(name){
 let value=String(name||'').trim(),long=value.length>24;
 return '<span class="trainer-program-name-marquee'+(long?' is-long':'')+'" title="'+esc(value)+'"><span class="trainer-program-name-track"><strong>'+esc(value)+'</strong>'+(long?'<strong aria-hidden="true">'+esc(value)+'</strong>':'')+'</span></span>';
}

function programHTML(d){
 let groups={}; (d.program||[]).forEach(x=>(groups[x.day_name]??=[]).push(x));
 (d.program_days||[]).forEach(m=>{if(String(m.kind||'standard').toLowerCase()==='extra'&&!groups[m.day_name])groups[m.day_name]=[]});
 let form=`<div class="card trainer-program-editor">
   <div class="trainer-program-editor-head"><div><h2>Програма тренувань</h2><p>Додай вправу до потрібного тренувального дня.</p></div><button type="button" class="trainer-extra-day-create" onclick="openExtraTrainingDayModal()">＋ Додаткове тренування</button></div>
   <div class="trainer-program-editor-grid">
     <label class="wide"><span>День</span><input id="dn" placeholder="Напр. День 1"></label>
     <label class="wide"><span>Назва дня</span><input id="dntitle" placeholder="Напр. Ноги або Плечі + руки"></label>
     <label class="wide"><span>Вправа</span><div class="trainer-program-exercise-field"><input id="ex" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,'tech')" placeholder="Оберіть або введіть вправу"><button type="button" onclick="openProgramExercisePicker('ex','tech')">Обрати з бібліотеки</button></div></label>
     <label class="wide"><span>Техніка</span><input id="tech" placeholder="https://..."></label>
     <label><span>Підходи</span><input id="st" type="number" value="3" placeholder="3"></label>
     <label><span>Повтори</span><input id="rp" value="8-12" placeholder="8-12"></label>
     <label><span>Як рахувати повтори</span>${repeatModeSelectHTML('repeatmode','normal')}</label>
     <label><span>RIR по підходах</span><input id="rirset" value="2,2,2" placeholder="2,2,1"></label>
     <label><span>Відпочинок</span><input id="resttext" value="2" placeholder="2 хв"></label>
     <div class="wide trainer-program-alternatives-block"><div class="trainer-program-alternatives-title"><span>Альтернативи</span><small>Можна обрати з бібліотеки або ввести вручну</small></div>${programAlternativeEditorHTML('programAlternativesEditor',[],{sets:3,reps:'8-12',rir_by_set:'2,2,2',target_rir:2,rest_text:'2'})}</div>
     <div class="wide trainer-inline-superset-builder">
       <button type="button" class="trainer-inline-superset-toggle" id="inlineSupersetToggle" onclick="toggleNewExerciseSupersetBuilder()">＋ Додати суперсет</button>
       <div id="inlineSupersetFields" class="trainer-inline-superset-fields hidden">
         <div class="trainer-inline-superset-head"><div><small>СУПЕРСЕТ</small><strong>Друга вправа</strong><span>Відпочинок для суперсету береться з поля вище.</span></div><button type="button" onclick="toggleNewExerciseSupersetBuilder(false)" aria-label="Прибрати суперсет">✕</button></div>
         <div class="trainer-inline-superset-grid">
           <label class="wide"><span>Вправа</span><div class="trainer-program-exercise-field"><input id="ssInlineEx" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,'ssInlineTech')" placeholder="Оберіть або введіть вправу"><button type="button" onclick="openProgramExercisePicker('ssInlineEx','ssInlineTech')">Обрати з бібліотеки</button></div></label>
           <label class="wide"><span>Техніка</span><input id="ssInlineTech" placeholder="https://..."></label>
           <label><span>Підходи</span><input id="ssInlineSets" type="number" min="1" value="3" placeholder="3"></label>
           <label><span>Повтори</span><input id="ssInlineReps" value="8-12" placeholder="8-12"></label>
           <label><span>Як рахувати повтори</span>${repeatModeSelectHTML('ssInlineRepeatMode','normal')}</label>
           <label class="wide"><span>RIR по підходах</span><input id="ssInlineRirSet" value="2,2,2" placeholder="2,2,1"></label>
           <div class="wide trainer-program-alternatives-block"><div class="trainer-program-alternatives-title"><span>Альтернативи другої вправи</span><small>Необов'язково</small></div>${programAlternativeEditorHTML('programSupersetAlternativesEditor',[],{sets:3,reps:'8-12',rir_by_set:'2,2,2',target_rir:2,rest_text:'2'})}</div>
         </div>
       </div>
     </div>
   </div>
   <datalist id="exerciseLibraryNames">${[...new Map((window.exerciseLibrary?.exercises||[]).map(x=>[String(x.name||'').trim().toLowerCase(),x])).values()].map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist>
   <button class="trainer-program-add" onclick="addExercise(event.currentTarget)">Зберегти вправу</button>
 </div>`;
 let entries=Object.entries(groups);
 let list=entries.length?entries.map(([day,xs],di)=>{
   let bodyId='programDay_'+di,title=programDayTitle(d,day),meta=programDayMeta(d,day),isExtra=programDayIsExtra(d,day),blocks=[];
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
     let superRest=isSuper?supersetRestLabel(b.items):'';
     let superHead=isSuper?`<div class="trainer-superset-head"><span>Суперсет</span>${superRest?`<small>Відпочинок ${esc(superRest)}</small>`:''}</div>`:'';
     let info=superHead+b.items.map((x,xi)=>{
       let tech=exerciseTechniqueUrl(x.exercise,x.technique_url);
       let itemActions=!isSuper&&xi===0?normalBlockActions:(isSuper&&xi===0?supersetMoveActions:'');
       return `<div class="${isSuper?'superset-inner':'trainer-exercise-shell'}">
         <div class="trainer-exercise-head">
           <div class="trainer-program-title-line ${isSuper?'superset-title-line':''}">${trainerProgramExerciseTitleHTML(x.exercise)}${tech?techniqueLinkHTML(tech,'Техніка',true,'alternative-tech-link'):''}</div>
           ${itemActions}
         </div>
         <div class="trainer-exercise-body">
           <div class="muted">${x.sets} підходи × ${esc(repeatPlanText(x))}</div>
           ${programExtraHTML(x,!isSuper)}
           ${alternativesTrainerHTML(x)}
           <div class="inner-actions"><button class="dark" onclick="event.stopPropagation();editExercise(${x.id})">✏️ Редагувати</button><button class="danger" onclick="event.stopPropagation();deleteExercise(${x.id})">Видалити</button></div>
         </div>
       </div>`;
     }).join('');
     return `<div class="exercise program-block trainer-exercise-card ${isSuper?'superset-block':''}"><div class="program-block-info">${info}</div></div>`;
   }).join('');
   let extraBadge=isExtra?`<span class="trainer-extra-day-badges"><b>Додаткове</b><em>${esc(programDayExtraModeLabel(meta))}</em><i class="${programDayIsAvailable(d,day)?'active':'paused'}">${esc(programDayExtraStatusLabel(meta))}</i></span>`:'';
   let extraActions=isExtra?`<div class="trainer-extra-day-actions">
      <button type="button" class="dark" data-day="${esc(day)}" onclick="toggleExtraTrainingDayStatus(this.dataset.day,this)">${programDayIsAvailable(d,day)?'Призупинити':'Активувати'}</button>
      <button type="button" class="dark" data-day="${esc(day)}" onclick="openExtraTrainingDayModal(this.dataset.day)">Налаштування</button>
      <button type="button" class="trainer-extra-promote" data-day="${esc(day)}" onclick="promoteExtraTrainingDay(this.dataset.day,this)">Додати до основного плану</button>
      <button type="button" class="dark" data-day="${esc(day)}" onclick="openDuplicateProgramDayModal(this.dataset.day)">Дублювати</button>
      <button type="button" class="danger" data-day="${esc(day)}" onclick="deleteProgramDay(this.dataset.day,this)">Видалити день</button>
    </div>`:'';
   let emptyExtra=isExtra&&!rows?`<div class="trainer-extra-day-empty"><span>У цьому додатковому тренуванні ще немає вправ.</span><button type="button" data-day="${esc(day)}" onclick="useProgramDayInEditor(this.dataset.day)">Додати вправу</button></div>`:'';
   return `<div class="card program-day-card ${isExtra?'trainer-extra-day-card':''}" data-program-day="${esc(day)}">
     <div class="program-day-header-row">
       <button class="program-day-head" data-day="${esc(day)}" onclick="toggleProgramDay('${bodyId}',this)">
         <span class="program-day-heading"><span class="trainer-program-day-title-row"><h2>${esc(day)}</h2>${extraBadge}</span>${title?`<small>${esc(title)}</small>`:''}</span>
         <span class="program-day-arrow">⌄</span>
       </button>
       <button class="dark program-day-title-edit" title="Назва дня" data-day="${esc(day)}" onclick="event.stopPropagation();editProgramDayTitle(this.dataset.day)">✎</button>
     </div>
     <div id="${bodyId}" data-program-day-body="${esc(day)}" class="hidden" style="margin-top:18px">${extraActions}${emptyExtra}${rows}</div>
   </div>`;
 }).join(''):'<div class="card muted">Програма ще порожня.</div>';
 return form+list;
}

function useProgramDayInEditor(day){
 let d=window.currentClientData||{},meta=programDayMeta(d,day);
 let dayInput=document.getElementById('dn'),titleInput=document.getElementById('dntitle');
 if(dayInput)dayInput.value=day;
 if(titleInput)titleInput.value=meta?.title||'';
 document.querySelector('.trainer-program-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
 setTimeout(()=>document.getElementById('ex')?.focus(),250);
}

function extraTrainingDayFormModeChanged(){
 let mode=document.getElementById('extraDayMode')?.value||'once',wrap=document.getElementById('extraDayUntilWrap');
 if(wrap)wrap.classList.toggle('hidden',mode!=='temporary');
}

function openExtraTrainingDayModal(day=''){
 let d=window.currentClientData||{},meta=day?programDayMeta(d,day):null,isEdit=!!day;
 let title=meta?.title||'',mode=String(meta?.extra_mode||'once'),status=String(meta?.status||'active'),until=String(meta?.active_until||'').slice(0,10);
 document.getElementById('extraTrainingDayModal')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal trainer-extra-day-modal" id="extraTrainingDayModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-extra-day-modal-card"><div class="edit-exercise-head"><div><small>ДОДАТКОВЕ ТРЕНУВАННЯ</small><h2>${isEdit?'Налаштування':'Створити день'}</h2></div><button type="button" class="dark edit-exercise-close" onclick="extraTrainingDayModal.remove()">✕</button></div><div class="trainer-extra-day-form"><label><span>День</span><input id="extraDayName" value="${esc(day)}" ${isEdit?'readonly':''} placeholder="Напр. Додатковий день"></label><label><span>Назва</span><input id="extraDayTitle" value="${esc(title)}" placeholder="Напр. Груди + руки"></label><label><span>Режим</span><select id="extraDayMode" onchange="extraTrainingDayFormModeChanged()"><option value="once" ${mode==='once'?'selected':''}>Разово</option><option value="temporary" ${mode==='temporary'?'selected':''}>Тимчасово</option></select></label><label><span>Статус</span><select id="extraDayStatus"><option value="active" ${status==='active'?'selected':''}>Активне</option><option value="paused" ${status==='paused'?'selected':''}>Призупинено</option></select></label><label id="extraDayUntilWrap" class="${mode==='temporary'?'':'hidden'}"><span>Доступне до</span><input id="extraDayUntil" type="date" value="${esc(until)}"></label></div><p class="trainer-extra-day-note">Разовий день автоматично призупиниться після завершення. Тимчасовий можна залишити активним до потрібної дати.</p><button type="button" class="trainer-extra-day-save" onclick="saveExtraTrainingDay(this)">${isEdit?'Зберегти':'Створити тренування'}</button></div></div>`);
}

async function saveExtraTrainingDay(button=null){
 let d=window.currentClientData||{},cid=d.client?.id||selected,day=(document.getElementById('extraDayName')?.value||'').trim(),title=(document.getElementById('extraDayTitle')?.value||'').trim(),mode=document.getElementById('extraDayMode')?.value||'once',status=document.getElementById('extraDayStatus')?.value||'active',until=(document.getElementById('extraDayUntil')?.value||'').trim();
 if(!day)return alert('Вкажи назву дня.');
 let restore=setActionLoading(button,'Зберігаємо…');
 try{
   await api('/program-day-settings',{method:'PUT',body:JSON.stringify({client_id:cid,day_name:day,title,kind:'extra',extra_mode:mode,status,active_until:mode==='temporary'&&until?until:null})});
   extraTrainingDayModal.remove();
   let fresh=await loadClientData(cid);window.currentClientData=fresh;
   let pane=document.getElementById('program');
   if(pane){pane.innerHTML=trainerTrainingTabHTML(fresh);reopenTrainerProgramDay(day)}
   else await openClient(cid,'program');
 }catch(e){restore();alert(e.message||'Не вдалося зберегти додаткове тренування')}
}

async function toggleExtraTrainingDayStatus(day,button=null){
 let d=window.currentClientData||{},m=programDayMeta(d,day);if(!m)return;
 let status=programDayIsAvailable(d,day)?'paused':'active',restore=setActionLoading(button,status==='active'?'Активуємо…':'Призупиняємо…');
 try{
   await api('/program-day-settings',{method:'PUT',body:JSON.stringify({client_id:d.client.id,day_name:day,title:m.title||'',kind:'extra',extra_mode:m.extra_mode||'once',status,active_until:m.active_until||null})});
   let fresh=await loadClientData(d.client.id);window.currentClientData=fresh;
   let pane=document.getElementById('program');if(pane){pane.innerHTML=trainerTrainingTabHTML(fresh);reopenTrainerProgramDay(day)}
 }catch(e){restore();alert(e.message||'Не вдалося змінити статус')}
}

async function promoteExtraTrainingDay(day,button=null){
 if(!confirm('Додати цей день до основного плану? Він почне враховуватися у поточному циклі тренувань.'))return;
 let d=window.currentClientData||{},m=programDayMeta(d,day);if(!m)return;
 let restore=setActionLoading(button,'Додаємо…');
 try{
   await api('/program-day-settings',{method:'PUT',body:JSON.stringify({client_id:d.client.id,day_name:day,title:m.title||'',kind:'standard',extra_mode:'once',status:'active',active_until:null})});
   let fresh=await loadClientData(d.client.id);window.currentClientData=fresh;
   let pane=document.getElementById('program');if(pane){pane.innerHTML=trainerTrainingTabHTML(fresh);reopenTrainerProgramDay(day)}
 }catch(e){restore();alert(e.message||'Не вдалося додати день до основного плану')}
}

function openDuplicateProgramDayModal(day){
 document.getElementById('duplicateProgramDayModal')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal trainer-extra-day-modal" id="duplicateProgramDayModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-extra-day-modal-card"><div class="edit-exercise-head"><div><small>ДУБЛЮВАННЯ</small><h2>${esc(day)}</h2></div><button type="button" class="dark edit-exercise-close" onclick="duplicateProgramDayModal.remove()">✕</button></div><label class="trainer-day-title-field"><span>Новий день</span><input id="duplicateProgramDayName" placeholder="Напр. Додатковий день 2"></label><label class="trainer-day-title-field"><span>Назва</span><input id="duplicateProgramDayTitle" placeholder="Необов’язково"></label><button type="button" class="trainer-extra-day-save" data-day="${esc(day)}" onclick="duplicateProgramDay(this.dataset.day,this)">Створити копію</button></div></div>`);
 setTimeout(()=>document.getElementById('duplicateProgramDayName')?.focus(),30);
}

async function duplicateProgramDay(day,button=null){
 let d=window.currentClientData||{},target=(document.getElementById('duplicateProgramDayName')?.value||'').trim(),title=(document.getElementById('duplicateProgramDayTitle')?.value||'').trim();
 if(!target)return alert('Вкажи назву нового дня.');
 let restore=setActionLoading(button,'Копіюємо…');
 try{
   await api('/program-day/duplicate',{method:'POST',body:JSON.stringify({client_id:d.client.id,source_day:day,target_day:target,target_title:title})});
   duplicateProgramDayModal.remove();
   let fresh=await loadClientData(d.client.id);window.currentClientData=fresh;
   let pane=document.getElementById('program');if(pane){pane.innerHTML=trainerTrainingTabHTML(fresh);reopenTrainerProgramDay(target)}
 }catch(e){restore();alert(e.message||'Не вдалося дублювати день')}
}

async function deleteProgramDay(day,button=null){
 if(!confirm('Видалити цей додатковий день з поточного плану? Історія вже виконаних тренувань залишиться.'))return;
 let d=window.currentClientData||{},restore=setActionLoading(button,'Видаляємо…');
 try{
   await api('/program-day/'+d.client.id+'?day_name='+encodeURIComponent(day),{method:'DELETE'});
   let fresh=await loadClientData(d.client.id);window.currentClientData=fresh;
   let pane=document.getElementById('program');if(pane)pane.innerHTML=trainerTrainingTabHTML(fresh);
 }catch(e){restore();alert(e.message||'Не вдалося видалити день')}
}

function toggleNewExerciseSupersetBuilder(force=null){
 let host=document.getElementById('inlineSupersetFields'),btn=document.getElementById('inlineSupersetToggle');if(!host)return;
 let show=force===null?host.classList.contains('hidden'):!!force,save=document.querySelector('.trainer-program-editor>.trainer-program-add');
 host.classList.toggle('hidden',!show);
 if(btn){btn.classList.toggle('active',show);btn.textContent=show?'✓ Суперсет':'＋ Додати суперсет'}
 if(save)save.textContent=show?'Зберегти суперсет':'Зберегти вправу';
 if(show)setTimeout(()=>document.getElementById('ssInlineEx')?.focus(),30);
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
 document.getElementById('dayTitleModal')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal trainer-day-title-modal" id="dayTitleModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-day-title-card"><div class="edit-exercise-head"><div><small class="trainer-day-title-kicker">ТРЕНУВАЛЬНИЙ ДЕНЬ</small><h2>Назва тренувального дня</h2><div class="trainer-day-title-day">${esc(day)}</div></div><button class="dark edit-exercise-close" type="button" aria-label="Закрити" onclick="dayTitleModal.remove()">✕</button></div><label class="trainer-day-title-field"><span>Назва дня</span><input id="dayTitleInput" value="${esc(current)}" placeholder="Наприклад: Груди + Спина"></label><p class="trainer-day-title-hint">Цю назву клієнт бачитиме у своїй програмі тренувань.</p><button class="trainer-day-title-save" data-day="${esc(day)}" onclick="saveProgramDayTitle(this.dataset.day,event.currentTarget)">Зберегти назву</button></div></div>`);
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
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="editExerciseModal"><div class="card edit-exercise-card"><div class="edit-exercise-head"><h2>Редагувати вправу</h2><button class="dark edit-exercise-close" onclick="editExerciseModal.remove()">✕</button></div><div class="grid"><input id="editDay" value="${esc(x.day_name)}" placeholder="День"><div class="trainer-program-exercise-field"><input id="editName" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,\'editTech\')" value="${esc(x.exercise)}" placeholder="Вправа"><button type="button" onclick="openProgramExercisePicker('editName','editTech')">Обрати з бібліотеки</button></div><input id="editTech" value="${esc(x.technique_url||'')}" placeholder="Посилання на техніку"><input id="editSets" type="number" min="1" value="${x.sets||3}" placeholder="Підходи"><input id="editReps" value="${esc(x.reps||'')}" placeholder="Повтори"><label class="wide trainer-repeat-mode-field"><span>Як рахувати повтори</span>${repeatModeSelectHTML('editRepeatMode',x.repeat_mode)}</label><input id="editRirSet" value="${esc(x.rir_by_set||rirPlan(x).join(','))}" placeholder="RIR по підходах"><input id="editRest" value="${esc(x.rest_text||((+x.rest_seconds||0)?String((+x.rest_seconds/60)).replace(/\.0$/,""):""))}" placeholder="Відпочинок, хв (напр. 2-3)"><div class="wide trainer-program-alternatives-block"><div class="trainer-program-alternatives-title"><span>Альтернативи</span><small>Обери з бібліотеки або введи вручну</small></div>${programAlternativeEditorHTML('editAlternativesEditor',exerciseAlternativeConfigs(x),x)}</div></div><br><button class="trainer-edit-exercise-primary" onclick="saveExerciseEdit(${pid},${x.client_id})">Зберегти зміни</button></div></div>`);
}

async function saveExerciseEdit(pid,cid){
 let body={client_id:cid,day_name:editDay.value.trim(),exercise:editName.value.trim(),sets:+editSets.value||1,reps:editReps.value.trim(),repeat_mode:normalizeRepeatMode(editRepeatMode.value),target_rir:+((editRirSet.value||'2').split(',')[0].trim())||2,superset_group:'',superset_order:0,technique_url:editTech.value.trim(),rest_seconds:0,rest_text:editRest.value.trim(),rir_by_set:editRirSet.value.trim(),alternatives_json:JSON.stringify(collectProgramAlternatives('editAlternativesEditor',editName.value))};
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
 let useSuperset=!document.getElementById('inlineSupersetFields')?.classList.contains('hidden');
 let secondExercise=(document.getElementById('ssInlineEx')?.value||'').trim(),secondTech=(document.getElementById('ssInlineTech')?.value||'').trim();
 if(useSuperset&&!secondExercise)return alert('Вкажи другу вправу суперсету');
 if(secondTech&&!safeTechniqueUrl(secondTech))return alert('Посилання на техніку другої вправи має починатися з https://');
 secondTech=safeTechniqueUrl(secondTech);
 let restore=setActionLoading(button,useSuperset?'Додаємо суперсет…':'Додаємо…');
 try{
  if(title)await api('/program-day-title',{method:'PUT',body:JSON.stringify({client_id:selected,day_name:day,title})});
  let first={client_id:selected,day_name:day,exercise,sets:+st.value||3,reps:rp.value||'8-12',repeat_mode:normalizeRepeatMode(document.getElementById('repeatmode')?.value),target_rir:+((rirset.value||'2').split(',')[0].trim())||2,superset_group:'',superset_order:0,superset_with_id:0,technique_url:technique,rest_seconds:0,rest_text:resttext.value.trim(),rir_by_set:rirset.value.trim(),alternatives_json:JSON.stringify(collectProgramAlternatives('programAlternativesEditor',exercise))};
  if(useSuperset){
    let secondRir=(document.getElementById('ssInlineRirSet')?.value||'2,2,2').trim();
    let second={client_id:selected,day_name:day,exercise:secondExercise,sets:+document.getElementById('ssInlineSets')?.value||3,reps:document.getElementById('ssInlineReps')?.value||'8-12',repeat_mode:normalizeRepeatMode(document.getElementById('ssInlineRepeatMode')?.value),target_rir:+((secondRir||'2').split(',')[0].trim())||2,superset_group:'',superset_order:1,superset_with_id:0,technique_url:secondTech,rest_seconds:0,rest_text:resttext.value.trim(),rir_by_set:secondRir,alternatives_json:JSON.stringify(collectProgramAlternatives('programSupersetAlternativesEditor',secondExercise))};
    await api('/program/superset-pair',{method:'POST',body:JSON.stringify({first,second})});
    if(libraryExerciseByName(secondExercise))rememberProgramExercise(secondExercise);
  }else{
    await api('/program',{method:'POST',body:JSON.stringify(first)});
  }
  if(libraryExerciseByName(exercise))rememberProgramExercise(exercise);
  await openClient(selected,'program');
  reopenTrainerProgramDay(day);
 }catch(e){restore();alert(e.message||'Не вдалося додати вправу')}
}


function addSupersetExercise(sourceId,dayName){
 document.getElementById('supersetModal')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="supersetModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-superset-modal"><div class="edit-exercise-head"><div><h2>Додати вправу в суперсет</h2><div class="muted">${esc(dayName)}</div></div><button class="dark edit-exercise-close" type="button" onclick="supersetModal.remove()">✕</button></div><p class="muted trainer-superset-modal-copy">Обери вправу з бібліотеки або введи свою. Посилання на техніку підтягнеться автоматично, якщо воно є в бібліотеці.</p><div class="trainer-superset-modal-grid"><label class="wide"><span>Вправа</span><div class="trainer-program-exercise-field"><input id="ssex" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,'sstech')" placeholder="Оберіть або введіть вправу"><button type="button" onclick="openProgramExercisePicker('ssex','sstech')">Обрати з бібліотеки</button></div></label><label class="wide"><span>Техніка</span><input id="sstech" placeholder="https://..."></label><label><span>Підходи</span><input id="sssets" type="number" min="1" value="3" placeholder="3"></label><label><span>Повтори</span><input id="ssreps" value="8-12" placeholder="8-12"></label><label><span>Як рахувати повтори</span>${repeatModeSelectHTML('ssrepeatmode','normal')}</label><label><span>RIR</span><input id="ssrir" type="number" min="0" max="10" value="2" placeholder="2"></label><label><span>RIR по підходах</span><input id="ssrirset" value="2,2,2" placeholder="2,2,1"></label><label class="wide"><span>Відпочинок</span><input id="ssrest" value="2" placeholder="2 хв"></label></div><button class="trainer-superset-primary" type="button" data-day="${esc(dayName)}" onclick="saveSupersetExercise(${sourceId},this.dataset.day,this)">Зберегти вправу</button></div></div>`);
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
   await api('/program',{method:'POST',body:JSON.stringify({client_id:selected,day_name:dayName,exercise,sets:+sssets.value||3,reps:ssreps.value||'8-12',repeat_mode:normalizeRepeatMode(document.getElementById('ssrepeatmode')?.value),target_rir:+ssrir.value||2,superset_group:'',superset_order:0,superset_with_id:sourceId,technique_url:technique,rest_seconds:0,rest_text:ssrest.value.trim(),rir_by_set:ssrirset.value.trim()})});
   if(libraryExerciseByName(exercise))rememberProgramExercise(exercise);
   supersetModal.remove();
   await openClient(selected,'program');
   reopenTrainerProgramDay(dayName);
 }catch(e){
   restore();
   alert(e.message||'Не вдалося додати вправу в суперсет');
 }
}


async function deleteExercise(id){
 if(!confirm('Видалити вправу?'))return;
 let d=window.currentClientData||{},item=(d.program||[]).find(x=>+x.id===+id);
 let dayName=item?.day_name||'',cid=d.client?.id||selected;
 try{
   await api('/program/'+id,{method:'DELETE'});
   let fresh=await loadClientData(cid);
   window.currentClientData=fresh;
   let pane=document.getElementById('program');
   if(pane){
     pane.innerHTML=trainerTrainingTabHTML(fresh);
     if(dayName)reopenTrainerProgramDay(dayName);
   }else{
     await openClient(cid,'program');
     if(dayName)setTimeout(()=>reopenTrainerProgramDay(dayName),30);
   }
 }catch(e){
   alert(e.message||'Не вдалося видалити вправу');
 }
}
