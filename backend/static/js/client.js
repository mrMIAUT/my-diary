// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function showClientSection(section){
 let d=window.currentClientData,c=d?.client;if(!d||!c)return clientCabinet(session.client_id);
 if(section!=='history')window.progressHistoryReturn=false;
 let feature={mealplan:'meal_plan',measurements:'measurements'}[section];
 if(feature&&!hasFeature(feature,c)){alert('Ця функція недоступна у вашому тарифі.');return}
 currentClientView=section;
 let html='';
 if(section==='mealplan')html=`<h1>План харчування</h1><div class="card"><h2>Моє харчування</h2><div class="daily-macros-line"><div class="daily-macro"><strong>${c.kcal||0}</strong><br>ккал</div><div class="daily-macro"><strong>${c.protein||0}</strong><br>Б</div><div class="daily-macro"><strong>${c.fat||0}</strong><br>Ж</div><div class="daily-macro"><strong>${c.carbs||0}</strong><br>В</div></div></div>${clientMealPlanHTML(d)||'<div class="card"><div class="empty-state"><strong>План харчування ще не додано.</strong>Коли тренер додасть план, він з’явиться тут.</div></div>'}`;
 else if(section==='measurements')html=`<h1>Заміри</h1>${clientMeasurementsHTML(d,c.id)}`;
 else if(section==='progress')html=`<div class="client-section-page redesign-progress-shell"><h1>Прогрес</h1>${clientProgressHTML(d)}</div>`;
 else if(section==='history')html=`${window.progressHistoryReturn?'<button class="unified-back-button" onclick="returnFromProgressHistory()" aria-label="Назад">‹</button>':''}<h1>Історія</h1><div id="clientCalendar">${calendarHTML(d,'client')}</div>`;
 app.innerHTML=shell(html);refreshNotificationBadge(c.id,'client','clientNotifyBtn');
}

