// V89 shared state and startup. Keep the executable statements in their original order.
// Load after all declaration-only feature scripts; do not add async/defer/type=module.

console.info('Є ПЛАН build 2026-09-23-v37');


const A='/api';
 const $=s=>document.querySelector(s);

let session=null;

try{
  const rawSession=localStorage.getItem('fitSession');
  session=rawSession?JSON.parse(rawSession):null;
}catch(e){
  console.warn('Є ПЛАН: invalid/unavailable fitSession; resetting standalone session',e);
  try{localStorage.removeItem('fitSession')}catch(_){}
  session=null;
}

let selected=null;
let calendarMonth=null;
let currentTrainerTab='profile';
let currentTrainerMainView='clients';

const OFFDB='eplan-offline-v1', OFFVER=1;

const apiMutationsInFlight=new Map();

let offSyncing=false;

window.addEventListener('online',()=>{hideOfflineStatus();syncOfflineQueue()});

window.addEventListener('offline',()=>offlineStatus('● Офлайн · дані зберігаються на телефоні'));

setTimeout(()=>{if(navigator.onLine)syncOfflineQueue();else offlineStatus('● Офлайн · дані зберігаються на телефоні')},800);

const TRAINER_SOCIALS={instagram:'https://www.instagram.com/mhiliuk/',tiktok:'https://www.tiktok.com/@michael_hilyk',telegram:'https://t.me/mrMiaut'};


let appLanguage=localStorage.getItem('eplanLanguage')||'uk';

const EN_MAP={
'Клієнти':'Clients','Анкета':'Profile','Анкета клієнта':'Client profile','Програма':'Program','Результати':'Results','Харчування':'Nutrition','Заміри':'Measurements','Календар':'Calendar','Кардіо':'Cardio','Бібліотека вправ':'Exercise library',
'Головна':'Home','Сьогодні':'Today','Прогрес':'Progress','Історія':'History','Профіль':'Profile','Огляд':'Overview','Усі клієнти':'All clients','Потрібно перевірити':'Needs review','Доступ завершується':'Access ending','Активних клієнтів':'Active clients','План харчування':'Meal plan','Моя історія':'My history','Мій профіль':'My profile','Вийти':'Log out','Сповіщення':'Notifications','До клієнтів':'Back to clients',
'Заморозити':'Freeze','Розморозити':'Unfreeze','Видалити':'Delete','Без цілі':'No goal',
'Ім’я':'First name','Прізвище':'Last name','Вік':'Age','Стать':'Sex','Зв’язок':'Contact','Протипоказання':'Contraindications','Травми':'Injuries','Не вказано':'Not specified',
'Цільове харчування':'Target nutrition','Вкажи калорійність та БЖВ клієнта.':'Set the client’s calorie and macro targets.','Ккал':'kcal','Білки, г':'Protein, g','Жири, г':'Fat, g','Вуглеводи, г':'Carbs, g','Зберегти харчування':'Save nutrition',
'План харчування':'Meal plan','Прийом їжі':'Meal','Варіант':'Option','Додати прийом їжі':'Add meal','Додати варіант':'Add option','Зберегти план':'Save plan',
'Календар історії':'History calendar','Натисни, щоб відкрити календар':'Tap to open calendar','жовта крапка = є записи':'yellow dot = records available',
'Січень':'January','Лютий':'February','Березень':'March','Квітень':'April','Травень':'May','Червень':'June','Липень':'July','Серпень':'August','Вересень':'September','Жовтень':'October','Листопад':'November','Грудень':'December',
'Пн':'Mon','Вт':'Tue','Ср':'Wed','Чт':'Thu','Пт':'Fri','Сб':'Sat','Нд':'Sun',
'Кардіо та активність':'Cardio and activity','Кардіо та активність сьогодні':'Cardio and activity today','кроків':'steps','Доріжка':'Treadmill','Швидкість':'speed','нахил':'incline','хв':'min',
'Історія тренувань':'Workout history','Обери тренувальний день і період. Спочатку показуються 5 останніх тренувань.':'Choose a workout day and period. The 5 most recent workouts are shown first.',
'Період':'Period','30 днів':'30 days','3 місяці':'3 months','6 місяців':'6 months','Весь час':'All time','Показати період':'Show period','Скинути дати':'Reset dates','З':'From','По':'To',
'Тренування':'Workout','День 1':'Day 1','День 2':'Day 2','День 3':'Day 3','День 4':'Day 4','День 5':'Day 5',
'Програма тренувань':'Workout program','Додати вправу':'Add exercise','Редагувати вправу':'Edit exercise','Редагувати':'Edit','Зберегти':'Save',
'Групи м’язів':'Muscle groups','Додати групу':'Add group','Вправ ще немає.':'No exercises yet.','Відео':'Video',
'Відпочинок':'Rest','Підходи':'Sets','Повтори':'Reps','Вага, кг':'Weight, kg','Підхід':'Set','Виконано ✓':'Completed ✓',
'Мій прогрес':'My progress','Показник':'Metric','Вага':'Weight','Талія':'Waist','Груди':'Chest','Таз':'Hips','Бедра':'Thighs','Руки':'Arms',
'Почати тренування':'Start workout','Завершити тренування':'Finish workout','Перевірено тренером ✓':'Reviewed by trainer ✓',
'БЖВ за сьогодні':'Macros today','Моє харчування':'My nutrition','Особисті дані та інформація, важлива для тренувань.':'Personal data and information important for training.','Редагувати анкету':'Edit profile',
'← До клієнтів':'← Back to clients','+ Додати вправу':'+ Add exercise',
'День, напр. День 1':'Day, e.g. Day 1','Назва дня, напр. Плечі + руки':'Day title, e.g. Shoulders + arms','Вправа':'Exercise','Посилання на техніку':'Technique video link',
'RIR за замовчуванням':'Default RIR','RIR по підходах: 2,2,1':'RIR by set: 2,2,1',
'Відпочинок, хв (напр. 2-3)':'Rest, min (e.g. 2-3)',
'Назва вправи':'Exercise name','Посилання на відео':'Video link',
'Напр. Спина':'e.g. Back','Видалити групу':'Delete group',

'Жіноча':'Female','Чоловіча':'Male','Доступ до застосунку':'App access','Тариф':'Plan','Доступ до':'Access until','Онлайн-ведення':'Online coaching','План тренувань':'Workout plan','План тренувань + План харчування':'Workout plan + Meal plan','Самостійно':'Self-guided','Активний':'Active','Закінчився':'Expired','Заморожено':'Frozen','Безстроково':'No expiry','Зберегти доступ':'Save access','Режим перегляду':'View-only mode','Термін доступу закінчився':'Access has expired','Доступ призупинено':'Access paused','Обери день і натисни «Почати тренування».':'Choose a day and tap “Start workout”.','Перед тренуванням':'Before training','Так':'Yes','Ні':'No','Зберегти активність':'Save activity','Редагувати активність':'Edit activity'
};

