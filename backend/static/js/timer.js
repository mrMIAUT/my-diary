// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function restTimerEnd(){return +(localStorage.getItem(REST_TIMER_KEY)||0)}

function restTimerRemaining(){return Math.max(0,Math.ceil((restTimerEnd()-Date.now())/1000))}

function restTimerPanelHTML(){
 return restTimerInlineHTML()+restTimerInlineControlsHTML();
}

function restTimerInlineHTML(){
 let remaining=restTimerRemaining();
 return `<button class="inline-rest-timer" onclick="toggleRestTimerChoices()" aria-label="Таймер відпочинку">
   <span class="inline-rest-timer-icon">⏱</span>
   <span id="restTimerDisplay">${remaining?formatRestTimer(remaining):'Таймер'}</span>
 </button>`;
}

function restTimerInlineControlsHTML(){
 let remaining=restTimerRemaining();
 return `<div id="restTimerChoices" class="rest-timer-choices inline-rest-timer-choices hidden">
   <button class="dark" data-rest-seconds="60" onclick="startRestTimer(60,this)">1:00</button>
   <button class="dark" data-rest-seconds="90" onclick="startRestTimer(90,this)">1:30</button>
   <button class="dark" data-rest-seconds="120" onclick="startRestTimer(120,this)">2:00</button>
   <button class="dark" data-rest-seconds="180" onclick="startRestTimer(180,this)">3:00</button>
   <button class="dark" onclick="customRestTimer()">Свій час</button>
 </div>
 <div id="restTimerActions" class="rest-timer-actions inline-rest-timer-actions ${remaining?'':'hidden'}">
   <button class="dark" onclick="addRestTimer(30)">+30 сек</button>
   <button class="dark" onclick="cancelRestTimer()">Скасувати</button>
 </div>`;
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
 let d=$('#restTimerDisplay');if(d)d.textContent=s?formatRestTimer(s):'Таймер';
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
 let s=restTimerRemaining();
 if(document.body.classList.contains('eplan-redesign')&&document.body.classList.contains('client-ui')){
   document.querySelector('#floatingRestTimer')?.remove();
   return;
 }
 if(!s){document.querySelector('#floatingRestTimer')?.remove();return}
 let el=$('#floatingRestTimer');if(!el){document.body.insertAdjacentHTML('beforeend',`<button id="floatingRestTimer" class="floating-rest-timer" onclick="window.scrollTo({top:0,behavior:'smooth'})">⏱ <span id="floatingRestTimerValue">${formatRestTimer(s)}</span></button>`)}
 else $('#floatingRestTimerValue').textContent=formatRestTimer(s);
}


// Redesign V1 — Lyfta-like rest timer: one compact control, automatic start after a set.
function preferredRestTimerSeconds(){return Math.max(1,+(localStorage.getItem('eplanPreferredRestSeconds')||120))}
function setPreferredRestTimerSeconds(seconds){let s=Math.max(1,Math.min(3600,+seconds||120));localStorage.setItem('eplanPreferredRestSeconds',String(s));closeRestTimerPicker();return s}
function openRestTimerPicker(){
 document.getElementById('restTimerPicker')?.remove();
 let current=preferredRestTimerSeconds();
 document.body.insertAdjacentHTML('beforeend',
  '<div class="modal rest-timer-picker" id="restTimerPicker" onclick="if(event.target===this)closeRestTimerPicker()"><div class="card rest-timer-picker-card">'
  +'<div class="rest-timer-picker-handle"></div><div class="rest-timer-picker-head"><div><strong>Таймер відпочинку</strong><span>Запускається автоматично після завершення підходу</span></div><button class="rest-timer-picker-close" onclick="closeRestTimerPicker()">✕</button></div>'
  +'<div class="rest-timer-preset-list">'+[60,90,120,150,180].map(s=>'<button class="'+(s===current?'selected':'')+'" onclick="setPreferredRestTimerSeconds('+s+')">'+formatRestTimer(s)+'</button>').join('')+'</div>'
  +'<button class="rest-timer-custom" onclick="customPreferredRestTimer()">Свій час</button></div></div>');
}
function closeRestTimerPicker(){document.getElementById('restTimerPicker')?.remove()}
function customPreferredRestTimer(){let raw=prompt('Введи час відпочинку у секундах, наприклад 150');let sec=parseInt(raw||'',10);if(sec>0&&sec<=3600)setPreferredRestTimerSeconds(sec)}
async function completeWorkoutSetAndStartTimer(pid,n,btn){
 let w=document.getElementById('w'+pid+'_'+n),r=document.getElementById('r'+pid+'_'+n);
 if(!w?.value||!r?.value)return alert('Спочатку заповни вагу та повтори у підході '+n);
 btn?.classList.toggle('done');
 if(btn?.classList.contains('done'))await startRestTimer(preferredRestTimerSeconds());
}
function compactRestTimerHTML(){let s=restTimerRemaining();return '<button class="redesign-rest-timer-icon '+(s?'running':'')+'" onclick="openRestTimerPicker()" aria-label="Налаштувати таймер відпочинку" title="Таймер відпочинку">⏱<span id="restTimerDisplay">'+(s?formatRestTimer(s):'')+'</span></button>'}
