
(function(){
  const splash=document.getElementById('eplanSplash');
  if(!splash)return;
  const started=performance.now();
  const hide=()=>{
    const wait=Math.max(0,900-(performance.now()-started));
    setTimeout(()=>{
      splash.classList.add('is-hidden');
      setTimeout(()=>splash.remove(),180);
    },wait);
  };
  const pageLoaded=document.readyState==='complete'
    ? Promise.resolve()
    : new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
  const appReady=(typeof authReady!=='undefined'&&authReady&&typeof authReady.then==='function')
    ? Promise.resolve(authReady).catch(()=>{})
    : Promise.resolve();
  Promise.all([pageLoaded,appReady]).then(()=>{
    const mount=document.getElementById('app');
    if(mount&&!mount.innerHTML.trim()){
      document.body.style.background='#f8fbff';
      document.body.style.color='#0a1738';
      mount.innerHTML='<main style="max-width:520px;margin:12vh auto;padding:24px;font-family:system-ui,-apple-system,sans-serif"><div style="background:#fff;border:1px solid #e1e8f2;border-radius:22px;padding:22px;box-shadow:0 18px 48px rgba(31,64,104,.08)"><strong style="display:block;font-size:20px;margin-bottom:8px">Не вдалося запустити застосунок</strong><p style="margin:0 0 16px;color:#69758e">Онови застосунок ще раз. Дані акаунта не видаляються.</p><button id="startupReload" style="width:100%;padding:13px 16px;border:0;border-radius:14px;background:#1677ff;color:#fff;font-weight:800;font-size:15px">Оновити</button></div></main>';
      document.getElementById('startupReload')?.addEventListener('click',()=>location.reload());
    }
    hide();
  });
})();

document.addEventListener('DOMContentLoaded',()=>setTimeout(syncAllPasswordEyes,0));
let passwordEyeSyncQueued=false;
const passwordEyeObserver=new MutationObserver(()=>{
  if(passwordEyeSyncQueued)return;
  passwordEyeSyncQueued=true;
  queueMicrotask(()=>{
    passwordEyeSyncQueued=false;
    syncAllPasswordEyes();
  });
});
passwordEyeObserver.observe(document.documentElement,{childList:true,subtree:true});
