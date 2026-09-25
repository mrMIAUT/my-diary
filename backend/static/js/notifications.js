// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

async function refreshNotificationBadge(cid,recipient,buttonId){
 try{
  let xs=await api('/notifications/'+cid+'?recipient='+recipient),n=xs.filter(x=>!x.is_read).length,b=$('#'+buttonId);
  if(!b)return;b.querySelector('.notify-badge')?.remove();
  if(n)b.insertAdjacentHTML('beforeend',`<span class="notify-badge">${n>99?'99+':n}</span>`)
 }catch(e){}
}




function urlBase64ToUint8Array(base64String){
 const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

function pushStorageKey(){
 return 'eplanPushEnabled_'+(session?.role==='trainer'?'trainer':('client_'+(session?.client_id||0)));
}

async function phoneNotificationEnabled(){
 try{
   if(!('Notification' in window)||Notification.permission!=='granted')return false;
   if(localStorage.getItem(pushStorageKey())==='1')return true;
   if(!('serviceWorker' in navigator)||!('PushManager' in window))return false;
   let reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
   if(sub){localStorage.setItem(pushStorageKey(),'1');return true}
   return false;
 }catch(e){return localStorage.getItem(pushStorageKey())==='1'&&('Notification' in window)&&Notification.permission==='granted'}
}

async function refreshPhoneNotificationButton(btn){
 if(!btn)return;
 let enabled=await phoneNotificationEnabled();
 btn.dataset.enabled=enabled?'1':'0';
 btn.textContent=enabled?'✓ Сповіщення на телефоні увімкнено':'🔔 Увімкнути сповіщення на телефоні';
 btn.classList.toggle('push-enabled',enabled);
}

async function enablePhoneNotifications(btn=null){
 if(await phoneNotificationEnabled()){await refreshPhoneNotificationButton(btn);return true}
 if(btn){btn.disabled=true;btn.textContent='Підключення…'}
 const done=async(ok)=>{if(btn){btn.disabled=false;await refreshPhoneNotificationButton(btn)}return ok};
 if(!window.isSecureContext){alert('Для push-сповіщень потрібен HTTPS.');return done(false)}
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
   alert('На iPhone push-сповіщення працюють у встановленому вебзастосунку «Є ПЛАН» через «Додати на початковий екран».');
   return done(false);
 }
 let permission=Notification.permission;
 if(permission!=='granted')permission=await Notification.requestPermission();
 if(permission!=='granted'){
   alert('Сповіщення не дозволені. Відкрий Налаштування iPhone → Сповіщення → Є ПЛАН та дозволь їх.');
   return done(false);
 }
 try{
   let reg=await navigator.serviceWorker.ready,key=await api('/push/public-key');
   if(!key.public_key)throw new Error('Push key unavailable');
   let sub=await reg.pushManager.getSubscription();
   if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(key.public_key)});
   let j=sub.toJSON(),recipient=session?.role==='trainer'?'trainer':'client',clientId=session?.role==='client'?session.client_id:0;
   await api('/push/subscribe',{method:'POST',body:JSON.stringify({client_id:clientId,recipient,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth})});
   localStorage.setItem(pushStorageKey(),'1');
   return done(true);
 }catch(e){
   console.warn('Push subscribe failed',e);
   alert('Не вдалося підключити push-сповіщення. Перевір, що «Є ПЛАН» додано на початковий екран iPhone.');
   return done(false);
 }
}

async function autoRegisterPhoneNotifications(){
 if(Notification?.permission!=='granted'||!session)return;
 try{await enablePhoneNotifications()}catch(e){}
}

