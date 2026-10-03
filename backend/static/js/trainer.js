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

function trainerCompliance(c){
 let days=+c.program_days_count||0,done=+c.workouts_28d||0;
 if(!days)return null;
 return Math.max(0,Math.min(100,Math.round(done/(days*4)*100)));
}
function trainerDaysSince(value){
 if(!value)return null;
 let d=new Date(value);if(Number.isNaN(d.getTime()))return null;
 return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));
}
function trainerAttention(c){
 if(c.status!=='Активний'||c.access?.expired)return {level:'paused',label:'На паузі',reason:'Доступ неактивний'};
 let review=+c.needs_review_count||0,check=+c.checkin_pending_count||0,comp=trainerCompliance(c),days=trainerDaysSince(c.last_finished_at);
 let reasons=[];
 if(review)reasons.push('Тренування до перевірки: '+review);
 if(check)reasons.push('Щотижневі звіти: '+check);
 if(days!==null&&days>=7)reasons.push('Без тренувань '+days+' дн.');
 if(days===null&&(+c.finished_workout_count||0)===0)reasons.push('Ще немає завершених тренувань');
 if(comp!==null&&comp<60)reasons.push('Дотримання плану '+comp+'%');
 if((+c.kcal||0)>0&&(+c.nutrition_days_7d||0)<3)reasons.push('Харчування заповнюється рідко');
 if((days!==null&&days>=14)||(comp!==null&&comp<40))return {level:'risk',label:'Ризик',reason:reasons[0]||'Потрібна увага'};
 if(reasons.length)return {level:'attention',label:'Потребує уваги',reason:reasons[0]};
 return {level:'ok',label:'Все добре',reason:'План виконується стабільно'};
}
function trainerClientInitials(c){
 let p=String(c.name||'').trim().split(/\s+/).filter(Boolean);
 return (p.slice(0,2).map(x=>x[0]).join('')||'К').toUpperCase();
}

async function trainerHome(){
 currentTrainerMainView='home';selected=null;window.currentClientData=null;
 let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
 let active=cs.filter(c=>c.status==='Активний'&&!c.access?.expired);
 let states=cs.map(c=>({c,state:trainerAttention(c)}));
 let attention=states.filter(x=>x.state.level==='attention'||x.state.level==='risk');
 let checkins=cs.reduce((n,c)=>n+(+c.checkin_pending_count||0),0);
 let comps=active.map(trainerCompliance).filter(x=>x!==null);
 let avgComp=comps.length?Math.round(comps.reduce((a,b)=>a+b,0)/comps.length):0;
 let avatars=cs.slice(0,4).map(c=>'<span class="trainer-client-avatar">'+esc(trainerClientInitials(c))+'</span>').join('');
 let recent=states.slice().sort((a,b)=>{
   let rank={risk:0,attention:1,ok:2,paused:3};return rank[a.state.level]-rank[b.state.level];
 }).slice(0,5).map(({c,state})=>{
   return '<button class="trainer-activity-row" onclick="navigateToClient('+c.id+')"><span class="trainer-client-avatar">'+esc(trainerClientInitials(c))+'</span><span><strong>'+esc(c.name)+'</strong><small>'+esc(state.reason)+'</small></span><span class="trainer-smart-status '+state.level+'">'+esc(state.label)+'</span><span class="more-chevron">›</span></button>'
 }).join('');
 app.innerHTML=shell(`<div class="trainer-home-page">
   <button class="trainer-hero-card" onclick="showTrainerClientsView()">
     <div class="trainer-hero-head"><span class="hero-users">${uiIcon('users')}</span><strong>Ваші клієнти</strong><span class="more-chevron">›</span></div>
     <div class="trainer-hero-count">${active.length} <small>активних клієнтів</small></div>
     <div class="trainer-hero-sub">${active.length} з ${cs.length} загалом</div>
     <div class="trainer-avatar-stack">${avatars}${cs.length>4?'<span class="trainer-client-avatar more">+'+(cs.length-4)+'</span>':''}</div>
   </button>

   <div class="trainer-home-stats reference-grid">
     <button onclick="window.trainerHomeFilter='review';showTrainerClientsView()"><span class="trainer-stat-icon orange">${uiIcon('users')}</span><strong>${attention.length}</strong><small>Потребують уваги</small><em>Переглянути ›</em></button>
     <button onclick="window.trainerHomeFilter='all';showTrainerClientsView()"><span class="trainer-stat-icon green">✓</span><strong>${avgComp}%</strong><small>Дотримання плану</small><em>За 28 днів ›</em></button>
     <button onclick="showTrainerCheckins()"><span class="trainer-stat-icon blue">${uiIcon('calendar')}</span><strong>${checkins}</strong><small>Щотижневі звіти</small><em>Переглянути ›</em></button>
     <button onclick="newClient()"><span class="trainer-stat-icon blue">${uiIcon('plus')}</span><strong>＋</strong><small>Новий клієнт</small><em>Додати ›</em></button>
   </div>

   <div class="trainer-home-section-head"><h2>Потребує уваги</h2><button onclick="window.trainerHomeFilter='review';showTrainerClientsView()">Усі ›</button></div>
   <div class="trainer-activity-card">${recent||'<div class="trainer-empty">Клієнтів ще немає.</div>'}</div>
 </div>`);
 refreshTrainerGlobalBadge()
}

