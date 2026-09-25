// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function restTimerEnd(){return +(localStorage.getItem(REST_TIMER_KEY)||0)}

function restTimerRemaining(){return Math.max(0,Math.ceil((restTimerEnd()-Date.now())/1000))}

function restTimerPanelHTML(){
 return `<div class="card rest-timer-card"><div class="rest-timer-top"><div><span class="rest-timer-label">⏱ Відпочинок між підходами</span><strong id="restTimerDisplay">${restTimerRemaining()?formatRestTimer(restTimerRemaining()):'Готовий до старту'}</strong></div><button class="dark rest-timer-main" onclick="toggleRestTimerChoices()">Таймер</button></div>
 <div id="restTimerChoices" class="rest-timer-choices hidden"><button class="dark" data-rest-seconds="60" onclick="startRestTimer(60,this)">1:00</button><button class="dark" data-rest-seconds="90" onclick="startRestTimer(90,this)">1:30</button><button class="dark" data-rest-seconds="120" onclick="startRestTimer(120,this)">2:00</button><button class="dark" data-rest-seconds="180" onclick="startRestTimer(180,this)">3:00</button><button class="dark" onclick="customRestTimer()">Свій час</button></div>
 <div id="restTimerActions" class="rest-timer-actions ${restTimerRemaining()?'':'hidden'}"><button class="dark" onclick="addRestTimer(30)">+30 сек</button><button class="dark" onclick="cancelRestTimer()">Скасувати</button></div>
 <div class="rest-timer-note">Можна згорнути застосунок — час не загубиться. Для сигналу у фоні дозволь сповіщення.</div></div>`;
}

function toggleRestTimerChoices(){let x=$('#restTimerChoices');if(x)x.classList.toggle('hidden')}

function formatRestTimer(s){let m=Math.floor(s/60),q=s%60;return `${String(m).padStart(2,'0')}:${String(q).padStart(2,'0')}`}

async function ensureTimerNotifications(){
 if(!('Notification' in window))return false;
 if(Notification.permission==='granted')return true;
 if(Notification.permission==='denied')return false;
 try{return (await Notification.requestPermission())==='granted'}catch(e){return false}
}

async function startRestTimer(seconds,sourceBtn=null){
 document.querySelectorAll('.rest-timer-choices button').forEach(b=>b.classList.remove('selected'));
 if(sourceBtn)sourceBtn.classList.add('selected');
 await unlockTimerSound();
 await ensureTimerNotifications();
 let end=Date.now()+seconds*1000;localStorage.setItem(REST_TIMER_KEY,String(end));
 $('#restTimerChoices')?.classList.remove('hidden');$('#restTimerActions')?.classList.remove('hidden');
 startRestTimerTicker();syncRestTimerWorker(end);renderFloatingRestTimer();
}

function addRestTimer(seconds){
 let end=Math.max(Date.now(),restTimerEnd())+seconds*1000;localStorage.setItem(REST_TIMER_KEY,String(end));
 startRestTimerTicker();syncRestTimerWorker(end);renderFloatingRestTimer();
}

function cancelRestTimer(){
 localStorage.removeItem(REST_TIMER_KEY);document.querySelectorAll('.rest-timer-choices button').forEach(b=>b.classList.remove('selected'));if(restTimerInterval){clearInterval(restTimerInterval);restTimerInterval=null}
 navigator.serviceWorker?.controller?.postMessage({type:'CANCEL_REST_TIMER'});
 updateRestTimerUI(0);document.querySelector('#floatingRestTimer')?.remove();
}

function customRestTimer(){
 let raw=prompt('Введи час відпочинку у секундах, наприклад 150');
 let sec=parseInt(raw||'',10);if(sec>0&&sec<=3600)startRestTimer(sec);
}

function startRestTimerTicker(){
 if(restTimerInterval)clearInterval(restTimerInterval);
 updateRestTimerUI(restTimerRemaining());
 restTimerInterval=setInterval(()=>{let s=restTimerRemaining();updateRestTimerUI(s);if(s<=0){clearInterval(restTimerInterval);restTimerInterval=null;finishRestTimer()}},250);
}

function updateRestTimerUI(s){
 let d=$('#restTimerDisplay');if(d)d.textContent=s?formatRestTimer(s):'Готовий до старту';
 let a=$('#restTimerActions');if(a)a.classList.toggle('hidden',!s);
 let f=$('#floatingRestTimerValue');if(f)f.textContent=formatRestTimer(s);
}

async function unlockTimerSound(){
 try{let AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;restTimerAudioCtx=restTimerAudioCtx||new AC();if(restTimerAudioCtx.state==='suspended')await restTimerAudioCtx.resume()}catch(e){}
}

function timerBeep(){
 try{
  let AC=window.AudioContext||window.webkitAudioContext,ctx=restTimerAudioCtx||new AC();restTimerAudioCtx=ctx;
  [0,.22,.44].forEach(t=>{let o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.001,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(.18,ctx.currentTime+t+.02);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+t+.16);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+.18)});
 }catch(e){}
 try{navigator.vibrate?.([180,90,180,90,260])}catch(e){}
}

async function finishRestTimer(){
 if(!restTimerEnd())return;
 localStorage.removeItem(REST_TIMER_KEY);document.querySelectorAll('.rest-timer-choices button').forEach(b=>b.classList.remove('selected'));updateRestTimerUI(0);document.querySelector('#floatingRestTimer')?.remove();timerBeep();
 if(document.visibilityState==='visible'&&Notification.permission==='granted'){
  try{let reg=await navigator.serviceWorker.ready;reg.showNotification('Є ПЛАН · Відпочинок завершено',{body:'Час починати наступний підхід.',icon:'/static/icon-192.png',badge:'/static/icon-192.png',tag:'eplan-rest-finished',renotify:true})}catch(e){}
 }
}

async function syncRestTimerWorker(end){
 try{let reg=await navigator.serviceWorker.ready;(reg.active||navigator.serviceWorker.controller)?.postMessage({type:'REST_TIMER',end})}catch(e){}
}

function renderFloatingRestTimer(){
 let s=restTimerRemaining();if(!s){document.querySelector('#floatingRestTimer')?.remove();return}
 let el=$('#floatingRestTimer');if(!el){document.body.insertAdjacentHTML('beforeend',`<button id="floatingRestTimer" class="floating-rest-timer" onclick="window.scrollTo({top:0,behavior:'smooth'})">⏱ <span id="floatingRestTimerValue">${formatRestTimer(s)}</span></button>`)}
 else $('#floatingRestTimerValue').textContent=formatRestTimer(s);
}
