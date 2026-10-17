/* Theme preference: local to device, no API writes. */
(function(){
 const KEY='eplanThemePreference';
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 function choice(){try{const v=localStorage.getItem(KEY);return ['light','dark','system'].includes(v)?v:'light'}catch(e){return 'light'}}
 function apply(){
  const mode=choice(),dark=mode==='dark'||(mode==='system'&&media.matches);
  document.body.dataset.eplanTheme=dark?'dark':'light';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=dark?'#000000':'#f7faff';
  document.querySelectorAll('.eplan-theme-option').forEach(el=>el.setAttribute('aria-checked',String(el.dataset.mode===mode)));
 }
 window.eplanThemeChoice=choice;
 window.eplanSetTheme=function(mode){if(!['light','dark','system'].includes(mode))return;try{localStorage.setItem(KEY,mode)}catch(e){}apply()};
 window.eplanThemeOptionsHTML=function(){
  const mode=choice();
  return '<div class="card redesign-settings-panel"><strong>Тема оформлення</strong><div class="eplan-theme-options" role="radiogroup" aria-label="Тема оформлення">'
  +[['light','Світла'],['dark','Темна'],['system','Як на пристрої']].map(x=>'<button type="button" class="eplan-theme-option" role="radio" data-mode="'+x[0]+'" aria-checked="'+String(mode===x[0])+'" onclick="eplanSetTheme(\''+x[0]+'\')">'+x[1]+'</button>').join('')
  +'</div><p class="eplan-theme-note">Режим «Як на пристрої» автоматично змінює тему разом із налаштуваннями телефона.</p></div>';
 };
 if(media.addEventListener)media.addEventListener('change',apply);else if(media.addListener)media.addListener(apply);
 document.addEventListener('DOMContentLoaded',apply);
 new MutationObserver(()=>{if(document.body.classList.contains('client-ui')||document.body.classList.contains('trainer-ui'))apply()}).observe(document.body,{attributes:true,attributeFilter:['class']});
 apply();
})();
