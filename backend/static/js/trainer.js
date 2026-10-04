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
function trainerAccessIsActive(c){
 let a=clientAccess(c);
 return c.status==='Активний'&&!a.expired&&!a.manually_frozen&&a.effective_plan!=='free';
}
function trainerAttention(c){
 let a=clientAccess(c);
 if(!trainerAccessIsActive(c))return {level:'paused',label:'На паузі',reason:a.plan_code==='free'?'Безкоштовний режим':'Доступ неактивний'};
 if(!a.features?.trainer_review)return {level:'paused',label:'Без супроводу',reason:a.plan_name||'Самостійний тариф'};
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
 let active=cs.filter(c=>trainerAccessIsActive(c));
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
 let base=filter==='review'?cs.filter(c=>['attention','risk'].includes(trainerAttention(c).level)):filter==='active'?cs.filter(c=>trainerAccessIsActive(c)):cs;
 let shown=q?base.filter(c=>String(c.name||'').toLowerCase().includes(q)||String(c.goal||'').toLowerCase().includes(q)):base;
 let chip=(key,label,n)=>'<button class="'+(filter===key?'active':'')+'" onclick="window.trainerHomeFilter=\''+key+'\';showTrainerClientsView()">'+label+' <span>'+n+'</span></button>';
 app.innerHTML=shell(`<div class="trainer-clients-page">
   <div class="trainer-page-title"><h1>Клієнти</h1><button class="trainer-round-add" onclick="newClient()">＋</button></div>
   <label class="trainer-search">${uiIcon('menu')}<input value="${esc(window.trainerClientSearch||'')}" placeholder="Пошук клієнтів..." oninput="window.trainerClientSearch=this.value;showTrainerClientsView()"></label>
   <div class="trainer-filter-chips">
     ${chip('all','Усі',cs.length)}
     ${chip('active','Активні',cs.filter(c=>trainerAccessIsActive(c)).length)}
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
 setTimeout(()=>document.querySelector('.trainer-checkin-history')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
}


window.trainerProgramsMode=window.trainerProgramsMode||'assigned';

function trainerProgramTabsHTML(){
  let tab=(key,label)=>'<button class="'+(window.trainerProgramsMode===key?'active':'')+'" onclick="window.trainerProgramsMode=\''+key+'\';showTrainerPrograms()">'+label+'</button>';
  return '<div class="trainer-program-tabs">'+tab('assigned','Призначені')+tab('templates','Шаблони')+'</div>';
}

function trainerTemplateCardHTML(t){
  let days=+t.days_count||0,ex=+t.exercises_count||0;
  return '<div class="trainer-template-card">'
    +'<div class="trainer-template-card-main"><span class="trainer-template-icon">'+uiIcon('dumbbell')+'</span><div><strong>'+esc(t.name||'Шаблон')+'</strong><small>'+days+' дн. · '+ex+' вправ</small>'+(t.description?'<p>'+esc(t.description)+'</p>':'')+'</div></div>'
    +'<div class="trainer-template-actions"><button onclick="openAssignProgramTemplateModal('+t.id+')">Призначити</button><button class="dark" onclick="deleteProgramTemplate('+t.id+')">'+uiIcon('trash')+'</button></div>'
  +'</div>';
}

async function showTrainerPrograms(){
  currentTrainerMainView='programs';selected=null;window.currentClientData=null;
  let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
  let body='';
  if(window.trainerProgramsMode==='templates'){
    let templates=await api('/trainer/program-templates');
    body='<div class="trainer-template-toolbar"><div><strong>Мої шаблони</strong><span>Зберігай готові програми та призначай їх за кілька секунд.</span></div><button onclick="openCreateProgramTemplateModal()">+ Створити шаблон</button></div>'
      +(templates.length?'<div class="trainer-template-list">'+templates.map(trainerTemplateCardHTML).join('')+'</div>':'<div class="trainer-program-empty compact"><span class="trainer-program-empty-icon">'+uiIcon('dumbbell')+'</span><h2>Шаблонів ще немає</h2><p>Створи перший шаблон із готової програми будь-якого клієнта.</p><button onclick="openCreateProgramTemplateModal()">Створити шаблон</button></div>');
  }else{
    let rows=cs.map(c=>{
      let days=+c.program_days_count||0,hasProgram=days>0;
      let countLabel=days===1?'1 день':days>=2&&days<=4?days+' дні':days+' днів';
      let label=hasProgram?'Призначено '+countLabel:'Програму ще не призначено';
      return '<button class="trainer-assigned-row modern" onclick="openClient('+c.id+',\'program\')">'
        +'<span class="trainer-client-avatar">'+esc(trainerClientInitials(c))+'</span>'
        +'<span class="trainer-assigned-copy"><strong>'+esc(c.name)+'</strong><small>'+esc(label)+'</small></span>'
        +'<span class="trainer-assigned-meta '+(hasProgram?'active':'empty')+'">'+esc(hasProgram?countLabel:'Без програми')+'</span>'
        +'<span class="trainer-assigned-chevron">›</span>'
      +'</button>';
    }).join('');
    body=rows
      ?'<div class="trainer-assigned-list modern">'+rows+'</div>'
      :'<div class="trainer-program-empty compact"><span class="trainer-program-empty-icon">'+uiIcon('dumbbell')+'</span><h2>Призначених програм немає</h2><p>Відкрий клієнта, щоб створити або призначити йому програму.</p></div>';
  }
  app.innerHTML=shell('<div class="trainer-programs-page modern"><div class="trainer-page-title trainer-programs-title"><div><h1>Програми</h1><p class="trainer-page-sub">Призначені програми та твої багаторазові шаблони</p></div></div>'+trainerProgramTabsHTML()+body+'</div>');
}

async function openCreateProgramTemplateModal(){
  let cs=(await loadClients()).filter(c=>c.status!=='Видалений'&&(+c.program_days_count||0)>0);
  if(!cs.length)return alert('Спочатку створи програму хоча б для одного клієнта.');
  document.getElementById('programTemplateModal')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div class="modal" id="programTemplateModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-template-modal"><div class="between"><div><h2>Новий шаблон</h2><p class="muted">Збережемо копію готової програми. Подальші зміни клієнта шаблон не змінять.</p></div><button class="dark" onclick="programTemplateModal.remove()">✕</button></div><label><span>Назва шаблону</span><input id="templateName" placeholder="Наприклад: Full Body · 3 дні"></label><label><span>Взяти програму клієнта</span><select id="templateSourceClient">'+cs.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' · '+(+x.program_days_count||0)+' дн.</option>').join('')+'</select></label><label><span>Опис <small>необов’язково</small></span><textarea id="templateDescription" placeholder="Для кого цей шаблон, ціль, акцент..."></textarea></label><button class="trainer-template-primary" onclick="createProgramTemplate(this)">Зберегти шаблон</button></div></div>');
}

async function createProgramTemplate(btn){
  let name=document.getElementById('templateName')?.value.trim()||'',source_client_id=+document.getElementById('templateSourceClient')?.value||0,description=document.getElementById('templateDescription')?.value||'';
  if(!name)return alert('Вкажи назву шаблону.');
  if(btn)btn.disabled=true;
  try{
    await api('/trainer/program-templates',{method:'POST',body:JSON.stringify({source_client_id,name,description})});
    document.getElementById('programTemplateModal')?.remove();
    window.trainerProgramsMode='templates';await showTrainerPrograms();
  }catch(e){if(btn)btn.disabled=false;alert(e.message||'Не вдалося створити шаблон')}
}

async function openAssignProgramTemplateModal(templateId){
  let cs=(await loadClients()).filter(c=>c.status!=='Видалений');
  document.getElementById('programTemplateAssignModal')?.remove();
  document.body.insertAdjacentHTML('beforeend','<div class="modal" id="programTemplateAssignModal" onclick="if(event.target===this)this.remove()"><div class="card trainer-template-modal"><div class="between"><div><h2>Призначити шаблон</h2><p class="muted">Поточна програма вибраного клієнта буде замінена копією шаблону. Історія завершених тренувань залишиться.</p></div><button class="dark" onclick="programTemplateAssignModal.remove()">✕</button></div><label><span>Клієнт</span><select id="templateTargetClient">'+cs.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('')+'</select></label><button class="trainer-template-primary" onclick="applyProgramTemplate('+templateId+',this)">Призначити програму</button></div></div>');
}

async function applyProgramTemplate(templateId,btn){
  let client_id=+document.getElementById('templateTargetClient')?.value||0;if(!client_id)return;
  if(!confirm('Замінити поточну програму цього клієнта шаблоном?'))return;
  if(btn)btn.disabled=true;
  try{
    await api('/trainer/program-templates/'+templateId+'/apply',{method:'POST',body:JSON.stringify({client_id})});
    document.getElementById('programTemplateAssignModal')?.remove();
    window.trainerProgramsMode='assigned';await showTrainerPrograms();
  }catch(e){if(btn)btn.disabled=false;alert(e.message||'Не вдалося призначити шаблон')}
}

async function deleteProgramTemplate(templateId){
  if(!confirm('Видалити цей шаблон? Уже призначені клієнтам програми не зміняться.'))return;
  await api('/trainer/program-templates/'+templateId,{method:'DELETE'});
  await showTrainerPrograms();
}


async function showTrainerNutrition(){
 currentTrainerMainView='nutrition';selected=null;window.currentClientData=null;
 let cs=(await loadClients()).filter(c=>c.status!=='Видалений'&&clientAccess(c).features?.meal_plan);
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

function trainerProfileAvatarEditorHTML(p){
  return '<div class="trainer-profile-editor-avatar '+(p.avatar_url?'has-photo':'')+'">'
    +(p.avatar_url?'<img src="'+esc(p.avatar_url)+'" alt="Фото тренера">':'<span>'+esc(trainerClientInitials({name:p.display_name||'Тренер'}))+'</span>')
  +'</div>';
}

async function showTrainerPublicProfileEditor(){
 currentTrainerMainView='more';selected=null;window.currentClientData=null;
 let p=await api('/trainer/profile');
 let checked=v=>v?'checked':'';
 let rating=+p.rating_count>0?Number(p.rating_avg||0).toFixed(1)+' ★ · '+p.rating_count+' відгуків':'Ще без оцінок';
 app.innerHTML=shell('<div class="trainer-more-page modern trainer-public-profile-editor">'
   +'<div class="trainer-page-title trainer-more-title"><div><h1>Профіль тренера</h1><p class="trainer-page-sub">Саме так тебе бачитимуть клієнти у каталозі ЄПЛАН.</p></div></div>'
   +'<div class="trainer-profile-editor-preview card">'+trainerProfileAvatarEditorHTML(p)+'<div><strong>'+esc(p.display_name||'Тренер ЄПЛАН')+'</strong><span>'+esc(p.headline||'Додай коротке позиціонування')+'</span><small>'+esc(rating)+'</small></div><label class="trainer-avatar-upload"><input id="tpAvatarFile" type="file" accept="image/*" onchange="openTrainerAvatarCropper(this)"><span>'+uiIcon('edit')+' Змінити фото</span></label></div>'
   +'<div class="trainer-profile-editor-stats"><div><strong>'+esc(String(+p.active_clients||0))+'</strong><span>ведеш зараз</span></div><div><strong>'+esc(String(+p.total_clients||0))+'</strong><span>клієнтів всього</span></div><div><strong>'+esc(String(+p.experience_years||0))+'</strong><span>років досвіду</span></div></div>'
   +'<div class="card trainer-public-profile-card">'
     +'<label><span>Ім’я у профілі</span><input id="tpName" value="'+esc(p.display_name||'')+'"></label>'
     +'<label><span>Короткий опис</span><input id="tpHeadline" value="'+esc(p.headline||'')+'" placeholder="Наприклад: набір м’язів · силові · онлайн"></label>'
     +'<label><span>Про себе</span><textarea id="tpBio" placeholder="Підхід, досвід, кому ти допомагаєш">'+esc(p.bio||'')+'</textarea></label>'
     +'<div class="trainer-public-profile-two"><label><span>Досвід, років</span><input id="tpExperience" type="number" min="0" max="100" value="'+(+p.experience_years||0)+'"></label><label><span>Максимум активних клієнтів</span><input id="tpCapacity" type="number" min="0" max="10000" value="'+(+p.max_active_clients||0)+'" placeholder="0 = без ліміту"></label></div>'
     +'<label><span>Спеціалізації</span><input id="tpSpecialties" value="'+esc(p.specialties||'')+'" placeholder="Набір м’язів, схуднення, силові тренування"></label>'
     +'<div class="trainer-public-profile-social-grid"><label><span>Instagram</span><input id="tpInstagram" value="'+esc(p.instagram||'')+'" placeholder="@username"></label><label><span>Telegram</span><input id="tpTelegram" value="'+esc(p.telegram||'')+'" placeholder="@username"></label><label><span>TikTok</span><input id="tpTiktok" value="'+esc(p.tiktok||'')+'" placeholder="@username"></label></div>'
     +'<label class="trainer-public-profile-check"><input id="tpAccepting" type="checkbox" '+checked(p.accepting_clients)+'><span>Набираю нових клієнтів</span></label>'
     +'<label class="trainer-public-profile-check"><input id="tpPublished" type="checkbox" '+checked(p.is_published)+'><span>Показувати профіль у каталозі</span></label>'
     +'<button class="trainer-public-profile-save" onclick="saveTrainerPublicProfile(this)">Зберегти профіль</button>'
   +'</div>'
 +'</div>');
}

let trainerAvatarCropState=null;

function closeTrainerAvatarCropper(){
  let state=trainerAvatarCropState;
  if(state?.objectUrl)URL.revokeObjectURL(state.objectUrl);
  if(state?.input)state.input.value='';
  trainerAvatarCropState=null;
  document.getElementById('trainerAvatarCropModal')?.remove();
}

function clampTrainerAvatarCrop(){
  let s=trainerAvatarCropState;if(!s)return;
  let scale=s.baseScale*s.zoom,w=s.naturalWidth*scale,h=s.naturalHeight*scale;
  s.x=Math.min(0,Math.max(s.size-w,s.x));
  s.y=Math.min(0,Math.max(s.size-h,s.y));
}

function renderTrainerAvatarCrop(){
  let s=trainerAvatarCropState,img=document.getElementById('trainerAvatarCropImage');if(!s||!img)return;
  let scale=s.baseScale*s.zoom;
  clampTrainerAvatarCrop();
  img.style.width=(s.naturalWidth*scale)+'px';
  img.style.height=(s.naturalHeight*scale)+'px';
  img.style.transform='translate3d('+s.x+'px,'+s.y+'px,0)';
}

function setTrainerAvatarCropZoom(value){
  let s=trainerAvatarCropState;if(!s)return;
  let oldScale=s.baseScale*s.zoom,newZoom=Math.max(1,Math.min(3,+value||1)),newScale=s.baseScale*newZoom;
  let cx=(s.size/2-s.x)/oldScale,cy=(s.size/2-s.y)/oldScale;
  s.zoom=newZoom;
  s.x=s.size/2-cx*newScale;
  s.y=s.size/2-cy*newScale;
  renderTrainerAvatarCrop();
}

function bindTrainerAvatarCropDrag(viewport){
  let active=false,lastX=0,lastY=0;
  viewport.addEventListener('pointerdown',e=>{
    if(!trainerAvatarCropState)return;
    active=true;lastX=e.clientX;lastY=e.clientY;
    viewport.setPointerCapture?.(e.pointerId);
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove',e=>{
    if(!active||!trainerAvatarCropState)return;
    trainerAvatarCropState.x+=e.clientX-lastX;
    trainerAvatarCropState.y+=e.clientY-lastY;
    lastX=e.clientX;lastY=e.clientY;
    renderTrainerAvatarCrop();
  });
  let finish=e=>{
    if(!active)return;
    active=false;viewport.classList.remove('is-dragging');
    try{viewport.releasePointerCapture?.(e.pointerId)}catch{}
  };
  viewport.addEventListener('pointerup',finish);
  viewport.addEventListener('pointercancel',finish);
}

async function openTrainerAvatarCropper(input){
  let file=input?.files?.[0];if(!file)return;
  if(!String(file.type||'').startsWith('image/')){
    input.value='';return alert('Обери файл зображення.');
  }
  document.getElementById('trainerAvatarCropModal')?.remove();
  let objectUrl=URL.createObjectURL(file);
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal trainer-avatar-crop-modal" id="trainerAvatarCropModal">'
    +'<div class="card trainer-avatar-crop-card">'
      +'<div class="trainer-avatar-crop-head"><div><h2>Фото профілю</h2><p>Перетягни фото та збільш його, щоб обрати потрібну область.</p></div><button type="button" class="dark" onclick="closeTrainerAvatarCropper()">✕</button></div>'
      +'<div class="trainer-avatar-crop-stage"><div class="trainer-avatar-crop-viewport" id="trainerAvatarCropViewport"><img id="trainerAvatarCropImage" alt=""><span class="trainer-avatar-crop-shade"></span><span class="trainer-avatar-crop-ring"></span></div></div>'
      +'<div class="trainer-avatar-crop-zoom"><span>−</span><input id="trainerAvatarCropZoom" type="range" min="1" max="3" step="0.01" value="1" oninput="setTrainerAvatarCropZoom(this.value)"><span>＋</span></div>'
      +'<div class="trainer-avatar-crop-actions"><button type="button" class="dark" onclick="closeTrainerAvatarCropper()">Скасувати</button><button type="button" class="trainer-avatar-crop-save" onclick="saveTrainerAvatarCrop(this)">Використати фото</button></div>'
    +'</div></div>');
  let img=document.getElementById('trainerAvatarCropImage'),viewport=document.getElementById('trainerAvatarCropViewport');
  img.onload=()=>{
    let size=viewport.clientWidth||280,nw=img.naturalWidth||1,nh=img.naturalHeight||1,baseScale=Math.max(size/nw,size/nh);
    trainerAvatarCropState={input,file,objectUrl,naturalWidth:nw,naturalHeight:nh,size,baseScale,zoom:1,x:(size-nw*baseScale)/2,y:(size-nh*baseScale)/2};
    bindTrainerAvatarCropDrag(viewport);
    renderTrainerAvatarCrop();
  };
  img.onerror=()=>{
    URL.revokeObjectURL(objectUrl);input.value='';
    document.getElementById('trainerAvatarCropModal')?.remove();
    trainerAvatarCropState=null;
    alert('Не вдалося відкрити це фото. Спробуй інше зображення.');
  };
  img.src=objectUrl;
}

function trainerAvatarCanvasBlob(canvas,quality=.86){
  return new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
}

async function saveTrainerAvatarCrop(btn){
  let s=trainerAvatarCropState;if(!s)return;
  if(btn){btn.disabled=true;btn.textContent='Обробляємо…'}
  try{
    let scale=s.baseScale*s.zoom,ringInset=12,cropSize=s.size-ringInset*2;
    clampTrainerAvatarCrop();
    let sx=Math.max(0,(ringInset-s.x)/scale),sy=Math.max(0,(ringInset-s.y)/scale),sw=cropSize/scale,sh=cropSize/scale;
    let source=document.getElementById('trainerAvatarCropImage');
    let canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    let ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Не вдалося обробити фото');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(source,sx,sy,sw,sh,0,0,512,512);
    let blob=null;
    for(let quality of [.86,.72,.58,.46]){
      blob=await trainerAvatarCanvasBlob(canvas,quality);
      if(blob&&blob.size<=360*1024)break;
    }
    if(!blob||blob.size>420*1024)throw new Error('Не вдалося достатньо зменшити фото');
    let form=new FormData();form.append('file',blob,'avatar.jpg');
    if(btn)btn.textContent='Завантажуємо…';
    let response=await eplanFetch(A+'/trainer/profile/avatar',{method:'POST',body:form});
    if(!response.ok){let body={};try{body=await response.json()}catch{};throw new Error(body.detail||'Не вдалося завантажити фото')}
    closeTrainerAvatarCropper();
    await showTrainerPublicProfileEditor();
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='Використати фото'}
    alert(e.message||'Не вдалося завантажити фото');
  }
}

async function saveTrainerPublicProfile(btn){
 if(btn)btn.disabled=true;
 try{
   await api('/trainer/profile',{method:'PATCH',body:JSON.stringify({
     display_name:document.getElementById('tpName')?.value||'',
     headline:document.getElementById('tpHeadline')?.value||'',
     bio:document.getElementById('tpBio')?.value||'',
     experience_years:+document.getElementById('tpExperience')?.value||0,
     max_active_clients:+document.getElementById('tpCapacity')?.value||0,
     specialties:document.getElementById('tpSpecialties')?.value||'',
     instagram:document.getElementById('tpInstagram')?.value||'',
     telegram:document.getElementById('tpTelegram')?.value||'',
     tiktok:document.getElementById('tpTiktok')?.value||'',
     accepting_clients:!!document.getElementById('tpAccepting')?.checked,
     is_published:!!document.getElementById('tpPublished')?.checked
   })});
   await showTrainerPublicProfileEditor();
 }catch(e){
   if(btn)btn.disabled=false;
   alert(e.message||'Не вдалося зберегти профіль');
 }
}

function trainerRequestStatusLabel(status){
 return status==='accepted'?'Прийнято':status==='declined'?'Відхилено':'Новий';
}

async function showTrainerCoachRequests(){
 currentTrainerMainView='more';selected=null;window.currentClientData=null;
 let xs=await api('/trainer/requests');
 let rows=xs.map(x=>{
   let pending=x.status==='pending';
   return '<div class="card trainer-coach-request">'
     +'<div class="trainer-coach-request-head"><div><strong>'+esc(x.client_name||'Клієнт')+'</strong><small>'+esc(x.client_email||'')+'</small></div><span class="trainer-coach-request-status '+esc(x.status)+'">'+esc(trainerRequestStatusLabel(x.status))+'</span></div>'
     +(x.message?'<p>'+esc(x.message)+'</p>':'<p class="muted">Без повідомлення.</p>')
     +(pending?'<div class="trainer-coach-request-actions"><button onclick="updateTrainerCoachRequest('+x.id+',\'accepted\')">Прийняти</button><button class="dark" onclick="updateTrainerCoachRequest('+x.id+',\'declined\')">Відхилити</button></div>':'')
   +'</div>';
 }).join('');
 app.innerHTML=shell(`<div class="trainer-more-page modern trainer-coach-requests-page">
   <div class="trainer-page-title trainer-more-title"><div><h1>Запити на ведення</h1><p class="trainer-page-sub">Клієнти, які обрали тебе у каталозі тренерів.</p></div></div>
   ${rows||'<div class="trainer-empty">Запитів поки немає.</div>'}
 </div>`);
}

async function updateTrainerCoachRequest(id,status){
 await api('/trainer/requests/'+id,{method:'PATCH',body:JSON.stringify({status})});
 await showTrainerCoachRequests();
}

function showTrainerMore(){
 currentTrainerMainView='more';selected=null;window.currentClientData=null;
 app.innerHTML=shell(`<div class="trainer-more-page modern">
   <div class="trainer-page-title trainer-more-title"><h1>Більше</h1></div>
   <div class="trainer-more-list modern">
     <button class="trainer-more-item" onclick="showTrainerPublicProfileEditor()">
       <span class="trainer-more-icon">${uiIcon('user')}</span>
       <span class="trainer-more-copy"><strong>Мій профіль тренера</strong><small>Публічна сторінка у каталозі</small></span>
       <span class="trainer-more-chevron">›</span>
     </button>
     <button class="trainer-more-item" onclick="showTrainerCoachRequests()">
       <span class="trainer-more-icon">${uiIcon('users')}</span>
       <span class="trainer-more-copy"><strong>Запити на ведення</strong><small>Клієнти, які обрали тебе</small></span>
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
 await openClient(cid,'program');
 setTimeout(()=>{if(typeof openFirstPendingWorkout==='function')openFirstPendingWorkout()},100);
}

async function quickExtendFromCard(cid,months){
 let clients=await loadClients(),c=clients.find(x=>x.id===cid);if(!c)return;
 let until=isoAddMonthsFrom(c.access?.access_until||'',months);
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


function localISODate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function isoAddMonthsFrom(value,n){
 let now=new Date(),today=localISODate(now),base=value&&value>=today?new Date(value+'T12:00:00'):new Date(today+'T12:00:00'),day=base.getDate();
 base.setDate(1);base.setMonth(base.getMonth()+n);
 let last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
 base.setDate(Math.min(day,last));
 return localISODate(base);
}

function trainerAccessHTML(c){
 let a=clientAccess(c),cls=(a.expired||a.manually_frozen)?'off':(a.days_left!==null&&a.days_left<=7?'warn':'ok'),days=a.days_left===null?'Безстроково':a.days_left<0?'Закінчився':`${a.days_left} дн.`;
 let summary=`<div class="access-saved" id="accessSavedView"><div><h2>Доступ до застосунку</h2><div class="access-saved-main"><span class="access-pill ${cls}">${a.expired?'Закінчився':a.manually_frozen?'Заморожено':'Активний'}</span><span class="access-pill">${esc(a.plan_name)}</span><span class="access-pill">${days}</span>${a.access_until?`<span class="access-pill">до ${esc(a.access_until)}</span>`:''}</div></div><button class="dark" onclick="toggleAccessEdit(true)">Редагувати</button></div>`;
 let editor=`<div id="accessEditBox" class="access-edit-box hidden">
   <div class="access-editor-head"><small>РЕДАГУВАННЯ ДОСТУПУ</small><strong>Тариф і термін</strong></div>
   <div class="access-grid">
     <div class="access-field"><label for="accessPlan">Тариф</label><select id="accessPlan"><option value="coaching" ${a.plan_code==='coaching'?'selected':''}>Онлайн-ведення</option><option value="workout_nutrition" ${a.plan_code==='workout_nutrition'?'selected':''}>План тренувань + харчування</option><option value="workout_plan" ${a.plan_code==='workout_plan'?'selected':''}>План тренувань</option><option value="self" ${a.plan_code==='self'?'selected':''}>ЄПЛАН Самостійно</option><option value="free" ${a.plan_code==='free'?'selected':''}>Free</option></select></div>
     <div class="access-field"><label for="accessUntil">Доступ до</label><input id="accessUntil" type="date" value="${esc(a.access_until||'')}"></div>
   </div>
   <div class="access-quick-title">Швидко продовжити</div>
   <div class="access-quick-actions"><button type="button" onclick="quickAccess(${c.id},1)">+ 1 місяць</button><button type="button" onclick="quickAccess(${c.id},3)">+ 3 місяці</button><button type="button" onclick="quickAccess(${c.id},6)">+ 6 місяців</button></div>
   <div class="access-editor-actions"><button id="accessSaveBtn" class="access-primary" onclick="saveClientAccess(${c.id},this)">Зберегти доступ</button><button type="button" class="access-secondary" onclick="toggleAccessEdit(false)">Скасувати</button></div>
   <div class="access-editor-note"><span>i</span><p>Після завершення строку клієнт автоматично переходить у режим перегляду. Дані не видаляються.</p></div>
 </div>`;
 return `<div class="card access-card">${summary}${editor}</div>`;
}

function toggleAccessEdit(show){let box=document.getElementById('accessEditBox'),view=document.getElementById('accessSavedView');if(box)box.classList.toggle('hidden',!show);if(view){let b=view.querySelector('button');if(b)b.style.display=show?'none':''}}

function quickAccess(cid,m){
 let input=document.getElementById('accessUntil');if(!input)return;
 input.value=isoAddMonthsFrom(input.value,m);
 input.dispatchEvent(new Event('change',{bubbles:true}));
}

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
   ${trainerNotesHTML(d,c.id)}
 `;
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
     <button data-tab="progress" onclick="showTrainerClientTab('progress',this)">Прогрес</button>
   </div>
   <div id="profile" class="tab">${profile}</div>
   <div id="program" class="tab hidden">${trainerSafePane(()=>trainerTrainingTabHTML(d),'program')}</div>
   <div id="results" class="tab hidden">${trainerSafePane(()=>trainerMeasurementsResultsHTML(d),'measurements')}</div>
   <div id="nutrition" class="tab hidden">${trainerSafePane(()=>nutritionHTML(d),'nutrition')}</div>
   <div id="progress" class="tab hidden">${trainerSafePane(()=>trainerProgressHTML(d),'progress')}</div>
 </div>`);
 refreshTrainerGlobalBadge();
 let requestedTab=activeTab||'profile';
 if(requestedTab==='notes')requestedTab='profile';
 if(requestedTab==='calendar')requestedTab='progress';
 if(!['profile','program','results','nutrition','progress'].includes(requestedTab))requestedTab='profile';
 currentTrainerTab=requestedTab;
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
 let canReview=!!clientAccess((window.currentClientData||{}).client||{}).features?.checkin;
 return '<div class="trainer-checkin-grid"><span>Самопочуття <b>'+x.mood+'/5</b></span><span>Сон <b>'+x.sleep+'/5</b></span><span>Енергія <b>'+x.energy+'/5</b></span><span>Голод <b>'+x.hunger+'/5</b></span><span>Складність <b>'+x.difficulty+'/5</b></span></div>'
   +(x.comment?'<p>'+esc(x.comment)+'</p>':'')
   +(!x.reviewed&&canReview?'<button onclick="reviewTrainerCheckin('+cid+','+x.id+')">Позначити переглянутим</button>':x.reviewed?'<span class="trainer-checkin-reviewed">Переглянуто ✓</span>':'<span class="trainer-checkin-reviewed">Лише перегляд</span>');
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
