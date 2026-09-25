// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function offDb(){return new Promise((ok,no)=>{let q=indexedDB.open(OFFDB,OFFVER);q.onupgradeneeded=()=>{let d=q.result;if(!d.objectStoreNames.contains('cache'))d.createObjectStore('cache');if(!d.objectStoreNames.contains('queue'))d.createObjectStore('queue',{keyPath:'id',autoIncrement:true})};q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}

async function offGet(store,key){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readonly').objectStore(store).get(key);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}

async function offPut(store,val,key){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readwrite').objectStore(store).put(val,key);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}

async function offAdd(store,val){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readwrite').objectStore(store).add(val);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}

async function offAll(store){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readonly').objectStore(store).getAll();q.onsuccess=()=>ok(q.result||[]);q.onerror=()=>no(q.error)})}

async function offDel(store,key){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readwrite').objectStore(store).delete(key);q.onsuccess=()=>ok();q.onerror=()=>no(q.error)})}

function offBody(opt){try{return opt?.body?JSON.parse(opt.body):{}}catch{return {}}}

function offToday(){return new Date().toLocaleDateString('sv-SE')}

function offClientKey(cid){return '/client/'+cid}

async function offClient(cid){return await offGet('cache',offClientKey(cid))}

async function offSaveClient(cid,d){if(d)await offPut('cache',d,offClientKey(cid))}

async function offApply(path,opt,localSid){
 let b=offBody(opt),m=(opt.method||'GET').toUpperCase(),cid=b.client_id||session?.client_id, d=cid?await offClient(cid):null;
 if(!d)return;
 if(path==='/result-sets'&&m==='POST'){d.result_sets=(d.result_sets||[]).filter(x=>!(x.program_id==b.program_id&&x.day===offToday()));(b.sets||[]).forEach(x=>d.result_sets.push({...x,id:-Date.now()-x.set_number,client_id:cid,program_id:b.program_id,exercise:b.exercise,day:offToday()}))}
 else if(path==='/nutrition'&&m==='POST'){d.nutrition=d.nutrition||[];d.nutrition.unshift({id:-Date.now(),client_id:cid,day:offToday(),kcal:b.kcal,protein:b.protein,fat:b.fat,carbs:b.carbs})}
 else if(/^\/nutrition\/-?\d+$/.test(path)&&m==='PATCH'){let id=+path.split('/').pop(),x=(d.nutrition||[]).find(x=>x.id==id);if(x)Object.assign(x,b)}
 else if(path==='/history/nutrition'&&m==='POST'){d.nutrition=d.nutrition||[];let x=d.nutrition.find(x=>x.day===b.day);if(x)Object.assign(x,b);else d.nutrition.unshift({id:-Date.now(),...b})}
 else if(path==='/measurements'&&m==='POST'){d.measurements=d.measurements||[];d.measurements.push({id:-Date.now(),day:offToday(),...b})}
 else if(path==='/cardio'&&m==='POST'){d.cardio=d.cardio||[];let day=b.day||offToday(),x=d.cardio.find(x=>x.day===day);if(x)Object.assign(x,b,{day});else d.cardio.unshift({id:-Date.now(),...b,day})}
 else if(path==='/workout/start'&&m==='POST'){d.workout_sessions=d.workout_sessions||[];d.workout_sessions.unshift({id:localSid,client_id:cid,day_name:b.day_name,status:'training',started_at:offToday()+' 12:00:00',program_snapshot:'[]'})}
 else if(/^\/workout\/-\d+\/finish$/.test(path)&&m==='POST'){let id=+path.split('/')[2],x=(d.workout_sessions||[]).find(x=>x.id==id);if(x){x.status='finished';x.finished_at=offToday()+' 13:00:00'}}
 else if(path==='/history/workout'&&m==='POST'){d.workout_sessions=d.workout_sessions||[];d.workout_sessions.unshift({id:-Date.now(),client_id:cid,day_name:b.day_name,status:'finished',started_at:b.day+' 12:00:00',finished_at:b.day+' 13:00:00'});d.result_sets=d.result_sets||[];(b.sets||[]).forEach((x,i)=>d.result_sets.push({...x,id:-Date.now()-i,client_id:cid,day:b.day}))}
 else if(path==='/comments'&&m==='POST'){d.comments=d.comments||[];d.comments.unshift({id:-Date.now(),created_at:new Date().toISOString(),...b})}
 else if(/^\/comments\/-?\d+$/.test(path)&&m==='PUT'){let id=+path.split('/').pop(),x=(d.comments||[]).find(x=>x.id==id);if(x)x.body=b.body}
 await offSaveClient(cid,d);window.currentClientData=d;
}

function offResponse(path,opt,localSid){
 let b=offBody(opt);
 if(path==='/workout/start')return {id:localSid,client_id:b.client_id,day_name:b.day_name,status:'training',started_at:new Date().toISOString()};
 if(/\/finish$/.test(path))return {ok:true,status:'finished'};
 if(path==='/nutrition'||path==='/measurements'||path==='/comments')return {id:-Date.now(),ok:true};
 return {ok:true,offline:true};
}

function offCanQueue(path,opt){
 let m=(opt.method||'GET').toUpperCase();
 if(m==='GET'||!session||session.role!=='client')return false;
 return !path.startsWith('/login')&&!path.startsWith('/password-reset')&&!path.includes('/screenshot')&&!path.startsWith('/notifications');
}

async function offlineStatus(msg,kind=''){
 let el=document.getElementById('offlinePill');if(!el){el=document.createElement('div');el.id='offlinePill';el.className='offline-pill';document.body.appendChild(el)}
 el.textContent=msg;el.className='offline-pill show '+kind;
 if(msg==='✓ Синхронізовано')setTimeout(()=>el.classList.remove('show'),1800);
}

function hideOfflineStatus(){
 let el=document.getElementById('offlinePill');
 if(el){el.classList.remove('show','syncing');el.textContent=''}
}

function setActionLoading(btn,text='Зберігаємо…'){
 if(!btn)return ()=>{};
 const oldText=btn.textContent,oldDisabled=btn.disabled;
 btn.disabled=true;btn.dataset.actionLoading='1';btn.textContent=text;
 return ()=>{btn.disabled=oldDisabled;btn.dataset.actionLoading='0';btn.textContent=oldText};
}

async function eplanFetch(url,opt={},timeoutMs=15000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fetch(url,{...opt,signal:controller.signal})}
 catch(e){
  if(e?.name==='AbortError')throw Object.assign(new Error('Сервер довго не відповідає. Перевір інтернет і спробуй ще раз.'),{network:true,timeout:true});
  throw Object.assign(e||new Error('Помилка мережі'),{network:true});
 }finally{clearTimeout(timer)}
}

function friendlyApiError(status,detail=''){
 if(status>=500)return 'Сервіс тимчасово недоступний. Дані не втрачено — спробуй ще раз через кілька секунд.';
 if(status===429)return 'Забагато запитів. Зачекай кілька секунд і спробуй ще раз.';
 return detail||'Не вдалося виконати дію. Спробуй ще раз.';
}

async function api(path,opt={}){
 let method=(opt.method||'GET').toUpperCase();
 let mutation=!['GET','HEAD','OPTIONS'].includes(method);
 let mutationKey=mutation?method+'|'+path+'|'+String(opt.body||''):'';
 if(mutation&&apiMutationsInFlight.has(mutationKey))return apiMutationsInFlight.get(mutationKey);
 let task=(async()=>{
 try{
   let r=await eplanFetch(A+path,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
   if(!r.ok){let x;try{x=await r.json()}catch{};throw Object.assign(new Error(friendlyApiError(r.status,x?.detail)),{server:true,status:r.status})}
   let data=r.status===204?null:await r.json();
   if(method==='GET')await offPut('cache',data,path);
   return data;
 }catch(e){
   if(e.server)throw e;
   if(method==='GET'){
     let cached=await offGet('cache',path);
     if(cached!==undefined){offlineStatus('● Офлайн · показано збережені дані');return cached}
     throw new Error(e?.timeout?'Сервер довго не відповідає. Перевір інтернет і спробуй ще раз.':'Не вдалося завантажити дані. Перевір інтернет і спробуй ще раз.');
   }
   if(offCanQueue(path,opt)){
     let localSid=path==='/workout/start'?-Date.now():null;
     await offAdd('queue',{path,opt:{method,body:opt.body||null},created:Date.now(),localSid});
     await offApply(path,opt,localSid);
     offlineStatus('● Офлайн · зміни збережено на телефоні');
     return offResponse(path,opt,localSid);
   }
   throw new Error(e?.timeout?'Не вдалося зберегти: сервер довго не відповідає. Перевір інтернет і спробуй ще раз.':'Не вдалося зберегти. Перевір інтернет і спробуй ще раз.');
 }
 })();
 if(!mutation)return task;
 apiMutationsInFlight.set(mutationKey,task);
 try{return await task}finally{apiMutationsInFlight.delete(mutationKey)}
}

async function syncOfflineQueue(){
 if(offSyncing||!navigator.onLine)return;offSyncing=true;
 let q=await offAll('queue');if(!q.length){hideOfflineStatus();offSyncing=false;return}
 offlineStatus('Синхронізація…','syncing');let sidMap={};
 try{
   for(let item of q){
     let path=item.path;
     let neg=path.match(/^\/workout\/(-\d+)\/finish$/);if(neg&&sidMap[neg[1]])path='/workout/'+sidMap[neg[1]]+'/finish';
     let r=await eplanFetch(A+path,{headers:{'Content-Type':'application/json'},method:item.opt.method,body:item.opt.body||undefined},15000);
     if(!r.ok)throw new Error('sync');
     let data=null;try{data=await r.clone().json()}catch{}
     if(item.localSid&&data?.id)sidMap[String(item.localSid)]=data.id;
     await offDel('queue',item.id);
   }
   if(session?.client_id){try{let r=await eplanFetch(A+'/client/'+session.client_id,{},15000);if(r.ok){let d=await r.json();await offSaveClient(session.client_id,d);window.currentClientData=d}}catch{}}
   offlineStatus('✓ Синхронізовано');
 }catch{offlineStatus('● Є дані, що очікують синхронізації')}
 offSyncing=false;
}

function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function enText(s){
 let lead=s.match(/^\s*/)?.[0]||'', trail=s.match(/\s*$/)?.[0]||'', t=s.trim();
 if(!t)return s;
 if(EN_MAP[t])return lead+EN_MAP[t]+trail;
 const months={Січень:'January',Лютий:'February',Березень:'March',Квітень:'April',Травень:'May',Червень:'June',Липень:'July',Серпень:'August',Вересень:'September',Жовтень:'October',Листопад:'November',Грудень:'December'};
 let mm=t.match(/^(Січень|Лютий|Березень|Квітень|Травень|Червень|Липень|Серпень|Вересень|Жовтень|Листопад|Грудень)(\s+\d{4})$/);
 if(mm)return lead+months[mm[1]]+mm[2]+trail;
 // Dynamic labels
 let m=t.match(/^День\s+(\d+)$/); if(m)return lead+'Day '+m[1]+trail;
 m=t.match(/^(\d+)\s+кроків$/); if(m)return lead+m[1]+' steps'+trail;
 m=t.match(/^(\d+)\s+хв$/); if(m)return lead+m[1]+' min'+trail;
 let out=t;
 EN_PARTS.forEach(([a,b])=>{out=out.split(a).join(b)});
 return lead+out+trail;
}

function translateTree(root=document.body){
 if(appLanguage!=='en'||!root)return;
 let walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 nodes.forEach(n=>{n.nodeValue=enText(n.nodeValue)});
 root.querySelectorAll?.('input,textarea,select,button').forEach(el=>{
   if(el.placeholder)el.placeholder=enText(el.placeholder);
   if(el.title)el.title=enText(el.title);
   if(el.getAttribute('aria-label'))el.setAttribute('aria-label',enText(el.getAttribute('aria-label')));
 });
 document.documentElement.lang='en';
}

function setLanguage(lang){appLanguage=lang;localStorage.setItem('eplanLanguage',lang);location.reload()}

function uiIcon(name){const p={menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',user:'<circle cx="12" cy="8" r="3"/><path d="M5 20c.7-4 3.1-6 7-6s6.3 2 7 6"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 20c.6-4 2.7-6 6-6s5.4 2 6 6"/><path d="M16 6.5a2.5 2.5 0 0 1 0 5M17 14c2.2.6 3.5 2.5 4 5"/>',home:'<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',dumbbell:'<path d="M6 8v8M3 9v6M18 8v8M21 9v6M6 12h12"/>',chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',food:'<path d="M7 3v7M4 3v4c0 2 1 3 3 3s3-1 3-3V3M7 10v11M16 3c3 2 4 5 4 9h-4V3Zm0 9v9"/>',measure:'<path d="M4 8h16v8H4z"/><path d="M7 8v4M10 8v2M13 8v4M16 8v2"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',message:'<path d="M4 5h16v12H9l-5 4V5Z"/>',run:'<circle cx="14" cy="4" r="2"/><path d="m10 21 2-7-3-3 3-4 4 3 4 1M12 14l4 3 1 4M9 11l-4 3"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',edit:'<path d="m4 20 4.5-1L19 8.5 15.5 5 5 15.5 4 20Z"/><path d="m13.5 7 3.5 3.5"/>',trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',plus:'<path d="M12 5v14M5 12h14"/>',logout:'<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${p[name]||''}</svg>`}

function socialLinksHTML(){let links=[];const ig=`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1" style="fill:currentColor;stroke:none"></circle></svg>`;const tg=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 9.7 14.3"></path><path d="m21 4-7.2 16-4.1-5.7L3 11.8 21 4Z"></path></svg>`;const tt=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.4 3h3c.3 2.1 1.5 3.6 3.6 4.2v3a8.2 8.2 0 0 1-3.6-1.1v6.1a6.2 6.2 0 1 1-5.3-6.1v3.1a3.2 3.2 0 1 0 2.3 3V3Z"></path></svg>`;if(TRAINER_SOCIALS.instagram)links.push(`<a class="social-link instagram" href="${TRAINER_SOCIALS.instagram}" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">${ig}</a>`);if(TRAINER_SOCIALS.telegram)links.push(`<a class="social-link telegram" href="${TRAINER_SOCIALS.telegram}" target="_blank" rel="noopener" aria-label="Telegram" title="Telegram">${tg}</a>`);if(TRAINER_SOCIALS.tiktok)links.push(`<a class="social-link tiktok" href="${TRAINER_SOCIALS.tiktok}" target="_blank" rel="noopener" aria-label="TikTok" title="TikTok">${tt}</a>`);return `<div class="social-links">${links.join('')}</div>`}

function shell(content){
 let right='';
 if(session&&session.role==='client'&&session.client_id){right=`${socialLinksHTML()}<button id="clientNotifyBtn" class="dark notify-btn" onclick="showNotifications(${session.client_id},'client')">${uiIcon('bell')} <span class="notify-label">Сповіщення</span></button>`}
 if(session&&session.role==='trainer'){right=`<button id="trainerGlobalNotifyBtn" class="dark notify-btn" onclick="showTrainerNotifications()">${uiIcon('bell')} <span class="notify-label">Сповіщення</span></button>`}
 return `<div class="wrap"><div class="top"><div class="top-left"><button class="side-menu-btn" onclick="openSideMenu()" aria-label="Меню">${uiIcon('menu')}</button><div class="brand"><span class="brand-e">Є</span><span class="brand-divider"></span><span class="brand-plan">ПЛАН</span></div></div><div class="top-right">${right}</div></div>${content}</div>`
}

function clientAccess(c=(window.currentClientData||{}).client||{}){return c.access||{plan_code:'coaching',plan_name:'Онлайн-ведення',effective_plan:'coaching',features:{workouts:true,nutrition:true,measurements:true,cardio:true,trainer_review:true,meal_plan:true},expired:false,manually_frozen:false,days_left:null,access_until:''}}

function hasFeature(name,c){return !!clientAccess(c).features?.[name]}

function lockedNav(label,icon,plan='Онлайн-ведення'){return `<button class="side-nav-item locked-feature" onclick="closeSideMenu();alert('Функція «${label}» доступна в тарифі «${plan}».')"><span class="side-nav-icon">${uiIcon(icon)}</span>${label}<span style="margin-left:auto">🔒</span></button>`}

function accessBannerHTML(c){let a=clientAccess(c);if(a.expired||a.manually_frozen)return `<div class="card client-access-banner expired"><strong>${a.expired?'Термін доступу закінчився':'Доступ призупинено'}</strong><p class="muted" style="margin-bottom:0">Твої результати та історія збережені. Звернись до тренера, щоб продовжити доступ.</p></div>`;if(a.days_left!==null&&a.days_left<=7)return `<div class="card client-access-banner"><strong>До завершення доступу: ${Math.max(0,a.days_left)} дн.</strong><p class="muted" style="margin-bottom:0">Тариф: ${esc(a.plan_name)} · до ${esc(a.access_until)}</p></div>`;return ''}


function sideMenuHTML(){
 if(!session)return '';
 if(session.role==='trainer'){
   let client=selected&&window.currentClientData?.client;
   if(!client)return `<button class="side-nav-item ${currentTrainerMainView==='clients'?'active':''}" onclick="closeSideMenu();goToTrainerHome()"><span class="side-nav-icon">${uiIcon('users')}</span>Клієнти</button><button class="side-nav-item ${currentTrainerMainView==='library'?'active':''}" onclick="closeSideMenu();showExerciseLibrary()"><span class="side-nav-icon">${uiIcon('dumbbell')}</span>Бібліотека вправ</button>`;
   let a=clientAccess(client);
   return `<button class="side-nav-item" onclick="closeSideMenu();goToTrainerHome()"><span class="side-nav-icon">${uiIcon('users')}</span>Усі клієнти</button>
   <div class="side-client-context"><strong>${esc(client.name)}</strong><span>${esc(a.plan_name)}${a.access_until?' · до '+esc(a.access_until):''}</span></div>
   <button class="side-nav-item ${currentTrainerTab==='profile'?'active':''}" onclick="sideTrainerTab('profile')"><span class="side-nav-icon">${uiIcon('home')}</span>Огляд</button>
   <button class="side-nav-item ${currentTrainerTab==='program'?'active':''}" onclick="sideTrainerTab('program')"><span class="side-nav-icon">${uiIcon('dumbbell')}</span>Програма</button>
   <button class="side-nav-item ${currentTrainerTab==='results'?'active':''}" onclick="sideTrainerTab('results')"><span class="side-nav-icon">${uiIcon('chart')}</span>Результати</button>
   <button class="side-nav-item ${currentTrainerTab==='nutrition'?'active':''}" onclick="sideTrainerTab('nutrition')"><span class="side-nav-icon">${uiIcon('food')}</span>Харчування</button>
   <button class="side-nav-item ${currentTrainerTab==='calendar'?'active':''}" onclick="sideTrainerTab('calendar')"><span class="side-nav-icon">${uiIcon('calendar')}</span>Історія</button>`;
 }
 let cid=session.client_id,c=(window.currentClientData||{}).client||{},a=clientAccess(c);
 return `<button class="side-nav-item ${currentClientView==='home'?'active':''}" onclick="closeSideMenu();clientCabinet(${cid})"><span class="side-nav-icon">${uiIcon('home')}</span>Сьогодні</button>
 <button class="side-nav-item ${currentClientView==='progress'?'active':''}" onclick="closeSideMenu();showClientSection('progress')"><span class="side-nav-icon">${uiIcon('chart')}</span>Прогрес</button>
 <button class="side-nav-item ${currentClientView==='history'?'active':''}" onclick="closeSideMenu();showClientSection('history')"><span class="side-nav-icon">${uiIcon('calendar')}</span>Історія</button>
 ${a.features?.meal_plan?`<button class="side-nav-item ${currentClientView==='mealplan'?'active':''}" onclick="closeSideMenu();showClientSection('mealplan')"><span class="side-nav-icon">${uiIcon('food')}</span>План харчування</button>`:lockedNav('План харчування','food')}
 ${a.features?.measurements?`<button class="side-nav-item ${currentClientView==='measurements'?'active':''}" onclick="closeSideMenu();showClientSection('measurements')"><span class="side-nav-icon">${uiIcon('measure')}</span>Заміри</button>`:lockedNav('Заміри','measure','Самостійно')}
 <button class="side-nav-item ${currentClientView==='profile'?'active':''}" onclick="closeSideMenu();showClientProfile(${cid})"><span class="side-nav-icon">${uiIcon('user')}</span>Профіль</button>`;
}

function openSideMenu(){
 document.querySelector('#sideOverlay')?.remove();document.querySelector('#sideDrawer')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div id="sideOverlay" class="side-overlay" onclick="closeSideMenu()"></div><aside id="sideDrawer" class="side-drawer"><div class="side-drawer-head"><div class="brand"><span class="brand-e">Є</span><span class="brand-divider"></span><span class="brand-plan">ПЛАН</span></div><button class="side-close" onclick="closeSideMenu()">×</button></div><div class="side-menu-body">${sideMenuHTML()}</div><div class="side-menu-footer"><div class="lang-switch"><button class="${appLanguage==='uk'?'':'dark'}" onclick="setLanguage('uk')">UA</button><button class="${appLanguage==='en'?'':'dark'}" onclick="setLanguage('en')">EN</button></div><button class="logout-link" onclick="closeSideMenu();logout()"><span class="side-nav-icon">${uiIcon('logout')}</span>Вийти</button></div></aside>`);
 requestAnimationFrame(()=>{document.querySelector('#sideOverlay')?.classList.add('open');document.querySelector('#sideDrawer')?.classList.add('open')});syncOverlayLock();
}

function closeSideMenu(){document.querySelector('#sideOverlay')?.classList.remove('open');document.querySelector('#sideDrawer')?.classList.remove('open');setTimeout(()=>{document.querySelector('#sideOverlay')?.remove();document.querySelector('#sideDrawer')?.remove()},230)}

function sideTrainerTab(id){
 closeSideMenu();
 if(session?.role==='trainer'&&selected&&(history.state?.eplanPage==='calendarDay'||!document.getElementById(id))){
   openClient(selected,id);return;
 }
 showTab(id,null,false)
}



function syncOverlayLock(){document.body.classList.toggle('overlay-open',!!document.querySelector('.modal')||!!document.querySelector('.side-drawer.open'))}