async function showTrainerClientsView(){
 currentTrainerMainView='clients';selected=null;window.currentClientData=null;
 let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
 let filter=window.trainerHomeFilter||'all',q=String(window.trainerClientSearch||'').trim().toLowerCase();
 let base=filter==='review'?cs.filter(c=>['attention','risk'].includes(trainerAttention(c).level)):filter==='active'?cs.filter(c=>c.status==='Активний'&&!c.access?.expired):cs;
 let shown=q?base.filter(c=>String(c.name||'').toLowerCase().includes(q)||String(c.goal||'').toLowerCase().includes(q)):base;
 let chip=(key,label,n)=>'<button class="'+(filter===key?'active':'')+'" onclick="window.trainerHomeFilter=\''+key+'\';showTrainerClientsView()">'+label+' <span>'+n+'</span></button>';
 app.innerHTML=shell(`<div class="trainer-clients-page">
   <div class="trainer-page-title"><h1>Клієнти</h1><button class="trainer-round-add" onclick="newClient()">＋</button></div>
   <label class="trainer-search">${uiIcon('menu')}<input value="${esc(window.trainerClientSearch||'')}" placeholder="Пошук клієнтів..." oninput="window.trainerClientSearch=this.value;showTrainerClientsView()"></label>
   <div class="trainer-filter-chips">
     ${chip('all','Усі',cs.length)}
     ${chip('active','Активні',cs.filter(c=>c.status==='Активний'&&!c.access?.expired).length)}
     ${chip('review','Потребують уваги',cs.filter(c=>['attention','risk'].includes(trainerAttention(c).level)).length)}
   </div>
   <div class="trainer-client-list">${shown.map(c=>{
     let st=trainerAttention(c),comp=trainerCompliance(c),goal=c.goal||'Без цілі';
     return '<button type="button" class="trainer-client-row" data-client="'+(+c.id||0)+'" onclick="navigateToClient(+this.dataset.client)"><span class="trainer-client-avatar">'+esc(trainerClientInitials(c))+'</span><span class="trainer-client-copy"><strong>'+esc(c.name)+'</strong><small>'+esc(goal)+(comp!==null?' · '+comp+'% дотримання':'')+'</small><span class="trainer-smart-status '+st.level+'">'+esc(st.label)+'</span><em>'+esc(st.reason)+'</em></span><span class="more-chevron">›</span></button>'
   }).join('')||'<div class="trainer-empty">У цій категорії клієнтів немає.</div>'}</div>
 </div>`);
 refreshTrainerGlobalBadge()
}

async function showTrainerCheckins(){
 currentTrainerMainView='home';
 let cs=(await loadClients()).filter(c=>(+c.checkin_pending_count||0)>0);
 if(!cs.length){alert('Нових щотижневих звітів поки немає.');return trainerHome()}
 await navigateToClient(cs[0].id);
 setTimeout(()=>document.querySelector('.trainer-client-tabs [data-tab="notes"]')?.click(),0);
}


