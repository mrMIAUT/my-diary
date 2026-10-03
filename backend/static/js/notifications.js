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

function clearLocalPushFlags(){
 try{for(let i=localStorage.length-1;i>=0;i--){let k=localStorage.key(i)||'';if(k.startsWith('eplanPushEnabled_')||k==='eplanPushBoundOwner')localStorage.removeItem(k)}}catch(e){}
}

async function detachLocalPush({silent=false}={}){
 if(pushDetachTask)return pushDetachTask;
 pushDetachTask=(async()=>{
   let sub=null;
   try{
     if('serviceWorker' in navigator&&'PushManager' in window){
       let reg=await navigator.serviceWorker.getRegistration('/');
       if(reg)sub=await reg.pushManager.getSubscription();
     }
     if(!sub){clearLocalPushFlags();return true}
     let serverDetached=false,localDetached=false;
     // During a pending logout the HttpOnly cookie may still be valid even though
     // local UI state has already been cleared. eplanFetch explicitly allows this
     // one authenticated DELETE before /logout so the server binding can be removed.
     if(navigator.onLine){
       try{
         const r=await eplanFetch(A+'/push/subscribe',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})},5000);
         serverDetached=r.ok;
       }catch(_){ }
     }
     try{localDetached=(await sub.unsubscribe())!==false}catch(_){ }
     if(serverDetached||localDetached){clearLocalPushFlags();return true}
     if(!silent)console.warn('Push unsubscribe failed');
     return false;
   }catch(e){
     if(!silent)console.warn('Push unsubscribe failed',e);
     return false;
   }
 })();
 try{return await pushDetachTask}finally{pushDetachTask=null}
}

async function phoneNotificationEnabled(){
 try{
   if(!sessionVerified||logoutPending||!sessionOwner())return false;
   if(!('Notification' in window)||Notification.permission!=='granted')return false;
   if(!('serviceWorker' in navigator)||!('PushManager' in window))return false;
   let reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
   if(!sub){clearLocalPushFlags();return false}
   let bound=localStorage.getItem('eplanPushBoundOwner')||'';
   return bound===sessionOwner()&&localStorage.getItem(pushStorageKey())==='1';
 }catch(e){return false}
}

async function refreshPhoneNotificationButton(btn){
 if(!btn)return;
 let enabled=await phoneNotificationEnabled();
 btn.dataset.enabled=enabled?'1':'0';
 btn.textContent=enabled?'✓ Сповіщення на телефоні увімкнено':'🔔 Увімкнути сповіщення на телефоні';
 btn.classList.toggle('push-enabled',enabled);
}

async function enablePhoneNotifications(btn=null){
 if(!sessionVerified||logoutPending)return false;
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
   let recipient=session.role,clientId=session.role==='client'?session.client_id:0;
   const register=()=>{let j=sub.toJSON();return api('/push/subscribe',{method:'POST',body:JSON.stringify({client_id:clientId,recipient,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth})})};
   try{await register()}catch(e){
     if(e.status!==409)throw e;
     // A browser subscription previously bound to another account cannot be
     // reassigned by that account's identifier. Obtain a fresh subscription.
     await sub.unsubscribe();
     sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(key.public_key)});
     await register();
   }
   localStorage.setItem(pushStorageKey(),'1');
   localStorage.setItem('eplanPushBoundOwner',sessionOwner());
   return done(true);
 }catch(e){
   console.warn('Push subscribe failed',e);
   alert('Не вдалося підключити push-сповіщення. Перевір, що «Є ПЛАН» додано на початковий екран iPhone.');
   return done(false);
 }
}

