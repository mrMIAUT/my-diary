const VERSION='eplan-v68';
const APP_SHELL_CACHE='eplan-app-shell-'+VERSION;
const APP_SHELL_URLS=[
  '/',
  '/manifest.webmanifest?v=66',
  '/static/icons/apple-touch-icon.png?v=66',
  '/static/icons/icon-192.png?v=65',
  '/static/icons/icon-512.png?v=65',
  '/static/css/base.css',
  '/static/css/components.css',
  '/static/css/refinements.css',
  '/static/css/today.css',
  '/static/css/layout.css',
  '/static/css/redesign.css?v=135',
  '/static/js/core.js?v=78',
  '/static/js/auth.js?v=67',
  '/static/js/trainer.js',
  '/static/js/client.js?v=120',
  '/static/js/home-redesign.js?v=131',
  '/static/js/activity.js?v=124',
  '/static/js/program.js?v=91',
  '/static/js/library.js',
  '/static/js/calendar.js?v=124',
  '/static/js/results.js',
  '/static/js/progress-redesign.js?v=82',
  '/static/js/nutrition.js',
  '/static/js/nutrition-redesign.js?v=121',
  '/static/js/more-redesign.js?v=136',
  '/static/js/measurements.js?v=89',
  '/static/js/workout.js?v=130',
  '/static/js/training-redesign.js?v=95',
  '/static/js/timer.js?v=107',
  '/static/js/workout-lyfta.js?v=128',
  '/static/js/notifications.js?v=125',
  '/static/js/app.js?v=136',
  '/static/js/pwa.js?v=68',
  '/static/js/startup-ui.js?v=90'
];
let restTimerHandle=null;

async function cacheAppShell(){
  const cache=await caches.open(APP_SHELL_CACHE);
  await Promise.all(APP_SHELL_URLS.map(async url=>{
    try{
      const response=await fetch(url,{cache:'no-store'});
      if(response&&response.ok)await cache.put(url,response.clone());
    }catch(_){}
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await cacheAppShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('eplan-app-shell-')&&k!==APP_SHELL_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(APP_SHELL_CACHE);
      try{
        const response=await fetch(req,{cache:'no-store'});
        if(response&&response.ok)await cache.put('/',response.clone());
        return response;
      }catch(_){
        const cached=await cache.match('/');
        if(cached)return cached;
        return new Response(
          '<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080909"></head><body style="margin:0;background:#080909;color:#f4f4f5;font-family:system-ui;padding:32px"><h2 style="color:#ffd000">Є ПЛАН</h2><p>Не вдалося відкрити збережену версію застосунку. Підключи інтернет і відкрий застосунок ще раз.</p></body></html>',
          {headers:{'Content-Type':'text/html; charset=utf-8'}}
        );
      }
    })());
    return;
  }

  const isShellAsset=url.pathname.startsWith('/static/')||url.pathname==='/manifest.webmanifest'||url.pathname==='/apple-touch-icon.png';
  if(isShellAsset){
    event.respondWith((async()=>{
      const cache=await caches.open(APP_SHELL_CACHE);
      try{
        const response=await fetch(req,{cache:'no-store'});
        if(response&&response.ok)await cache.put(req,response.clone());
        return response;
      }catch(_){
        return (await cache.match(req))||(await cache.match(req,{ignoreSearch:true}))||Response.error();
      }
    })());
    return;
  }

  // API/private GETs deliberately stay network-only here. The app's scoped
  // IndexedDB cache handles authenticated offline data without putting it into
  // shared Cache Storage.
  event.respondWith(fetch(req,{cache:'no-store'}));
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
        icon:'/static/icons/icon-192.png?v=65',
        badge:'/static/icons/icon-192.png?v=65',
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
    icon:'/static/icons/icon-192.png?v=65',
    badge:'/static/icons/icon-192.png?v=65',
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
