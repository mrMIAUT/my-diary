// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


async function showExerciseLibrary(){
 currentTrainerMainView='library';selected=null;window.currentClientData=null;await loadExerciseLibrary();
 let L=window.exerciseLibrary||{groups:[],exercises:[]};
 app.innerHTML=shell(`<h1>Бібліотека вправ</h1><div class="card"><h2>Групи м’язів</h2><div class="grid"><input id="newLibraryGroup" placeholder="Напр. Спина"><button onclick="addLibraryGroup()">+ Додати групу</button></div></div>${L.groups.map(g=>`<div class="card library-group"><button class="exercise-toggle" onclick="toggleExercise('libGroup${g.id}',this)"><span><strong>${esc(g.name)}</strong><span class="muted" style="display:block;margin-top:5px">${L.exercises.filter(x=>x.group_id===g.id).length} вправ</span></span><span class="arrow">⌄</span></button><div id="libGroup${g.id}" class="library-group-body hidden">${L.exercises.filter(x=>x.group_id===g.id).map(x=>`<div class="library-exercise"><div class="library-exercise-main"><strong>${esc(x.name)}</strong>${x.technique_url?`<div><a href="${esc(x.technique_url)}" target="_blank" rel="noopener">▶ Відео</a></div>`:''}</div><div class="library-exercise-actions"><button class="library-icon-btn library-edit-btn" aria-label="Редагувати вправу" title="Редагувати" onclick="openLibraryExerciseEdit(${x.id})">✎</button><button class="library-icon-btn library-delete-btn" aria-label="Видалити вправу" title="Видалити" onclick="deleteLibraryExercise(${x.id})">×</button></div></div>`).join('')||'<p class="muted">Вправ ще немає.</p>'}<div class="grid" style="margin-top:14px"><input id="libName${g.id}" placeholder="Назва вправи"><input id="libUrl${g.id}" placeholder="Посилання на відео"></div><button style="margin-top:10px" onclick="addLibraryExercise(${g.id})">+ Додати вправу</button><button class="danger" style="margin-top:10px;margin-left:8px" onclick="deleteLibraryGroup(${g.id})">Видалити групу</button></div></div>`).join('')}`);
}

async function addLibraryGroup(){let n=$('#newLibraryGroup').value.trim();if(!n)return;await api('/exercise-library/groups',{method:'POST',body:JSON.stringify({name:n})});showExerciseLibrary()}

async function deleteLibraryGroup(id){if(!confirm('Видалити групу та всі вправи в ній?'))return;await api('/exercise-library/groups/'+id,{method:'DELETE'});showExerciseLibrary()}

async function addLibraryExercise(gid){let n=$('#libName'+gid).value.trim(),u=$('#libUrl'+gid).value.trim();if(!n)return;await api('/exercise-library/exercises',{method:'POST',body:JSON.stringify({group_id:gid,name:n,technique_url:u})});showExerciseLibrary()}

function openLibraryExerciseEdit(id){
 let x=(window.exerciseLibrary?.exercises||[]).find(v=>+v.id===+id);if(!x)return;
 document.getElementById('libraryExerciseEditModal')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="libraryExerciseEditModal" onclick="if(event.target===this)this.remove()"><div class="card"><div class="edit-exercise-head"><h2>Редагувати вправу</h2><button class="dark edit-exercise-close" onclick="libraryExerciseEditModal.remove()">✕</button></div><div class="grid"><input id="libraryEditName" value="${esc(x.name)}" placeholder="Назва вправи"><input id="libraryEditUrl" value="${esc(x.technique_url||'')}" placeholder="Посилання на відео"></div><br><button onclick="saveLibraryExerciseEdit(${x.id},${x.group_id},event.currentTarget)">Зберегти зміни</button></div></div>`);
}

async function saveLibraryExerciseEdit(id,gid,btn){
 let n=$('#libraryEditName')?.value.trim()||'',u=$('#libraryEditUrl')?.value.trim()||'';if(!n)return alert('Вкажіть назву вправи');
 if(btn){btn.disabled=true;btn.textContent='Зберігаємо…'}
 try{await api('/exercise-library/exercises/'+id,{method:'PUT',body:JSON.stringify({group_id:gid,name:n,technique_url:u})});document.getElementById('libraryExerciseEditModal')?.remove();await showExerciseLibrary()}
 catch(e){if(btn){btn.disabled=false;btn.textContent='Зберегти зміни'}throw e}
}

async function deleteLibraryExercise(id){await api('/exercise-library/exercises/'+id,{method:'DELETE'});showExerciseLibrary()}

async function loadExerciseLibrary(){try{window.exerciseLibrary=await api('/exercise-library')}catch(e){window.exerciseLibrary={groups:[],exercises:[]}}}