async function autoRegisterPhoneNotifications(){
 if(!('Notification' in window)||Notification.permission!=='granted'||!sessionVerified||logoutPending)return;
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

function notificationTrashIcon(){
 return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
}
function notificationEmptyHTML(){
 return '<div class="notification-empty">'+uiIcon('bell')+'<strong>Сповіщень немає</strong><span>Нові події з’являться тут.</span></div>';
}
function syncNotificationModalEmpty(){
 let list=document.getElementById('notificationList');if(!list)return;
 if(list.querySelector('.notification-swipe'))return;
 list.innerHTML=notificationEmptyHTML();
 document.getElementById('notificationClearAllBtn')?.remove();
}
async function showTrainerNotifications(){
 let xs=(await api('/notifications/trainer/all')).filter(x=>x.client_name&&x.client_name!=='Незнакомец'&&+x.client_id>0);
 refreshTrainerGlobalBadge();
 let body=xs.length?xs.map(x=>`<div class="notification-swipe" data-notification-id="${x.id}">
   <button class="notification-delete-bg notification-delete" aria-label="Видалити сповіщення" onclick="event.stopPropagation();deleteTrainerNotification(${x.id},this)">${notificationTrashIcon()}</button>
   <div class="notification-item ${x.is_read?'':'unread'}" onclick="openTrainerNotification(${x.id},${x.client_id})">
     ${x.is_read?'':'<span class="notification-dot"></span>'}
     <div class="notification-item-top"><strong>${esc(x.client_name||'Клієнт')}</strong><time>${String(x.created_at||'').replace('T',' ').slice(0,16)}</time></div>
     <p>${esc(x.message)}</p>
   </div>
 </div>`).join(''):notificationEmptyHTML();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal notification-modal" id="notificationModal" onclick="if(event.target===this)this.remove()">
   <div class="card notification-modal-card">
     <div class="notification-modal-head">
       <div><small>ЦЕНТР ПОДІЙ</small><h2>Сповіщення</h2></div>
       <div class="notification-modal-actions">
         ${xs.length?'<button id="notificationClearAllBtn" class="notification-clear-all" onclick="clearTrainerNotifications(this)">Очистити все</button>':''}
         <button class="notification-close" onclick="notificationModal.remove()" aria-label="Закрити">✕</button>
       </div>
     </div>
     <button id="phoneNotifyEnableBtn" class="phone-notify-enable notification-phone-toggle" onclick="enablePhoneNotifications(this)">🔔 Увімкнути сповіщення на телефоні</button>
     <div id="notificationList" class="notification-list">${body}</div>
   </div>
 </div>`);
 initNotificationSwipes();
 refreshPhoneNotificationButton($('#phoneNotifyEnableBtn'));
}
async function clearTrainerNotifications(btn){
 if(!confirm('Очистити всі сповіщення?'))return;
 let prev=btn.textContent;btn.disabled=true;btn.textContent='Очищення…';
 try{
   await api('/notifications/trainer/all',{method:'DELETE'});
   let list=document.getElementById('notificationList');if(list)list.innerHTML=notificationEmptyHTML();
   btn.remove();
   refreshTrainerGlobalBadge();
 }catch(e){
   btn.disabled=false;btn.textContent=prev;
   alert(e?.message||'Не вдалося очистити сповіщення.');
 }
}
function initNotificationSwipes(){
 document.querySelectorAll('.notification-swipe').forEach(row=>{
   let item=row.querySelector('.notification-item'),sx=0,dx=0;if(!item)return;
   item.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;dx=0},{passive:true});
   item.addEventListener('touchmove',e=>{dx=e.touches[0].clientX-sx;if(dx<0)item.style.transform=`translateX(${Math.max(-84,dx)}px)`},{passive:true});
   item.addEventListener('touchend',()=>{row.classList.toggle('reveal',dx<-34);item.style.transform=''});
 });
}
async function deleteTrainerNotification(nid,btn){
 try{
   await api('/notifications/item/'+nid,{method:'DELETE'});
   btn.closest('.notification-swipe')?.remove();
   syncNotificationModalEmpty();
   refreshTrainerGlobalBadge();
 }catch(e){alert(e?.message||'Не вдалося видалити сповіщення.')}
}
async function openTrainerNotification(nid,cid){
 let xs=await api('/notifications/trainer/all'),note=xs.find(x=>+x.id===+nid);
 if(!note)return;
 try{
   if(!note.is_read&&nid>0)await api('/notifications/item/'+nid+'/read',{method:'PATCH'});
   $('#notificationModal')?.remove();

   if(note.kind==='workout_finished'||note.target_tab==='results'){
     await openClient(cid,'progress');
     refreshTrainerGlobalBadge();
     setTimeout(()=>openTrainerWorkoutCalendar(note.target_day||'',+note.target_session_id||0),100);
     return;
   }

   if(note.kind==='comment'&&note.target_day){
     await openClient(cid,'calendar');
     refreshTrainerGlobalBadge();
     let day=note.target_day||'';
     if(day)setTimeout(()=>showCalendarDay(day,null,true,+note.target_session_id||0),80);
     return;
   }

   let tab='profile';
   if(note.target_tab==='program')tab='program';
   else if(note.target_tab==='nutrition')tab='nutrition';
   else if(note.target_tab==='notes')tab='notes';
   else if(note.target_tab==='calendar')tab='calendar';
   else if(note.target_tab==='profile'||note.kind==='checkin'||note.kind==='cardio')tab='profile';

   await openClient(cid,tab);
   refreshTrainerGlobalBadge();

   if(note.kind==='checkin'){
     setTimeout(()=>document.querySelector('.trainer-checkin-card')?.scrollIntoView({behavior:'smooth',block:'center'}),100);
   }else if(note.kind==='cardio'){
     setTimeout(()=>document.querySelector('.trainer-overview-card')?.scrollIntoView({behavior:'smooth',block:'start'}),100);
   }
 }catch(e){
   console.error('Є ПЛАН: notification navigation failed',e);
   refreshTrainerGlobalBadge();
   alert('Не вдалося відкрити це сповіщення. Спробуй ще раз.');
 }
}

function focusTrainerPendingWorkoutNotification(n){
 let sid=+n?.target_session_id||0,day=n?.target_day||'';
 let card=sid?document.querySelector('#trainerPendingReviewQueue .trainer-review-card[data-session="'+sid+'"]'):null;
 if(!card&&day){
   card=[...document.querySelectorAll('#trainerPendingReviewQueue .trainer-review-card')].find(x=>{
     let small=x.querySelector('.trainer-review-main small');
     return small&&String(small.textContent||'').trim()===String(day);
   })||null;
 }
 if(card){
   let btn=card.querySelector('.trainer-review-toggle'),body=card.querySelector('.trainer-review-detail');
   if(body?.classList.contains('hidden')&&btn)toggleTrainerPendingReview(btn);
   card.classList.add('notification-focus');
   card.scrollIntoView({behavior:'smooth',block:'center'});
   setTimeout(()=>card.classList.remove('notification-focus'),3000);
   return;
 }
 // If this workout has already been reviewed, fall back to its calendar record
 // instead of throwing the trainer back to Home.
 if(day){
   let calendarBtn=document.querySelector('.trainer-client-tabs [data-tab="calendar"]');
   showTrainerClientTab('calendar',calendarBtn,false);
   setTimeout(()=>showCalendarDay(day,null,true,sid),60);
 }
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
 let body=xs.length?xs.map(x=>`<div class="notification-swipe" data-notification-id="${x.id}">
   <button class="notification-delete-bg notification-delete client-notification-delete" aria-label="Видалити сповіщення" onclick="event.stopPropagation();deleteClientNotification(${x.id},${cid},'${recipient}',this)">${notificationTrashIcon()}</button>
   <div class="notification-item ${x.is_read?'':'unread'}" onclick="if(this.closest('.notification-swipe')?.classList.contains('reveal')){event.stopPropagation();this.closest('.notification-swipe').classList.remove('reveal');return}openNotification(${x.id},${cid},'${recipient}')">
     ${x.is_read?'':'<span class="notification-dot"></span>'}
     <div class="notification-item-top"><strong>Повідомлення</strong><time>${String(x.created_at||'').replace('T',' ').slice(0,16)}</time></div>
     <p>${esc(x.message)}</p>
   </div>
 </div>`).join(''):notificationEmptyHTML();
 document.body.insertAdjacentHTML('beforeend',`<div class="modal notification-modal" id="notificationModal" onclick="if(event.target===this)this.remove()">
   <div class="card notification-modal-card">
     <div class="notification-modal-head">
       <div><small>ЦЕНТР ПОДІЙ</small><h2>Сповіщення</h2></div>
       <div class="notification-modal-actions">
         ${xs.length?'<button id="notificationClearAllBtn" class="notification-clear-all" onclick="clearClientNotifications('+cid+',\''+recipient+'\',this)">Очистити все</button>':''}
         <button class="notification-close" onclick="notificationModal.remove()" aria-label="Закрити">✕</button>
       </div>
     </div>
     <button id="phoneNotifyEnableBtn" class="phone-notify-enable notification-phone-toggle" onclick="enablePhoneNotifications(this)">🔔 Увімкнути сповіщення на телефоні</button>
     <div id="notificationList" class="notification-list">${body}</div>
   </div>
 </div>`);
 initNotificationSwipes();
 setTimeout(()=>refreshPhoneNotificationButton(document.getElementById('phoneNotifyEnableBtn')),0);
}
async function deleteClientNotification(nid,cid,recipient,btn){
 try{
   await api('/notifications/item/'+nid,{method:'DELETE'});
   btn.closest('.notification-swipe')?.remove();
   syncNotificationModalEmpty();
   refreshNotificationBadge(cid,recipient,recipient==='trainer'?'trainerNotifyBtn':'clientNotifyBtn');
 }catch(e){
   alert(e?.message||'Не вдалося видалити сповіщення.');
 }
}
async function clearClientNotifications(cid,recipient,btn){
 if(!confirm('Очистити всі сповіщення?'))return;
 let prev=btn.textContent;btn.disabled=true;btn.textContent='Очищення…';
 try{
   await api('/notifications/'+cid+'/all?recipient='+encodeURIComponent(recipient),{method:'DELETE'});
   let list=document.getElementById('notificationList');if(list)list.innerHTML=notificationEmptyHTML();
   btn.remove();
   refreshNotificationBadge(cid,recipient,recipient==='trainer'?'trainerNotifyBtn':'clientNotifyBtn');
 }catch(e){
   btn.disabled=false;btn.textContent=prev;
   alert(e?.message||'Не вдалося очистити сповіщення.');
 }
}

function returnFromNotificationDetail(){
 document.getElementById('notificationDetailModal')?.remove();
 document.getElementById('notificationModal')?.classList.remove('notification-list-hidden');
}
function closeNotificationDetail(){
 document.getElementById('notificationDetailModal')?.remove();
 document.getElementById('notificationModal')?.remove();
}

async function openNotification(nid,cid,recipient){
 let xs=await api('/notifications/'+cid+'?recipient='+recipient),n=xs.find(x=>x.id===nid);if(!n)return;
 if(!n.is_read)await api('/notifications/item/'+nid+'/read',{method:'PATCH'});
 let listModal=document.getElementById('notificationModal');
 let row=listModal?.querySelector('[data-notification-id="'+nid+'"]');
 row?.querySelector('.notification-item')?.classList.remove('unread');
 row?.querySelector('.notification-dot')?.remove();
 listModal?.classList.add('notification-list-hidden');
 document.body.insertAdjacentHTML('beforeend',`<div class="modal notification-modal" id="notificationDetailModal" onclick="if(event.target===this)closeNotificationDetail()"><div class="card notification-modal-card notification-detail-card"><div class="notification-modal-head"><div><small>СПОВІЩЕННЯ</small><h2>Повідомлення</h2></div><button class="notification-close" onclick="closeNotificationDetail()">✕</button></div><div class="notification-detail-message"><p>${esc(n.message)}</p><time>${String(n.created_at||'').replace('T',' ').slice(0,16)}</time></div><button class="notification-detail-back" onclick="returnFromNotificationDetail()">← Назад</button></div></div>`);
 refreshNotificationBadge(cid,recipient,recipient==='trainer'?'trainerNotifyBtn':'clientNotifyBtn');
}

async function markNotificationsRead(cid,recipient){
 await api('/notifications/'+cid+'/read',{method:'PATCH',body:JSON.stringify({recipient})});
 notificationModal.remove();
 if(session.role==='trainer')openClient(cid);else clientCabinet(cid)
}