async function handleNotificationDeepLink(){
 let p=new URLSearchParams(location.search),nid=+p.get('notify')||0,recipient=p.get('recipient'),cid=+p.get('client')||0;
 if(!nid||!session)return;
 history.replaceState(history.state,'',location.pathname);
 if(session.role==='trainer'&&recipient==='trainer'){await openTrainerNotification(nid,cid)}
 else if(session.role==='client'&&recipient==='client'){
   let xs=await api('/notifications/'+session.client_id+'?recipient=client'),n=xs.find(x=>x.id===nid);
   if(n&&!n.is_read)await api('/notifications/item/'+nid+'/read',{method:'PATCH'});
   await clientCabinet(session.client_id);
   setTimeout(()=>showNotifications(session.client_id,'client'),180);
 }
}


async function refreshTrainerGlobalBadge(){
 try{let xs=await api('/notifications/trainer/all'),n=xs.filter(x=>!x.is_read).length,b=$('#trainerGlobalNotifyBtn');if(!b)return;b.querySelector('.notify-badge')?.remove();if(n)b.insertAdjacentHTML('beforeend',`<span class="notify-badge">${n>99?'99+':n}</span>`)}catch(e){}
}

async function showTrainerNotifications(){
 let xs=(await api('/notifications/trainer/all')).filter(x=>x.client_name&&x.client_name!=='Незнакомец'&&+x.client_id>0);
 refreshTrainerGlobalBadge();
 let body=xs.length?xs.map(x=>`<div class="notification-swipe"><button class="notification-delete-bg" onclick="event.stopPropagation();deleteTrainerNotification(${x.id},this)">×</button><div class="exercise notification-item ${x.is_read?'':'unread'}" onclick="openTrainerNotification(${x.id},${x.client_id})">${x.is_read?'':'<span class="notification-dot"></span>'}<div class="muted" style="margin-bottom:5px">${esc(x.client_name||'Клієнт')}</div><strong>${esc(x.message)}</strong><div class="muted" style="margin-top:5px">${String(x.created_at||'').replace('T',' ').slice(0,16)}</div></div></div>`).join(''):'<p class="muted">Сповіщень немає.</p>';
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="notificationModal" onclick="if(event.target===this)this.remove()"><div class="card"><div class="notification-modal-head"><h2>Сповіщення</h2><button class="dark notification-close" onclick="notificationModal.remove()">✕</button></div><button id="phoneNotifyEnableBtn" class="dark phone-notify-enable" onclick="enablePhoneNotifications(this)">🔔 Увімкнути сповіщення на телефоні</button>${body}</div></div>`);initNotificationSwipes();refreshPhoneNotificationButton($('#phoneNotifyEnableBtn'));
}

function initNotificationSwipes(){
 document.querySelectorAll('.notification-swipe').forEach(row=>{let item=row.querySelector('.notification-item'),sx=0,dx=0;item.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;dx=0},{passive:true});item.addEventListener('touchmove',e=>{dx=e.touches[0].clientX-sx;if(dx<0)item.style.transform=`translateX(${Math.max(-72,dx)}px)`},{passive:true});item.addEventListener('touchend',()=>{row.classList.toggle('reveal',dx<-34);item.style.transform=''})})
}

async function deleteTrainerNotification(nid,btn){await api('/notifications/item/'+nid,{method:'DELETE'});btn.closest('.notification-swipe')?.remove();refreshTrainerGlobalBadge()}

async function openTrainerNotification(nid,cid){
 let xs=await api('/notifications/trainer/all'),n=xs.find(x=>x.id===nid);if(!n)return;
 try{await api('/clients/'+cid)}catch(e){if(nid>0)try{await api('/notifications/item/'+nid,{method:'DELETE'})}catch(_e){};$('#notificationModal')?.remove();refreshTrainerGlobalBadge();await trainerHome();return;}
 if(!n.is_read&&nid>0)await api('/notifications/item/'+nid+'/read',{method:'PATCH'});
 $('#notificationModal')?.remove();
 if(n.kind==='workout_finished'||n.target_tab==='results'){
   await openClient(cid,'calendar');refreshTrainerGlobalBadge();
   let day=n.target_day||'';
   if(!day&&n.target_session_id){
     let ws=(window.currentClientData?.workout_sessions||[]).find(s=>+s.id===+n.target_session_id);
     day=sessionDay(ws);
   }
   if(day)showCalendarDay(day,null,true,+n.target_session_id||0);
   return;
 }
 let tab=n.target_tab||(n.kind==='cardio'?'cardio':'profile');
 await openClient(cid,tab);refreshTrainerGlobalBadge();
 setTimeout(()=>{let pane=$('#'+tab);if(pane)pane.scrollIntoView({behavior:'smooth',block:'start'})},120);
}

function focusTrainerWorkoutNotification(n){
 let day=n.target_day||'',sid=+n.target_session_id||0;
 let target=sid?document.querySelector(`[data-workout-session="${sid}"]`):null;
 if(!target&&day)target=[...document.querySelectorAll('#results [data-workout-day]')].find(x=>x.dataset.workoutDay===day);
 if(!target)return;
 let body=target.querySelector('[id^="workoutResult_"]');
 if(body&&body.classList.contains('hidden')){body.classList.remove('hidden');let a=target.querySelector('.arrow');if(a)a.textContent='⌃'}
 target.classList.add('notification-focus');target.scrollIntoView({behavior:'smooth',block:'center'});
 setTimeout(()=>target.classList.remove('notification-focus'),3500);
}


async function notificationBadge(cid,recipient){
 try{
  let xs=await api('/notifications/'+cid+'?recipient='+recipient);
  return xs.filter(x=>!x.is_read).length;
 }catch(e){return 0}
}

async function showNotifications(cid,recipient){
 let xs=await api('/notifications/'+cid+'?recipient='+recipient);
 let body=xs.length?xs.map(x=>`<div class="exercise notification-item ${x.is_read?'':'unread'}" onclick="openNotification(${x.id},${cid},'${recipient}')">${x.is_read?'':'<span class="notification-dot"></span>'}<strong>${esc(x.message)}</strong><div class="muted" style="margin-top:5px">${String(x.created_at||'').replace('T',' ').slice(0,16)}</div></div>`).join(''):'<p class="muted">Сповіщень немає.</p>';
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="notificationModal" onclick="if(event.target===this)this.remove()"><div class="card"><div class="notification-modal-head"><h2>Сповіщення</h2><button class="dark notification-close" onclick="notificationModal.remove()">✕</button></div><button id="phoneNotifyEnableBtn" class="dark phone-notify-enable" onclick="enablePhoneNotifications(this)">🔔 Увімкнути сповіщення на телефоні</button>${body}</div></div>`);
 setTimeout(()=>refreshPhoneNotificationButton(document.getElementById('phoneNotifyEnableBtn')),0);
}

