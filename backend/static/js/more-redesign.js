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

function achievementHeatmapData(sessions){
  let active=new Set(sessions.map(x=>sessionDay(x)).filter(Boolean));
  let today=new Date();today.setHours(12,0,0,0);
  let monday=new Date(today),wd=(monday.getDay()+6)%7;
  monday.setDate(monday.getDate()-wd);
  let start=new Date(monday);start.setDate(start.getDate()-49);
  let cells=[],windowStart=start.toISOString().slice(0,10),todayKey=today.toISOString().slice(0,10);

  for(let week=0;week<8;week++){
    for(let dow=0;dow<7;dow++){
      let d=new Date(start);d.setDate(start.getDate()+week*7+dow);
      let day=d.toISOString().slice(0,10),future=d>today,isActive=active.has(day);
      let cls=(isActive?'active ':'')+(future?'future ':'')+(day===todayKey?'today':'');
      cells.push('<i class="'+cls.trim()+'" title="'+esc(formatProgressDate(day))+'">'+(isActive?uiIcon('dumbbell'):'')+'</i>');
    }
  }

  let weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
  let count=sessions.filter(x=>{let day=sessionDay(x);return day&&day>=windowStart&&day<=todayKey}).length;
  let html='<div class="achievement-heatmap-wrap">'
    +'<div class="achievement-heatmap-weekdays">'+weekdays.map(x=>'<span>'+x+'</span>').join('')+'</div>'
    +'<div class="achievement-heatmap-main"><div class="achievement-heatmap">'+cells.join('')+'</div>'
    +'<div class="achievement-heatmap-scale"><span>8 тижнів</span><span>Зараз</span></div></div>'
    +'</div>';
  return {html,count};
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

let achievementPRExpanded=false;

function achievementRecentPRs(d){
  let sets=(d.result_sets||[])
    .filter(x=>x.day&&(+x.weight||0)>0)
    .slice()
    .sort((a,b)=>String(a.day||'').localeCompare(String(b.day||''))||(+a.id||0)-(+b.id||0));

  // A workout can contain several progressively heavier sets. Count at most
  // one record event per exercise per day by using that day's heaviest set.
  let daily={};
  sets.forEach(x=>{
    let exercise=String(x.exercise||'Вправа').trim()||'Вправа';
    let key=x.day+'__'+exercise;
    let weight=+x.weight||0;
    if(!daily[key]||weight>(+daily[key].weight||0))daily[key]={exercise,day:x.day,weight};
  });

  let best={},events=[];
  Object.values(daily)
    .sort((a,b)=>String(a.day).localeCompare(String(b.day))||a.exercise.localeCompare(b.exercise,'uk'))
    .forEach(x=>{
      let previous=best[x.exercise]||0;
      if(x.weight>previous){
        events.push({
          exercise:x.exercise,
          day:x.day,
          previous,
          current:x.weight,
          delta:previous?x.weight-previous:0,
          first:!previous
        });
        best[x.exercise]=x.weight;
      }
    });

  events.sort((a,b)=>String(b.day).localeCompare(String(a.day))||(+b.current||0)-(+a.current||0));

  let cutoff=new Date();
  cutoff.setHours(12,0,0,0);
  cutoff.setDate(cutoff.getDate()-29);
  let cutoffKey=cutoff.toISOString().slice(0,10);
  let recent=events.filter(x=>x.day>=cutoffKey);

  return {all:events,recent,count30:recent.length};
}

function redesignAchievementsHTML(d){
  let sessions=(d.workout_sessions||[]).filter(x=>x.status==='finished');
  let streak=achievementWeekStreak(sessions);
  let records=achievementRecords(d);
  let recentPRs=achievementRecentPRs(d);
  let heatmap=achievementHeatmapData(sessions);
  let visiblePRs=achievementPRExpanded?recentPRs.all:recentPRs.recent.slice(0,3);
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
    +'<div class="card achievement-activity-card"><div class="between"><div><span class="achievement-kicker">Активність</span><strong>Останні 8 тижнів</strong></div><span class="achievement-count">'+heatmap.count+' трен.</span></div>'+heatmap.html+'</div>'
    +'<div class="achievement-section-head"><h2>Особисті рекорди</h2><span>'+records.length+'</span></div>'
    +(records.length?'<div class="achievement-record-list">'+records.map((x,i)=>'<div class="achievement-record-row"><span class="record-rank">'+(i+1)+'</span><div><strong>'+esc(x.exercise||'Вправа')+'</strong><small>'+esc(formatProgressDate(x.day))+'</small></div><b>'+fmtProgress(+x.weight||0)+' кг</b></div>').join('')+'</div>':'<div class="redesign-empty-panel"><strong>Рекордів ще немає</strong><span>Після тренувань з вагами вони з’являться тут автоматично.</span></div>')
    +'<div class="card achievement-pr-card">'
      +'<div class="achievement-pr-head"><div><h2>Нові рекорди</h2><span>за останні 30 днів</span></div><div class="achievement-pr-summary"><strong>'+recentPRs.count30+'</strong><small>нових PR</small></div></div>'
      +(visiblePRs.length?'<div class="achievement-pr-events">'+visiblePRs.map(x=>
        '<div class="achievement-pr-event">'
          +'<span class="achievement-pr-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M10 7h7v7"/></svg></span>'
          +'<div class="achievement-pr-copy"><strong>'+esc(x.exercise)+'</strong><small>'+esc(formatProgressDate(x.day))+'</small></div>'
          +'<div class="achievement-pr-values">'
            +(x.first
              ?'<div class="achievement-pr-main first"><b>'+fmtProgress(x.current)+' кг</b></div><small class="achievement-pr-delta first">Перший результат</small>'
              :'<div class="achievement-pr-main"><span>'+fmtProgress(x.previous)+' кг</span><b>→ '+fmtProgress(x.current)+' кг</b></div><small class="achievement-pr-delta">+'+fmtProgress(x.delta)+' кг</small>')
          +'</div>'
        +'</div>').join('')+'</div>'
        :'<div class="redesign-empty-panel"><strong>Нових рекордів поки немає</strong><span>Коли робоча вага перевищить твій попередній максимум, рекорд з’явиться тут.</span></div>')
      +(recentPRs.all.length>3?'<button class="achievement-pr-more" onclick="toggleAchievementPRList()">'+(achievementPRExpanded?'Згорнути':'Переглянути всі')+' <span>›</span></button>':'')
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
      +redesignMoreItem('bell','Сповіщення','Налаштування повідомлень','showClientNotificationSettings('+cid+')')
      +redesignMoreItem('message','Допомога','Відповіді на часті питання','showClientHelp('+cid+')')
    +'</div>'
    +'<div class="redesign-more-settings-card"><div><strong>Мова</strong><small>Мова інтерфейсу</small></div><div class="redesign-language-switch"><button class="'+(appLanguage==='uk'?'active':'')+'" onclick="setLanguage(\'uk\')">UA</button><button class="'+(appLanguage==='en'?'active':'')+'" onclick="setLanguage(\'en\')">EN</button></div></div>'
    +'<button class="redesign-more-logout" onclick="logout()">'+uiIcon('logout')+' Вийти з акаунта</button>'
  +'</div>';
  app.innerHTML=shell(body);
  refreshNotificationBadge(cid,'client','clientNotifyBtn');
};

window.toggleAchievementPRList = function(){
  achievementPRExpanded=!achievementPRExpanded;
  let cid=window.currentClientData?.client?.id||session?.client_id||0;
  showClientAchievements(cid);
};

window.showClientAchievements = function(cid){
  let d=window.currentClientData||{};currentClientView='progress';
  app.innerHTML=shell('<div class="client-section-page redesign-more-subpage"><div class="redesign-back-title"><button class="unified-back-button" onclick="showClientSection(\'progress\')" aria-label="Назад">‹</button><h1>Досягнення</h1></div>'+redesignAchievementsHTML(d)+'</div>');
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
