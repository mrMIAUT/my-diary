// Redesign V1 — client More tab.

function redesignMoreItem(icon,title,subtitle,action,tone='blue'){
  return '<button class="redesign-more-item" onclick="'+action+'">'
    +'<span class="redesign-more-icon '+tone+'">'+uiIcon(icon)+'</span>'
    +'<span class="redesign-more-copy"><strong>'+esc(title)+'</strong><small>'+esc(subtitle)+'</small></span>'
    +'<span class="redesign-more-chevron">›</span>'
  +'</button>';
}

function redesignAchievementsHTML(d){
  let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished');
  let measures=(d.measurements||[]).filter(x=>x.day);
  let nutrition=(d.nutrition||[]).filter(x=>x.day);
  let cards=[
    ['★',sessions.length+' тренувань','Завершено всього'],
    ['◎',measures.length+' замірів','Додано до прогресу'],
    ['✓',nutrition.length+' днів','Харчування заповнено']
  ];
  return '<div class="redesign-achievements-grid">'+cards.map(x=>'<div><span>'+x[0]+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></div>').join('')+'</div>';
}

window.showClientMore = function(cid){
  let d=window.currentClientData||{},c=d.client||{},a=clientAccess(c);currentClientView='more';
  let body='<div class="client-section-page redesign-more-page"><h1>Більше</h1>'
    +'<div class="redesign-more-list">'
      +redesignMoreItem('user','Мій профіль','Особисті дані та анкета','showClientProfile('+cid+')')
      +redesignMoreItem('calendar','Історія тренувань','Усі виконані тренування','showClientSection(\'history\')')
      +(a.features?.measurements?redesignMoreItem('measure','Мої заміри','Вага, талія та об’єми тіла','showClientSection(\'measurements\')','green'):'')
      +redesignMoreItem('chart','Досягнення','Результати та активність','showClientAchievements('+cid+')','orange')
      +redesignMoreItem('bell','Сповіщення','Налаштування повідомлень','showClientNotificationSettings('+cid+')')
      +redesignMoreItem('message','Допомога','Відповіді на часті питання','showClientHelp('+cid+')')
    +'</div>'
    +'<div class="redesign-more-settings-card"><div><strong>Мова</strong><small>Мова інтерфейсу</small></div><div class="redesign-language-switch"><button class="'+(appLanguage==='uk'?'active':'')+'" onclick="setLanguage(\'uk\')">UA</button><button class="'+(appLanguage==='en'?'active':'')+'" onclick="setLanguage(\'en\')">EN</button></div></div>'
    +'<button class="redesign-more-logout" onclick="logout()">'+uiIcon('logout')+' Вийти з акаунта</button>'
  +'</div>';
  app.innerHTML=shell(body);
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};

window.showClientAchievements = function(cid){
  let d=window.currentClientData||{};currentClientView='more';
  app.innerHTML=shell('<div class="client-section-page redesign-more-subpage"><div class="redesign-back-title"><button onclick="showClientMore('+cid+')">‹</button><h1>Досягнення</h1></div>'+redesignAchievementsHTML(d)+'</div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};

window.showClientNotificationSettings = function(cid){
  currentClientView='more';
  app.innerHTML=shell('<div class="client-section-page redesign-more-subpage"><div class="redesign-back-title"><button onclick="showClientMore('+cid+')">‹</button><h1>Сповіщення</h1></div><div class="card redesign-settings-panel"><strong>Сповіщення на телефоні</strong><p class="muted">Увімкни push-сповіщення, щоб не пропускати важливі оновлення.</p><button id="phoneNotifyEnableBtn" class="phone-notify-enable" onclick="enablePhoneNotifications(this)">Увімкнути сповіщення</button></div></div>');
  setTimeout(()=>refreshPhoneNotificationButton(document.getElementById('phoneNotifyEnableBtn')),0);
};

window.showClientHelp = function(cid){
  currentClientView='more';
  let qa=[
    ['Як почати тренування?','Відкрий вкладку «Тренування», обери наступний день і натисни «Почати тренування».'],
    ['Де дивитися прогрес?','У вкладці «Прогрес» є вага, заміри, тренування та історія змін.'],
    ['Як заповнювати БЖВ?','У «Харчування» натисни «Додати БЖВ» та внеси підсумок за день.']
  ];
  app.innerHTML=shell('<div class="client-section-page redesign-more-subpage"><div class="redesign-back-title"><button onclick="showClientMore('+cid+')">‹</button><h1>Допомога</h1></div><div class="redesign-help-list">'+qa.map((x,i)=>'<div class="redesign-help-item"><button onclick="toggleClientPanel(\'help'+i+'\',this)"><span><strong>'+esc(x[0])+'</strong></span><span>⌄</span></button><div id="help'+i+'" class="hidden"><p>'+esc(x[1])+'</p></div></div>').join('')+'</div></div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};
