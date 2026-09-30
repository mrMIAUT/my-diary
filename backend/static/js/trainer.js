// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

async function goToTrainerHome(){
 history.pushState({eplanPage:'clients'},'',location.pathname+location.search);
 currentTrainerMainView='clients';selected=null;window.currentClientData=null;
 await trainerHome();
 let _btn=(typeof event!=='undefined'&&event.currentTarget)?event.currentTarget:null;
 let _input=_btn?(_btn.parentElement?.querySelector('input[data-password-field="1"],input[type="password"],input[type="text"]')):null;
 if(_btn&&_input)syncPasswordEye(_btn,_input);
}

async function trainerHome(){
 currentTrainerMainView='home';selected=null;window.currentClientData=null;
 let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
 let active=cs.filter(c=>c.status==='Активний'&&!c.access?.expired);
 let ending=cs.filter(c=>c.access?.days_left!==null&&c.access.days_left>=0&&c.access.days_left<=7&&!c.access?.expired);
 let attention=cs.filter(c=>(+c.needs_review_count||0)>0);
 let initials=c=>{let p=String(c.name||'').trim().split(/\s+/).filter(Boolean);return (p.slice(0,2).map(x=>x[0]).join('')||'К').toUpperCase()};
 let avatars=cs.slice(0,4).map(c=>'<span class="trainer-client-avatar">'+esc(initials(c))+'</span>').join('');
 let recent=cs.slice(0,5).map(c=>{let r=+c.needs_review_count||0;let status=r?'Потрібно перевірити тренування':c.live_status==='Тренується'?'Тренується зараз':'Остання активність без нових подій';return '<button class="trainer-activity-row" onclick="navigateToClient('+c.id+')"><span class="trainer-client-avatar">'+esc(initials(c))+'</span><span><strong>'+esc(c.name)+'</strong><small>'+esc(status)+'</small></span><span class="trainer-row-time">'+(r?'Зараз':'')+'</span><span class="more-chevron">›</span></button>'}).join('');
 app.innerHTML=shell(`<div class="trainer-home-page">
   <button class="trainer-hero-card" onclick="showTrainerClientsView()">
     <div class="trainer-hero-head"><span class="hero-users">${uiIcon('users')}</span><strong>Ваші клієнти</strong><span class="more-chevron">›</span></div>
     <div class="trainer-hero-count">${active.length} <small>активних клієнтів</small></div>
     <div class="trainer-hero-sub">${active.length} з ${cs.length} загалом</div>
     <div class="trainer-avatar-stack">${avatars}${cs.length>4?'<span class="trainer-client-avatar more">+'+(cs.length-4)+'</span>':''}</div>
   </button>

   <div class="trainer-home-stats reference-grid">
     <button onclick="window.trainerHomeFilter='review';showTrainerClientsView()"><span class="trainer-stat-icon orange">${uiIcon('users')}</span><strong>${attention.length}</strong><small>Потребують уваги</small><em>Переглянути ›</em></button>
     <button onclick="window.trainerHomeFilter='active';showTrainerClientsView()"><span class="trainer-stat-icon green">✓</span><strong>${active.length}</strong><small>Активні клієнти</small><em>Переглянути ›</em></button>
     <button onclick="window.trainerHomeFilter='ending';showTrainerClientsView()"><span class="trainer-stat-icon blue">${uiIcon('calendar')}</span><strong>${ending.length}</strong><small>Доступ завершується</small><em>Переглянути ›</em></button>
     <button onclick="newClient()"><span class="trainer-stat-icon blue">${uiIcon('plus')}</span><strong>＋</strong><small>Новий клієнт</small><em>Додати ›</em></button>
   </div>

   <div class="trainer-home-section-head"><h2>Остання активність</h2><button onclick="showTrainerClientsView()">Усі ›</button></div>
   <div class="trainer-activity-card">${recent||'<div class="trainer-empty">Клієнтів ще немає.</div>'}</div>
 </div>`);
 refreshTrainerGlobalBadge()
}

