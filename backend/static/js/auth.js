// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function sessionOwner(s=session){
 return s?.role==='trainer'?'trainer:1':s?.role==='client'&&s.client_id?'client:'+s.client_id:'';
}

function installSession(s){
 if(sessionOwner(s)!==sessionOwner())authEpoch++;
 session=s;sessionVerified=true;
 try{localStorage.setItem('fitSession',JSON.stringify(s))}catch(e){}
}

function clearLocalSession({keepLocation=false,skipOfflinePurge=false,suppressLoginRender=false}={}){
 const oldScope=offlineScopeIdentity();
 authEpoch++;sessionVerified=false;
 try{localStorage.removeItem('fitSession')}catch(e){}
 session=null;selected=null;window.currentClientData=null;
 document.querySelectorAll('.modal,#sideOverlay,#sideDrawer').forEach(x=>x.remove());
 document.body.classList.remove('overlay-open');
 if(restTimerInterval){clearInterval(restTimerInterval);restTimerInterval=null}
 document.querySelector('#floatingRestTimer')?.remove();
 if(!skipOfflinePurge){purgeOfflinePrivateData({notice:true,scope:oldScope});detachLocalPush({silent:true})}
 if(!keepLocation)try{history.replaceState({},'',location.pathname)}catch(e){}
 if(!suppressLoginRender)requestAnimationFrame(()=>renderLogin());
}

function setLogoutPending(value){
 logoutPending=value;
 try{if(value)localStorage.setItem('eplanLogoutPending','1');else localStorage.removeItem('eplanLogoutPending')}catch(e){}
}

async function finishPendingLogout(){
 if(!logoutPending)return true;
 if(logoutTask)return logoutTask;
 logoutTask=(async()=>{
   try{
     if(!await detachLocalPush({silent:true}))return false;
     const r=await eplanFetch(A+'/logout',{method:'POST',cache:'no-store'});
     if(!r.ok)return false;
     setLogoutPending(false);return true;
   }catch(e){return false}
 })();
 try{return await logoutTask}finally{logoutTask=null}
}

async function logout(){
 const pending=await offlinePendingSummary();
 if(pending.total){
   const ok=confirm(`На цьому пристрої є незасинхронізовані або чернеткові дані (${pending.total}). Якщо вийти зараз, локальні копії буде видалено і вони не синхронізуються. Вийти та видалити локальні копії?`);
   if(!ok)return false;
 }
 setLogoutPending(true);
 await detachLocalPush({silent:true});
 await purgeOfflinePrivateData({all:true});
 clearLocalSession({skipOfflinePurge:true});
 if(!await finishPendingLogout())offlineStatus('● Вихід на сервері очікує підключення до інтернету');
 return true;
}

async function refreshServerSession({suppressLoginRender=false}={}){
 if(logoutPending){if(!await finishPendingLogout())return false;return false}
 if(sessionRefreshTask)return sessionRefreshTask;
 const epoch=authEpoch;
 sessionRefreshTask=(async()=>{
   try{
     const r=await eplanFetch(A+'/session',{cache:'no-store'});
     if(epoch!==authEpoch||logoutPending)return false;
     if(r.status===401){clearLocalSession({keepLocation:true,suppressLoginRender});return false}
     if(!r.ok){sessionVerified=false;return false}
     const s=await r.json();
     if(epoch!==authEpoch||logoutPending)return false;
     installSession(s);return true;
   }catch(e){if(epoch===authEpoch)sessionVerified=false;return false}
 })();
 try{return await sessionRefreshTask}finally{sessionRefreshTask=null}
}

async function bootstrapAuthentication(){
 // Server identity is resolved asynchronously; keep the existing shell visible
 // while it loads instead of leaving an empty PWA screen on a slow connection.
 app.innerHTML=`<div class="wrap login"><div class="card"><p class="muted">${appLanguage==='en'?'Loading…':'Завантаження…'}</p></div></div>`;
 if(logoutPending){clearLocalSession({suppressLoginRender:!!startupResetToken});await finishPendingLogout()}
 else await refreshServerSession({suppressLoginRender:!!startupResetToken});
 if(startupResetToken)return renderResetPassword(startupResetToken);
 if(!history.state?.eplanPage)history.replaceState(session?.role==='client'?{eplanPage:'clientHome',eplanClient:session.client_id}:{eplanPage:'clients'},'',location.pathname+location.search);
 try{await route()}catch(e){renderLogin();offlineStatus(e.message)}
}

function renderLogin(){
 document.body.classList.remove('client-ui');
 document.body.classList.add('eplan-redesign','eplan-auth-page');
 let token=new URLSearchParams(location.search).get('reset');
 if(token)return renderResetPassword(token);
 let rememberedEmail=localStorage.getItem('rememberedEmail')||'';
 app.innerHTML=`<main class="auth-shell"><div class="auth-logo"><img src="/static/icons/apple-touch-icon.png?v=67" alt="Є ПЛАН"></div><form class="auth-card" onsubmit="event.preventDefault();login()" autocomplete="on"><div class="auth-heading"><span>З поверненням</span><h1>Вхід</h1><p>Увійди, щоб продовжити тренування.</p></div><label class="auth-field"><span>Email</span><input id="email" name="email" type="email" autocomplete="username" value="${esc(rememberedEmail)}" placeholder="name@email.com"></label><label class="auth-field"><span>Пароль</span><div class="password-field-wrap"><input id="pass" name="password" type="password" data-password-field="1" autocomplete="current-password" placeholder="Введи пароль"><button type="button" class="password-eye-btn" aria-label="Показати пароль" onclick="togglePasswordField(this,'pass')">${passwordEyeSVG(true)}</button></div></label><div class="auth-options"><label class="remember-row"><input id="rememberLogin" type="checkbox" ${rememberedEmail?'checked':''}><span>Запам’ятати email</span></label><button type="button" class="auth-forgot" onclick="renderForgotPassword()">Забули пароль?</button></div><p id="err" class="auth-error"></p><button class="auth-submit" type="submit">Увійти</button></form></main>`
}

