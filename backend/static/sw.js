const CACHE_VERSION='eplan-v49';

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
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#090909;color:white;font-family:system-ui;padding:32px"><h2>Є ПЛАН</h2><p>Немає з’єднання з сервером. Перевір інтернет і відкрий застосунок ще раз.</p></body>',
      {headers:{'Content-Type':'text/html; charset=utf-8'}}
    )));
    return;
  }
  event.respondWith(fetch(req).catch(()=>caches.match(req)));
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(e){data={body:event.data?.text()||''}}
  event.waitUntil(self.registration.showNotification(data.title||'Є ПЛАН',{
    body:data.body||'',
    icon:'/static/icon-192.png',
    badge:'/static/icon-192.png',
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
