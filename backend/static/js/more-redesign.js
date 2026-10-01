// Redesign V1 — client More tab.

function redesignMoreItem(icon,title,subtitle,action,tone='blue'){
  return '<button class="redesign-more-item" onclick="'+action+'">'
    +'<span class="redesign-more-icon '+tone+'">'+uiIcon(icon)+'</span>'
    +'<span class="redesign-more-copy"><strong>'+esc(title)+'</strong><small>'+esc(subtitle)+'</small></span>'
    +'<span class="redesign-more-chevron">›</span>'
  +'</button>';
}

function achievementWeekKey(day){
  let d=new Date(day+'T12:00:00');if(Number.isNaN(d.getTime()))return '';
  let wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);
  return d.toISOString().slice(0,10);
}

function achievementWeekStreak(sessions){
  let weeks=[...new Set(sessions.map(x=>sessionDay(x)).filter(Boolean).map(achievementWeekKey))].sort();
  if(!weeks.length)return 0;
  let cur=new Date(),wd=(cur.getDay()+6)%7;cur.setDate(cur.getDate()-wd);cur.setHours(12,0,0,0);
  let currentKey=cur.toISOString().slice(0,10);
  let last=weeks[weeks.length-1];
  if(last!==currentKey){
    cur.setDate(cur.getDate()-7);
    if(last!==cur.toISOString().slice(0,10))return 0;
  }
  let streak=0,cursor=new Date(last+'T12:00:00');
  let set=new Set(weeks);
  while(set.has(cursor.toISOString().slice(0,10))){
    streak++;cursor.setDate(cursor.getDate()-7);
  }
  return streak;
}

function achievementHeatmapHTML(sessions){
  let active=new Set(sessions.map(x=>sessionDay(x)).filter(Boolean));
  let today=new Date(),cells=[];
  today.setHours(12,0,0,0);
  for(let i=55;i>=0;i--){
    let d=new Date(today);d.setDate(today.getDate()-i);
    let day=d.toISOString().slice(0,10);
    cells.push('<i class="'+(active.has(day)?'active':'')+'" title="'+esc(formatProgressDate(day))+'"></i>');
  }
  return '<div class="achievement-heatmap">'+cells.join('')+'</div>';
}

function achievementRecords(d){
  let sets=(d.result_sets||[]).filter(x=>x.day&&(+x.weight||0)>0);
  let by={};
  sets.forEach(x=>{
    let name=String(x.exercise||'Вправа').trim()||'Вправа';
    if(!by[name]||(+x.weight||0)>(+by[name].weight||0))by[name]=x;
  });
  return Object.values(by).sort((a,b)=>(+b.weight||0)-(+a.weight||0)).slice(0,5);
}

function achievementMonthlyPRs(d){
  let sets=(d.result_sets||[]).filter(x=>x.day&&(+x.weight||0)>0).slice().sort((a,b)=>a.day.localeCompare(b.day));
  let best={},months={};
  sets.forEach(x=>{
    let key=String(x.exercise||'Вправа'),w=+x.weight||0;
    if(w>(best[key]||0)){
      best[key]=w;
      let m=x.day.slice(0,7);
      months[m]=(months[m]||0)+1;
    }
  });
  return months;
}

