const VERSION='eplan-v50';
let restTimerHandle=null;

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>new Response(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080909"></head><body style="margin:0;background:#080909;color:#f4f4f5;font-family:system-ui;padding:32px"><h2 style="color:#ffd000">Є ПЛАН</h2><p>Не вдалося підключитися до сервера. Перевір інтернет і відкрий застосунок ще раз.</p></body></html>`,
      {headers:{'Content-Type':'text/html; charset=utf-8'}}
    )));
    return;
  }
  event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
});
self.addEventListener('message',event=>{
  const d=event.data||{};
  if(d.type==='CANCEL_REST_TIMER'){
    if(restTimerHandle) clearTimeout(restTimerHandle);
    restTimerHandle=null;
  }
  if(d.type==='REST_TIMER'&&d.end){
    if(restTimerHandle) clearTimeout(restTimerHandle);
    const wait=Math.max(0,Number(d.end)-Date.now());
    restTimerHandle=setTimeout(()=>{
      self.registration.showNotification('Є ПЛАН · Відпочинок завершено',{
        body:'Час починати наступний підхід.',
        icon:'/static/icons/icon-192.png',
        badge:'/static/icons/icon-192.png',
        tag:'eplan-rest-finished',
        renotify:true
      });
    },wait);
  }
});
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(e){data={body:event.data?.text()||''}}
  event.waitUntil(self.registration.showNotification(data.title||'Є ПЛАН',{
    body:data.body||'',
    icon:'/static/icons/icon-192.png',
    badge:'/static/icons/icon-192.png',
    data:{url:data.url||'/'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){
      if('navigate' in client) await client.navigate(url);
      if('focus' in client) return client.focus();
    }
    return clients.openWindow(url);
  })());
});
