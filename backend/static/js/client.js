// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function showClientSection(section){
 let d=window.currentClientData,c=d?.client;if(!d||!c)return clientCabinet(session.client_id);
 let feature={mealplan:'meal_plan',measurements:'measurements'}[section];
 if(feature&&!hasFeature(feature,c)){alert('Ця функція недоступна у вашому тарифі.');return}
 currentClientView=section;
 let html='';
 if(section==='mealplan')html=`<h1>План харчування</h1><div class="card"><h2>Моє харчування</h2><div class="daily-macros-line"><div class="daily-macro"><strong>${c.kcal||0}</strong><br>ккал</div><div class="daily-macro"><strong>${c.protein||0}</strong><br>Б</div><div class="daily-macro"><strong>${c.fat||0}</strong><br>Ж</div><div class="daily-macro"><strong>${c.carbs||0}</strong><br>В</div></div></div>${clientMealPlanHTML(d)||'<div class="card"><div class="empty-state"><strong>План харчування ще не додано.</strong>Коли тренер додасть план, він з’явиться тут.</div></div>'}`;
 else if(section==='measurements')html=`<h1>Заміри</h1>${clientMeasurementsHTML(d,c.id)}`;
 else if(section==='progress')html=`<h1>Прогрес</h1>${clientProgressHTML(d)}`;
 else if(section==='history')html=`<h1>Історія</h1><div id="clientCalendar">${calendarHTML(d,'client')}</div>`;
 app.innerHTML=shell(html);refreshNotificationBadge(c.id,'client','clientNotifyBtn');
}

function toggleClientPanel(id,btn){let el=$('#'+id);if(!el)return;el.classList.toggle('hidden');let a=btn.querySelector('.arrow');if(a)a.textContent=el.classList.contains('hidden')?'⌄':'⌃';setTimeout(toggleCardioFields,0)}


function profileVal(v){return esc(v==null?'':String(v))}