async function showTrainerPrograms(tab='templates'){
  currentTrainerMainView='programs';selected=null;window.currentClientData=null;
  window.trainerProgramsTab=tab;
  let assignedHTML='';
  if(tab==='assigned'){
    let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
    let rows=await Promise.all(cs.map(async c=>{
      try{
        let d=await loadClientData(c.id),days=[...new Set((d.program||[]).map(x=>x.day_name).filter(Boolean))];
        let hasProgram=days.length>0;
        let label=hasProgram?days.join(' · '):'Програму ще не призначено';
        let countLabel=days.length===1?'1 день':days.length>1?days.length+' дні':'Без програми';
        return '<button class="trainer-assigned-row modern" onclick="openClient('+c.id+',\'program\')">'
          +'<span class="trainer-client-avatar">'+esc(trainerClientInitials(c))+'</span>'
          +'<span class="trainer-assigned-copy"><strong>'+esc(c.name)+'</strong><small>'+esc(label)+'</small></span>'
          +'<span class="trainer-assigned-meta '+(hasProgram?'active':'empty')+'">'+esc(countLabel)+'</span>'
          +'<span class="trainer-assigned-chevron">›</span>'
        +'</button>';
      }catch(e){return ''}
    }));
    assignedHTML=rows.filter(Boolean).length
      ?'<div class="trainer-assigned-list modern">'+rows.join('')+'</div>'
      :'<div class="trainer-program-empty compact"><span class="trainer-program-empty-icon">'+uiIcon('dumbbell')+'</span><h2>Призначених програм немає</h2><p>Коли ти призначиш клієнту програму, вона з’явиться тут.</p></div>';
  }
  app.innerHTML=shell(`<div class="trainer-programs-page modern">
    <div class="trainer-page-title trainer-programs-title">
      <div><h1>Програми</h1><p class="trainer-page-sub">Шаблони та програми, призначені клієнтам</p></div>
      <button class="trainer-round-add" onclick="alert('Конструктор шаблонів програм додамо наступним етапом.')" aria-label="Створити шаблон">＋</button>
    </div>
    <div class="trainer-segmented trainer-programs-segmented">
      <button class="${tab==='templates'?'active':''}" onclick="showTrainerPrograms('templates')">Шаблони</button>
      <button class="${tab==='assigned'?'active':''}" onclick="showTrainerPrograms('assigned')">Призначені</button>
    </div>
    ${tab==='templates'
      ?'<div class="trainer-program-empty modern"><span class="trainer-program-empty-icon">'+uiIcon('dumbbell')+'</span><h2>Шаблони програм</h2><p>Створюй готові програми один раз і швидко призначай їх клієнтам.</p><button class="trainer-program-create" onclick="alert(\'Конструктор шаблонів програм додамо наступним етапом.\')">＋ Створити шаблон</button></div>'
      :assignedHTML}
  </div>`);
}

