let restTimerHandle=null;
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
 const d=e.data||{};
 if(d.type==='CANCEL_REST_TIMER'){if(restTimerHandle)clearTimeout(restTimerHandle);restTimerHandle=null;return}
 if(d.type==='REST_TIMER'&&d.end){
   if(restTimerHandle)clearTimeout(restTimerHandle);
   const delay=Math.max(0,+d.end-Date.now());
   restTimerHandle=setTimeout(()=>{self.registration.showNotification('Є ПЛАН · Відпочинок завершено',{body:'Час починати наступний підхід.',icon:'/static/icon-192.png',badge:'/static/icon-192.png',tag:'eplan-rest-finished',renotify:true,vibrate:[180,90,180,90,260]});restTimerHandle=null},delay);
 }
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 const url=e.notification.data?.url||'/';
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(xs=>{
   if(xs.length){xs[0].navigate(url);return xs[0].focus()}
   return clients.openWindow(url);
 }));
});

self.addEventListener('push',event=>{
 let d={};try{d=event.data?event.data.json():{}}catch(e){d={body:event.data?event.data.text():'Нове сповіщення'}}
 event.waitUntil(self.registration.showNotification(d.title||'Є ПЛАН',{
   body:d.body||'Нове сповіщення',icon:'/static/icon-192.png',badge:'/static/icon-192.png',
   tag:'eplan-'+Date.now(),data:{url:d.url||'/'}
 }));
});