async function openNotification(nid,cid,recipient){
 let xs=await api('/notifications/'+cid+'?recipient='+recipient),n=xs.find(x=>x.id===nid);if(!n)return;
 if(!n.is_read)await api('/notifications/item/'+nid+'/read',{method:'PATCH'});
 notificationModal.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="notificationDetailModal" onclick="if(event.target===this)this.remove()"><div class="card"><div class="between"><h2>Сповіщення</h2><button class="dark" onclick="notificationDetailModal.remove()">✕</button></div><div class="exercise"><div class="muted" style="margin-bottom:7px">Повідомлення</div><strong style="white-space:pre-wrap;line-height:1.5">${esc(n.message)}</strong><div class="muted" style="margin-top:10px">${String(n.created_at||'').replace('T',' ').slice(0,16)}</div></div><button class="dark" onclick="notificationDetailModal.remove();showNotifications(${cid},'${recipient}')">Назад</button></div></div>`);
 refreshNotificationBadge(cid,recipient,recipient==='trainer'?'trainerNotifyBtn':'clientNotifyBtn');
}

async function markNotificationsRead(cid,recipient){
 await api('/notifications/'+cid+'/read',{method:'PATCH',body:JSON.stringify({recipient})});
 notificationModal.remove();
 if(session.role==='trainer')openClient(cid);else clientCabinet(cid)
}
