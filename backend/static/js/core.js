// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function offlineSessionExpiresAt(s=session){
 const t=Date.parse(s?.session_expires_at||'');
 return Number.isFinite(t)?t:0;
}

function offlineScopeIdentity(s=session){
 const owner=sessionOwner(s),expires=offlineSessionExpiresAt(s);
 if(!owner||!expires)return '';
 return `${owner}|${s?.auth_version||0}|${s.session_expires_at}`;
}

function offlineScope(s=session){
 const scope=offlineScopeIdentity(s),expires=offlineSessionExpiresAt(s);
 return scope&&expires>Date.now()?scope:'';
}

function offlineLocalScopeKey(s=session){const scope=offlineScope(s);return scope?encodeURIComponent(scope):''}
function offlinePrivateLocalKeyScope(key=''){
 for(const prefix of ['eplanWorkoutDraftV2_','eplanDailyDraftV2_','eplanActiveWorkoutV2_','eplanRestTrackV1_']){
   if(key.startsWith(prefix)){let part=key.slice(prefix.length).split('_',1)[0];try{return decodeURIComponent(part)}catch{return ''}}
 }
 return '';
}

function offDb(){return new Promise((ok,no)=>{let q=indexedDB.open(OFFDB,OFFVER);q.onupgradeneeded=e=>{
 let d=q.result,tx=q.transaction;
 if(!d.objectStoreNames.contains('cache'))d.createObjectStore('cache');
 if(!d.objectStoreNames.contains('queue'))d.createObjectStore('queue',{keyPath:'id',autoIncrement:true});
 // M01 migration: old cache keys were global paths and old queue rows had no
 // server-session version. Neither can be safely attributed to a verified M01
 // session, so derived cache is cleared and legacy queued mutations are dropped
 // with a visible one-time notice instead of being silently replayed as someone else.
 if(e.oldVersion<2&&tx){
   try{tx.objectStore('cache').clear()}catch(_){}
   try{
     const qs=tx.objectStore('queue'),cur=qs.openCursor();
     cur.onsuccess=()=>{const c=cur.result;if(!c)return;let v=c.value||{};
       if(!v.scope){c.delete();window.eplanOfflineMigrationDropped=(window.eplanOfflineMigrationDropped||0)+1}
       c.continue();
     };
   }catch(_){}
 }
};q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}

function offCacheStorageKey(key,scope=offlineScope()){return scope?`v2|${scope}|${key}`:''}
function offCacheRecordValid(rec,scope=offlineScope()){
 if(!scope||!rec||rec.scope!==scope)return false;
 const now=Date.now(),sessionEnd=offlineSessionExpiresAt();
 return !!rec.storedAt&&rec.storedAt>=now-OFF_CACHE_TTL_MS&&sessionEnd>now;
}

async function offRawSnapshot(store){let d=await offDb();return new Promise((ok,no)=>{let tx=d.transaction(store,'readonly'),st=tx.objectStore(store),kr=st.getAllKeys(),vr=st.getAll(),keys,values;kr.onsuccess=()=>{keys=kr.result||[];if(values)ok({keys,values})};vr.onsuccess=()=>{values=vr.result||[];if(keys)ok({keys,values})};kr.onerror=vr.onerror=()=>no(kr.error||vr.error)})}

async function offRawDeleteMany(store,keys){if(!keys?.length)return;let d=await offDb();return new Promise((ok,no)=>{let tx=d.transaction(store,'readwrite'),st=tx.objectStore(store);keys.forEach(k=>st.delete(k));tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error)})}

async function offInvalidateClientPageCache(cid){
 const scope=offlineScope();if(!scope||!cid)return;
 const prefix=offCacheStorageKey(`/client/${cid}?`,scope),snap=await offRawSnapshot('cache'),keys=[];
 snap.keys.forEach(k=>{if(typeof k==='string'&&k.startsWith(prefix))keys.push(k)});
 await offRawDeleteMany('cache',keys);
}

let offPruneTask=null,offLastPrune=0,offPurgeTask=null;
async function offPrune(force=false){
 if(offPruneTask)return offPruneTask;
 if(!force&&Date.now()-offLastPrune<60000)return;
 offPruneTask=(async()=>{
   const now=Date.now(),scope=offlineScope();
   const cache=await offRawSnapshot('cache'),dropCache=[];
   let current=[];
   cache.values.forEach((rec,i)=>{
     // Cache is derived server data: keep only the active session scope. A new
     // account/session never leaves another user's cache resident and readable.
     if(!scope||!rec||!rec.scope||rec.scope!==scope||!offCacheRecordValid(rec,scope)){dropCache.push(cache.keys[i]);return}
     current.push({key:cache.keys[i],storedAt:rec.storedAt,size:+rec.size||0});
   });
   current.sort((a,b)=>b.storedAt-a.storedAt);let bytes=0,count=0;
   for(const rec of current){count++;bytes+=rec.size;if(count>OFF_CACHE_MAX_RECORDS||bytes>OFF_CACHE_MAX_BYTES)dropCache.push(rec.key)}
   await offRawDeleteMany('cache',[...new Set(dropCache)]);
   const queue=await offRawSnapshot('queue'),dropQueue=[];
   queue.values.forEach((rec,i)=>{
     if(!rec||!rec.scope||!rec.created||rec.created<now-OFF_QUEUE_TTL_MS){dropQueue.push(queue.keys[i]);return}
     // With a live session, quarantine is no longer useful: a foreign-session
     // mutation must never remain available or be replayed. Drop it visibly.
     if(scope&&rec.scope!==scope){dropQueue.push(queue.keys[i]);window.eplanOfflineMigrationDropped=(window.eplanOfflineMigrationDropped||0)+1}
   });
   await offRawDeleteMany('queue',[...new Set(dropQueue)]);
   // Pre-M01 unscoped local data cannot be assigned safely. Session-scoped V2
   // drafts belonging to another live session are also removed on account switch.
   try{for(let i=localStorage.length-1;i>=0;i--){
     let k=localStorage.key(i)||'',legacy=k.startsWith('eplanWorkoutDraft_')||k.startsWith('eplanDailyDraftV1_')||k.startsWith('activeWorkout_'),ks=offlinePrivateLocalKeyScope(k);
     if(legacy||(scope&&ks&&ks!==scope)){localStorage.removeItem(k);window.eplanOfflineMigrationDropped=(window.eplanOfflineMigrationDropped||0)+1}
   }}catch(_){}
   offLastPrune=Date.now();
 })();
 try{return await offPruneTask}finally{offPruneTask=null}
}

async function offGet(store,key){
 if(store!=='cache'){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readonly').objectStore(store).get(key);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}
 const scope=offlineScope();if(!scope)return undefined;let d=await offDb(),storageKey=offCacheStorageKey(key,scope);
 const rec=await new Promise((ok,no)=>{let q=d.transaction('cache','readonly').objectStore('cache').get(storageKey);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
 if(!offCacheRecordValid(rec,scope)){if(rec)await offRawDeleteMany('cache',[storageKey]);return undefined}
 return rec.data;
}

async function offPut(store,val,key){
 if(store!=='cache'){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readwrite').objectStore(store).put(val,key);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}
 const scope=offlineScope();if(!scope)return;
 let serialized='';try{serialized=JSON.stringify(val)}catch{return}
 const size=serialized.length*2;if(size>OFF_CACHE_MAX_RECORD_BYTES)return;
 let d=await offDb(),storageKey=offCacheStorageKey(key,scope),rec={scope,owner:sessionOwner(),storedAt:Date.now(),size,data:val};
 await new Promise((ok,no)=>{let q=d.transaction('cache','readwrite').objectStore('cache').put(rec,storageKey);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
 offPrune();
}

async function offAdd(store,val){
 if(store!=='queue'){let d=await offDb();return new Promise((ok,no)=>{let q=d.transaction(store,'readwrite').objectStore(store).add(val);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}
 const scope=offlineScope();if(!scope)throw new Error('Офлайн-сесія завершилась. Підключіться до інтернету та увійдіть знову.');
 const current=await offAll('queue');if(current.length>=OFF_QUEUE_MAX_RECORDS)throw new Error('Забагато офлайн-змін. Підключіться до інтернету для синхронізації.');
 let d=await offDb(),rec={...val,scope,owner:sessionOwner()};
 const id=await new Promise((ok,no)=>{let q=d.transaction('queue','readwrite').objectStore('queue').add(rec);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
 offPrune();return id;
}

async function offAll(store){
 let d=await offDb();const values=await new Promise((ok,no)=>{let q=d.transaction(store,'readonly').objectStore(store).getAll();q.onsuccess=()=>ok(q.result||[]);q.onerror=()=>no(q.error)});
 if(store!=='queue')return values;
 const scope=offlineScope();if(!scope)return [];
 const now=Date.now();return values.filter(x=>x?.scope===scope&&x.created&&x.created>=now-OFF_QUEUE_TTL_MS);
}

async function offDel(store,key){
 let d=await offDb();
 if(store!=='queue')return new Promise((ok,no)=>{let q=d.transaction(store,'readwrite').objectStore(store).delete(key);q.onsuccess=()=>ok();q.onerror=()=>no(q.error)});
 const scope=offlineScope();if(!scope)return;
 return new Promise((ok,no)=>{let tx=d.transaction('queue','readwrite'),st=tx.objectStore('queue'),g=st.get(key);g.onsuccess=()=>{if(g.result?.scope===scope)st.delete(key)};tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error)})
}

async function offlinePendingSummary(){
 let queued=0;try{queued=(await offRawSnapshot('queue')).values.filter(x=>x&&x.created&&x.created>=Date.now()-OFF_QUEUE_TTL_MS).length}catch(e){}
 let drafts=0;try{for(let i=0;i<localStorage.length;i++){let k=localStorage.key(i)||'';if(OFF_PENDING_LOCAL_PREFIXES.some(p=>k.startsWith(p)))drafts++}}catch(e){}
 return {queued,drafts,total:queued+drafts};
}

async function purgeOfflinePrivateData({notice=false,scope='',all=false}={}){
 if(offPurgeTask)return offPurgeTask;
 offPurgeTask=(async()=>{
   let pending={queued:0,drafts:0,total:0};try{pending=await offlinePendingSummary()}catch(e){}
   const target=scope||offlineScopeIdentity();
   try{
     let cache=await offRawSnapshot('cache'),queue=await offRawSnapshot('queue');
     const ck=[],qk=[];
     cache.values.forEach((rec,i)=>{if(all||(target&&rec?.scope===target)||!rec?.scope)ck.push(cache.keys[i])});
     queue.values.forEach((rec,i)=>{if(all||(target&&rec?.scope===target)||!rec?.scope)qk.push(queue.keys[i])});
     await offRawDeleteMany('cache',ck);await offRawDeleteMany('queue',qk);
   }catch(e){}
   try{
     const targetKey=target?encodeURIComponent(target):'';
     for(let i=localStorage.length-1;i>=0;i--){
       let k=localStorage.key(i)||'',remove=false;
       const legacyUnscoped=k.startsWith('eplanWorkoutDraft_')||k.startsWith('eplanDailyDraftV1_')||k.startsWith('activeWorkout_');
       if(all)remove=OFF_PRIVATE_LOCAL_PREFIXES.some(p=>k.startsWith(p))||k===REST_TIMER_KEY||k==='eplanRestTrackV1';
       else if(legacyUnscoped||k==='eplanRestTrackV1')remove=true;
       else if(targetKey)remove=(k.startsWith('eplanWorkoutDraftV2_')||k.startsWith('eplanDailyDraftV2_')||k.startsWith('eplanActiveWorkoutV2_')||k.startsWith('eplanRestTrackV1_'))&&k.includes(`_${targetKey}`);
       if(remove)localStorage.removeItem(k);
     }
     if(!all)try{localStorage.removeItem(REST_TIMER_KEY)}catch(_){ }
   }catch(e){}
   if(notice&&pending.total)offlineStatus('● Локальні дані попереднього сеансу очищено');
   return pending;
 })();
 try{return await offPurgeTask}finally{offPurgeTask=null}
}

function offBody(opt){try{return opt?.body?JSON.parse(opt.body):{}}catch{return {}}}

function offToday(){return new Date().toLocaleDateString('sv-SE')}

function offWorkoutDay(d){
 let active=(d?.workout_sessions||[]).find(x=>x.status==='training');
 return String(active?.workout_day||active?.started_at||'').slice(0,10)||offToday();
}

function offClientKey(cid){return '/client/'+cid}

async function offClient(cid){return await offGet('cache',offClientKey(cid))}

async function offSaveClient(cid,d){if(d)await offPut('cache',d,offClientKey(cid))}

async function offApply(path,opt,localSid){
 let b=offBody(opt),m=(opt.method||'GET').toUpperCase(),cid=b.client_id||session?.client_id, d=cid?await offClient(cid):null;
 if(!d)return;
 if(path==='/result-sets'&&m==='POST'){let workoutDay=offWorkoutDay(d);d.result_sets=(d.result_sets||[]).filter(x=>!(x.program_id==b.program_id&&x.day===workoutDay));(b.sets||[]).forEach(x=>d.result_sets.push({...x,id:-Date.now()-x.set_number,client_id:cid,program_id:b.program_id,exercise:b.exercise,repeat_mode:b.repeat_mode||'normal',day:workoutDay}));d.aux_sets=(d.aux_sets||[]).filter(x=>!(x.program_id==b.program_id&&x.day===workoutDay));(b.aux_sets||[]).forEach((x,i)=>d.aux_sets.push({...x,id:-Date.now()-1000-i,client_id:cid,program_id:b.program_id,exercise:b.exercise,repeat_mode:b.repeat_mode||'normal',day:workoutDay}));d.skipped_sets=(d.skipped_sets||[]).filter(x=>!(x.program_id==b.program_id&&x.day===workoutDay));(b.skipped_sets||[]).forEach((n,i)=>d.skipped_sets.push({id:-Date.now()-2000-i,client_id:cid,program_id:b.program_id,exercise:b.exercise,day:workoutDay,set_number:+n}))}
 else if(path==='/timed-result-sets'&&m==='POST'){let workoutDay=offWorkoutDay(d);d.timed_result_sets=(d.timed_result_sets||[]).filter(x=>!(x.program_id==b.program_id&&x.day===workoutDay));(b.sets||[]).forEach((x,i)=>d.timed_result_sets.push({...x,id:-Date.now()-3000-i,client_id:cid,program_id:b.program_id,exercise:b.exercise,day:workoutDay}))}
 else if(path==='/nutrition'&&m==='POST'){d.nutrition=d.nutrition||[];d.nutrition.unshift({id:-Date.now(),client_id:cid,day:offToday(),kcal:b.kcal,protein:b.protein,fat:b.fat,carbs:b.carbs})}
 else if(/^\/nutrition\/-?\d+$/.test(path)&&m==='PATCH'){let id=+path.split('/').pop(),x=(d.nutrition||[]).find(x=>x.id==id);if(x)Object.assign(x,b)}
 else if(path==='/history/nutrition'&&m==='POST'){d.nutrition=d.nutrition||[];let x=d.nutrition.find(x=>x.day===b.day);if(x)Object.assign(x,b);else d.nutrition.unshift({id:-Date.now(),...b})}
 else if(path==='/measurements'&&m==='POST'){d.measurements=d.measurements||[];d.measurements.push({id:-Date.now(),day:offToday(),...b})}
 else if(path==='/cardio'&&m==='POST'){d.cardio=d.cardio||[];let day=b.day||offToday(),x=d.cardio.find(x=>x.day===day);if(x)Object.assign(x,b,{day});else d.cardio.unshift({id:-Date.now(),...b,day})}
 else if(path==='/workout/start'&&m==='POST'){d.workout_sessions=d.workout_sessions||[];let meta=(d.program_days||[]).find(x=>x.day_name===b.day_name),dayKind=String(meta?.kind||'standard');d.workout_sessions.unshift({id:localSid,client_id:cid,day_name:b.day_name,status:'training',started_at:new Date().toISOString(),workout_day:offToday(),duration_seconds:0,program_snapshot:'[]',day_kind:dayKind})}
 else if(/^\/workout\/-\d+\/finish$/.test(path)&&m==='POST'){let id=+path.split('/')[2],x=(d.workout_sessions||[]).find(x=>x.id==id);if(x){x.status='finished';x.finished_at=offToday()+' 13:00:00';let meta=(d.program_days||[]).find(v=>v.day_name===x.day_name);if(String(meta?.kind||'')==='extra'&&String(meta?.extra_mode||'once')==='once')meta.status='paused'}}
 else if(path==='/history/workout'&&m==='POST'){d.workout_sessions=d.workout_sessions||[];d.workout_sessions.unshift({id:-Date.now(),client_id:cid,day_name:b.day_name,status:'finished',started_at:b.day+' 12:00:00',finished_at:b.day+' 13:00:00'});d.result_sets=d.result_sets||[];(b.sets||[]).forEach((x,i)=>{let p=(d.program||[]).find(v=>+v.id===+x.program_id),repeat_mode=p?.repeat_mode||'normal';d.result_sets.push({...x,id:-Date.now()-i,client_id:cid,repeat_mode,day:b.day})})}
 else if(path==='/comments'&&m==='POST'){d.comments=d.comments||[];d.comments.unshift({id:-Date.now(),created_at:new Date().toISOString(),...b})}
 else if(/^\/comments\/-?\d+$/.test(path)&&m==='PUT'){let id=+path.split('/').pop(),x=(d.comments||[]).find(x=>x.id==id);if(x)x.body=b.body}
 await offSaveClient(cid,d);
 // Paginated /client/{id}?limit=... cache entries are snapshots from the last
 // online load. After an offline mutation they must not win over the updated
 // canonical client cache on the next render, otherwise the UI can present a
 // stale form and enqueue a second mutation that overwrites the first one.
 await offInvalidateClientPageCache(cid);
 window.currentClientData=d;
}

function offResponse(path,opt,localSid){
 let b=offBody(opt);
 if(path==='/workout/start'){let d=window.currentClientData||{},meta=(d.program_days||[]).find(x=>x.day_name===b.day_name);return {id:localSid,client_id:b.client_id,day_name:b.day_name,status:'training',started_at:new Date().toISOString(),workout_day:offToday(),duration_seconds:0,day_kind:String(meta?.kind||'standard')};}
 if(/\/finish$/.test(path))return {ok:true,status:'finished'};
 if(path==='/nutrition'||path==='/measurements'||path==='/comments')return {id:-Date.now(),ok:true};
 return {ok:true,offline:true};
}

function offCanQueue(path,opt){
 let m=(opt.method||'GET').toUpperCase();
 if(m==='GET'||!session||session.role!=='client'||!offlineScope())return false;
 // Workout lifecycle/history recovery is deliberately server-only.
 // These actions depend on authoritative session status, calendar day and review state.
 if(/^\/workout\/-?\d+\/(cancel|reopen|results)$/.test(path))return false;
 return !logoutPending&&!path.startsWith('/login')&&!path.startsWith('/logout')&&!path.startsWith('/session')&&!path.startsWith('/password-reset')&&!path.includes('/screenshot')&&!path.startsWith('/notifications')&&!path.startsWith('/push/');
}

async function offlineStatus(msg,kind=''){
 let el=document.getElementById('offlinePill');if(!el){el=document.createElement('div');el.id='offlinePill';el.className='offline-pill';document.body.appendChild(el)}
 el.textContent=msg;el.className='offline-pill show '+kind;
 if(msg==='✓ Синхронізовано')setTimeout(()=>el.classList.remove('show'),1800);
}

function hideOfflineStatus(){
 let el=document.getElementById('offlinePill');
 if(el){el.classList.remove('show','syncing');el.textContent=''}
}

function setActionLoading(btn,text='Зберігаємо…'){
 if(!btn)return ()=>{};
 const oldText=btn.textContent,oldDisabled=btn.disabled;
 btn.disabled=true;btn.dataset.actionLoading='1';btn.textContent=text;
 return ()=>{btn.disabled=oldDisabled;btn.dataset.actionLoading='0';btn.textContent=oldText};
}

async function eplanFetch(url,opt={},timeoutMs=15000){
 const target=new URL(url,location.href);
 if(target.origin===location.origin&&target.pathname.startsWith('/api/')){
   const method=(opt.method||'GET').toUpperCase();
   const logoutMaintenance=target.pathname==='/api/logout'||(target.pathname==='/api/push/subscribe'&&method==='DELETE');
   if(logoutPending&&!logoutMaintenance)throw Object.assign(new Error('Спочатку потрібне підключення для завершення виходу.'),{server:true,status:401});
   const headers=new Headers(opt.headers||{});headers.set('X-EPLAN-Request','1');
   if(sessionOwner()&&!['/api/session','/api/login','/api/logout','/api/password-reset/request','/api/password-reset/confirm','/api/push/public-key'].includes(target.pathname))headers.set('X-EPLAN-Actor',sessionOwner());
   opt={...opt,headers,credentials:'same-origin'};
 }
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fetch(url,{...opt,signal:controller.signal})}
 catch(e){
  if(e?.name==='AbortError')throw Object.assign(new Error('Сервер довго не відповідає. Перевір інтернет і спробуй ще раз.'),{network:true,timeout:true});
  throw Object.assign(e||new Error('Помилка мережі'),{network:true});
 }finally{clearTimeout(timer)}
}

function friendlyApiError(status,detail=''){
 if(status>=500)return 'Сервіс тимчасово недоступний. Дані не втрачено — спробуй ще раз через кілька секунд.';
 if(status===429)return 'Забагато запитів. Зачекай кілька секунд і спробуй ще раз.';
 return detail||'Не вдалося виконати дію. Спробуй ще раз.';
}

async function api(path,opt={}){
 const epoch=authEpoch,owner=sessionOwner();
 let method=(opt.method||'GET').toUpperCase();
 let mutation=!['GET','HEAD','OPTIONS'].includes(method);
 let mutationKey=mutation?method+'|'+path+'|'+String(opt.body||''):'';
 if(mutation&&apiMutationsInFlight.has(mutationKey))return apiMutationsInFlight.get(mutationKey);
 let task=(async()=>{
 try{
   let r=await eplanFetch(A+path,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
   if(epoch!==authEpoch||logoutPending)throw Object.assign(new Error('Сеанс змінено. Увійдіть знову.'),{server:true,status:401});
   if(r.status===401&&!path.startsWith('/login')&&!path.startsWith('/password-reset'))clearLocalSession({keepLocation:true});
   if(!r.ok){let x;try{x=await r.json()}catch{};throw Object.assign(new Error(friendlyApiError(r.status,x?.detail)),{server:true,status:r.status})}
   let data=r.status===204?null:await r.json();
   if(epoch!==authEpoch)throw Object.assign(new Error('Сеанс змінено. Увійдіть знову.'),{server:true,status:401});
   if(method==='GET')await offPut('cache',data,path);
   return data;
 }catch(e){
   if(e.server)throw e;
   if(epoch!==authEpoch||logoutPending)throw new Error('Сеанс змінено. Увійдіть знову.');
   if(method==='GET'){
     let cached=await offGet('cache',path);
     if(cached!==undefined){offlineStatus('● Офлайн · показано збережені дані');return cached}
     throw new Error(e?.timeout?'Сервер довго не відповідає. Перевір інтернет і спробуй ще раз.':'Не вдалося завантажити дані. Перевір інтернет і спробуй ще раз.');
   }
   if(offCanQueue(path,opt)){
     let localSid=path==='/workout/start'?-Date.now():null;
     await offAdd('queue',{path,opt:{method,body:opt.body||null},created:Date.now(),localSid,owner});
     await offApply(path,opt,localSid);
     offlineStatus('● Офлайн · зміни збережено на телефоні');
     return offResponse(path,opt,localSid);
   }
   throw new Error(e?.timeout?'Не вдалося зберегти: сервер довго не відповідає. Перевір інтернет і спробуй ще раз.':'Не вдалося зберегти. Перевір інтернет і спробуй ще раз.');
 }
 })();
 if(!mutation)return task;
 apiMutationsInFlight.set(mutationKey,task);
 try{return await task}finally{apiMutationsInFlight.delete(mutationKey)}
}

const EPLAN_PAGE_SIZE=50;
const EPLAN_CLIENT_COLLECTIONS=['program','program_days','results','result_sets','timed_result_sets','aux_sets','skipped_sets','nutrition','nutrition_plan','measurements','workout_sessions','comments','cardio','checkins'];

function mergeClientPage(merged,page){
 if(!merged){
   merged={...page};
   EPLAN_CLIENT_COLLECTIONS.forEach(k=>merged[k]=[...(page[k]||[])]);
   return merged;
 }
 EPLAN_CLIENT_COLLECTIONS.forEach(k=>merged[k].push(...(page[k]||[])));
 if(page.client)merged.client=page.client;
 return merged;
}

async function collectClientPages(cid,getter){
 let offset=0,merged=null,pages=0;
 while(true){
   const page=await getter(`/client/${cid}?limit=${EPLAN_PAGE_SIZE}&offset=${offset}`);
   merged=mergeClientPage(merged,page);
   const meta=page?.pagination;
   if(!meta?.has_more)break; // Backward-compatible with a pre-M03B2 server.
   offset+=EPLAN_PAGE_SIZE;
   if(++pages>2000)throw new Error('Історія завелика для одного завантаження.');
 }
 if(merged)delete merged.pagination;
 return merged;
}

async function loadClientData(cid){
 try{
   const d=await collectClientPages(cid,path=>api(path));
   if(d)await offSaveClient(cid,d); // Keep the existing offline full-card contract.
   return d;
 }catch(e){
   if(e?.server)throw e; // Never replace an authenticated server denial with stale local data.
   const cached=await offClient(cid);
   if(cached!==undefined){offlineStatus('● Офлайн · показано збережені дані');return cached}
   throw e;
 }
}

async function loadClientDataOnline(cid,guard=()=>{}){
 return collectClientPages(cid,async path=>{
   const r=await eplanFetch(A+path,{cache:'no-store'});guard();
   if(r.status===401)clearLocalSession({keepLocation:true});
   if(!r.ok)throw new Error('client page');
   const data=await r.json();guard();return data;
 });
}

async function loadClients(){
 let offset=0,out=[],seen=new Set(),pages=0;
 while(true){
   const xs=await api(`/clients?limit=${EPLAN_PAGE_SIZE}&offset=${offset}`);
   if(!Array.isArray(xs))return out;
   let added=0;
   for(const x of xs){if(!seen.has(x.id)){seen.add(x.id);out.push(x);added++}}
   // added===0 also makes this safe during a short mixed-version deploy where
   // an older backend ignores pagination query parameters.
   if(xs.length<EPLAN_PAGE_SIZE||added===0)break;
   offset+=EPLAN_PAGE_SIZE;
   if(++pages>2000)throw new Error('Список клієнтів завеликий для одного завантаження.');
 }
 return out;
}

function queueOwner(item,queue,clientData){
 if(item.owner)return item.owner;
 // V92 queue entries have no owner field. Use only an explicit client_id or
 // membership in a fresh server response; never infer ownership from the UI.
 const body=offBody(item.opt);
 if(body.client_id)return 'client:'+body.client_id;
 const finish=item.path.match(/^\/workout\/(-?\d+)\/finish$/);
 if(finish){
   const sid=+finish[1],start=queue.find(x=>x.localSid===sid&&x.path==='/workout/start');
   if(start)return queueOwner(start,[],clientData);
   if((clientData?.workout_sessions||[]).some(x=>x.id===sid))return 'client:'+clientData.client.id;
 }
 const comment=item.path.match(/^\/comments\/(\d+)$/);
 if(comment&&(clientData?.comments||[]).some(x=>x.id===+comment[1]&&x.author==='client'))return 'client:'+clientData.client.id;
 return '';
}

async function syncOfflineQueue(){
 if(offSyncing||!navigator.onLine||logoutPending||!session)return;
 offSyncing=true;
 try{
   if(!await refreshServerSession()||session?.role!=='client')return;
   const epoch=authEpoch,owner=sessionOwner(),cid=session.client_id;
   let q=await offAll('queue');if(!q.length){hideOfflineStatus();return}
   const check=()=>{if(epoch!==authEpoch||!sessionVerified||logoutPending||sessionOwner()!==owner)throw new Error('session changed')};
   const requireOK=r=>{if(r.status===401)clearLocalSession({keepLocation:true});if(!r.ok)throw new Error('sync')};
   check();
   const clientData=await loadClientDataOnline(cid,check);check();
   offlineStatus('Синхронізація…','syncing');let sidMap={},pending=false;
   for(let item of q){
     check();
     if(queueOwner(item,q,clientData)!==owner){pending=true;continue}
     let path=item.path;
     let neg=path.match(/^\/workout\/(-\d+)\/finish$/);if(neg&&sidMap[neg[1]])path='/workout/'+sidMap[neg[1]]+'/finish';
     let r=await eplanFetch(A+path,{headers:{'Content-Type':'application/json'},method:item.opt.method,body:item.opt.body||undefined},15000);
     check();requireOK(r);
     let data=null;try{data=await r.clone().json()}catch{}
     check();
     if(item.localSid&&data?.id)sidMap[String(item.localSid)]=data.id;
     await offDel('queue',item.id);
   }
   check();
   let d=await loadClientDataOnline(cid,check);check();await offSaveClient(cid,d);window.currentClientData=d;
   offlineStatus(pending?'● Є дані, що очікують синхронізації':'✓ Синхронізовано');
 }catch{offlineStatus('● Є дані, що очікують синхронізації')}
 finally{offSyncing=false}
}

function formatSetRest(seconds){
 let s=Math.max(0,Math.round(+seconds||0));
 if(!s)return '';
 return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}

function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function safeTechniqueUrl(value=''){
 let s=String(value||'').trim();
 if(!s||/[\\\u0000-\u001F\u007F]/.test(s))return '';
 try{
  let u=new URL(s);
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password)return '';
  return u.href;
 }catch(_){return ''}
}

function techniqueLinkHTML(value,label='Техніка',stop=false,className='tech-link'){
 let href=safeTechniqueUrl(value);if(!href)return '';
 return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${stop?' onclick="event.stopPropagation()"':''}${className?` class="${esc(className)}"`:''}>${esc(label)}</a>`;
}

function uiIcon(name){const p={menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',user:'<circle cx="12" cy="8" r="3"/><path d="M5 20c.7-4 3.1-6 7-6s6.3 2 7 6"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 20c.6-4 2.7-6 6-6s5.4 2 6 6"/><path d="M16 6.5a2.5 2.5 0 0 1 0 5M17 14c2.2.6 3.5 2.5 4 5"/>',home:'<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',dumbbell:'<path d="M6 8v8M3 9v6M18 8v8M21 9v6M6 12h12"/>',chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',food:'<path d="M7 3v7M4 3v4c0 2 1 3 3 3s3-1 3-3V3M7 10v11M16 3c3 2 4 5 4 9h-4V3Zm0 9v9"/>',scale:'<rect x="4" y="4.5" width="16" height="15.5" rx="3"/><path d="M8 10a4 4 0 0 1 8 0"/><path d="m12 10 2.2-2.2"/><path d="M8 16.5h8"/>',ruler:'<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v4M10 7v2.5M13 7v4M16 7v2.5M19 7v4"/>',measure:'<path d="M4 8h16v8H4z"/><path d="M7 8v4M10 8v2M13 8v4M16 8v2"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',message:'<path d="M4 5h16v12H9l-5 4V5Z"/>',run:'<circle cx="14" cy="4" r="2"/><path d="m10 21 2-7-3-3 3-4 4 3 4 1M12 14l4 3 1 4M9 11l-4 3"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',edit:'<path d="m4 20 4.5-1L19 8.5 15.5 5 5 15.5 4 20Z"/><path d="m13.5 7 3.5 3.5"/>',trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',plus:'<path d="M12 5v14M5 12h14"/>',logout:'<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${p[name]||''}</svg>`}

function clientInitials(c=(window.currentClientData||{}).client||{}){
 let first=String(c.first_name||'').trim(),last=String(c.last_name||'').trim(),fallback=String(c.name||'').trim();
 let parts=(first||last)?[first,last].filter(Boolean):fallback.split(/\s+/).filter(Boolean);
 let initials=parts.slice(0,2).map(x=>x.charAt(0)).join('').toUpperCase();
 return initials||'ЄП';
}
function clientAvatarHTML(cid,compact=false){
 let c=(window.currentClientData||{}).client||{};
 let inner='<span class="avatar-initials">'+esc(clientInitials(c))+'</span>';
 return '<button class="client-avatar is-placeholder '+(compact?'compact':'')+'" onclick="showClientProfile('+cid+')" aria-label="Мій профіль">'+inner+'</button>';
}

function clientNavGroup(view=currentClientView){
 if(view==='training')return 'training';
 if(view==='progress')return 'progress';
 if(view==='nutrition'||view==='mealplan')return 'nutrition';
 if(['more','profile','history','measurements'].includes(view))return 'more';
 return 'home';
}

async function goClientHome(cid){
 try{
   await clientCabinet(cid);
 }catch(e){
   console.error('client home navigation failed',e);
   location.assign('/');
 }
}

function clientBottomNavHTML(){
 if(!session||session.role!=='client'||!session.client_id)return '';
 let cid=session.client_id,active=clientNavGroup(),features=clientAccess().features||{};
 let item=(key,label,icon,action)=>`<button type="button" class="${active===key?'active':''}" onclick="${action}" aria-label="${label}">${uiIcon(icon)}<span>${label}</span></button>`;
 let items=[
   item('home','Головна','home',`goClientHome(${cid})`),
   features.workouts?item('training','Тренування','dumbbell',`showClientTraining(${cid})`):'',
   item('progress','Прогрес','chart',`showClientSection('progress')`),
   item('nutrition','Харчування','food',`showClientNutrition(${cid})`),
   item('more','Більше','menu',`showClientMore(${cid})`)
 ].filter(Boolean);
 return `<nav class="client-bottom-nav" aria-label="Основна навігація" style="grid-template-columns:repeat(${items.length},1fr)">${items.join('')}</nav>`;
}

function trainerBottomNavHTML(){
 if(!session||session.role!=='trainer')return '';
 let active=currentTrainerMainView||'home';
 let item=(key,label,icon,action)=>`<button type="button" class="${active===key?'active':''}" onclick="${action}" aria-label="${label}">${uiIcon(icon)}<span>${label}</span></button>`;
 return `<nav class="trainer-bottom-nav" aria-label="Навігація тренера">
   ${item('home','Головна','home','trainerHome()')}
   ${item('clients','Клієнти','users','showTrainerClientsView()')}
   ${item('programs','Програми','chart','showTrainerPrograms()')}
   ${item('nutrition','Харчування','food','showTrainerNutrition()')}
   ${item('more','Більше','menu','showTrainerMore()')}
 </nav>`;
}

function shell(content){
 if(session&&session.role==='client'&&session.client_id){
   document.body.classList.add('eplan-redesign','client-ui');
   let isHome=clientNavGroup()==='home';
   let top=isHome
    ?`<div class="client-top"><div class="client-greeting"><strong>Вітаємо! 👋</strong><span>${esc(kyivTodayLong())}</span></div><div class="client-top-actions">${clientAvatarHTML(session.client_id)}<button id="clientNotifyBtn" class="notify-btn" onclick="showNotifications(${session.client_id},'client')" aria-label="Сповіщення">${uiIcon('bell')}<span class="notify-label">Сповіщення</span></button></div></div>`
    :`<div class="client-top client-top-compact"><div></div><div class="client-top-actions">${clientAvatarHTML(session.client_id,true)}<button id="clientNotifyBtn" class="notify-btn" onclick="showNotifications(${session.client_id},'client')" aria-label="Сповіщення">${uiIcon('bell')}<span class="notify-label">Сповіщення</span></button></div></div>`;
   return `<div class="wrap client-shell">${top}${content}${clientBottomNavHTML()}</div>`;
 }
 if(session&&session.role==='trainer'){
   document.body.classList.add('eplan-redesign','trainer-ui');
   document.body.classList.remove('client-ui');
   return `<div class="wrap trainer-shell"><div class="trainer-top"><div><strong>Вітаємо, Тренере! 👋</strong><span>${esc(kyivTodayLong())}</span></div><button id="trainerGlobalNotifyBtn" class="notify-btn" onclick="showTrainerNotifications()" aria-label="Сповіщення">${uiIcon('bell')}</button></div>${content}${trainerBottomNavHTML()}</div>`;
 }
 document.body.classList.remove('eplan-redesign','client-ui','trainer-ui');
 return `<div class="wrap">${content}</div>`
}

function clientAccess(c=(window.currentClientData||{}).client||{}){return c.access||{plan_code:'coaching',plan_name:'Онлайн-ведення',effective_plan:'coaching',features:{workouts:true,nutrition:true,measurements:true,cardio:true,trainer_review:true,meal_plan:true,checkin:true},expired:false,manually_frozen:false,days_left:null,access_until:''}}

function hasFeature(name,c){return !!clientAccess(c).features?.[name]}

function accessBannerHTML(c){
 let a=clientAccess(c);
 if(a.expired||a.manually_frozen)return `<div class="card client-access-banner expired"><strong>${a.expired?'Термін доступу закінчився':'Доступ призупинено'}</strong><p class="muted" style="margin-bottom:0">Твої результати та історія збережені. Звернись до тренера, щоб продовжити доступ.</p></div>`;
 if(a.days_left!==null&&a.days_left<=7)return `<div class="card client-access-banner"><strong>До завершення доступу: ${Math.max(0,a.days_left)} дн.</strong><p class="muted" style="margin-bottom:0">Тариф: ${esc(a.plan_name)} · до ${esc(a.access_until)}</p></div>`;
 return '';
}


function syncOverlayLock(){document.body.classList.toggle('overlay-open',!!document.querySelector('.modal'))}
