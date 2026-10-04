// V89 shared state and startup. Keep the executable statements in their original order.
// Load after all declaration-only feature scripts; do not add async/defer/type=module.

console.info('Є ПЛАН build 2026-09-23-v37');


const A='/api';
 const $=s=>document.querySelector(s);

let session=null;
// fitSession is an offline/UI hint only. Credentials live in an HttpOnly cookie.
let sessionVerified=false,authEpoch=0,logoutPending=false;
let sessionRefreshTask=null,logoutTask=null;
try{logoutPending=localStorage.getItem('eplanLogoutPending')==='1'}catch(e){}

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

const OFFDB='eplan-offline-v1', OFFVER=2;
const OFF_CACHE_TTL_MS=72*60*60*1000;
const OFF_QUEUE_TTL_MS=7*24*60*60*1000;
const OFF_CACHE_MAX_RECORDS=200;
const OFF_CACHE_MAX_RECORD_BYTES=4*1024*1024;
const OFF_CACHE_MAX_BYTES=12*1024*1024;
const OFF_QUEUE_MAX_RECORDS=100;
const OFF_PRIVATE_LOCAL_PREFIXES=['eplanWorkoutDraft_','eplanWorkoutDraftV2_','eplanDailyDraftV1_','eplanDailyDraftV2_','activeWorkout_','eplanActiveWorkoutV2_','eplanPushEnabled_','eplanRestTrackV1_'];
const OFF_PENDING_LOCAL_PREFIXES=['eplanWorkoutDraft_','eplanWorkoutDraftV2_','eplanDailyDraftV1_','eplanDailyDraftV2_'];

const apiMutationsInFlight=new Map();

let offSyncing=false,pushDetachTask=null;

window.addEventListener('online',async()=>{await authReady;hideOfflineStatus();if(logoutPending){await finishPendingLogout();return}if(await refreshServerSession())syncOfflineQueue()});

window.addEventListener('offline',()=>offlineStatus('● Офлайн · дані зберігаються на телефоні'));

setTimeout(async()=>{await authReady;if(navigator.onLine)syncOfflineQueue();else offlineStatus('● Офлайн · дані зберігаються на телефоні');await offPrune();if(window.eplanOfflineMigrationDropped)offlineStatus('● Старі несинхронізовані офлайн-дані очищено після оновлення безпеки')},800);



let currentClientView='home';

new MutationObserver(()=>syncOverlayLock()).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

// Close any modal when the dimmed backdrop itself is tapped/clicked.
document.addEventListener('click',e=>{
  let modal=e.target?.closest?.('.modal');
  if(modal&&e.target===modal){
    modal.remove();
    syncOverlayLock();
  }
});

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
 document.querySelectorAll('.modal').forEach(x=>x.remove());
 let st=e.state||{};
 if(st.eplanPage==='clientProgressWorkout'&&st.eplanWorkoutId&&session.role==='client'&&session.client_id){
   window.currentClientData=await loadClientData(session.client_id);
   openProgressWorkout(st.eplanWorkoutId,false);return;
 }
 if(st.eplanPage==='calendarDay'&&st.eplanDay){
   if(session.role==='trainer'&&st.eplanClient){selected=st.eplanClient;window.currentClientData=await loadClientData(st.eplanClient)}
   else if(session.role==='client'&&session.client_id){window.currentClientData=await loadClientData(session.client_id)}
   showCalendarDay(st.eplanDay,null,false);return;
 }
 if(session.role==='trainer'){
   if(st.eplanPage==='client'&&st.eplanClient){await openClient(st.eplanClient,st.eplanTab||'profile')}
   else{selected=null;window.currentClientData=null;await trainerHome()}
 }else if(session.role==='client'){
   await clientCabinet(session.client_id);
   if(st.eplanSection==='history')showClientSection('history');
   else if(st.eplanSection==='progress'){window.clientProgressView='training';showClientSection('progress')}
 }
});


let startupResetToken=new URLSearchParams(location.search).get('reset');
if(startupResetToken){
 try{
  const cleanUrl=new URL(location.href);
  cleanUrl.searchParams.delete('reset');
  const qs=cleanUrl.searchParams.toString();
  history.replaceState(history.state||{},'',cleanUrl.pathname+(qs?'?'+qs:'')+cleanUrl.hash);
 }catch(e){}
}

const authReady=bootstrapAuthentication();