function renderForgotPassword(){
 app.innerHTML=`<div class="wrap login"><div class="brand"><span class="brand-e">Є</span><span class="brand-divider"></span><span class="brand-plan">ПЛАН</span></div><div class="card"><h1>Відновлення пароля</h1><p class="muted">Введіть справжній email, який тренер вказав під час створення акаунта.</p><input id="resetEmail" type="email" placeholder="Email"><p id="resetMsg" class="muted"></p><button onclick="requestPasswordReset()">Надіслати посилання</button><button class="dark" style="margin-left:8px" onclick="renderLogin()">Назад</button></div></div>`
}

async function requestPasswordReset(){
 try{let r=await api('/password-reset/request',{method:'POST',body:JSON.stringify({email:resetEmail.value})});resetMsg.textContent=r.message}catch(e){resetMsg.textContent=e.message}
}

function renderResetPassword(token){
 // H03: token is data in this closure, never HTML or JavaScript source.
 app.innerHTML=`<div class="wrap login"><div class="brand"><span class="brand-e">Є</span><span class="brand-divider"></span><span class="brand-plan">ПЛАН</span></div><div class="card"><h1>Новий пароль</h1><div class="password-field-wrap"><input id="newPass" type="password" data-password-field="1" autocomplete="new-password" placeholder="Новий пароль, мінімум 8 символів"><button type="button" class="password-eye-btn" aria-label="Показати пароль" onclick="togglePasswordField(this,'newPass')">${passwordEyeSVG(true)}</button></div><div class="password-field-wrap"><input id="newPassRepeat" type="password" data-password-field="1" autocomplete="new-password" placeholder="Повторіть новий пароль"><button type="button" class="password-eye-btn" aria-label="Показати пароль" onclick="togglePasswordField(this,'newPassRepeat')">${passwordEyeSVG(true)}</button></div><p id="resetMsg" class="muted"></p><button id="confirmResetButton">Зберегти пароль</button></div></div>`;
 document.getElementById('confirmResetButton').addEventListener('click',()=>confirmPasswordReset(token));
}

async function confirmPasswordReset(token){
 let p=newPass.value,r=newPassRepeat.value;
 if(p.length<8){resetMsg.textContent='Пароль має містити щонайменше 8 символів';return}
 if(p!==r){resetMsg.textContent='Паролі не співпадають';return}
 try{await api('/password-reset/confirm',{method:'POST',body:JSON.stringify({token,password:p})});clearLocalSession();history.replaceState({},'',location.pathname);alert('Пароль змінено. Тепер увійдіть з новим паролем.');renderLogin()}catch(e){resetMsg.textContent=e.message}
}

function passwordEyeSVG(hidden){
 return hidden
  ? `<svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9 5 9 5s-1.3 1.9-3.5 3.4"/><path d="M6.6 6.6C4.3 8 3 10 3 10s3.5 5 9 5c1 0 2-.2 2.8-.5"/></svg>`
  : `<svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z"/><circle cx="12" cy="12" r="2.4"/></svg>`;
}

function syncPasswordEye(btn,input){
 if(!btn||!input)return;
 btn.classList.add('password-eye-btn');
 let hidden=input.type==='password';
 let state=hidden?'hidden':'visible';
 let label=hidden?'Показати пароль':'Сховати пароль';
 if(btn.dataset.eyeState!==state){
   btn.dataset.eyeState=state;
   btn.innerHTML=passwordEyeSVG(hidden);
 }
 if(btn.getAttribute('aria-label')!==label)btn.setAttribute('aria-label',label);
 if(btn.title!==label)btn.title=label;
}

function syncAllPasswordEyes(){
 document.querySelectorAll('input[type="password"],input[data-password-field="1"]').forEach(input=>{
   input.dataset.passwordField='1';
   let wrap=input.parentElement;
   let btn=wrap&&[...wrap.querySelectorAll('button')].find(b=>/парол|👁|🙈|eye/i.test((b.getAttribute('aria-label')||'')+(b.title||'')+(b.textContent||'')));
   if(btn)syncPasswordEye(btn,input);
 });
}

function togglePasswordField(btn,inputId){let p=document.getElementById(inputId);if(!p)return;p.type=p.type==='password'?'text':'password';syncPasswordEye(btn,p)}

function togglePassword(){let p=$('#pass'),btn=p?.parentElement?.querySelector('.password-eye-btn');if(p){p.type=p.type==='password'?'text':'password';syncPasswordEye(btn,p)}}

async function login(){try{let em=email.value.trim();if(offPurgeTask)await offPurgeTask;if(pushDetachTask)await pushDetachTask;if(!await finishPendingLogout())throw new Error('Для завершення виходу та нового входу потрібен інтернет.');let s=await api('/login',{method:'POST',body:JSON.stringify({email:em,password:pass.value})});authEpoch++;installSession(s);if(document.querySelector('#rememberLogin')?.checked)localStorage.setItem('rememberedEmail',em);else localStorage.removeItem('rememberedEmail');await route();syncOfflineQueue();autoRegisterPhoneNotifications()}catch(e){let el=document.querySelector('#err');if(el)el.textContent=e.message}}

async function route(){if(!session)return renderLogin();if(session.role==='trainer')return trainerHome();return clientCabinet(session.client_id)}