async function showTrainerClientsView(){
 currentTrainerMainView='clients';selected=null;window.currentClientData=null;
 let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
 let filter=window.trainerHomeFilter||'all',q=String(window.trainerClientSearch||'').trim().toLowerCase();
 let base=filter==='review'?cs.filter(c=>(+c.needs_review_count||0)>0):filter==='ending'?cs.filter(c=>c.access?.days_left!==null&&c.access.days_left>=0&&c.access.days_left<=7&&!c.access?.expired):filter==='active'?cs.filter(c=>c.status==='Активний'&&!c.access?.expired):cs;
 let shown=q?base.filter(c=>String(c.name||'').toLowerCase().includes(q)||String(c.goal||'').toLowerCase().includes(q)):base;
 let initials=c=>{let p=String(c.name||'').trim().split(/\s+/).filter(Boolean);return (p.slice(0,2).map(x=>x[0]).join('')||'К').toUpperCase()};
 let chip=(key,label,n)=>'<button class="'+(filter===key?'active':'')+'" onclick="window.trainerHomeFilter=\''+key+'\';showTrainerClientsView()">'+label+' <span>'+n+'</span></button>';
 app.innerHTML=shell(`<div class="trainer-clients-page">
   <div class="trainer-page-title"><h1>Клієнти</h1><button class="trainer-round-add" onclick="newClient()">＋</button></div>
   <label class="trainer-search">${uiIcon('menu')}<input value="${esc(window.trainerClientSearch||'')}" placeholder="Пошук клієнтів..." oninput="window.trainerClientSearch=this.value;showTrainerClientsView()"></label>
   <div class="trainer-filter-chips">
     ${chip('all','Усі',cs.length)}
     ${chip('active','Активні',cs.filter(c=>c.status==='Активний'&&!c.access?.expired).length)}
     ${chip('review','Потребують уваги',cs.filter(c=>(+c.needs_review_count||0)>0).length)}
   </div>
   <div class="trainer-client-list">${shown.map(c=>{let r=+c.needs_review_count||0;let goal=c.goal||'Без цілі';let status=r?'Потребує уваги':(c.status==='Активний'&&!c.access?.expired?'Активна':'На паузі');return '<button class="trainer-client-row" onclick="navigateToClient('+c.id+')"><span class="trainer-client-avatar">'+esc(initials(c))+'</span><span class="trainer-client-copy"><strong>'+esc(c.name)+'</strong><small>'+esc(goal)+'</small><span class="trainer-status-pill '+(r?'attention':'ok')+'">'+esc(status)+'</span></span><span class="more-chevron">›</span></button>'}).join('')||'<div class="trainer-empty">У цій категорії клієнтів немає.</div>'}</div>
 </div>`);
 refreshTrainerGlobalBadge()
}

function showTrainerPrograms(){
 currentTrainerMainView='programs';selected=null;window.currentClientData=null;
 app.innerHTML=shell(`<div class="trainer-programs-page">
   <div class="trainer-page-title"><h1>Програми</h1><button class="trainer-round-add" onclick="alert('Конструктор шаблонів програм додамо наступним етапом.')">＋</button></div>
   <div class="trainer-segmented"><button class="active">Шаблони</button><button>Призначені</button></div>
   <div class="trainer-program-empty">
     <span class="trainer-program-empty-icon">${uiIcon('dumbbell')}</span>
     <h2>Шаблони програм</h2>
     <p>Тут буде бібліотека готових програм, які можна призначати клієнтам.</p>
     <button onclick="alert('Конструктор шаблонів програм додамо наступним етапом.')">＋ Створити шаблон</button>
   </div>
 </div>`);
}

