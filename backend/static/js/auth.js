// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.


function logout(){
 try{localStorage.removeItem('fitSession')}catch(e){}
 session=null;selected=null;window.currentClientData=null;
 document.querySelectorAll('.modal,#sideOverlay,#sideDrawer').forEach(x=>x.remove());
 document.body.classList.remove('overlay-open');
 if(restTimerInterval){clearInterval(restTimerInterval);restTimerInterval=null}
 document.querySelector('#floatingRestTimer')?.remove();
 try{history.replaceState({},'',location.pathname)}catch(e){}
 requestAnimationFrame(()=>renderLogin());
}

function renderLogin(){
 let token=new URLSearchParams(location.search).get('reset');
 if(token)return renderResetPassword(token);
 let rememberedEmail=localStorage.getItem('rememberedEmail')||'';
 app.innerHTML=`<div class="wrap login"><div class="brand"><span class="brand-e">Є</span><span class="brand-divider"></span><span class="brand-plan">ПЛАН</span></div><form class="card" onsubmit="event.preventDefault();login()" autocomplete="on"><h1>Вхід</h1><input id="email" name="email" type="email" autocomplete="username" value="${esc(rememberedEmail)}" placeholder="Email"><div class="password-field-wrap"><input id="pass" name="password" type="password" data-password-field="1" autocomplete="current-password" placeholder="Пароль"><button type="button" class="password-eye-btn" aria-label="Показати пароль" onclick="togglePasswordField(this,'pass')">${passwordEyeSVG(true)}</button></div><label class="remember-row"><input id="rememberLogin" type="checkbox" ${rememberedEmail?'checked':''}><span>Запам’ятати email на цьому пристрої</span></label><p id="err" class="muted"></p><button type="submit">Увійти</button><button type="button" class="dark" style="margin-left:8px" onclick="renderForgotPassword()">Забули пароль?</button><p class="muted" style="font-size:13px;margin-top:16px">Пароль може зберегти браузер або менеджер паролів. Сам сайт не зберігає пароль у відкритому вигляді.</p></form></div>`
}

function renderForgotPassword(){
 app.innerHTML=`<div class="wrap login"><div class="brand"><span class="brand-e">Є</span><span class="brand-divider"></span><span class="brand-plan">ПЛАН</span></div><div class="card"><h1>Відновлення пароля</h1><p class="muted">Введіть справжній email, який тренер вказав під час створення акаунта.</p><input id="resetEmail" type="email" placeholder="Email"><p id="resetMsg" class="muted"></p><button onclick="requestPasswordReset()">Надіслати посилання</button><button class="dark" style="margin-left:8px" onclick="renderLogin()">Назад</button></div></div>`
}

async function requestPasswordReset(){
 try{let r=await api('/password-reset/request',{method:'POST',body:JSON.stringify({email:resetEmail.value})});resetMsg.textContent=r.message}catch(e){resetMsg.textContent=e.message}
}

function renderResetPassword(token){
 app.innerHTML=`<div class="wrap login"><div class="brand"><span class="brand-e">Є</span><span class="brand-divider"></span><span class="brand-plan">ПЛАН</span></div><div class="card"><h1>Новий пароль</h1><div class="password-field-wrap"><input id="newPass" type="password" data-password-field="1" autocomplete="new-password" placeholder="Новий пароль, мінімум 8 символів"><button type="button" class="password-eye-btn" aria-label="Показати пароль" onclick="togglePasswordField(this,'newPass')">${passwordEyeSVG(true)}</button></div><div class="password-field-wrap"><input id="newPassRepeat" type="password" data-password-field="1" autocomplete="new-password" placeholder="Повторіть новий пароль"><button type="button" class="password-eye-btn" aria-label="Показати пароль" onclick="togglePasswordField(this,'newPassRepeat')">${passwordEyeSVG(true)}</button></div><p id="resetMsg" class="muted"></p><button onclick="confirmPasswordReset('${esc(token)}')">Зберегти пароль</button></div></div>`
}

async function confirmPasswordReset(token){
 let p=newPass.value,r=newPassRepeat.value;
 if(p.length<8){resetMsg.textContent='Пароль має містити щонайменше 8 символів';return}
 if(p!==r){resetMsg.textContent='Паролі не співпадають';return}
 try{await api('/password-reset/confirm',{method:'POST',body:JSON.stringify({token,password:p})});localStorage.removeItem('fitSession');session=null;history.replaceState({},'',location.pathname);alert('Пароль змінено. Тепер увійдіть з новим паролем.');renderLogin()}catch(e){resetMsg.textContent=e.message}
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

async function login(){try{let em=email.value.trim();let s=await api('/login',{method:'POST',body:JSON.stringify({email:em,password:pass.value})});session=s;localStorage.setItem('fitSession',JSON.stringify(s));if(document.querySelector('#rememberLogin')?.checked)localStorage.setItem('rememberedEmail',em);else localStorage.removeItem('rememberedEmail');route()}catch(e){err.textContent=e.message}}

async function route(){if(!session)return renderLogin();if(session.role==='trainer')return trainerHome();return clientCabinet(session.client_id)}