async function showTrainerNutrition(){
 currentTrainerMainView='nutrition';selected=null;window.currentClientData=null;
 let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
 let q=String(window.trainerNutritionSearch||'').trim().toLowerCase(),filter=window.trainerNutritionFilter||'all';
 let tracked=cs.filter(c=>(+c.kcal||0)>0),needs=cs.filter(c=>(+c.kcal||0)>0&&(+c.nutrition_days_7d||0)<3);
 let base=filter==='tracked'?tracked:filter==='attention'?needs:cs;
 let shown=q?base.filter(c=>String(c.name||'').toLowerCase().includes(q)||String(c.goal||'').toLowerCase().includes(q)):base;
 let avg=tracked.length?Math.round(tracked.reduce((n,c)=>n+Math.min(7,+c.nutrition_days_7d||0),0)/tracked.length):0;
 let chip=(key,label,n)=>'<button class="'+(filter===key?'active':'')+'" onclick="window.trainerNutritionFilter=\''+key+'\';showTrainerNutrition()">'+label+' <span>'+n+'</span></button>';
 let rows=shown.map(c=>{
   let initials=trainerClientInitials(c),days=Math.min(7,+c.nutrition_days_7d||0),kcal=+c.kcal||0,hasTargets=kcal>0;
   let status=!hasTargets?'<span class="trainer-nutrition-status neutral">Без цілей</span>':days>=5?'<span class="trainer-nutrition-status ok">'+days+'/7 днів</span>':days>=3?'<span class="trainer-nutrition-status warn">'+days+'/7 днів</span>':'<span class="trainer-nutrition-status attention">'+days+'/7 днів</span>';
   return '<button class="trainer-nutrition-row modern" onclick="openClient('+c.id+',\'nutrition\')"><span class="trainer-client-avatar">'+esc(initials)+'</span><span class="trainer-nutrition-copy"><strong>'+esc(c.name)+'</strong><small>'+(hasTargets?esc(kcal)+' ккал · Б '+esc(c.protein||0)+' · Ж '+esc(c.fat||0)+' · В '+esc(c.carbs||0):'Цілі харчування ще не задані')+'</small>'+status+'</span><span class="more-chevron">›</span></button>';
 }).join('');
 app.innerHTML=shell(`<div class="trainer-nutrition-page">
   <div class="trainer-page-title"><div><h1>Харчування</h1><p class="trainer-page-sub">Контроль цілей, БЖВ і заповнення щоденника</p></div></div>
   <div class="trainer-nutrition-summary">
     <div><span class="trainer-stat-icon green">${uiIcon('food')}</span><strong>${tracked.length}</strong><small>з цілями харчування</small></div>
     <div><span class="trainer-stat-icon orange">!</span><strong>${needs.length}</strong><small>потребують уваги</small></div>
     <div><span class="trainer-stat-icon blue">${uiIcon('calendar')}</span><strong>${avg}/7</strong><small>середнє заповнення</small></div>
   </div>
   <label class="trainer-search trainer-nutrition-search">${uiIcon('menu')}<input value="${esc(window.trainerNutritionSearch||'')}" placeholder="Пошук клієнта..." oninput="window.trainerNutritionSearch=this.value;showTrainerNutrition()"></label>
   <div class="trainer-filter-chips trainer-nutrition-chips">
     ${chip('all','Усі',cs.length)}
     ${chip('tracked','З цілями',tracked.length)}
     ${chip('attention','Потребують уваги',needs.length)}
   </div>
   <div class="trainer-nutrition-list modern">${rows||'<div class="trainer-empty">У цій категорії клієнтів немає.</div>'}</div>
 </div>`);
}