function showTrainerMore(){
 currentTrainerMainView='more';selected=null;window.currentClientData=null;
 app.innerHTML=shell(`<div class="trainer-more-page">
   <div class="trainer-page-title"><h1>Більше</h1></div>
   <div class="trainer-more-list">
    <button onclick="showTrainerNotifications()">${uiIcon('bell')}<span><strong>Сповіщення</strong><small>Нові події клієнтів</small></span><b>›</b></button>
    <button onclick="showExerciseLibrary()">${uiIcon('dumbbell')}<span><strong>Бібліотека вправ</strong><small>Вправи, м’язи та техніка</small></span><b>›</b></button>
    <button onclick="logout()">${uiIcon('logout')}<span><strong>Вийти з акаунта</strong><small>Завершити сеанс тренера</small></span><b>›</b></button>
   </div>
 </div>`);
}


async function openPendingWorkoutForClient(cid){
 await openClient(cid,'calendar');
 let d=window.currentClientData||{};
 let pending=(d.workout_sessions||[])
   .filter(s=>s.status==='finished'&&!s.trainer_reviewed)
   .sort((a,b)=>(+b.id||0)-(+a.id||0))[0];
 if(!pending)return;
 let day=sessionDay(pending);
 if(day)showCalendarDay(day,null,true,pending.id);
}

async function quickExtendFromCard(cid,months){
 let clients=await loadClients(),c=clients.find(x=>x.id===cid);if(!c)return;
 let base=c.access?.access_until&&c.access.access_until>=isoToday()?new Date(c.access.access_until+'T12:00:00'):new Date();
 base.setMonth(base.getMonth()+months);
 let until=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
 await api('/clients/'+cid+'/access',{method:'PATCH',body:JSON.stringify({plan_code:c.access?.plan_code||'coaching',access_until:until})});
 trainerHome();
}