function contactHref(v){v=(v||'').trim();if(!v)return '';if(/^https?:\/\//i.test(v))return v;if(/^@/.test(v))return 'https://t.me/'+v.slice(1);if(/^(instagram\.com|t\.me|telegram\.me|www\.)/i.test(v))return 'https://'+v;return ''}

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
 let low=v.toLowerCase();
 if(low.includes('instagram.com'))return {instagram:v};
 if(low.includes('t.me')||low.includes('telegram.me'))return {telegram:v};
 if(low.includes('tiktok.com'))return {tiktok:v};
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

function contactLinkHTML(v){if(!v)return '<strong>—</strong>';let href=contactHref(v);return href?`<a class="contact-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(v)}</a>`:`<strong>${esc(v)}</strong>`}

function clientProfileHTML(c){
 return `<div class="card"><div class="between"><div><h2>Мій кабінет</h2><p class="muted">Особисті дані та інформація, важлива для тренувань.</p></div><button class="dark" onclick="editClientProfile(${c.id})">Редагувати</button></div><div class="grid" style="margin-top:14px"><div><div class="muted">Ім’я</div><strong>${profileVal(c.first_name||c.name||'—')}</strong></div><div><div class="muted">Прізвище</div><strong>${profileVal(c.last_name||'—')}</strong></div><div><div class="muted">Вік</div><strong>${c.age?profileVal(c.age):'—'}</strong></div><div><div class="muted">Стать</div><strong>${profileVal(c.sex||'—')}</strong></div><div><div class="muted">Зв’язок</div>${socialContactsHTML(c)}</div></div><div style="margin-top:16px"><div class="muted">Протипоказання</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.contraindications||'Не вказано')}</div></div><div style="margin-top:16px"><div class="muted">Травми</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.injuries||'Не вказано')}</div></div></div>`
}

function showClientProfile(cid){
 let c=(window.currentClientData||{}).client||{};currentClientView='profile';
 app.innerHTML=shell(`<div class="client-section-page"><h1>Мій профіль</h1><div class="card"><p class="muted">Особисті дані та інформація, важлива для тренувань.</p><div class="grid" style="margin-top:14px"><div><div class="muted">Ім’я</div><strong>${profileVal(c.first_name||c.name||'—')}</strong></div><div><div class="muted">Прізвище</div><strong>${profileVal(c.last_name||'—')}</strong></div><div><div class="muted">Вік</div><strong>${c.age?profileVal(c.age):'—'}</strong></div><div><div class="muted">Стать</div><strong>${profileVal(c.sex||'—')}</strong></div><div><div class="muted">Зв’язок</div>${socialContactsHTML(c)}</div></div><div style="margin-top:16px"><div class="muted">Протипоказання</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.contraindications||'Не вказано')}</div></div><div style="margin-top:16px"><div class="muted">Травми</div><div style="white-space:pre-wrap;margin-top:5px">${profileVal(c.injuries||'Не вказано')}</div></div><button style="margin-top:20px" onclick="editClientProfile(${cid})">Редагувати анкету</button></div></div>`);
 history.pushState({eplanPage:'clientProfile',cid},'',location.href);
}

function editClientProfile(cid){
 let c=(window.currentClientData||{}).client||{};
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="profileModal"><div class="card"><div class="profile-modal-head"><h2>Мій кабінет</h2><p class="muted" style="margin:0">Особисті дані та інформація, важлива для тренувань.</p></div><button class="profile-close" onclick="profileModal.remove()" aria-label="Закрити">×</button><div class="grid profile-grid"><div class="profile-field"><label>Ім’я</label><input id="pfFirst" placeholder="Ім’я" value="${profileVal(c.first_name||c.name||'')}"></div><div class="profile-field"><label>Прізвище</label><input id="pfLast" placeholder="Прізвище" value="${profileVal(c.last_name||'')}"></div><div class="profile-field"><label>Вік</label><input id="pfAge" type="number" placeholder="Вік" value="${c.age||''}"></div><div class="profile-field profile-wide"><label>Стать</label><select id="pfSex"><option value="">Оберіть стать</option><option ${c.sex==='Чоловіча'?'selected':''}>Чоловіча</option><option ${c.sex==='Жіноча'?'selected':''}>Жіноча</option><option ${c.sex==='Інше'?'selected':''}>Інше</option></select></div><div class="profile-field profile-wide"><label>Instagram</label><input id="pfInstagram" placeholder="@username або посилання" value="${profileVal(c.instagram||legacySocial(c).instagram||'')}"></div><div class="profile-field profile-wide"><label>Telegram</label><input id="pfTelegram" placeholder="@username або посилання" value="${profileVal(c.telegram||legacySocial(c).telegram||'')}"></div><div class="profile-field profile-wide"><label>TikTok</label><input id="pfTikTok" placeholder="@username або посилання" value="${profileVal(c.tiktok||legacySocial(c).tiktok||'')}"><span class="profile-hint">Усі поля необов’язкові. Можна додати одну, дві або всі три соцмережі.</span></div><div class="profile-field profile-wide"><label>Протипоказання</label><textarea id="pfContra" placeholder="Опишіть протипоказання, якщо вони є">${profileVal(c.contraindications||'')}</textarea><span class="profile-hint">Наприклад: проблеми з серцем, тиском, суглобами тощо.</span></div><div class="profile-field profile-wide"><label>Травми</label><textarea id="pfInjuries" placeholder="Опишіть травми, якщо вони є">${profileVal(c.injuries||'')}</textarea><span class="profile-hint">Наприклад: травми коліна, спини, плеча тощо.</span></div></div><p id="profileErr" class="muted"></p><button onclick="saveClientProfile(${cid})">Зберегти зміни</button></div></div>`)
}

async function saveClientProfile(cid){
 try{await api('/client/'+cid+'/profile',{method:'PATCH',body:JSON.stringify({first_name:pfFirst.value,last_name:pfLast.value,age:+pfAge.value||0,sex:pfSex.value,contraindications:pfContra.value,injuries:pfInjuries.value,contact:'',instagram:pfInstagram.value,telegram:pfTelegram.value,tiktok:pfTikTok.value})});profileModal.remove();let d=await api('/client/'+cid);window.currentClientData=d;showClientProfile(cid)}catch(e){profileErr.textContent=e.message}
}


function onboardingKey(){return 'eplanClientOnboardingV1_'+(session?.client_id||'client')}

function maybeShowClientOnboarding(){if(!session||session.role!=='client')return;try{if(localStorage.getItem(onboardingKey())==='done')return}catch(e){}if(!document.getElementById('clientOnboarding'))showClientOnboarding(0)}

function showClientOnboarding(step=0){
 const steps=[
 {title:'Сьогодні — твій план на день',text:'Тут ти побачиш тренування, активність, БЖВ та все, що потрібно виконати сьогодні.'},
 {title:'Записуй результати під час тренування',text:'Внось вагу, повтори та RIR після підходів. Дані збережуться в історії та допоможуть відстежувати прогрес.'},
 {title:'Прогрес — тут побачиш зміни',text:'У розділі «Прогрес» зберігаються силові показники, вага та зміни тіла за вибраний період.'}];
 step=Math.max(0,Math.min(step,steps.length-1));let s=steps[step];document.getElementById('clientOnboarding')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div id="clientOnboarding" class="onboarding-overlay"><div class="onboarding-card"><div class="onboarding-step">Крок ${step+1} з ${steps.length}</div><h2>${s.title}</h2><p>${s.text}</p><div class="onboarding-dots">${steps.map((_,i)=>`<span class="${i===step?'active':''}"></span>`).join('')}</div><div class="onboarding-actions">${step<steps.length-1?`<button class="onboarding-skip" onclick="finishClientOnboarding()">Пропустити</button><button onclick="showClientOnboarding(${step+1})">Далі</button>`:`<button onclick="finishClientOnboarding()">Почати користуватися</button>`}</div></div></div>`);syncOverlayLock()
}

function finishClientOnboarding(){try{localStorage.setItem(onboardingKey(),'done')}catch(e){}document.getElementById('clientOnboarding')?.remove();syncOverlayLock()}

async function clientCabinet(id){
 let d=await api('/client/'+id),c=d.client;window.currentClientData=d;let groups={};d.program.forEach(x=>(groups[x.day_name]??=[]).push(x));

 let access=clientAccess(c);
 if(access.expired||access.manually_frozen||access.effective_plan==='free'){
   app.innerHTML=shell(`${accessBannerHTML(c)}<div class="card"><h2>Режим перегляду</h2><p class="muted">Ти можеш переглядати попередні тренування, прогрес та історію. Нові записи недоступні.</p></div><div class="card"><button class="exercise-toggle" onclick="toggleCalendar('clientCalendarBody',this)"><span><strong>Моя історія</strong><span class="muted" style="display:block;margin-top:5px">Усі попередні записи залишаються збереженими</span></span><span class="arrow">⌄</span></button><div id="clientCalendarBody" class="hidden" style="margin-top:14px"><div id="clientCalendar">${calendarHTML(d,'client')}</div></div></div>`);
   refreshNotificationBadge(id,'client','clientNotifyBtn');setTimeout(maybeShowClientOnboarding,180);return;
 }
 let active=(d.workout_sessions||[]).find(x=>x.status==='training');
 let programPart='';
 if(active){
   programPart=`<h1>${esc(active.day_name)}</h1>${restTimerPanelHTML()}<div class="card"><div class="training-live">Тренування триває</div><div style="height:12px"></div>${activeExercisesHTML(groups[active.day_name]||[],d,id)}<div class="finish-workout-wrap"><button class="finish-workout-btn" onclick="finishWorkout(${id},${active.id},this)">Завершити тренування</button></div></div>`;
 }
 currentClientView='home';let nutritionPart=hasFeature('nutrition',c)?dailyNutritionHTML(d,id):`<div class="card plan-lock-card"><strong>🔒 БЖВ та харчування</strong><span class="muted">Доступно в тарифі «Онлайн-ведення».</span></div>`;let cardioPart=hasFeature('cardio',c)?cardioHTML(d,id):'';app.innerHTML=shell(`${accessBannerHTML(c)}<div class="card"><h1>Сьогодні</h1><p class="today-date">${esc(kyivTodayLong())}</p><p class="muted">${esc(c.name)} · ${esc(c.goal||'Твоя програма')}</p></div>${hasFeature('workouts',c)&&!active?todayGuidanceHTML(d,id,groups):''}${active?programPart:''}${hasFeature('workouts',c)?clientTrainingProgramHTML(d,id,groups):''}${hasFeature('workouts',c)?trainingTermsHelpHTML():''}${active?'':programPart}${cardioPart}${nutritionPart}`);refreshNotificationBadge(id,'client','clientNotifyBtn');setTimeout(()=>restoreTodayDrafts(id,hasFeature('cardio',c)&&!(d.cardio||[]).some(x=>x.day===isoToday()),hasFeature('nutrition',c)&&!(d.nutrition||[]).some(x=>x.day===isoToday())),0);setTimeout(toggleCardioFields,0);setTimeout(maybeShowClientOnboarding,180)
}