const EN_PARTS=[
['RIR (Reps In Reserve) — кількість повторів, які залишилися б у запасі до відмови. Наприклад, RIR 2 = після підходу ти міг би виконати ще приблизно 2 reps.','RIR (Reps In Reserve) — the number of reps you would still have in reserve before failure. For example, RIR 2 means you could perform about 2 more reps after the set.'],
['RIR — скільки повторів залишилося б у запасі до відмови. RIR 2 = ти міг би зробити ще приблизно 2 повтори.','RIR — how many reps you would still have in reserve before failure. RIR 2 means you could do about 2 more reps.'],
['Обери день, щоб просто переглянути вправи.','Choose a day to preview the exercises.'],
['Тренування почнеться лише після натискання «Почати тренування».','The workout starts only after tapping “Start workout”.'],
['Наступне тренування:','Next workout:'],['Нове тренування можна буде почати наступного дня.','A new workout can be started the next day.'],

['Натисни на день, щоб переглянути записи.','Tap a day to view records.'],
['Натисни на день, щоб переглянути записи','Tap a day to view records'],
['Доріжка ·','Treadmill ·'],['швидкість','speed'],['нахил','incline'],['кроків','steps'],
['Не вказано','Not specified'],['Без цілі','No goal'],['Прийом їжі','Meal'],['Варіант','Option'],
['Відпочинок','Rest'],['підходи','sets'],['повтори','reps']
];


let currentClientView='home';

new MutationObserver(()=>syncOverlayLock()).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

new MutationObserver(ms=>{if(appLanguage==='en')ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)translateTree(n);else if(n.nodeType===3)n.nodeValue=enText(n.nodeValue)}))}).observe(document.body,{childList:true,subtree:true});

setTimeout(()=>translateTree(document.body),0);

// Unsaved daily entries are private drafts on this device, not completed records.
const dailyDraftFields={cardio:['cardioType','dailySteps','cardioMinutes','cardioSpeed','cardioIncline'],nutrition:['dkcal','dprotein','dfat','dcarbs']};

// Delegation survives rerenders and captures typing as well as select changes.
document.addEventListener('input',captureDailyDraft,true);

document.addEventListener('change',captureDailyDraft,true);


let nutritionPlanDraft=null;

let previewWorkoutDay=null;




const REST_TIMER_KEY='eplanRestTimerEnd';

let restTimerInterval=null,restTimerAudioCtx=null;

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&restTimerEnd()){if(restTimerRemaining()<=0)finishRestTimer();else{startRestTimerTicker();renderFloatingRestTimer()}}});

window.addEventListener('focus',()=>{if(restTimerEnd()){startRestTimerTicker();renderFloatingRestTimer()}});

setTimeout(()=>{if(restTimerEnd()){if(restTimerRemaining()<=0)finishRestTimer();else{startRestTimerTicker();syncRestTimerWorker(restTimerEnd());renderFloatingRestTimer()}}},500);


window.workoutExerciseChoices=window.workoutExerciseChoices||{};

window.addEventListener('popstate',async e=>{
 if(!session)return;
 document.querySelectorAll('.modal').forEach(x=>x.remove());closeSideMenu();
 let st=e.state||{};
 if(st.eplanPage==='calendarDay'&&st.eplanDay){
   if(session.role==='trainer'&&st.eplanClient){selected=st.eplanClient;window.currentClientData=await api('/client/'+st.eplanClient)}
   else if(session.role==='client'&&session.client_id){window.currentClientData=await api('/client/'+session.client_id)}
   showCalendarDay(st.eplanDay,null,false);return;
 }
 if(session.role==='trainer'){
   if(st.eplanPage==='client'&&st.eplanClient){await openClient(st.eplanClient,st.eplanTab||'profile')}
   else{selected=null;window.currentClientData=null;await trainerHome()}
 }else if(session.role==='client'){await clientCabinet(session.client_id);if(st.eplanSection==='history')showClientSection('history')}
});


let startupResetToken=new URLSearchParams(location.search).get('reset');

if(startupResetToken){renderResetPassword(startupResetToken)}else{
 if(!history.state?.eplanPage)history.replaceState(session?.role==='client'?{eplanPage:'clientHome',eplanClient:session.client_id}:{eplanPage:'clients'},'',location.pathname+location.search);
 route()
}