function newClient(){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="card"><div class="between"><h2>Новий клієнт</h2><button class="dark" onclick="modal.remove()">✕</button></div><p class="muted">Вкажи справжню пошту клієнта. Після створення він отримає посилання та сам встановить пароль.</p><div class="grid"><input id="n" placeholder="Ім'я"><input id="e" type="email" autocomplete="email" placeholder="Email клієнта"><input id="g" placeholder="Ціль"><input id="k" type="number" placeholder="Ккал"><input id="pr" type="number" placeholder="Білки"><input id="f" type="number" placeholder="Жири"><input id="ca" type="number" placeholder="Вуглеводи"></div><p id="me" class="muted"></p><button onclick="createClient()">Створити та надіслати запрошення</button></div></div>`)}

async function createClient(){
 let mail=(e.value||'').trim();
 if(!n.value.trim())return me.textContent="Вкажи ім'я клієнта";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))return me.textContent='Вкажи коректний email';
 try{
   let r=await api('/clients',{method:'POST',body:JSON.stringify({name:n.value,email:mail,password:'',goal:g.value,weight:0,kcal:+k.value||0,protein:+pr.value||0,fat:+f.value||0,carbs:+ca.value||0})});
   modal.remove();
   alert(r.invite_sent?'Клієнта створено. Запрошення надіслано на email.':'Клієнта створено, але лист не надіслано. Перевір налаштування пошти на Render.');
   trainerHome()
 }catch(x){me.textContent=x.message}
}

async function navigateToClient(id){
 // Only real screen changes belong to browser history. Inner tabs do not.
 history.pushState({eplanPage:'client',eplanClient:id},'',location.pathname+location.search+'#client-'+id);
 await openClient(id,'profile');
}


function isoAddMonths(n){let d=new Date(),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);let last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return d.toISOString().slice(0,10)}

function trainerAccessHTML(c){
 let a=clientAccess(c),cls=(a.expired||a.manually_frozen)?'off':(a.days_left!==null&&a.days_left<=7?'warn':'ok'),days=a.days_left===null?'Безстроково':a.days_left<0?'Закінчився':`${a.days_left} дн.`;
 let summary=`<div class="access-saved" id="accessSavedView"><div><h2>Доступ до застосунку</h2><div class="access-saved-main"><span class="access-pill ${cls}">${a.expired?'Закінчився':a.manually_frozen?'Заморожено':'Активний'}</span><span class="access-pill">${esc(a.plan_name)}</span><span class="access-pill">${days}</span>${a.access_until?`<span class="access-pill">до ${esc(a.access_until)}</span>`:''}</div></div><button class="dark" onclick="toggleAccessEdit(true)">Редагувати</button></div>`;
 let editor=`<div id="accessEditBox" class="access-edit-box hidden"><div class="access-grid"><div><label class="muted">Тариф</label><select id="accessPlan"><option value="coaching" ${a.plan_code==='coaching'?'selected':''}>Онлайн-ведення</option><option value="workout_nutrition" ${a.plan_code==='workout_nutrition'?'selected':''}>План тренувань + План харчування</option><option value="workout_plan" ${a.plan_code==='workout_plan'?'selected':''}>План тренувань</option><option value="self" ${a.plan_code==='self'?'selected':''}>Самостійно</option><option value="free" ${a.plan_code==='free'?'selected':''}>Free</option></select></div><div><label class="muted">Доступ до</label><input id="accessUntil" type="date" value="${esc(a.access_until||'')}"></div></div><div class="access-actions"><button class="dark" onclick="quickAccess(${c.id},1)">+ 1 місяць</button><button class="dark" onclick="quickAccess(${c.id},3)">+ 3 місяці</button><button class="dark" onclick="quickAccess(${c.id},6)">+ 6 місяців</button></div><div class="access-actions"><button id="accessSaveBtn" onclick="saveClientAccess(${c.id},this)">Зберегти доступ</button><button class="dark" onclick="toggleAccessEdit(false)">Скасувати</button></div><p class="muted" style="margin:12px 0 0">Після завершення строку клієнт автоматично переходить у режим перегляду. Дані не видаляються.</p></div>`;
 return `<div class="card access-card">${summary}${editor}</div>`;
}

function toggleAccessEdit(show){let box=document.getElementById('accessEditBox'),view=document.getElementById('accessSavedView');if(box)box.classList.toggle('hidden',!show);if(view){let b=view.querySelector('button');if(b)b.style.display=show?'none':''}}

function quickAccess(cid,m){accessUntil.value=isoAddMonths(m);accessUntil.dispatchEvent(new Event('change',{bubbles:true}))}

async function saveClientAccess(cid,btn){
 if(btn){btn.disabled=true;btn.textContent='Зберігаю...'}
 try{
   await api('/clients/'+cid+'/access',{method:'PATCH',body:JSON.stringify({plan_code:accessPlan.value,access_until:accessUntil.value})});
   if(btn){btn.disabled=false;btn.classList.add('access-save-success');btn.textContent='✓ Доступ збережено'}
   setTimeout(()=>openClient(cid,currentTrainerTab),850)
 }catch(e){if(btn){btn.disabled=false;btn.classList.remove('access-save-success');btn.textContent='Зберегти доступ'}throw e}
}


async function openClient(id,activeTab=null){
 selected=id;let [d]=await Promise.all([loadClientData(id),loadExerciseLibrary()]),c=d.client;window.currentClientData=d;
 app.innerHTML=shell(`<div class="trainer-toolbar"><button class="dark" onclick="goToTrainerHome()">← До клієнтів</button></div><div class="card"><div class="trainer-client-head"><div class="trainer-client-main"><h1>${esc(c.name)}</h1><div class="muted trainer-client-email">${esc(c.email)} · ${esc(c.goal||'Без цілі')}</div></div><div class="trainer-client-side"><div class="trainer-client-actions">${c.status==='Заморожений'?`<button onclick="setClientStatus(${c.id},'Активний')">Розморозити</button>`:`<button class="freeze-btn" onclick="setClientStatus(${c.id},'Заморожений')">Заморозити</button>`}<button class="danger" onclick="deleteClientAccount(${c.id})">Видалити</button></div></div></div></div><div id="profile" class="tab">${trainerAccessHTML(c)}${trainerProfileHTML(c)}</div><div id="program" class="tab hidden">${programHTML(d)}</div><div id="results" class="tab hidden">${resultsHTML(d)}</div><div id="nutrition" class="tab hidden">${nutritionHTML(d)}</div><div id="comments" class="tab hidden"></div><div id="cardio" class="tab hidden">${cardioHTML(d,c.id,true)}</div><div id="calendar" class="tab hidden"><div class="card"><button class="exercise-toggle open" onclick="toggleCalendar('trainerCalendarBody',this)"><span><strong>Календар історії</strong><span class="muted" style="display:block;margin-top:5px">Обери дату тренування</span></span><span class="arrow">⌃</span></button><div id="trainerCalendarBody" style="margin-top:14px">${calendarHTML(d,'trainer')}</div></div></div>`);
 refreshTrainerGlobalBadge();
 currentTrainerTab=activeTab||currentTrainerTab||'profile';
 if(currentTrainerTab!=='profile')showTab(currentTrainerTab,null,false);

}


async function setClientStatus(cid,status){
 let text=status==='Заморожений'?'Заморозити клієнта? Він зможе увійти, але матиме лише перегляд історії.':'Відновити повний доступ клієнту?';
 if(!confirm(text))return;
 await api('/clients/'+cid+'/status',{method:'PATCH',body:JSON.stringify({status})});openClient(cid)
}

async function deleteClientAccount(cid){
 if(!confirm('Видалити клієнта? Його доступ до застосунку буде закрито. Історія залишиться в базі.'))return;
 await api('/clients/'+cid,{method:'DELETE'});trainerHome()
}


function showTab(id,btn,push=true){
 document.querySelectorAll('.tab').forEach(x=>x.classList.add('hidden'));let pane=$('#'+id);if(!pane)return;pane.classList.remove('hidden');
 currentTrainerTab=id;
 // Cabinet sections stay inside the same browser-history entry, but remember the current section.
 if(session?.role==='trainer'&&selected&&history.state?.eplanPage==='client') history.replaceState({...history.state,eplanTab:id},'',location.href);
}

function trainerProfileHTML(c){
 let d=window.currentClientData||{},lastWorkout=(d.workout_sessions||[]).filter(x=>x.status==='finished').sort((a,b)=>(b.finished_at||b.started_at||'').localeCompare(a.finished_at||a.started_at||''))[0],lastCardio=(d.cardio||[])[0];
 return `<div class="card"><h2>Огляд клієнта</h2><div class="trainer-client-meta">${lastWorkout?`<span class="trainer-meta-chip ok">Останнє тренування: ${esc(sessionDay(lastWorkout))}</span>`:'<span class="trainer-meta-chip">Тренувань ще немає</span>'}${lastCardio?`<span class="trainer-meta-chip">Активність: ${esc(lastCardio.day)}</span>`:''}</div></div><div class="card"><h2>Анкета клієнта</h2><div class="grid" style="margin-top:14px"><div><div class="muted">Ім’я</div><strong>${profileVal(c.first_name||c.name||'—')}</strong></div><div><div class="muted">Прізвище</div><strong>${profileVal(c.last_name||'—')}</strong></div><div><div class="muted">Вік</div><strong>${c.age?profileVal(c.age):'—'}</strong></div><div><div class="muted">Стать</div><strong>${profileVal(c.sex||'—')}</strong></div><div><div class="muted">Зв’язок</div>${socialContactsHTML(c)}</div></div><div style="margin-top:16px"><div class="muted">Протипоказання</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.contraindications||'Не вказано')}</div></div><div style="margin-top:16px"><div class="muted">Травми</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.injuries||'Не вказано')}</div></div></div>`
}