function redesignAchievementsHTML(d){
  let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished');
  let streak=achievementWeekStreak(sessions);
  let records=achievementRecords(d);
  let monthly=achievementMonthlyPRs(d);
  let monthKeys=Object.keys(monthly).sort().slice(-6);
  let maxPR=Math.max(1,...monthKeys.map(m=>monthly[m]||0));
  let milestones=[
    {n:1,label:'Перше тренування',done:sessions.length>=1},
    {n:10,label:'10 тренувань',done:sessions.length>=10},
    {n:25,label:'25 тренувань',done:sessions.length>=25},
    {n:50,label:'50 тренувань',done:sessions.length>=50},
    {n:4,label:'4 тижні поспіль',done:streak>=4}
  ];
  let reached=milestones.filter(x=>x.done).length;

  return '<div class="redesign-achievements-page">'
    +'<div class="achievement-streak-card">'
      +'<div><span>Твоя серія</span><strong>'+streak+' '+ukDays(streak).replace('день','тиждень').replace('дні','тижні').replace('днів','тижнів')+'</strong><small>Тижнів поспіль з тренуваннями</small></div>'
      +'<span class="achievement-streak-icon">🔥</span>'
    +'</div>'
    +'<div class="card achievement-activity-card"><div class="between"><div><span class="achievement-kicker">Активність</span><strong>Останні 8 тижнів</strong></div><span class="achievement-count">'+sessions.length+' всього</span></div>'+achievementHeatmapHTML(sessions)+'</div>'
    +'<div class="achievement-section-head"><h2>Особисті рекорди</h2><span>'+records.length+'</span></div>'
    +(records.length?'<div class="achievement-record-list">'+records.map((x,i)=>'<div class="achievement-record-row"><span class="record-rank">'+(i+1)+'</span><div><strong>'+esc(x.exercise||'Вправа')+'</strong><small>'+esc(formatProgressDate(x.day))+'</small></div><b>'+fmtProgress(+x.weight||0)+' кг</b></div>').join('')+'</div>':'<div class="redesign-empty-panel"><strong>Рекордів ще немає</strong><span>Після тренувань з вагами вони з’являться тут автоматично.</span></div>')
    +'<div class="card achievement-pr-card"><div class="achievement-section-head inside"><h2>Нові рекорди</h2><span>за місяцями</span></div>'
      +(monthKeys.length?'<div class="achievement-pr-chart">'+monthKeys.map(m=>'<div><i style="height:'+Math.max(12,Math.round((monthly[m]/maxPR)*72))+'px"></i><b>'+monthly[m]+'</b><small>'+esc(new Date(m+'-01T12:00:00').toLocaleDateString('uk-UA',{month:'short'}))+'</small></div>').join('')+'</div>':'<div class="redesign-progress-empty-chart">Нові PR з’являться після прогресії робочих ваг.</div>')
    +'</div>'
    +'<div class="achievement-section-head"><h2>Етапи</h2><span>'+reached+' / '+milestones.length+'</span></div>'
    +'<div class="achievement-milestones">'+milestones.map(x=>'<div class="'+(x.done?'done':'')+'"><span>'+ (x.done?'✓':'○') +'</span><strong>'+esc(x.label)+'</strong></div>').join('')+'</div>'
    +'<div class="achievement-total-grid">'
      +'<div><strong>'+sessions.length+'</strong><small>тренувань</small></div>'
      +'<div><strong>'+streak+'</strong><small>тижнів серії</small></div>'
      +'<div><strong>'+records.length+'</strong><small>особистих рекордів</small></div>'
    +'</div>'
  +'</div>';
}

window.showClientMore = function(cid){
  let d=window.currentClientData||{},c=d.client||{},a=clientAccess(c);currentClientView='more';
  let body='<div class="client-section-page redesign-more-page"><h1>Більше</h1>'
    +'<div class="redesign-more-list">'
      +redesignMoreItem('user','Мій профіль','Особисті дані та анкета','showClientProfile('+cid+')')
      +redesignMoreItem('calendar','Історія тренувань','Усі виконані тренування','showClientSection(\'history\')')
      +redesignMoreItem('dumbbell','Вправи','Бібліотека вправ і техніка','showClientExerciseLibrary('+cid+')')
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


window.showClientExerciseLibrary = async function(cid){
  await loadExerciseLibrary();currentClientView='more';
  app.innerHTML=shell('<div class="client-section-page redesign-more-subpage"><div class="redesign-back-title"><button class="unified-back-button" onclick="showClientMore('+cid+')" aria-label="Назад">‹</button><h1>Вправи</h1></div>'+redesignClientExerciseLibraryHTML()+'</div>');
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};
