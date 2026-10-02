
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
  Promise.all([pageLoaded,appReady]).then(hide);
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
