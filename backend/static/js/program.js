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
 return (window.exerciseLibrary?.exercises||[]).find(x=>String(x.name||'').trim().toLowerCase()===q)||null;
}

function exerciseTechniqueUrl(name,fallback=''){
 let lib=libraryExerciseByName(name);
 return safeTechniqueUrl(lib?.technique_url||fallback||'');
}

function alternativesInputValue(x){return exerciseAlternatives(x).join(', ')}

function parseAlternatives(v,main=''){let seen=new Set(),m=String(main||'').trim().toLowerCase();return String(v||'').split(',').map(x=>x.trim()).filter(x=>x&&x.toLowerCase()!==m&&!seen.has(x.toLowerCase())&&seen.add(x.toLowerCase()))}

function alternativesTrainerHTML(x){let a=exerciseAlternatives(x);return a.length?`<div class="exercise-alternatives"><strong>Альтернативи</strong><div>${a.map(v=>{let tech=exerciseTechniqueUrl(v);return `<span class="alternative-chip">${esc(v)}${tech?' · '+techniqueLinkHTML(tech,'Техніка',true,'alternative-tech-link'):''}</span>`}).join('')}</div></div>`:''}

function programExtraHTML(x){
 let rest=restLabel(x),rp=rirPlan(x);
 return `<div class="program-extra">${rest?`<span class="badge">Відпочинок ${esc(rest)}</span>`:''}<span class="badge">RIR: ${rp.join(' / ')}</span></div>`;
}

function autofillTechnique(name,targetId){
 let q=String(name||'').trim().toLowerCase(),item=(window.exerciseLibrary?.exercises||[]).find(x=>String(x.name||'').trim().toLowerCase()===q);
 let el=document.getElementById(targetId);if(el)el.value=item?.technique_url||'';
}

function programDayTitle(d,day){
 let x=(d?.program_days||[]).find(v=>v.day_name===day);
 return String(x?.title||'').trim();
}

function programHTML(d){
 let groups={}; d.program.forEach(x=>(groups[x.day_name]??=[]).push(x));
 let form=`<div class="card trainer-program-editor">
   <div class="trainer-program-editor-head"><h2>Програма тренувань</h2><p>Додай вправу до потрібного тренувального дня.</p></div>
   <div class="trainer-program-editor-grid">
     <label class="wide"><span>День</span><input id="dn" placeholder="Напр. День 1"></label>
     <label class="wide"><span>Назва дня</span><input id="dntitle" placeholder="Напр. Ноги або Плечі + руки"></label>
     <label class="wide"><span>Вправа</span><input id="ex" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,'tech')" placeholder="Оберіть або введіть вправу"></label>
     <label class="wide"><span>Техніка</span><input id="tech" placeholder="https://..."></label>
     <label><span>Підходи</span><input id="st" type="number" value="3" placeholder="3"></label>
     <label><span>Повтори</span><input id="rp" value="8-12" placeholder="8-12"></label>
     <label><span>RIR по підходах</span><input id="rirset" value="2,2,2" placeholder="2,2,1"></label>
     <label><span>Відпочинок</span><input id="resttext" value="2" placeholder="2 хв"></label>
     <label class="wide"><span>Альтернативи</span><input id="alternatives" list="exerciseLibraryNames" placeholder="Напр. Гак-присідання, Сміт"></label>
   </div>
   <datalist id="exerciseLibraryNames">${(window.exerciseLibrary?.exercises||[]).map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist>
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
     let info=(isSuper?`<div class="trainer-superset-head">Суперсет</div>`:'')+b.items.map((x,xi)=>{let tech=exerciseTechniqueUrl(x.exercise,x.technique_url);return `<div class="${isSuper?'superset-inner':''}"><div class="trainer-program-title-line ${isSuper?'superset-title-line':''}"><strong>${esc(x.exercise)}</strong>${tech?' · '+techniqueLinkHTML(tech,'Техніка',true,'alternative-tech-link'):''}</div><div class="muted">${x.sets} підходи × ${esc(x.reps)}</div>${programExtraHTML(x)}${alternativesTrainerHTML(x)}<div class="inner-actions"><button class="dark" onclick="event.stopPropagation();editExercise(${x.id})">✏️ Редагувати</button><button class="danger" onclick="event.stopPropagation();deleteExercise(${x.id})">Видалити</button></div></div>`}).join('');
     return `<div class="exercise program-block ${isSuper?'superset-block':''}"><div class="program-block-info">${info}</div><div class="program-block-actions">${bi>0?`<button class="dark move-btn" data-day="${esc(day)}" onclick="event.stopPropagation();moveProgramBlock(this.dataset.day,${bi},'up')">↑</button>`:''}${bi<blocks.length-1?`<button class="dark move-btn" data-day="${esc(day)}" onclick="event.stopPropagation();moveProgramBlock(this.dataset.day,${bi},'down')">↓</button>`:''}${!isSuper?`<button class="dark" title="Додати вправу в суперсет" data-day="${esc(first.day_name)}" onclick="event.stopPropagation();addSupersetExercise(${first.id},this.dataset.day)">＋</button>`:''}</div></div>`;
   }).join('');
   return `<div class="card program-day-card">
     <div class="program-day-header-row">
       <button class="program-day-head" onclick="toggleProgramDay('${bodyId}',this)">
         <span class="program-day-heading"><h2>${esc(day)}</h2>${title?`<small>${esc(title)}</small>`:''}</span>
         <span class="program-day-arrow">⌄</span>
       </button>
       <button class="dark program-day-title-edit" title="Назва дня" data-day="${esc(day)}" onclick="event.stopPropagation();editProgramDayTitle(this.dataset.day)">✎</button>
     </div>
     <div id="${bodyId}" class="hidden" style="margin-top:18px">${rows}</div>
   </div>`;
 }).join(''):'<div class="card muted">Програма ще порожня.</div>';
 return form+list;
}

function toggleProgramDay(id,btn){
 let el=$('#'+id);if(!el)return;el.classList.toggle('hidden');
 let a=btn.querySelector('.program-day-arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';
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
   let programPane=$('#program');if(programPane)programPane.innerHTML=programHTML(d);
 }catch(e){alert(e.message||'Не вдалося змінити порядок вправ')}
}

function editExercise(pid){
 let d=window.currentClientData||{},x=(d.program||[]).find(v=>v.id===pid);
 if(!x)return alert('Вправу не знайдено');
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="editExerciseModal"><div class="card edit-exercise-card"><div class="edit-exercise-head"><h2>Редагувати вправу</h2><button class="dark edit-exercise-close" onclick="editExerciseModal.remove()">✕</button></div><div class="grid"><input id="editDay" value="${esc(x.day_name)}" placeholder="День"><input id="editName" list="exerciseLibraryNames" oninput="autofillTechnique(this.value,\'editTech\')" value="${esc(x.exercise)}" placeholder="Вправа"><input id="editTech" value="${esc(x.technique_url||'')}" placeholder="Посилання на техніку"><input id="editSets" type="number" min="1" value="${x.sets||3}" placeholder="Підходи"><input id="editReps" value="${esc(x.reps||'')}" placeholder="Повтори"><input id="editRirSet" value="${esc(x.rir_by_set||rirPlan(x).join(','))}" placeholder="RIR по підходах"><input id="editRest" value="${esc(x.rest_text||((+x.rest_seconds||0)?String((+x.rest_seconds/60)).replace(/\.0$/,""):""))}" placeholder="Відпочинок, хв (напр. 2-3)"><input id="editAlternatives" list="exerciseLibraryNames" value="${esc(alternativesInputValue(x))}" placeholder="Альтернативи через кому"></div><br><button onclick="saveExerciseEdit(${pid},${x.client_id})">Зберегти зміни</button></div></div>`);
}

