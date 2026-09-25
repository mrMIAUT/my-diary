// V92 — exercise library groups + many-to-many target muscles.
// Shared state is initialized by app.js.

function libraryMuscleName(id){return (window.exerciseLibrary?.muscles||[]).find(x=>+x.id===+id)?.name||''}
function libraryExerciseMuscleIds(x){return [...(x.primary_muscle_ids||[]),...(x.secondary_muscle_ids||[])].map(Number)}
function libraryMuscleBadges(x){
 let primary=(x.primary_muscle_ids||[]).map(libraryMuscleName).filter(Boolean),secondary=(x.secondary_muscle_ids||[]).map(libraryMuscleName).filter(Boolean);
 if(!primary.length&&!secondary.length)return '<div class="library-muscles-empty">М’язи ще не призначені</div>';
 return `<div class="library-muscle-lines">${primary.length?`<div><span>Основні:</span> ${primary.map(n=>`<b>${esc(n)}</b>`).join(' · ')}</div>`:''}${secondary.length?`<div><span>Додаткові:</span> ${secondary.map(n=>`<b>${esc(n)}</b>`).join(' · ')}</div>`:''}</div>`
}
function libraryMuscleChecks(prefix,selectedPrimary=[],selectedSecondary=[]){
 let muscles=window.exerciseLibrary?.muscles||[],p=new Set(selectedPrimary.map(Number)),s=new Set(selectedSecondary.map(Number));
 if(!muscles.length)return '<p class="muted library-no-muscles">Спочатку додайте м’язи до довідника вище.</p>';
 return `<div class="library-muscle-picker"><div><strong>Основні м’язи</strong><div class="library-check-grid">${muscles.map(m=>`<label><input type="checkbox" data-muscle-role="primary" data-prefix="${prefix}" value="${m.id}" ${p.has(+m.id)?'checked':''}> <span>${esc(m.name)}</span></label>`).join('')}</div></div><div><strong>Додаткові м’язи</strong><div class="library-check-grid">${muscles.map(m=>`<label><input type="checkbox" data-muscle-role="secondary" data-prefix="${prefix}" value="${m.id}" ${s.has(+m.id)?'checked':''}> <span>${esc(m.name)}</span></label>`).join('')}</div></div></div>`
}
function selectedLibraryMuscles(prefix,role){return [...document.querySelectorAll(`input[data-prefix="${prefix}"][data-muscle-role="${role}"]:checked`)].map(x=>+x.value)}
function syncLibraryMuscleRoles(prefix,changed){
 if(!changed?.checked)return;let role=changed.dataset.muscleRole,other=role==='primary'?'secondary':'primary';
 let twin=document.querySelector(`input[data-prefix="${prefix}"][data-muscle-role="${other}"][value="${changed.value}"]`);if(twin)twin.checked=false
}
function bindLibraryMuscleRoleGuards(){document.querySelectorAll('.library-muscle-picker input[type="checkbox"]').forEach(x=>x.onchange=()=>syncLibraryMuscleRoles(x.dataset.prefix,x))}

