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
 currentTrainerMainView='more';selected=null;window.currentClientData=null;await loadExerciseLibrary();
 let L=window.exerciseLibrary||{groups:[],muscles:[],exercises:[]};
 let groupFilter=+(window.libraryGroupFilter||0),muscleFilter=+(window.libraryMuscleFilter||0),scopeFilter=String(window.libraryScopeFilter||'all'),q=String(window.librarySearch||'').trim().toLowerCase();
 let groups=groupFilter?L.groups.filter(g=>+g.id===groupFilter):L.groups;
 let exerciseVisible=x=>{
   if(scopeFilter!=='all'&&String(x.scope||'platform')!==scopeFilter)return false;
   if(muscleFilter&&!libraryExerciseMuscleIds(x).includes(muscleFilter))return false;
   if(q&&!String(x.name||'').toLowerCase().includes(q))return false;
   return true;
 };
 let visibleCount=L.exercises.filter(exerciseVisible).length;
 let filterCard=`<div class="trainer-library-tools">
   <label class="trainer-search trainer-library-search">${uiIcon('menu')}<input value="${esc(window.librarySearch||'')}" placeholder="Пошук вправи..." oninput="window.librarySearch=this.value;showExerciseLibrary()"></label>
   <div class="trainer-library-filters">
     <select id="libraryGroupFilter" onchange="setLibraryFilters()"><option value="0">Усі групи</option>${L.groups.map(g=>`<option value="${g.id}" ${groupFilter===+g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select>
     <select id="libraryMuscleFilter" onchange="setLibraryFilters()"><option value="0">Усі м’язи</option>${L.muscles.map(m=>`<option value="${m.id}" ${muscleFilter===+m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select>
     <select id="libraryScopeFilter" onchange="setLibraryFilters()"><option value="all" ${scopeFilter==='all'?'selected':''}>Усі бібліотеки</option><option value="platform" ${scopeFilter==='platform'?'selected':''}>ЄПЛАН</option><option value="trainer" ${scopeFilter==='trainer'?'selected':''}>Мої вправи</option></select>
   </div>
 </div>`;

 let adminCard=`<div class="card trainer-library-admin">
   <button class="exercise-toggle trainer-library-admin-toggle" onclick="toggleExercise('libraryAdminBody',this)">
     <span><strong>Керування бібліотекою</strong><small>Групи вправ і довідник м’язів</small></span>
     <span class="trainer-library-toggle-meta"><b>${L.groups.length+L.muscles.length}</b><i class="arrow">⌄</i></span>
   </button>
   <div id="libraryAdminBody" class="hidden trainer-library-admin-body">
     <div class="trainer-library-admin-section">
       <div class="trainer-library-admin-section-head"><div><strong>Групи вправ</strong><small>Наприклад: Ноги, Груди, Спина</small></div></div>
       <div class="trainer-library-admin-form"><input id="newLibraryGroup" placeholder="Назва групи"><button class="trainer-library-primary-btn" onclick="addLibraryGroup()">+ Додати групу</button></div>
     </div>
     <div class="trainer-library-admin-section">
       <div class="trainer-library-admin-section-head"><div><strong>Довідник м’язів</strong><small>Використовується для фільтрів та обсягу</small></div></div>
       <div class="trainer-library-admin-form"><input id="newLibraryMuscle" placeholder="Назва м’яза"><button class="trainer-library-primary-btn" onclick="addLibraryMuscle()">+ Додати м’яз</button></div>
       <div class="library-muscle-admin-list">${L.muscles.map(m=>`<div><span>${esc(m.name)}</span><button class="library-icon-btn library-delete-btn" title="Видалити м’яз" onclick="deleteLibraryMuscle(${m.id})">×</button></div>`).join('')||'<p class="muted">М’язів ще немає.</p>'}</div>
     </div>
   </div>
 </div>`;

 let groupCards=groups.map(g=>{
   let all=L.exercises.filter(x=>+x.group_id===+g.id),xs=all.filter(exerciseVisible);
   if((q||muscleFilter)&&!xs.length)return '';
   return `<div class="card trainer-library-group">
     <button class="exercise-toggle trainer-library-group-toggle redesign-library-group-head" onclick="toggleExercise('libGroup${g.id}',this)">
       <strong>${esc(g.name)}</strong>
       <span class="redesign-library-group-meta trainer-library-toggle-meta"><b>${xs.length}</b><i class="arrow">⌄</i></span>
     </button>
     <div id="libGroup${g.id}" class="library-group-body hidden">
       <div class="trainer-library-exercise-list">
         ${xs.map(x=>`<div class="library-exercise trainer-library-exercise redesign-library-row">
           <div class="library-exercise-main"><div class="library-exercise-name-line"><strong>${esc(x.name)}</strong><span class="library-scope-badge ${x.scope==='trainer'?'mine':'platform'}">${x.scope==='trainer'?'Моя вправа':'ЄПЛАН'}</span></div>${libraryMuscleBadges(x)}${x.technique_url?`<div class="trainer-library-video">${techniqueLinkHTML(x.technique_url,'Відео',false,'redesign-library-video')}</div>`:''}</div>
           <div class="library-exercise-actions">${x.editable?'<button class="library-icon-btn library-edit-btn" aria-label="Редагувати вправу" title="Редагувати" onclick="openLibraryExerciseEdit('+x.id+')">✎</button><button class="library-icon-btn library-delete-btn" aria-label="Видалити вправу" title="Видалити" onclick="deleteLibraryExercise('+x.id+')">×</button>':''}</div>
         </div>`).join('')||'<p class="muted trainer-library-empty-row">Вправ ще немає.</p>'}
       </div>
       <div class="trainer-library-group-footer">
         <button class="trainer-library-add-toggle" type="button" onclick="toggleExercise('libAdd${g.id}',this)"><span>+ Додати вправу</span><span class="arrow">⌄</span></button>
         <div id="libAdd${g.id}" class="library-add-exercise trainer-library-add hidden">
           <div class="trainer-library-add-head"><strong>Нова вправа</strong><small>Буде збережена у «Мої вправи» і доступна тільки тобі та призначеним програмам.</small></div>
           <div class="trainer-library-input-stack"><input id="libName${g.id}" placeholder="Назва вправи"><input id="libUrl${g.id}" placeholder="Посилання на відео"></div>
           ${libraryMuscleChecks('add'+g.id)}
           <div class="trainer-library-add-actions"><button class="trainer-library-primary-btn" onclick="addLibraryExercise(${g.id})">+ Додати вправу</button>${session?.user_id===1?'<button class="trainer-library-danger-btn" onclick="deleteLibraryGroup('+g.id+')">Видалити групу</button>':''}</div>
         </div>
       </div>
     </div>
   </div>`;
 }).join('');

 app.innerHTML=shell(`<div class="trainer-library-page">
   <div class="trainer-client-navline"><button onclick="showTrainerMore()" aria-label="Назад">‹</button></div>
   <div class="trainer-page-title"><div><h1>Бібліотека вправ</h1><p class="trainer-page-sub">Вправи, м’язи та техніка виконання</p></div></div>
   <div class="trainer-library-summary">
     <div><strong>${L.exercises.filter(x=>x.scope==='platform').length}</strong><small>ЄПЛАН</small></div>
     <div><strong>${L.exercises.filter(x=>x.scope==='trainer').length}</strong><small>моїх вправ</small></div>
     <div><strong>${L.groups.length}</strong><small>груп</small></div>
   </div>
   ${filterCard}
   <div class="trainer-library-result-line"><span>Знайдено</span><strong>${visibleCount}</strong></div>
   ${groupCards||'<div class="trainer-empty card">За вибраними фільтрами вправ не знайдено.</div>'}
   ${session?.user_id===1?adminCard:''}
 </div>`);
 bindLibraryMuscleRoleGuards();
}

function setLibraryFilters(){window.libraryGroupFilter=+($('#libraryGroupFilter')?.value||0);window.libraryMuscleFilter=+($('#libraryMuscleFilter')?.value||0);window.libraryScopeFilter=$('#libraryScopeFilter')?.value||'all';showExerciseLibrary()}
async function addLibraryGroup(){let n=$('#newLibraryGroup').value.trim();if(!n)return;await api('/exercise-library/groups',{method:'POST',body:JSON.stringify({name:n})});showExerciseLibrary()}
async function deleteLibraryGroup(id){if(!confirm('Видалити групу та всі вправи в ній?'))return;await api('/exercise-library/groups/'+id,{method:'DELETE'});if(+window.libraryGroupFilter===+id)window.libraryGroupFilter=0;showExerciseLibrary()}
async function addLibraryMuscle(){let n=$('#newLibraryMuscle')?.value.trim();if(!n)return;await api('/exercise-library/muscles',{method:'POST',body:JSON.stringify({name:n})});showExerciseLibrary()}
async function deleteLibraryMuscle(id){if(!confirm('Видалити цей м’яз? Він буде прибраний з усіх вправ, але самі вправи залишаться.'))return;await api('/exercise-library/muscles/'+id,{method:'DELETE'});if(+window.libraryMuscleFilter===+id)window.libraryMuscleFilter=0;showExerciseLibrary()}

async function addLibraryExercise(gid){
 let n=$('#libName'+gid).value.trim(),u=$('#libUrl'+gid).value.trim();if(!n)return;
 if(u&&!safeTechniqueUrl(u))return alert('Посилання на відео має починатися з https://');
 u=safeTechniqueUrl(u);
 let prefix='add'+gid,primary=selectedLibraryMuscles(prefix,'primary'),secondary=selectedLibraryMuscles(prefix,'secondary');
 await api('/exercise-library/exercises',{method:'POST',body:JSON.stringify({group_id:gid,name:n,technique_url:u,primary_muscle_ids:primary,secondary_muscle_ids:secondary})});showExerciseLibrary()
}

function openLibraryExerciseEdit(id){
 let L=window.exerciseLibrary||{},x=(L.exercises||[]).find(v=>+v.id===+id);if(!x)return;
 if(!x.editable)return alert('Це загальна вправа ЄПЛАН. Її не можна змінювати у твоїй особистій бібліотеці.');
 document.getElementById('libraryExerciseEditModal')?.remove();let prefix='edit'+id;
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="libraryExerciseEditModal" onclick="if(event.target===this)this.remove()"><div class="card library-edit-card"><div class="edit-exercise-head"><h2>Редагувати вправу</h2><button class="dark edit-exercise-close" onclick="libraryExerciseEditModal.remove()">✕</button></div><div class="grid"><input id="libraryEditName" value="${esc(x.name)}" placeholder="Назва вправи"><input id="libraryEditUrl" value="${esc(x.technique_url||'')}" placeholder="Посилання на відео"><select id="libraryEditGroup">${(L.groups||[]).map(g=>`<option value="${g.id}" ${+g.id===+x.group_id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>${libraryMuscleChecks(prefix,x.primary_muscle_ids||[],x.secondary_muscle_ids||[])}<br><button onclick="saveLibraryExerciseEdit(${x.id},event.currentTarget)">Зберегти зміни</button></div></div>`);bindLibraryMuscleRoleGuards()
}

async function saveLibraryExerciseEdit(id,btn){
 let n=$('#libraryEditName')?.value.trim()||'',u=$('#libraryEditUrl')?.value.trim()||'',gid=+($('#libraryEditGroup')?.value||0);if(!n)return alert('Вкажіть назву вправи');
 if(u&&!safeTechniqueUrl(u))return alert('Посилання на відео має починатися з https://');
 u=safeTechniqueUrl(u);
 let prefix='edit'+id,primary=selectedLibraryMuscles(prefix,'primary'),secondary=selectedLibraryMuscles(prefix,'secondary');
 if(btn){btn.disabled=true;btn.textContent='Зберігаємо…'}
 try{await api('/exercise-library/exercises/'+id,{method:'PUT',body:JSON.stringify({group_id:gid,name:n,technique_url:u,primary_muscle_ids:primary,secondary_muscle_ids:secondary})});document.getElementById('libraryExerciseEditModal')?.remove();await showExerciseLibrary()}
 catch(e){if(btn){btn.disabled=false;btn.textContent='Зберегти зміни'}throw e}
}

async function deleteLibraryExercise(id){let x=(window.exerciseLibrary?.exercises||[]).find(v=>+v.id===+id);if(!x?.editable)return;if(!confirm('Видалити цю вправу з твоєї бібліотеки?'))return;await api('/exercise-library/exercises/'+id,{method:'DELETE'});showExerciseLibrary()}
async function loadExerciseLibrary(){try{window.exerciseLibrary=await api('/exercise-library')}catch(e){window.exerciseLibrary={groups:[],muscles:[],exercises:[]}}}