async function saveExerciseEdit(pid,cid){
 let body={client_id:cid,day_name:editDay.value.trim(),exercise:editName.value.trim(),sets:+editSets.value||1,reps:editReps.value.trim(),target_rir:+((editRirSet.value||'2').split(',')[0].trim())||2,superset_group:'',superset_order:0,technique_url:editTech.value.trim(),rest_seconds:0,rest_text:editRest.value.trim(),rir_by_set:editRirSet.value.trim(),alternatives_json:JSON.stringify(parseAlternatives(editAlternatives.value,editName.value))};
 if(!body.day_name||!body.exercise)return alert('Вкажи день та назву вправи');
 if(body.technique_url&&!safeTechniqueUrl(body.technique_url))return alert('Посилання на техніку має починатися з https://');
 body.technique_url=safeTechniqueUrl(body.technique_url);
 try{
   await api('/program/'+pid,{method:'PUT',body:JSON.stringify(body)});
   editExerciseModal.remove();await openClient(cid);
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
  await openClient(selected,'program');
 }catch(e){restore();alert(e.message||'Не вдалося додати вправу')}
}


function addSupersetExercise(sourceId,dayName){
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="supersetModal"><div class="card"><div class="between"><div><h2>Додати суперсет</h2><div class="muted">${esc(dayName)}</div></div><button class="dark" onclick="supersetModal.remove()">✕</button></div><p class="muted">Нова вправа буде автоматично об'єднана з вибраною вправою в один суперсет.</p><div class="grid"><input id="ssex" placeholder="Друга вправа"><input id="sssets" type="number" value="3" placeholder="Підходи"><input id="ssreps" value="8-12" placeholder="Повтори"><input id="ssrir" type="number" value="2" placeholder="RIR"><input id="ssrirset" value="2,2,2" placeholder="RIR по підходах"><input id="ssrest" value="2" placeholder="Відпочинок, хв (напр. 2-3)"></div><br><button data-day="${esc(dayName)}" onclick="saveSupersetExercise(${sourceId},this.dataset.day)">+ Додати в суперсет</button></div></div>`)
}

async function saveSupersetExercise(sourceId,dayName){
 if(!ssex.value)return alert('Вкажи вправу');
 let group='SS'+sourceId;
 await api('/program/'+sourceId+'/superset',{method:'PATCH',body:JSON.stringify({superset_group:group})});
 await api('/program',{method:'POST',body:JSON.stringify({client_id:selected,day_name:dayName,exercise:ssex.value,sets:+sssets.value||3,reps:ssreps.value||'8-12',target_rir:+ssrir.value||2,superset_group:group,superset_order:1,technique_url:'',rest_seconds:0,rest_text:ssrest.value.trim(),rir_by_set:ssrirset.value.trim()})});
 supersetModal.remove();openClient(selected)
}


async function deleteExercise(id){if(confirm('Видалити вправу?')){await api('/program/'+id,{method:'DELETE'});openClient(selected)}}
