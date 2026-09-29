(async()=>{
 const log=document.getElementById('log'),status=document.getElementById('status'),go=document.getElementById('go');
 const say=x=>log.textContent+=x+'\n';
 try{
  if('serviceWorker'in navigator){
   const regs=await navigator.serviceWorker.getRegistrations();say('Service workers: '+regs.length);
   for(const r of regs)say('unregister '+r.scope+' → '+await r.unregister());
  }else say('Service Worker API: unavailable');
 }catch(e){say('SW error: '+e)}
 try{
  if('caches'in window){
   const keys=await caches.keys();say('Caches: '+keys.length);
   for(const k of keys)say('delete '+k+' → '+await caches.delete(k));
  }
 }catch(e){say('Cache error: '+e)}
 status.textContent='Готово. Старі Service Worker та кеші очищено.';
 go.hidden=false;go.addEventListener('click',()=>location.replace('/app?clean=57'));
})();