function showTrainerMore(){
 currentTrainerMainView='more';selected=null;window.currentClientData=null;
 app.innerHTML=shell(`<div class="trainer-more-page modern">
   <div class="trainer-page-title trainer-more-title"><h1>Більше</h1></div>
   <div class="trainer-more-list modern">
     <button class="trainer-more-item" onclick="showTrainerNotifications()">
       <span class="trainer-more-icon">${uiIcon('bell')}</span>
       <span class="trainer-more-copy"><strong>Сповіщення</strong><small>Нові події клієнтів</small></span>
       <span class="trainer-more-chevron">›</span>
     </button>
     <button class="trainer-more-item" onclick="showExerciseLibrary()">
       <span class="trainer-more-icon">${uiIcon('dumbbell')}</span>
       <span class="trainer-more-copy"><strong>Бібліотека вправ</strong><small>Вправи, м’язи та техніка</small></span>
       <span class="trainer-more-chevron">›</span>
     </button>
   </div>
   <button class="trainer-more-logout" onclick="logout()">${uiIcon('logout')}<span>Вийти з акаунта</span></button>
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


function newClient(){
 document.body.insertAdjacentHTML('beforeend',`<div class="modal trainer-new-client-modal" id="modal" onclick="if(event.target===this)this.remove()">
   <div class="card trainer-new-client-card">
     <div class="trainer-new-client-head">
       <div><small>НОВИЙ КЛІЄНТ</small><h2>Додати клієнта</h2></div>
       <button type="button" class="trainer-new-client-close" onclick="modal.remove()" aria-label="Закрити">✕</button>
     </div>
     <p class="trainer-new-client-copy">Вкажи ім’я та справжню пошту клієнта. Після створення він отримає посилання та сам встановить пароль.</p>

     <div class="trainer-new-client-main-fields">
       <label><span>Ім’я</span><input id="n" autocomplete="name" placeholder="Ім’я клієнта"></label>
       <label><span>Email</span><input id="e" type="email" autocomplete="email" placeholder="client@example.com"></label>
     </div>

     <div class="trainer-new-client-section">
       <div class="trainer-new-client-section-head"><strong>Цільове харчування</strong><span>Необов’язково</span></div>
       <div class="trainer-new-client-macros">
         <label><span>Ккал</span><input id="k" type="number" inputmode="numeric" placeholder="2000"></label>
         <label><span>Білки, г</span><input id="pr" type="number" inputmode="numeric" placeholder="160"></label>
         <label><span>Жири, г</span><input id="f" type="number" inputmode="numeric" placeholder="55"></label>
         <label><span>Вуглеводи, г</span><input id="ca" type="number" inputmode="numeric" placeholder="250"></label>
       </div>
     </div>

     <p id="me" class="trainer-new-client-error"></p>
     <button type="button" class="trainer-new-client-submit" onclick="createClient()">Створити та надіслати запрошення</button>
   </div>
 </div>`)
}

async function createClient(){
 let mail=(e.value||'').trim();
 if(!n.value.trim())return me.textContent="Вкажи ім'я клієнта";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))return me.textContent='Вкажи коректний email';
 try{
   let r=await api('/clients',{method:'POST',body:JSON.stringify({name:n.value,email:mail,password:'',goal:'',weight:0,kcal:+k.value||0,protein:+pr.value||0,fat:+f.value||0,carbs:+ca.value||0})});
   modal.remove();
   alert(r.invite_sent?'Клієнта створено. Запрошення надіслано на email.':'Клієнта створено, але лист не надіслано. Перевір налаштування пошти на Render.');
   trainerHome()
 }catch(x){me.textContent=x.message}
}

async function navigateToClient(id){
 // Only real screen changes belong to browser history. Inner tabs do not.
 let previousState=history.state,previousUrl=location.href;
 history.pushState({eplanPage:'client',eplanClient:id},'',location.pathname+location.search+'#client-'+id);
 try{
   await openClient(id,'profile');
 }catch(e){
   console.error('Є ПЛАН: failed to open trainer client card',e);
   history.replaceState(previousState||{},'',previousUrl);
   alert('Не вдалося відкрити клієнта. Онови сторінку та спробуй ще раз.');
 }
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


function trainerSafePane(render,label){
 try{return render()}catch(e){
   console.error('Є ПЛАН: trainer pane render failed:',label,e);
   return '<div class="card trainer-pane-error"><strong>Розділ тимчасово недоступний</strong><span>Спробуй відкрити його ще раз після оновлення сторінки.</span></div>';
 }
}

async function openClient(id,activeTab=null){
 selected=id;currentTrainerMainView='clients';
 let [d]=await Promise.all([loadClientData(id),loadExerciseLibrary()]);
 d=d||{};
 ['program','program_days','results','result_sets','nutrition','nutrition_plan','measurements','workout_sessions','comments','cardio','checkins'].forEach(key=>{if(!Array.isArray(d[key]))d[key]=[]});
 let c=d.client;
 if(!c)throw new Error('client data missing');
 window.currentClientData=d;
 let initials=trainerClientInitials(c);
 let lastM=(d.measurements||[]).slice().sort((a,b)=>String(b.day||'').localeCompare(String(a.day||'')))[0]||{};
 let lastWorkout=(d.workout_sessions||[]).filter(x=>x.status==='finished').sort((a,b)=>String(b.finished_at||b.started_at||'').localeCompare(String(a.finished_at||a.started_at||'')))[0];
 let age=c.age?c.age+' років':'Вік не вказано';
 let localMetrics={
   ...c,
   workouts_28d:(d.workout_sessions||[]).filter(x=>x.status==='finished'&&trainerDaysSince(x.finished_at||x.started_at)<=28).length,
   program_days_count:new Set((d.program||[]).map(x=>x.day_name)).size,
   needs_review_count:(d.workout_sessions||[]).filter(x=>x.status==='finished'&&!x.trainer_reviewed).length,
   checkin_pending_count:(d.checkins||[]).filter(x=>!x.reviewed).length,
   nutrition_days_7d:new Set((d.nutrition||[]).filter(x=>trainerDaysSince(x.day+'T12:00:00')<=6).map(x=>x.day)).size,
   finished_workout_count:(d.workout_sessions||[]).filter(x=>x.status==='finished').length,
   last_finished_at:lastWorkout?.finished_at||lastWorkout?.started_at||null
 };
 let smart=trainerAttention(localMetrics),comp=trainerCompliance(localMetrics);
 let weight=lastM.weight?lastM.weight+' кг':'—';
 let lastDay=lastWorkout?sessionDay(lastWorkout):'—';
 let latestCheck=(d.checkins||[]).slice().sort((a,b)=>String(b.week_start||'').localeCompare(String(a.week_start||''))||(+b.id||0)-(+a.id||0))[0]||null;
 let profile=`
   <div class="trainer-client-kpis">
    <div><strong>${comp===null?'—':comp+'%'}</strong><small>Дотримання плану</small></div>
    <div><strong>${weight}</strong><small>Поточна вага</small></div>
    <div><strong>${lastDay}</strong><small>Останнє тренування</small></div>
   </div>
   ${localMetrics.needs_review_count>0?`<button type="button" class="trainer-smart-summary ${smart.level} is-action" onclick="openTrainerPendingReviews(true)"><strong>${esc(smart.label)}</strong><span>${esc(smart.reason)}</span><b aria-hidden="true">›</b></button>`:`<div class="trainer-smart-summary ${smart.level}"><strong>${esc(smart.label)}</strong><span>${esc(smart.reason)}</span></div>`}
   ${latestCheck?trainerCheckinCard(latestCheck,c.id):'<div class="card trainer-checkin-empty"><strong>Щотижневих звітів ще немає</strong><span>Перший щотижневий звіт клієнта з’явиться тут.</span></div>'}
   ${trainerProfileHTML(c)}
   ${trainerAccessHTML(c)}
 `;
 let notes=trainerNotesHTML(d,c.id);
 app.innerHTML=shell(`<div class="trainer-client-page">
   <div class="trainer-client-navline"><button onclick="showTrainerClientsView()" aria-label="До клієнтів">‹</button><button class="trainer-client-more" onclick="toggleTrainerClientActions(event)" aria-label="Дії з клієнтом">•••</button></div>
   <div id="trainerClientActionsLayer" class="trainer-client-actions-layer hidden" onclick="closeTrainerClientActions()">
     <div id="trainerClientActions" class="trainer-client-actions-pop" onclick="event.stopPropagation()">
       <div class="trainer-client-actions-head"><strong>Дії з клієнтом</strong><button type="button" onclick="closeTrainerClientActions()" aria-label="Закрити">✕</button></div>
       ${c.status==='Заморожений'?'<button type="button" class="trainer-client-action neutral" onclick="closeTrainerClientActions();setClientStatus('+c.id+',\'Активний\')">Розморозити клієнта</button>':'<button type="button" class="trainer-client-action neutral" onclick="closeTrainerClientActions();setClientStatus('+c.id+',\'Заморожений\')">Заморозити клієнта</button>'}
       <button type="button" class="trainer-client-action danger" onclick="closeTrainerClientActions();deleteClientAccount(${c.id})">Видалити клієнта</button>
     </div>
   </div>
   <div class="trainer-client-identity">
     <span class="trainer-client-avatar large">${esc(initials)}</span>
     <div><h1>${esc(c.name)}</h1><p>${esc(age)} · ${esc(c.goal||'Без цілі')}</p><span class="trainer-smart-status ${smart.level}">${esc(smart.label)}</span></div>
   </div>
   <div class="trainer-client-tabs">
     <button data-tab="profile" onclick="showTrainerClientTab('profile',this)">Огляд</button>
     <button data-tab="program" onclick="showTrainerClientTab('program',this)">Тренування</button>
     <button data-tab="results" onclick="showTrainerClientTab('results',this)">Заміри</button>
     <button data-tab="nutrition" onclick="showTrainerClientTab('nutrition',this)">Харчування</button>
     <button data-tab="notes" onclick="showTrainerClientTab('notes',this)">Нотатки</button>
   </div>
   <div id="profile" class="tab">${profile}</div>
   <div id="program" class="tab hidden">${trainerSafePane(()=>trainerTrainingTabHTML(d),'program')}</div>
   <div id="results" class="tab hidden">${trainerSafePane(()=>trainerMeasurementsResultsHTML(d),'measurements')}</div>
   <div id="nutrition" class="tab hidden">${trainerSafePane(()=>nutritionHTML(d),'nutrition')}</div>
   <div id="notes" class="tab hidden">${notes}</div>
   <div id="calendar" class="tab hidden"><div class="card"><div id="trainerCalendarBody">${trainerSafePane(()=>calendarHTML(d,'trainer'),'calendar')}</div></div></div>
 </div>`);
 refreshTrainerGlobalBadge();
 currentTrainerTab=activeTab||'profile';
 showTrainerClientTab(currentTrainerTab,document.querySelector('.trainer-client-tabs [data-tab="'+currentTrainerTab+'"]'),false);
}

function openTrainerPendingReviews(autoOpen=true){
 let btn=document.querySelector('.trainer-client-tabs [data-tab="program"]');
 showTrainerClientTab('program',btn);
 setTimeout(()=>{
   let queue=document.getElementById('trainerPendingReviewQueue');
   if(queue)queue.scrollIntoView({behavior:'smooth',block:'start'});
   if(autoOpen&&typeof openFirstPendingWorkout==='function')openFirstPendingWorkout();
 },60);
}

function trainerCheckinDetailsHTML(x,cid){
 return '<div class="trainer-checkin-grid"><span>Самопочуття <b>'+x.mood+'/5</b></span><span>Сон <b>'+x.sleep+'/5</b></span><span>Енергія <b>'+x.energy+'/5</b></span><span>Голод <b>'+x.hunger+'/5</b></span><span>Складність <b>'+x.difficulty+'/5</b></span></div>'
   +(x.comment?'<p>'+esc(x.comment)+'</p>':'')
   +(!x.reviewed?'<button onclick="reviewTrainerCheckin('+cid+','+x.id+')">Позначити переглянутим</button>':'<span class="trainer-checkin-reviewed">Переглянуто ✓</span>');
}
function trainerCheckinCard(x,cid){
 return '<div class="card trainer-checkin-card"><div class="between"><div><small>ЩОТИЖНЕВИЙ ЗВІТ</small><h2>'+esc(String(x.week_start||''))+'</h2></div><span class="trainer-checkin-score">'+(x.reviewed?'✓':'Новий')+'</span></div>'
   +trainerCheckinDetailsHTML(x,cid)+'</div>';
}
async function reviewTrainerCheckin(cid,id){
 await api('/client/'+cid+'/checkin/'+id+'/review',{method:'PATCH',body:JSON.stringify({reviewed:true})});
 await openClient(cid,'profile');
}
function trainerCheckinHistoryItem(x,cid){
 return '<div class="trainer-checkin-history-item">'
   +'<button type="button" class="trainer-checkin-history-toggle" onclick="toggleTrainerCheckinHistoryItem(this)">'
     +'<span><small>ЩОТИЖНЕВИЙ ЗВІТ</small><strong>'+esc(String(x.week_start||''))+'</strong></span>'
     +'<span class="trainer-checkin-history-status '+(x.reviewed?'reviewed':'new')+'">'+(x.reviewed?'Переглянуто':'Новий')+'</span>'
     +'<b class="trainer-checkin-history-arrow" aria-hidden="true">⌄</b>'
   +'</button>'
   +'<div class="trainer-checkin-history-detail hidden">'+trainerCheckinDetailsHTML(x,cid)+'</div>'
 +'</div>';
}
function toggleTrainerCheckinHistoryItem(btn){
 let item=btn?.closest('.trainer-checkin-history-item'),detail=item?.querySelector('.trainer-checkin-history-detail');
 if(!detail)return;
 let open=detail.classList.contains('hidden');
 detail.classList.toggle('hidden',!open);
 item.classList.toggle('is-open',open);
}
function trainerCheckinHistoryLimit(cid){
 window.trainerCheckinHistoryLimits=window.trainerCheckinHistoryLimits||{};
 return Math.max(3,+window.trainerCheckinHistoryLimits[cid]||3);
}
function showMoreTrainerCheckins(cid){
 window.trainerCheckinHistoryLimits=window.trainerCheckinHistoryLimits||{};
 window.trainerCheckinHistoryLimits[cid]=trainerCheckinHistoryLimit(cid)+5;
 let host=document.getElementById('trainerCheckinHistoryHost');
 if(host&&window.currentClientData)host.innerHTML=trainerCheckinHistoryHTML(window.currentClientData,cid);
}
function trainerCheckinHistoryHTML(d,cid){
 let xs=(d.checkins||[]).slice().sort((a,b)=>String(b.week_start||'').localeCompare(String(a.week_start||''))||(+b.id||0)-(+a.id||0));
 if(!xs.length)return '<div class="trainer-checkin-history-empty">Щотижневих звітів ще немає.</div>';
 let limit=trainerCheckinHistoryLimit(cid),shown=xs.slice(0,limit),left=Math.max(0,xs.length-shown.length);
 return '<div class="trainer-checkin-history-list">'+shown.map(x=>trainerCheckinHistoryItem(x,cid)).join('')+'</div>'
   +(left?'<button type="button" class="trainer-checkin-history-more" onclick="showMoreTrainerCheckins('+cid+')">Показати ще <span>('+left+')</span></button>':'');
}
function trainerNotesHTML(d,cid){
 let note=String(d.trainer_note?.body||''),total=(d.checkins||[]).length;
 return '<div class="card trainer-private-note">'
   +'<div class="trainer-private-note-head"><div><small>ЛИШЕ ДЛЯ ТРЕНЕРА</small><h2>Приватні нотатки</h2><p>Ці нотатки бачиш тільки ти.</p></div></div>'
   +'<textarea id="trainerPrivateNote" placeholder="Наприклад: ліве коліно реагує на великий об’єм випадів...">'+esc(note)+'</textarea>'
   +'<button class="trainer-private-note-save" onclick="saveTrainerPrivateNote('+cid+',this)">Зберегти нотатку</button>'
 +'</div>'
 +'<div class="card trainer-checkin-history">'
   +'<div class="trainer-checkin-history-head"><div><h2>Історія щотижневих звітів</h2><p>Останні звіти клієнта</p></div><span>'+total+'</span></div>'
   +'<div id="trainerCheckinHistoryHost">'+trainerCheckinHistoryHTML(d,cid)+'</div>'
 +'</div>';
}
async function saveTrainerPrivateNote(cid,btn){
 let body=document.getElementById('trainerPrivateNote')?.value||'';
 await api('/client/'+cid+'/trainer-note',{method:'PUT',body:JSON.stringify({body})});
 if(window.currentClientData)window.currentClientData.trainer_note={body};
 if(btn){let old=btn.textContent;btn.textContent='Збережено ✓';setTimeout(()=>btn.textContent=old,1200)}
}

function toggleTrainerClientActions(event){
 event?.stopPropagation?.();
 document.getElementById('trainerClientActionsLayer')?.classList.toggle('hidden');
}
function closeTrainerClientActions(){
 document.getElementById('trainerClientActionsLayer')?.classList.add('hidden');
}

function showTrainerClientTab(id,btn,push=true){
 closeTrainerClientActions();
 document.querySelectorAll('.trainer-client-page .tab').forEach(x=>x.classList.add('hidden'));
 document.getElementById(id)?.classList.remove('hidden');
 document.querySelectorAll('.trainer-client-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
 currentTrainerTab=id;
 if(session?.role==='trainer'&&selected&&history.state?.eplanPage==='client') history.replaceState({...history.state,eplanTab:id},'',location.href);
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
 let health=[c.contraindications,c.injuries].map(x=>String(x||'').trim()).filter(Boolean).join('\n');
 return `<div class="card trainer-overview-card"><h2>Огляд клієнта</h2><div class="trainer-client-meta">${lastWorkout?'<span class="trainer-meta-chip ok">Останнє тренування: '+esc(sessionDay(lastWorkout))+'</span>':'<span class="trainer-meta-chip">Тренувань ще немає</span>'}${lastCardio?'<span class="trainer-meta-chip">Активність: '+esc(lastCardio.day)+'</span>':''}</div></div><div class="card trainer-profile-card"><h2>Анкета клієнта</h2><div class="grid" style="margin-top:14px"><div><div class="muted">Ім’я</div><strong>${profileVal(c.first_name||c.name||'—')}</strong></div><div><div class="muted">Прізвище</div><strong>${profileVal(c.last_name||'—')}</strong></div><div><div class="muted">Вік</div><strong>${c.age?profileVal(c.age):'—'}</strong></div><div><div class="muted">Стать</div><strong>${profileVal(c.sex||'—')}</strong></div></div><div style="margin-top:16px"><div class="muted">Моя ціль</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.goal||'Не вказано')}</div></div><div style="margin-top:16px"><div class="muted">Протипоказання та травми</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(health||'Не вказано')}</div></div></div>`;
}