async function showExerciseLibrary(){
 currentTrainerMainView='library';selected=null;window.currentClientData=null;await loadExerciseLibrary();
 let L=window.exerciseLibrary||{groups:[],muscles:[],exercises:[]},groupFilter=+(window.libraryGroupFilter||0),muscleFilter=+(window.libraryMuscleFilter||0);
 let groups=groupFilter?L.groups.filter(g=>+g.id===groupFilter):L.groups;
 let exerciseVisible=x=>!muscleFilter||libraryExerciseMuscleIds(x).includes(muscleFilter);
 let filterCard=`<div class="card library-filter-card"><h2>Фільтр вправ</h2><div class="grid"><select id="libraryGroupFilter" onchange="setLibraryFilters()"><option value="0">Усі групи</option>${L.groups.map(g=>`<option value="${g.id}" ${groupFilter===+g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select><select id="libraryMuscleFilter" onchange="setLibraryFilters()"><option value="0">Усі м’язи</option>${L.muscles.map(m=>`<option value="${m.id}" ${muscleFilter===+m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div></div>`;
 let muscleCard=`<div class="card"><button class="exercise-toggle" onclick="toggleExercise('libraryMusclesBody',this)"><span><strong>Довідник м’язів</strong><span class="muted" style="display:block;margin-top:5px">${L.muscles.length} м’язів · використовуються як основні або додаткові</span></span><span class="arrow">⌄</span></button><div id="libraryMusclesBody" class="hidden library-muscles-admin"><div class="grid"><input id="newLibraryMuscle" placeholder="Напр. Квадрицепс"><button onclick="addLibraryMuscle()">+ Додати м’яз</button></div><div class="library-muscle-admin-list">${L.muscles.map(m=>`<div><span>${esc(m.name)}</span><button class="library-icon-btn library-delete-btn" title="Видалити м’яз" onclick="deleteLibraryMuscle(${m.id})">×</button></div>`).join('')||'<p class="muted">М’язів ще немає.</p>'}</div></div></div>`;
 let groupCards=groups.map(g=>{let all=L.exercises.filter(x=>+x.group_id===+g.id),xs=all.filter(exerciseVisible);return `<div class="card library-group"><button class="exercise-toggle" onclick="toggleExercise('libGroup${g.id}',this)"><span><strong>${esc(g.name)}</strong><span class="muted" style="display:block;margin-top:5px">${muscleFilter?`${xs.length} з ${all.length}`:`${all.length}`} вправ</span></span><span class="arrow">⌄</span></button><div id="libGroup${g.id}" class="library-group-body hidden">${xs.map(x=>`<div class="library-exercise"><div class="library-exercise-main"><strong>${esc(x.name)}</strong>${libraryMuscleBadges(x)}${x.technique_url?`<div><a href="${esc(x.technique_url)}" target="_blank" rel="noopener">▶ Відео</a></div>`:''}</div><div class="library-exercise-actions"><button class="library-icon-btn library-edit-btn" aria-label="Редагувати вправу" title="Редагувати" onclick="openLibraryExerciseEdit(${x.id})">✎</button><button class="library-icon-btn library-delete-btn" aria-label="Видалити вправу" title="Видалити" onclick="deleteLibraryExercise(${x.id})">×</button></div></div>`).join('')||(muscleFilter?'<p class="muted">У цій групі немає вправ для вибраного м’яза.</p>':'<p class="muted">Вправ ще немає.</p>')}<div class="library-add-exercise"><div class="grid"><input id="libName${g.id}" placeholder="Назва вправи"><input id="libUrl${g.id}" placeholder="Посилання на відео"></div>${libraryMuscleChecks('add'+g.id)}<button style="margin-top:10px" onclick="addLibraryExercise(${g.id})">+ Додати вправу</button><button class="danger" style="margin-top:10px;margin-left:8px" onclick="deleteLibraryGroup(${g.id})">Видалити групу</button></div></div></div>`}).join('');
 app.innerHTML=shell(`<h1>Бібліотека вправ</h1><div class="card"><h2>Групи вправ</h2><p class="muted">Група — верхній рівень каталогу, наприклад Ноги, Спина або Груди.</p><div class="grid"><input id="newLibraryGroup" placeholder="Напр. Ноги"><button onclick="addLibraryGroup()">+ Додати групу</button></div></div>${muscleCard}${filterCard}${groupCards||'<div class="card"><p class="muted">Додайте першу групу вправ.</p></div>'}`);
 bindLibraryMuscleRoleGuards();
}

function setLibraryFilters(){window.libraryGroupFilter=+($('#libraryGroupFilter')?.value||0);window.libraryMuscleFilter=+($('#libraryMuscleFilter')?.value||0);showExerciseLibrary()}
async function addLibraryGroup(){let n=$('#newLibraryGroup').value.trim();if(!n)return;await api('/exercise-library/groups',{method:'POST',body:JSON.stringify({name:n})});showExerciseLibrary()}
async function deleteLibraryGroup(id){if(!confirm('Видалити групу та всі вправи в ній?'))return;await api('/exercise-library/groups/'+id,{method:'DELETE'});if(+window.libraryGroupFilter===+id)window.libraryGroupFilter=0;showExerciseLibrary()}
async function addLibraryMuscle(){let n=$('#newLibraryMuscle')?.value.trim();if(!n)return;await api('/exercise-library/muscles',{method:'POST',body:JSON.stringify({name:n})});showExerciseLibrary()}
async function deleteLibraryMuscle(id){if(!confirm('Видалити цей м’яз? Він буде прибраний з усіх вправ, але самі вправи залишаться.'))return;await api('/exercise-library/muscles/'+id,{method:'DELETE'});if(+window.libraryMuscleFilter===+id)window.libraryMuscleFilter=0;showExerciseLibrary()}

async function addLibraryExercise(gid){
 let n=$('#libName'+gid).value.trim(),u=$('#libUrl'+gid).value.trim();if(!n)return;
 let prefix='add'+gid,primary=selectedLibraryMuscles(prefix,'primary'),secondary=selectedLibraryMuscles(prefix,'secondary');
 await api('/exercise-library/exercises',{method:'POST',body:JSON.stringify({group_id:gid,name:n,technique_url:u,primary_muscle_ids:primary,secondary_muscle_ids:secondary})});showExerciseLibrary()
}

function openLibraryExerciseEdit(id){
 let L=window.exerciseLibrary||{},x=(L.exercises||[]).find(v=>+v.id===+id);if(!x)return;
 document.getElementById('libraryExerciseEditModal')?.remove();let prefix='edit'+id;
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="libraryExerciseEditModal" onclick="if(event.target===this)this.remove()"><div class="card library-edit-card"><div class="edit-exercise-head"><h2>Редагувати вправу</h2><button class="dark edit-exercise-close" onclick="libraryExerciseEditModal.remove()">✕</button></div><div class="grid"><input id="libraryEditName" value="${esc(x.name)}" placeholder="Назва вправи"><input id="libraryEditUrl" value="${esc(x.technique_url||'')}" placeholder="Посилання на відео"><select id="libraryEditGroup">${(L.groups||[]).map(g=>`<option value="${g.id}" ${+g.id===+x.group_id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>${libraryMuscleChecks(prefix,x.primary_muscle_ids||[],x.secondary_muscle_ids||[])}<br><button onclick="saveLibraryExerciseEdit(${x.id},event.currentTarget)">Зберегти зміни</button></div></div>`);bindLibraryMuscleRoleGuards()
}

async function saveLibraryExerciseEdit(id,btn){
 let n=$('#libraryEditName')?.value.trim()||'',u=$('#libraryEditUrl')?.value.trim()||'',gid=+($('#libraryEditGroup')?.value||0);if(!n)return alert('Вкажіть назву вправи');
 let prefix='edit'+id,primary=selectedLibraryMuscles(prefix,'primary'),secondary=selectedLibraryMuscles(prefix,'secondary');
 if(btn){btn.disabled=true;btn.textContent='Зберігаємо…'}
 try{await api('/exercise-library/exercises/'+id,{method:'PUT',body:JSON.stringify({group_id:gid,name:n,technique_url:u,primary_muscle_ids:primary,secondary_muscle_ids:secondary})});document.getElementById('libraryExerciseEditModal')?.remove();await showExerciseLibrary()}
 catch(e){if(btn){btn.disabled=false;btn.textContent='Зберегти зміни'}throw e}
}

async function deleteLibraryExercise(id){await api('/exercise-library/exercises/'+id,{method:'DELETE'});showExerciseLibrary()}
async function loadExerciseLibrary(){try{window.exerciseLibrary=await api('/exercise-library')}catch(e){window.exerciseLibrary={groups:[],muscles:[],exercises:[]}}}
