
(function(){
  const splash=document.getElementById('eplanSplash');
  if(!splash)return;
  const started=performance.now();
  const hide=()=>{
    const wait=Math.max(0,1250-(performance.now()-started));
    setTimeout(()=>{
      splash.classList.add('is-hidden');
      setTimeout(()=>splash.remove(),180);
    },wait);
  };
  if(document.readyState==='complete') hide();
  else window.addEventListener('load',hide,{once:true});
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