function toggleClientPanel(id,btn){let el=$('#'+id);if(!el)return;el.classList.toggle('hidden');let a=btn.querySelector('.arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';setTimeout(toggleCardioFields,0)}


function profileVal(v){return esc(v==null?'':String(v))}

function socialHref(kind,v){
 v=String(v||'').trim();if(!v)return '';
 if(/^https?:\/\//i.test(v))return v;
 let u=v.replace(/^@/,'').replace(/^\/+/,'');
 if(kind==='instagram')return 'https://instagram.com/'+u;
 if(kind==='telegram')return 'https://t.me/'+u;
 if(kind==='tiktok')return 'https://www.tiktok.com/@'+u;
 return '';
}

function socialIcon(kind){
 if(kind==='instagram')return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`;
 if(kind==='telegram')return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4L3.8 10.6c-1.2.5-1.2 1.2-.2 1.5l4.4 1.4 1.7 5.2c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.1-2 4.4 3.2c.8.4 1.4.2 1.6-.8L22 5.2c.3-1.1-.4-1.6-1-1.2z"/><path d="M8 13.5L18.7 7"/></svg>`;
 return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3v11.2a4.7 4.7 0 1 1-4-4.6v3.1a1.8 1.8 0 1 0 1 1.6V3h3zM14.5 3c.7 2.6 2.3 4.1 5 4.5v3.1c-2-.1-3.7-.8-5-2"/></svg>`;
}

function legacySocial(c){
 let v=String(c.contact||'').trim();if(!v)return {};
 let raw=/^https?:\/\//i.test(v)?v:'https://'+v;
 try{
  let u=new URL(raw),host=u.hostname.toLowerCase().replace(/\.$/,'');
  if(host==='instagram.com'||host==='www.instagram.com')return {instagram:v};
  if(host==='t.me'||host==='telegram.me'||host==='www.telegram.me')return {telegram:v};
  if(host==='tiktok.com'||host==='www.tiktok.com')return {tiktok:v};
 }catch(e){}
 return {};
}

function socialContactsHTML(c){
 let legacy=legacySocial(c),items=[
  ['instagram',c.instagram||legacy.instagram],
  ['telegram',c.telegram||legacy.telegram],
  ['tiktok',c.tiktok||legacy.tiktok]
 ].filter(x=>x[1]);
 if(!items.length)return '<strong>—</strong>';
 return `<div class="profile-socials">${items.map(([k,v])=>`<a class="profile-social ${k}" href="${esc(socialHref(k,v))}" target="_blank" rel="noopener" aria-label="${k}">${socialIcon(k)}</a>`).join('')}</div>`;
}

function clientProfileAvatarHTML(c,cid){
 let inner='<span class="avatar-initials avatar-initials-large">'+esc(clientInitials(c))+'</span>';
 let name=[c.first_name||'',c.last_name||''].filter(Boolean).join(' ').trim()||c.name||'Мій профіль';
 return '<div class="client-profile-hero">'
   +'<div class="client-profile-avatar is-placeholder" aria-label="Аватар профілю">'+inner+'</div>'
   +'<h1>'+esc(name)+'</h1>'
   +'<button type="button" class="client-profile-edit-btn" onclick="editClientProfile('+cid+')">Редагувати профіль</button>'
 +'</div>';
}

function showClientProfile(cid){
 let c=(window.currentClientData||{}).client||{},health=[c.contraindications,c.injuries].map(x=>String(x||'').trim()).filter(Boolean).join('\n');currentClientView='profile';
 app.innerHTML=shell(`<div class="client-section-page client-profile-page">${clientProfileAvatarHTML(c,cid)}<div class="card client-profile-details"><div class="grid" style="margin-top:14px"><div><div class="muted">Ім’я</div><strong>${profileVal(c.first_name||c.name||'—')}</strong></div><div><div class="muted">Прізвище</div><strong>${profileVal(c.last_name||'—')}</strong></div><div><div class="muted">Вік</div><strong>${c.age?profileVal(c.age):'—'}</strong></div><div><div class="muted">Стать</div><strong>${profileVal(c.sex||'—')}</strong></div><div><div class="muted">Зв’язок</div>${socialContactsHTML(c)}</div></div><div style="margin-top:16px"><div class="muted">Моя ціль</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.goal||'Не вказано')}</div></div><div style="margin-top:16px"><div class="muted">Протипоказання та травми</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(health||'Не вказано')}</div></div></div></div>`);
 history.pushState({eplanPage:'clientProfile',cid},'',location.href);
}

function editClientProfile(cid){
 let c=(window.currentClientData||{}).client||{};
 let combinedHealth=[c.contraindications,c.injuries].map(x=>String(x||'').trim()).filter(Boolean).join('\n');
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="profileModal"><div class="card profile-editor-card"><div class="profile-modal-sticky"><div class="profile-modal-head"><h2>Мій кабінет</h2></div><button class="profile-close" onclick="profileModal.remove()" aria-label="Закрити">×</button></div><div class="profile-modal-body"><div class="grid profile-grid"><div class="profile-field"><label>Ім’я</label><input id="pfFirst" placeholder="Ім’я" value="${profileVal(c.first_name||c.name||'')}"></div><div class="profile-field"><label>Прізвище</label><input id="pfLast" placeholder="Прізвище" value="${profileVal(c.last_name||'')}"></div><div class="profile-field"><label>Вік</label><input id="pfAge" type="number" placeholder="Вік" value="${c.age||''}"></div><div class="profile-field profile-wide"><label>Стать</label><select id="pfSex"><option value="">Оберіть стать</option><option ${c.sex==='Чоловіча'?'selected':''}>Чоловіча</option><option ${c.sex==='Жіноча'?'selected':''}>Жіноча</option><option ${c.sex==='Інше'?'selected':''}>Інше</option></select></div><div class="profile-field profile-wide"><label>Моя ціль</label><textarea id="pfGoal" placeholder="Наприклад: набрати м’язову масу, схуднути або покращити форму">${profileVal(c.goal||'')}</textarea></div><div class="profile-field profile-wide"><label>Instagram</label><input id="pfInstagram" placeholder="@username або посилання" value="${profileVal(c.instagram||legacySocial(c).instagram||'')}"></div><div class="profile-field profile-wide"><label>Telegram</label><input id="pfTelegram" placeholder="@username або посилання" value="${profileVal(c.telegram||legacySocial(c).telegram||'')}"></div><div class="profile-field profile-wide"><label>TikTok</label><input id="pfTikTok" placeholder="@username або посилання" value="${profileVal(c.tiktok||legacySocial(c).tiktok||'')}"><span class="profile-hint">Усі поля необов’язкові. Можна додати одну, дві або всі три соцмережі.</span></div><div class="profile-field profile-wide"><label>Протипоказання та травми</label><textarea id="pfHealth" placeholder="Опишіть протипоказання або травми, якщо вони є">${profileVal(combinedHealth)}</textarea><span class="profile-hint">Наприклад: проблеми з тиском, суглобами, травми коліна, спини або плеча.</span></div></div><p id="profileErr" class="muted"></p><button class="profile-save" onclick="saveClientProfile(${cid})">Зберегти зміни</button></div></div></div>`)
}

async function saveClientProfile(cid){
 try{await api('/client/'+cid+'/profile',{method:'PATCH',body:JSON.stringify({first_name:pfFirst.value,last_name:pfLast.value,age:+pfAge.value||0,sex:pfSex.value,goal:pfGoal.value,contraindications:pfHealth.value,injuries:'',contact:'',instagram:pfInstagram.value,telegram:pfTelegram.value,tiktok:pfTikTok.value})});profileModal.remove();let d=await loadClientData(cid);window.currentClientData=d;showClientProfile(cid)}catch(e){profileErr.textContent=e.message}
}
