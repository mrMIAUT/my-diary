(function(){
const $=id=>document.getElementById(id);
function showError(message){const e=$('calcError');e.textContent=message;e.style.display='block'}
function recommendedAdjust(g,bf,exp){
 const h=Number($('height').value)||0,w=Number($('weight').value)||0,bmi=h&&w?w/Math.pow(h/100,2):0;
 if(g==='loss'){
  // Product starting heuristic informed by obesity energy-deficit evidence; the 28-day cycle adapts from real response.
  if(bf){if(bf>=35)return -25;if(bf>=30)return -20;if(bf>=25)return -15;if(bf>=20)return -15;return exp==='advanced'?-10:-15}
  if(bmi>=40)return -20;
  if(bmi>=35)return -20;
  if(bmi>=30)return -15;
  return exp==='advanced'?-10:-15;
 }
 if(g==='recomp') return bf?(bf>=25?-10:bf>=18?-5:0):-5;
 if(g==='gain') return exp==='advanced'?5:(bf&&bf>=25?0:5);
 return 0;
}
function syncAdjust(){
 const g=$('goal').value,bf=Number($('bf').value)||0,exp=$('experience').value,rec=recommendedAdjust(g,bf,exp),sel=$('adjust');
 const values=g==='loss'?[-5,-10,-15,-20,-25]:g==='recomp'?[0,-5,-10]:g==='gain'?[0,5,10,15]:[0];
 sel.innerHTML=values.map(v=>'<option value="'+v+'"'+(v===rec?' selected':'')+'>'+(v>0?'+':'')+v+'%'+(v===rec?' · рекомендовано':'')+'</option>').join('');
 $('adjustHint').textContent=g==='maintain'?'Підтримання без дефіциту чи профіциту.':'Рекомендований старт. За потреби можна змінити.';
}
function calculate(){
 try{
  $('calcError').style.display='none';
  const sex=$('sex').value,age=Number($('age').value),h=Number($('height').value),w=Number($('weight').value),bf=Number($('bf').value)||0,g=$('goal').value,exp=$('experience').value;
  const steps=Number($('steps').value),strength=Number($('strength').value),cardio=Number($('cardio').value),cardioMin=Number($('cardioMin').value);
  if(!age||!h||!w||age<18||age>100||h<120||h>230||w<35||w>300){showError('Перевір вік, зріст і вагу.');return}
  if(bf&&(bf<3||bf>60)){showError('Перевір відсоток жиру.');return}
  if(steps<0||steps>50000||strength<0||strength>7||cardio<0||cardio>7||cardioMin<0||cardioMin>240){showError('Перевір дані активності.');return}
  const rmr=10*w+6.25*h-5*age+(sex==='male'?5:-161);
  const base=rmr*1.2,stepKcal=steps*w*0.0005,strengthDaily=(strength*5*w)/7,cardioDaily=(cardio*cardioMin*0.07*w)/7;
  const tdee=base+stepKcal+strengthDaily+cardioDaily,adjustment=Number($('adjust').value)||0;
  const kcal=Math.round(tdee*(1+adjustment/100)/10)*10;
  const bmi=w/Math.pow(h/100,2),bmi30Weight=30*Math.pow(h/100,2),ffm=bf?w*(1-bf/100):0;
  let macroWeight=w,proteinBasis='фактичної маси тіла';
  if(bmi>=30){macroWeight=Math.min(w,bmi30Weight);proteinBasis='скоригованої маси тіла (межа BMI 30)';
   if(bf&&ffm>0){const ffmGuard=Math.min(w,Math.max(ffm,bmi30Weight*.8));macroWeight=Math.min(macroWeight,Math.max(ffmGuard,ffm));proteinBasis='скоригованої маси з урахуванням складу тіла'}
  }
  const proteinRate=g==='loss'||g==='recomp'?2.0:1.8,protein=Math.round(macroWeight*proteinRate);
  const fatWeight=bmi>=30?macroWeight:w,fat=Math.max(Math.round(fatWeight*.8),50),carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  const strategy=adjustment===0?'підтримання':(adjustment<0?'дефіцит '+Math.abs(adjustment)+'%':'профіцит '+adjustment+'%');
  const result=$('result');
  result.innerHTML='<span class="kicker">ВАША СТАРТОВА ЦІЛЬ</span><strong class="kcal">'+kcal.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><div class="macros"><div class="macro"><b>'+protein+'</b> г<small>Білки</small></div><div class="macro"><b>'+fat+'</b> г<small>Жири</small></div><div class="macro"><b>'+carbs+'</b> г<small>Вуглеводи</small></div></div><p class="note"><b>Є ПЛАН скоригує ціль за вашою реальною динамікою.</b> Калорії можуть змінюватися в межах поточного циклу, але сама ціль змінюється лише після вашого підтвердження.</p><details class="note"><summary>Як розраховано?</summary><p>Mifflin–St Jeor · '+strategy+'. Білок розраховано від '+proteinBasis+'. '+(bmi>=30?'Для БЖВ фактичну масу не використано напряму, щоб надлишкова жирова маса не завищувала білок і жири. ':'')+(bf?'Вказаний % жиру використано як додатковий сигнал складу тіла. ':'')+'Досвід: '+$('experience').selectedOptions[0].textContent+'. Активність: '+steps.toLocaleString('uk-UA')+' кроків/день, '+strength+' силових і '+cardio+' кардіо/тиждень.</p></details>';
  result.classList.add('show');$('currentTarget').value=kcal;setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 }catch(err){showError('Помилка калькулятора: '+(err&&err.message?err.message:'невідома помилка'))}
}

function adapt(){
 try{
  const error=$('adaptError'),result=$('adaptResult');error.style.display='none';
  const n=id=>Number($(id).value)||0,target=n('currentTarget'),weights=['cycleW1','cycleW2','cycleW3','cycleW4','cycleW5'].map(n),avgCalories=n('cycleCalories'),foodDays=n('cycleFoodDays'),steps=n('cycleSteps'),planned=n('cyclePlannedWorkouts'),done=n('cycleDoneWorkouts'),waistStart=n('waistStart'),waistEnd=n('waistEnd'),g=$('goal').value;
  const wait=msg=>{result.innerHTML='<span class="kicker">ПОКИ ЩО БЕЗ КОРЕКЦІЇ</span><strong class="kcal">'+target.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><p class="note">'+msg+'</p>';result.classList.add('show')};
  if(!target||target<800||target>7000||weights.some(x=>x<35||x>300)){error.textContent='Перевір поточну ціль та 5 контрольних зважувань.';error.style.display='block';return}
  if(foodDays<21||!avgCalories){wait('Недостатньо даних про харчування. Для місячного перегляду потрібно щонайменше 21 день із записаним раціоном.');return}
  if(Math.abs(avgCalories-target)/target>.10){wait('Фактична середня калорійність помітно відрізняється від призначеної. Спочатку потрібно стабілізувати виконання плану.');return}
  if(planned>0&&done/planned<.7){wait('Виконано менше 70% запланованих силових тренувань. Зараз зміна калорій може маскувати проблему з виконанням плану.');return}
  const startAvg=(weights[0]+weights[1])/2,endAvg=(weights[3]+weights[4])/2,weightChange=(endAvg-startAvg)/startAvg,waistChange=waistStart&&waistEnd?waistEnd-waistStart:null;
  let delta=0,reason='Поточна калорійність відповідає динаміці. Змінювати її зараз не потрібно.';
  if(g==='loss'){
   if(weightChange>-.01 && !(waistChange!==null&&waistChange<=-1)) {delta=-100;reason='За 28 днів немає достатньої динаміки ваги або талії для цілі зменшення жиру.'}
   else if(weightChange<-.04){delta=100;reason='За цикл маса знизилася швидко. Пропонуємо трохи підвищити калорійність.'}
  }else if(g==='recomp'){
   const waistImproved=waistChange!==null&&waistChange<=-1;
   if(Math.abs(weightChange)<=.015&&waistImproved){reason='Вага відносно стабільна, а талія зменшилася. Для рекомпозиції це хороший сигнал — калорійність залишаємо.'}
   else if(weightChange>.015&&!waistImproved){delta=-100;reason='Вага зростає, а талія не покращується. Пропонуємо невелике зниження калорійності.'}
   else if(weightChange<-.03){delta=100;reason='Для рекомпозиції маса знижується занадто помітно. Пропонуємо невелике підвищення калорійності.'}
  }else if(g==='gain'){
   if(weightChange<.005){delta=100;reason='За 28 днів маса майже не змінилася при цілі набору.'}
   else if(weightChange>.025){delta=-100;reason='Маса зростає швидше, ніж потрібно для консервативного набору.'}
  }else{
   if(weightChange>.015){delta=-100;reason='За цикл є стійкий ріст маси при цілі підтримання.'}
   else if(weightChange<-.015){delta=100;reason='За цикл є стійке зниження маси при цілі підтримання.'}
  }
  const next=Math.max(1200,Math.round((target+delta)/10)*10),title=delta===0?'ЗАЛИШАЄМО БЕЗ ЗМІН':'РЕКОМЕНДОВАНА КОРЕКЦІЯ',waistInfo=waistChange===null?'':' Талія: '+(waistChange>0?'+':'')+waistChange.toFixed(1)+' см.';
  const action=delta===0?'':'<div style="display:flex;gap:8px;margin-top:14px"><button type="button" id="acceptAdapt" style="margin:0">Прийняти '+next.toLocaleString('uk-UA')+' ккал</button><button type="button" id="keepAdapt" style="margin:0;background:#eef4ff;color:#245cae">Залишити '+target.toLocaleString('uk-UA')+'</button></div>';
  result.innerHTML='<span class="kicker">'+title+'</span><strong class="kcal">'+next.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><p class="note">'+reason+'</p><p class="note">Проаналізовано 28-денний цикл: 5 контрольних зважувань, '+foodDays+' днів харчування'+waistInfo+(steps?' Середня активність: '+steps.toLocaleString('uk-UA')+' кроків/день.':'')+'</p>'+action;
  result.classList.add('show');
  if(delta!==0){$('acceptAdapt').onclick=()=>{$('currentTarget').value=next;result.innerHTML='<span class="kicker">НОВУ ЦІЛЬ ПРИЙНЯТО</span><strong class="kcal">'+next.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><p class="note">Починається новий 28-денний цикл спостереження.</p>'};$('keepAdapt').onclick=()=>{result.innerHTML='<span class="kicker">ПОТОЧНУ ЦІЛЬ ЗАЛИШЕНО</span><strong class="kcal">'+target.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><p class="note">Рекомендацію не застосовано. Наступний плановий перегляд — після нового циклу.</p>'}}
  setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 }catch(err){const e=$('adaptError');e.textContent='Помилка перегляду цілі: '+(err&&err.message?err.message:'невідома помилка');e.style.display='block'}
}

function changeGoal(){
 const result=$('goalActionResult'),goal=$('goal');
 result.innerHTML='<span class="kicker">НОВА ЦІЛЬ</span><p class="note" style="margin-top:8px">Оберіть новий етап. Поточний цикл буде завершено, а розрахунок почнеться заново за актуальними даними.</p><select id="newGoal" style="margin-top:8px"><option value="maintain">Підтримання форми</option><option value="loss">Зменшення жиру</option><option value="recomp">Рекомпозиція тіла</option><option value="gain">Набір м’язової маси</option></select><button type="button" id="confirmGoal">Підтвердити нову ціль</button>';
 result.classList.add('show');
 $('confirmGoal').onclick=()=>{const v=$('newGoal').value;goal.value=v;syncAdjust();$('adaptResult').classList.remove('show');result.innerHTML='<span class="kicker">ЦІЛЬ ЗМІНЕНО</span><p class="note">Попередній цикл завершено. Нова ціль: <b>'+goal.selectedOptions[0].textContent+'</b>. Натисніть «Розрахувати», щоб отримати нову стартову калорійність за актуальними параметрами.</p>';result.scrollIntoView({behavior:'smooth',block:'nearest'})};
}
function stopGoal(){
 const result=$('goalActionResult');
 result.innerHTML='<span class="kicker">ЗУПИНИТИ ЦІЛЬ?</span><p class="note">Автоматичні 28-денні перегляди та рекомендації калорій буде призупинено. Дані поточного циклу не використовуватимуться для нової корекції.</p><button type="button" id="confirmStop">Так, зупинити</button>';
 result.classList.add('show');
 $('confirmStop').onclick=()=>{result.innerHTML='<span class="kicker">ЦІЛЬ ЗУПИНЕНО</span><p class="note">Автоматичні корекції призупинено. Коли будете готові, оберіть нову ціль і почніть новий цикл.</p>';$('adaptResult').classList.remove('show')};
}
$('goal').addEventListener('change',syncAdjust);$('bf').addEventListener('input',syncAdjust);$('experience').addEventListener('change',syncAdjust);$('height').addEventListener('input',syncAdjust);$('weight').addEventListener('input',syncAdjust);$('calcBtn').addEventListener('click',calculate);$('adaptBtn').addEventListener('click',adapt);$('changeGoalBtn').addEventListener('click',changeGoal);$('stopGoalBtn').addEventListener('click',stopGoal);

let foodItems=[],selectedFood=null,activeFoodProfile=null,foodPage=1,foodActiveQuery='',foodHasMore=false,foodPrepMode='raw',foodWeightBasis='raw',foodPrepCache={},foodPrepMeta=null,currentFoodTotals=null,currentPrepValid=true,foodRequestId=0;
const FOOD_CACHE_KEY='eplan12-food-cache-v2';
const FOOD_DIARY_KEY='eplan12-food-diary-v1';
const FOOD_LOCAL_CATALOG_KEY='eplan12-local-food-catalog-v1';
const FOOD_LOCAL_CATALOG_TTL=6*60*60*1000;
let foodLocalCatalog=null,foodFullLoading=false,foodLocalLoadPromise=null;
let foodLocalResults=[],foodLocalShown=0,foodSearchStage='idle',foodRemotePage=0,foodRemoteHasMore=false;
function loadLocalFoodCatalogue(){
 // The server embeds the current local reference foods into the same HTML
 // document. They are ready synchronously, even on first visit or if
 // localStorage is disabled by Safari private-browsing restrictions.
 try{
  const node=typeof document==='undefined'?null:
   document.getElementById('eplan-local-food-catalog-bootstrap');
  if(node&&node.textContent){
   const embedded=JSON.parse(node.textContent);
   if(embedded&&Array.isArray(embedded.items)&&embedded.items.length>=26){
    const value={...embedded,savedAt:Date.now()};
    try{localStorage.setItem(FOOD_LOCAL_CATALOG_KEY,JSON.stringify(value))}catch(_){}
    return value;
   }
  }
 }catch(_){}
 // Graceful fallback for legacy static pages and temporarily offline users.
 try{
  const stored=JSON.parse(localStorage.getItem(FOOD_LOCAL_CATALOG_KEY)||'null');
  if(!stored||!Array.isArray(stored.items)||stored.items.length<26
     ||!Number.isFinite(stored.savedAt)
     ||Date.now()-stored.savedAt>FOOD_LOCAL_CATALOG_TTL)return null;
  return stored;
 }catch(_){return null}
}
foodLocalCatalog=loadLocalFoodCatalogue();
function foodPreviewNormalize(query){
 const text=String(query||'').toLocaleLowerCase('uk-UA').replace(/ё/g,'е').trim().replace(/\s+/g,' ');
 if(!foodLocalCatalog)return text;
 const replacements=foodLocalCatalog.query_replacements||{};
 if(Object.prototype.hasOwnProperty.call(replacements,text))return replacements[text];
 let result=text;
 // Same word-boundary semantics as the Python normalizer, including Cyrillic.
 const escaped=x=>Array.from(x).map(ch=>'\\^$.*+?()[]{}|'.includes(ch)?'\\'+ch:ch).join('');
 for(const [from,to] of Object.entries(replacements).sort((a,b)=>b[0].length-a[0].length)){
  const re=new RegExp('(^|[^\\p{L}\\p{N}])'+escaped(from)+'(?=$|[^\\p{L}\\p{N}])','gu');
  result=result.replace(re,(_,left)=>left+to);
 }
 return result;
}
function localFoodMatches(query,limit=8){
 if(!foodLocalCatalog||!Array.isArray(foodLocalCatalog.items))return [];
 const raw=String(query||'').trim().toLocaleLowerCase('uk-UA');
 if(raw.length<2||/^\d{8,14}$/.test(raw))return [];
 const normalized=foodPreviewNormalize(raw);
 const variants=[raw,normalized];
 const equivalents=Array.isArray(foodLocalCatalog.english_aliases)?foodLocalCatalog.english_aliases:[];
 for(const [src,dst] of [...equivalents].sort((a,b)=>b[0].length-a[0].length)){
  if(normalized===src||normalized.startsWith(src+' ')){
   variants.push(normalized.replace(src,dst));
  }
 }
 const terms=variants.map(v=>String(v).toLocaleLowerCase('uk-UA').split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>1));
 const scored=[];
 for(const item of foodLocalCatalog.items){
  if(!item||!item.name||!Number.isFinite(Number(item.kcal_100)))continue;
  const label=String(item.name).toLocaleLowerCase('uk-UA');
  const aliases=Array.isArray(item.search_aliases)?item.search_aliases.join(' '):'';
  const hay=(label+' '+String(item.brand||'')+' '+aliases).toLocaleLowerCase('uk-UA');
  let relevance=99;
  for(let k=0;k<terms.length;k++){
   const words=terms[k];
   if(!words.length||!words.every(word=>hay.includes(word)))continue;
   const labelMatch=words.every(word=>label.includes(word));
   const score=(labelMatch?0:3)+k;
   if(score<relevance)relevance=score;
  }
  if(relevance>=99)continue;
  scored.push({item,score:relevance,approx:item.approximate?1:0});
 }
 scored.sort((a,b)=>a.score-b.score||a.approx-b.approx||
   a.item.name.length-b.item.name.length||
   a.item.name.localeCompare(b.item.name,'uk'));
 return (limit===null?scored:scored.slice(0,limit)).map(x=>x.item);
}
function warmLocalFoodCatalogue(){
 if(foodLocalLoadPromise)return foodLocalLoadPromise;
 foodLocalLoadPromise=fetch('/api/prototype/foods/local-catalog',
    {headers:{'Accept':'application/json'}})
  .then(response=>response.ok?response.json():null)
  .then(data=>{
   if(!data||!Array.isArray(data.items)||data.items.length<26)return null;
   foodLocalCatalog={...data,savedAt:Date.now()};
   try{localStorage.setItem(FOOD_LOCAL_CATALOG_KEY,JSON.stringify(foodLocalCatalog))}catch(_){}
   if(foodSearchStage==='idle'&&foodActiveQuery&&!selectedFood){
    showLocalFoodResults(foodActiveQuery);
   }
   return foodLocalCatalog;
  })
  .catch(()=>null)
  .finally(()=>{foodLocalLoadPromise=null});
 return foodLocalLoadPromise;
}

const foodEsc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function foodKey(item){
 const fdc=item.source_fdc_id||(item.source==='usda'?item.source_id:null);
 if(fdc&&/^\d+$/.test(String(fdc)))return 'fdc:'+fdc;
 return String(item.barcode||'')||((item.source||'')+':'+String(item.source_id||''));
}
function loadFoodCache(){
 try{const x=JSON.parse(localStorage.getItem(FOOD_CACHE_KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return []}
}
function saveFoodCache(items){
 try{
  const merged=[...items,...loadFoodCache()],seen=new Set(),out=[];
  for(const item of merged){const k=foodKey(item);if(!k||seen.has(k))continue;seen.add(k);out.push(item);if(out.length>=200)break}
  localStorage.setItem(FOOD_CACHE_KEY,JSON.stringify(out));
 }catch(_){}
}
function cachedFoodMatches(query){
 const tokens=String(query||'').toLowerCase().split(/\s+/).filter(x=>x.length>1&&!/^\d+%?$/.test(x));
 if(!tokens.length)return [];
 return loadFoodCache().filter(item=>{
  const aliases=Array.isArray(item.search_aliases)?item.search_aliases.join(' '):'';
  const hay=((item.name||'')+' '+(item.brand||'')+' '+aliases).toLowerCase();
  return tokens.every(t=>hay.includes(t));
 }).slice(0,8);
}
function mergeFoodItems(a,b){
 const seen=new Set(),out=[];
 for(const item of [...a,...b]){const k=foodKey(item);if(!k||seen.has(k))continue;seen.add(k);out.push(item)}
 return out;
}
const foodFmt=value=>{
 const n=Number(value)||0;
 return n.toLocaleString('uk-UA',{maximumFractionDigits:1});
};
function foodResultLabel(item){
 const brand=item.brand?'<span class="foodBrand">'+foodEsc(item.brand)+(item.source_kind==='manufacturer_label'?' · дані виробника':'')+'</span>':item.approximate?'<span class="foodBrand">Довідкові БЖВ · орієнтовно</span>':item.review_status==='approved'&&item.source_fdc_id?'<span class="foodBrand">База ЄПЛАН · USDA FDC №'+foodEsc(item.source_fdc_id)+'</span>':'';
 const macro='<span class="foodMacros">'+foodFmt(item.kcal_100)+' ккал<br>Б '+foodFmt(item.protein_100)+' · Ж '+foodFmt(item.fat_100)+' · В '+foodFmt(item.carbs_100)+'</span>';
 return '<span><strong>'+foodEsc(item.name)+'</strong>'+brand+'</span>'+macro;
}
function renderFoodResults(items,message){
 const box=$('foodResults'),portion=$('foodPortion');
 // Loading extra pages must not close the portion editor the user opened.
 if(!selectedFood){portion.classList.remove('show');portion.innerHTML=''}
 if(!items.length){
  box.innerHTML='';
  $('foodStatus').textContent=message||'Нічого не знайдено. Спробуй іншу назву.';
  $('foodMoreBtn').hidden=true;
  return;
 }
 $('foodStatus').textContent=message||('Показано '+items.length+' варіант'+(items.length===1?'':'ів')+'. Обери продукт.');
 box.innerHTML=items.map((item,i)=>'<button type="button" class="foodItem" data-food-index="'+i+'">'+foodResultLabel(item)+'</button>').join('');
 box.querySelectorAll('[data-food-index]').forEach(btn=>btn.onclick=()=>selectFood(Number(btn.dataset.foodIndex)));
 $('foodMoreBtn').hidden=!foodHasMore;
 $('foodMoreBtn').textContent=foodSearchStage==='local'&&foodLocalShown>=foodLocalResults.length
  ?'Показати ще · інші бази':'Показати ще';
}
function resetFoodSearch(query){
 ++foodRequestId;
 foodActiveQuery=query;
 foodPage=1;foodRemotePage=0;foodRemoteHasMore=false;
 foodSearchStage='idle';foodFullLoading=false;foodHasMore=false;
 foodLocalResults=[];foodLocalShown=0;foodItems=[];
 selectedFood=null;activeFoodProfile=null;currentFoodTotals=null;
 $('foodResults').innerHTML='';
 $('foodPortion').classList.remove('show');
 $('foodPortion').innerHTML='';
 $('foodMoreBtn').hidden=true;
 $('foodMoreBtn').disabled=false;
 $('foodSearchBtn').disabled=false;
}
function showLocalFoodResults(query){
 const local=localFoodMatches(query,null);
 if(!local.length)return false;
 foodActiveQuery=query;
 foodSearchStage='local';
 foodLocalResults=local;
 foodLocalShown=Math.min(8,local.length);
 foodItems=local.slice(0,foodLocalShown);
 // The button can always request more from OFF/USDA after local pages.
 foodHasMore=true;
 renderFoodResults(foodItems,'Показано '+foodLocalShown+' з '+local.length+
  ' продуктів бази ЄПЛАН. Обери продукт без очікування.');
 return true;
}
async function fetchExternalFoods(query,requestId,page,keepLocal){
 if(foodFullLoading)return;
 foodFullLoading=true;
 $('foodMoreBtn').disabled=true;
 $('foodSearchBtn').disabled=true;
 const status=$('foodStatus');
 status.textContent=keepLocal
  ?'Продукти ЄПЛАН доступні. Шукаємо додаткові товари в інших базах…'
  :'Шукаємо у відкритих базах продуктів…';
 try{
  const url='/api/prototype/foods/search?q='+encodeURIComponent(query)+'&limit=8&page='+page;
  const response=await fetch(url,{headers:{'Accept':'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(requestId!==foodRequestId)return;
  if(!response.ok)throw new Error(typeof data.detail==='string'
   ?data.detail:'Не вдалося виконати пошук');
  const incoming=Array.isArray(data.items)?data.items:[];
  saveFoodCache(incoming);
  foodItems=keepLocal?mergeFoodItems(foodItems,incoming):incoming;
  foodRemotePage=page;
  foodRemoteHasMore=Boolean(data.has_more);
  foodHasMore=foodRemoteHasMore;
  foodSearchStage='remote';
  renderFoodResults(foodItems,foodItems.length
   ?'Показано '+foodItems.length+' продуктів. Обери продукт.'
   :'За цим запитом продуктів не знайдено.');
 }catch(err){
  if(requestId!==foodRequestId)return;
  // Keep already-visible local food and retry option if remote API fails.
  foodHasMore=Boolean(foodItems.length);
  foodSearchStage=keepLocal?'local':'remote-retry';
  renderFoodResults(foodItems,foodItems.length
   ?'Продукти ЄПЛАН доступні. Інші бази тимчасово недоступні — можна спробувати ще раз.'
   :'Зовнішній пошук тимчасово недоступний: '+(err&&err.message?err.message:'невідома помилка'));
  if(!foodItems.length){
   foodHasMore=true;
   $('foodMoreBtn').hidden=false;
  }
 }finally{
  if(requestId===foodRequestId){
   foodFullLoading=false;
   $('foodSearchBtn').disabled=false;
   $('foodMoreBtn').disabled=false;
  }
 }
}
async function searchFoods(query,append=false){
 const q=String(query||$('foodQuery').value||'').trim();
 if(q.length<2){$('foodStatus').textContent='Введи хоча б 2 символи.';return}
 if(append){
  if(foodFullLoading||!foodActiveQuery)return;
  if(foodSearchStage==='local'&&foodLocalShown<foodLocalResults.length){
   foodLocalShown=Math.min(foodLocalShown+8,foodLocalResults.length);
   foodItems=foodLocalResults.slice(0,foodLocalShown);
   foodHasMore=true;
   renderFoodResults(foodItems,'Показано '+foodLocalShown+' з '+
    foodLocalResults.length+' продуктів бази ЄПЛАН.');
   return;
  }
  if(foodSearchStage==='local'||foodSearchStage==='remote-retry'){
   return fetchExternalFoods(foodActiveQuery,foodRequestId,
    foodSearchStage==='remote-retry'&&foodRemotePage>0?foodRemotePage:1,
    foodItems.length>0);
  }
  if(foodSearchStage==='remote'&&foodRemoteHasMore){
   return fetchExternalFoods(foodActiveQuery,foodRequestId,foodRemotePage+1,true);
  }
  return;
 }
 resetFoodSearch(q);
 $('foodQuery').value=q;
 const requestId=foodRequestId;
 const barcode=/^\d{8,14}$/.test(q.replace(/\s/g,''));
 if(!barcode&&!foodLocalCatalog){
  // An initial search shares the preloading request, never races it by
  // starting a slow external search before the local catalogue arrives.
  await (foodLocalLoadPromise||warmLocalFoodCatalogue());
  if(requestId!==foodRequestId)return;
 }
 if(!barcode&&showLocalFoodResults(q))return;
 // A barcode or an ingredient genuinely absent from the own catalogue
 // needs the complete OFF/USDA search immediately.
 foodSearchStage='remote';
 return fetchExternalFoods(q,requestId,1,false);
}

const PREP_PATTERNS=[
 {category:'meat',base:'chicken breast',re:/кур.*(філе|филе|груд)|chicken.*(breast|fillet)/},
 {category:'meat',base:'turkey breast',re:/індич|индей|turkey/},
 {category:'meat',base:'beef',re:/ялович|говя|beef/},
 {category:'meat',base:'pork',re:/свин|pork/},
 {category:'meat',base:'veal',re:/теля|veal/},
 {category:'meat',base:'lamb',re:/баран|ягня|lamb/},
 {category:'meat',base:'rabbit',re:/крол|rabbit/},
 {category:'meat',base:'duck',re:/качк|утк|duck/},
 {category:'fish',base:'tuna',re:/тунец|тунець|tuna/},
 {category:'fish',base:'salmon',re:/лосос|семг|salmon/},
 {category:'fish',base:'trout',re:/форел|trout/},
 {category:'fish',base:'cod',re:/тріск|треск|cod/},
 {category:'fish',base:'hake',re:/хек|hake/},
 {category:'fish',base:'pollock',re:/минтай|pollock/},
 {category:'fish',base:'mackerel',re:/скумбр|mackerel/},
 {category:'fish',base:'herring',re:/оселед|селед|herring/},
 {category:'fish',base:'tilapia',re:/тілап|тилап|tilapia/},
 {category:'fish',base:'carp',re:/короп|карп|carp/},
 {category:'fish',base:'sardine',re:/сардин|sardine/},
 {category:'grain',base:'basmati rice',re:/басмат|basmati/},
 {category:'grain',base:'rice',re:/рис|rice/},
 {category:'grain',base:'buckwheat',re:/греч|buckwheat/},
 {category:'grain',base:'bulgur',re:/булгур|bulgur/},
 {category:'grain',base:'couscous',re:/кускус|couscous/},
 {category:'grain',base:'quinoa',re:/кіноа|киноа|quinoa/},
 {category:'grain',base:'barley',re:/перлов|ячмін|ячмен|barley/},
 {category:'grain',base:'millet',re:/пшон|millet/},
 {category:'grain',base:'oats',re:/вівс|овся|oat/},
 {category:'potato',base:'potato',re:/картоп|картоф|potato/},
 {category:'pasta',base:'spaghetti',re:/спагет|spaghett/},
 {category:'pasta',base:'macaroni',re:/макарон|macaroni/},
 {category:'pasta',base:'pasta',re:/паст[аи]|pasta/},
];
const PREPARED_MARKERS=/консерв|у розсол|в розсол|у власному соку|в масл|в олі|копчен|сушен|в'ялен|вялен|варен|запеч|гриль|fried|cooked|smoked|cured|ready to eat|hotdog|хот-дог|сосиск/;
const PREP_OPTIONS={
 meat:[['raw','Сире'],['boiled','Варене'],['steamed','На парі'],['grilled','Гриль'],['baked','Запечене'],['fried','Смажене']],
 fish:[['raw','Сире'],['boiled','Варене'],['steamed','На парі'],['grilled','Гриль'],['baked','Запечене'],['fried','Смажене']],
 grain:[['dry','Сухе'],['boiled','Варене'],['steamed','На парі']],
 potato:[['raw','Сира'],['boiled','Варена'],['steamed','На парі'],['baked','Запечена'],['fried','Смажена']],
 pasta:[['dry','Сухі'],['boiled','Варені']],
};
function detectPrepMeta(item){
  // Built-in ready-to-eat profiles already represent their served weight.
  if(item&&item.source==='reference'&&item.preparation_state!=='raw'&&item.preparation_state!=='dry')return null;
 const low=((item&&item.name)||'').toLowerCase();
 for(const meta of PREP_PATTERNS){
  if(!meta.re.test(low))continue;
  // Meat/fish products that are already clearly processed are logged as-is.
  if((meta.category==='meat'||meta.category==='fish')&&PREPARED_MARKERS.test(low))return null;
  return {category:meta.category,base:meta.base};
 }
 return null;
}
function prepControlsHtml(meta){
 const options=(PREP_OPTIONS[meta.category]||[]).map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('');
 return '<div class="foodPrep" id="foodPrepBox">'
  +'<div class="foodPrepGrid">'
  +'<label>Спосіб приготування<select id="foodPrepMode">'+options+'</select></label>'
  +'<label>Коли зважено<select id="foodWeightBasis"><option value="raw">До приготування</option><option value="cooked">Після приготування</option></select></label>'
  +'</div>'
  +'<div class="foodOil" id="foodOilBox" hidden><label>Олія, що потрапила у порцію, г<input id="foodOilGrams" type="number" inputmode="decimal" min="0" max="200" value="0"></label></div>'
  +'<div class="foodPrepStatus" id="foodPrepStatus" hidden></div>'
  +'</div>';
}
function prepCacheKey(meta,mode){
 const p=Number(selectedFood&&selectedFood.protein_100)||0,f=Number(selectedFood&&selectedFood.fat_100)||0;
 return meta.category+'|'+meta.base+'|'+mode+'|'+(p>0?(f/p).toFixed(2):'na');
}
async function loadFoodPrep(meta,mode){
 const key=prepCacheKey(meta,mode);
 if(foodPrepCache[key])return foodPrepCache[key];
 const p=Number(selectedFood&&selectedFood.protein_100)||0,f=Number(selectedFood&&selectedFood.fat_100)||0;
 const url='/api/prototype/foods/preparation?category='+encodeURIComponent(meta.category)+'&base='+encodeURIComponent(meta.base)+'&mode='+encodeURIComponent(mode)+'&raw_protein='+encodeURIComponent(p)+'&raw_fat='+encodeURIComponent(f);
 const response=await fetch(url,{headers:{'Accept':'application/json'}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не вдалося завантажити спосіб приготування');
 foodPrepCache[key]=data;return data;
}
function prepModeLabel(){
 const select=$('foodPrepMode');
 return select&&select.selectedOptions[0]?select.selectedOptions[0].textContent:'';
}
function showPrepError(message){
 const el=$('foodPrepStatus');if(!el)return;
 if(message){el.textContent=message;el.hidden=false}
 else{el.textContent='';el.hidden=true}
}
async function refreshFoodPrepProfile(){
 if(!selectedFood||!foodPrepMeta)return;
 const prep=$('foodPrepMode'),basis=$('foodWeightBasis');
 foodPrepMode=prep?prep.value:'raw';foodWeightBasis=basis?basis.value:'raw';
 const rawLike=(foodPrepMode==='raw'||foodPrepMode==='dry');
 if(rawLike&&basis){basis.value='raw';foodWeightBasis='raw'}
 const cookedOption=basis?basis.querySelector('option[value="cooked"]'):null;
 if(cookedOption)cookedOption.disabled=rawLike;
 const oilBox=$('foodOilBox');if(oilBox)oilBox.hidden=foodPrepMode!=='fried';
 if(foodWeightBasis==='raw'||rawLike){
  activeFoodProfile=selectedFood;currentPrepValid=true;showPrepError('');
  updateFoodPer100();updateFoodPortion();return;
 }
 currentPrepValid=false;showPrepError('');
 try{
  const data=await loadFoodPrep(foodPrepMeta,foodPrepMode);
  if(data&&data.item){
   activeFoodProfile=data.item;currentPrepValid=true;showPrepError('');
  }else{
   activeFoodProfile=selectedFood;
   showPrepError('Не вдалося розрахувати готовий продукт.');
  }
 }catch(_){
  activeFoodProfile=selectedFood;
  showPrepError('Не вдалося розрахувати готовий продукт.');
 }
 updateFoodPer100();updateFoodPortion();
}
function updateFoodPer100(){
 const item=activeFoodProfile||selectedFood;if(!item)return;
 const el=$('foodPer100');if(el)el.textContent='На 100 г: '+foodFmt(item.kcal_100)+' ккал · Б '+foodFmt(item.protein_100)+' · Ж '+foodFmt(item.fat_100)+' · В '+foodFmt(item.carbs_100);
}
function selectFood(index){
 const item=foodItems[index];if(!item)return;
 selectedFood=item;activeFoodProfile=item;foodPrepMeta=detectPrepMeta(item);currentPrepValid=true;
 const options=foodPrepMeta?PREP_OPTIONS[foodPrepMeta.category]:null;
 foodPrepMode=options&&options.length?options[0][0]:'raw';foodWeightBasis='raw';
 const portion=$('foodPortion');
 portion.innerHTML='<div class="foodPortionHead"><div><span class="kicker">ОБРАНИЙ ПРОДУКТ</span><strong>'+foodEsc(item.name)+'</strong>'+(item.brand?'<span class="foodBrand">'+foodEsc(item.brand)+'</span>':'')+(item.approximate?'<span class="foodBrand">Орієнтовні значення · звір за етикеткою або джерелом</span>':'')+'</div></div>'
  +'<div class="foodPer100" id="foodPer100">На 100 г: '+foodFmt(item.kcal_100)+' ккал · Б '+foodFmt(item.protein_100)+' · Ж '+foodFmt(item.fat_100)+' · В '+foodFmt(item.carbs_100)+'</div>'
  +(foodPrepMeta?prepControlsHtml(foodPrepMeta):'')
  +'<div class="foodGramRow"><label>Кількість, г<input id="foodGrams" type="number" inputmode="decimal" min="1" max="5000" value="100"></label><div><span class="kicker">ПОРЦІЯ</span><b id="foodPortionName">100 г</b></div></div>'
  +'<div class="foodTotals"><span><b id="foodKcal">0</b>ккал</span><span><b id="foodProtein">0</b>білки, г</span><span><b id="foodFat">0</b>жири, г</span><span><b id="foodCarbs">0</b>вуглеводи, г</span></div>'
  +'<div class="foodAddRow"><select id="foodMeal"><option value="Сніданок">Сніданок</option><option value="Обід">Обід</option><option value="Вечеря">Вечеря</option><option value="Перекус">Перекус</option></select><button type="button" id="foodAddBtn">Додати в щоденник</button></div><div class="foodAddStatus" id="foodAddStatus"></div>';
 portion.classList.add('show');
 $('foodGrams').addEventListener('input',updateFoodPortion);
 $('foodAddBtn').addEventListener('click',addFoodToDiary);
 if(foodPrepMeta){
  $('foodPrepMode').value=foodPrepMode;
  $('foodPrepMode').addEventListener('change',refreshFoodPrepProfile);
  $('foodWeightBasis').addEventListener('change',refreshFoodPrepProfile);
  $('foodOilGrams').addEventListener('input',updateFoodPortion);
  refreshFoodPrepProfile();
 }else updateFoodPortion();
 setTimeout(()=>portion.scrollIntoView({behavior:'smooth',block:'start'}),50);
}
function updateFoodPortion(){
 const item=activeFoodProfile||selectedFood;if(!item)return;
 const grams=Math.max(0,Math.min(5000,Number($('foodGrams').value)||0)),factor=grams/100;
 let kcal=(Number(item.kcal_100)||0)*factor;
 let protein=(Number(item.protein_100)||0)*factor;
 let fat=(Number(item.fat_100)||0)*factor;
 let carbs=(Number(item.carbs_100)||0)*factor;
 let oil=0;
 const oilInput=$('foodOilGrams');
 if(foodPrepMeta&&foodPrepMode==='fried'&&oilInput){
  oil=Math.max(0,Math.min(200,Number(oilInput.value)||0));
  kcal+=oil*9;fat+=oil;
 }
 currentFoodTotals={grams,kcal,protein,fat,carbs,oil};
 $('foodPortionName').textContent=foodFmt(grams)+' г';
 $('foodKcal').textContent=foodFmt(kcal);
 $('foodProtein').textContent=foodFmt(protein);
 $('foodFat').textContent=foodFmt(fat);
 $('foodCarbs').textContent=foodFmt(carbs);
}
function localDayKey(){
 const d=new Date(),pad=n=>String(n).padStart(2,'0');
 return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
const FOOD_MEALS=['Сніданок','Обід','Вечеря','Перекус'];
let activeDiaryEditId=null,diaryLastRemoved=null;
function loadDiary(){
 try{const x=JSON.parse(localStorage.getItem(FOOD_DIARY_KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return []}
}
function saveDiary(items){
 try{localStorage.setItem(FOOD_DIARY_KEY,JSON.stringify(items));return true}catch(_){return false}
}
function diaryNutritionProfile(entry){
 // Older diary entries lack a per-100g snapshot. Infer it from the precise
 // original unrounded totals and never from the rounded UI numbers.
 const existing=entry&&entry.per100;
 if(existing&&['kcal_100','protein_100','fat_100','carbs_100'].every(
     key=>Number.isFinite(Number(existing[key]))&&Number(existing[key])>=0)){
  return existing;
 }
 const previous=Number(entry&&entry.grams),oil=Math.max(0,Number(entry&&entry.oil)||0);
 if(!Number.isFinite(previous)||previous<=0)return null;
 const keys=[['kcal_100','kcal',9*oil],['protein_100','protein',0],
             ['fat_100','fat',oil],['carbs_100','carbs',0]];
 const profile={};
 for(const [target,source,extra] of keys){
  const value=Number(entry[source]);
  if(!Number.isFinite(value)||value<extra-0.00001)return null;
  profile[target]=Math.max(0,(value-extra)*100/previous);
 }
 return profile;
}
function diaryTotalsForGrams(entry,grams){
 if(!Number.isFinite(grams)||grams<1||grams>5000)return null;
 const per100=diaryNutritionProfile(entry);
 if(!per100)return null;
 const oil=Math.max(0,Number(entry.oil)||0);
 const factor=grams/100;
 return {grams,oil,per100,
  kcal:Number(per100.kcal_100)*factor+oil*9,
  protein:Number(per100.protein_100)*factor,
  fat:Number(per100.fat_100)*factor+oil,
  carbs:Number(per100.carbs_100)*factor};
}
function diaryMealOptions(selected){
 return FOOD_MEALS.map(meal=>'<option value="'+meal+'"'+
  (selected===meal?' selected':'')+'>'+meal+'</option>').join('');
}
function diaryEntryHtml(x){
 const id=foodEsc(String(x.id));
 const brand=x.brand?'<span class="foodDiaryBrand">'+foodEsc(x.brand)+'</span>':'';
 const editing=activeDiaryEditId===String(x.id);
 let edit='';
 if(editing){
  const oil=Math.max(0,Number(x.oil)||0);
  edit='<div class="foodDiaryEditor" data-diary-editor="'+id+'">'+
   '<div class="foodDiaryEditGrid"><label>Кількість, г'+
   '<input id="diaryEditGrams" type="number" min="1" max="5000" step="any" inputmode="decimal" value="'+foodEsc(x.grams)+'"></label>'+
   '<label>Прийом їжі<select id="diaryEditMeal">'+diaryMealOptions(x.meal)+'</select></label></div>'+
   (oil?'<div class="foodDiaryEditHint">Олія '+foodFmt(oil)+' г залишається без змін.</div>':'')+
   '<div class="foodDiaryEditPreview" id="diaryEditPreview" aria-live="polite"></div>'+
   '<div class="foodDiaryEditError" id="diaryEditError" aria-live="polite"></div>'+
   '<div class="foodDiaryEditActions"><button type="button" data-diary-save="'+id+'">Зберегти</button>'+
   '<button type="button" class="foodDiaryCancel" data-diary-cancel="'+id+'">Скасувати</button></div></div>';
 }
 return '<div class="foodDiaryEntry" data-diary-entry="'+id+'">'+
  '<div class="foodDiaryInfo"><strong>'+foodEsc(x.name||'Продукт')+'</strong>'+
   brand+
   '<div class="foodDiaryMeta">'+foodFmt(x.grams)+' г'+
   (x.prep?' · '+foodEsc(x.prep):'')+' · '+foodFmt(x.kcal)+' ккал</div></div>'+
  '<div class="foodDiaryActions"><button type="button" data-diary-edit="'+id+
  '" aria-label="Редагувати '+foodEsc(x.name||'продукт')+'">Редагувати</button>'+
  '<button type="button" class="foodDiaryRemove" data-diary-remove="'+id+
  '" aria-label="Видалити '+foodEsc(x.name||'продукт')+'">×</button></div>'+edit+'</div>';
}
function diaryNutritionTotals(items){
 // Work from stored full-precision entries, never from rounded UI labels.
 const totals={kcal:0,protein:0,fat:0,carbs:0};
 for(const item of items){
  for(const key of Object.keys(totals)){
   const value=Number(item[key]);
   if(Number.isFinite(value))totals[key]+=value;
  }
 }
 return totals;
}
function diaryMealGroupHtml(meal,items){
 const totals=diaryNutritionTotals(items);
 const label=items.length===1?'1 продукт':items.length+' продуктів';
 return '<section class="foodDiaryMeal" data-diary-meal="'+foodEsc(meal)+'">'+
  '<div class="foodDiaryMealHead"><div><strong>'+foodEsc(meal)+'</strong>'+
   '<span class="foodDiaryMealCount">'+label+'</span></div>'+
   '<strong class="foodDiaryMealKcal">'+foodFmt(totals.kcal)+' <small>ккал</small></strong></div>'+
  '<div class="foodDiaryMealMacros" aria-label="БЖВ: '+foodEsc(meal)+'">'+
   '<span>Б <b>'+foodFmt(totals.protein)+'</b></span>'+
   '<span>Ж <b>'+foodFmt(totals.fat)+'</b></span>'+
   '<span>В <b>'+foodFmt(totals.carbs)+'</b></span></div>'+
  '<div class="foodDiaryMealEntries">'+items.map(diaryEntryHtml).join('')+'</div></section>';
}
function renderDiary(){
 const all=loadDiary(),day=localDayKey(),items=all.filter(x=>x.date===day);
 const totals=diaryNutritionTotals(items);
 $('diaryKcal').textContent=foodFmt(totals.kcal);
 $('diaryProtein').textContent=foodFmt(totals.protein);
 $('diaryFat').textContent=foodFmt(totals.fat);
 $('diaryCarbs').textContent=foodFmt(totals.carbs);
 const date=new Date();$('foodDiaryDate').textContent=date.toLocaleDateString('uk-UA',{day:'numeric',month:'long'});
 const box=$('foodDiaryEntries');
 if(!items.length){
  box.innerHTML='<div class="foodDiaryEmpty">Поки що нічого не додано. Обери продукт і прийом їжі вище.</div>';
 }else{
  const sections=FOOD_MEALS.map(meal=>{
   const group=items.filter(item=>item.meal===meal);
   return group.length?diaryMealGroupHtml(meal,group):'';
  });
  // Never hide entries created by an older diary version with a custom meal.
  const other=items.filter(item=>!FOOD_MEALS.includes(item.meal));
  if(other.length)sections.push(diaryMealGroupHtml('Інше',other));
  box.innerHTML=sections.join('');
 }
 box.querySelectorAll('[data-diary-remove]').forEach(btn=>btn.onclick=()=>removeDiaryEntry(btn.dataset.diaryRemove));
 box.querySelectorAll('[data-diary-edit]').forEach(btn=>btn.onclick=()=>startDiaryEdit(btn.dataset.diaryEdit));
 box.querySelectorAll('[data-diary-save]').forEach(btn=>btn.onclick=()=>saveDiaryEdit(btn.dataset.diarySave));
 box.querySelectorAll('[data-diary-cancel]').forEach(btn=>btn.onclick=()=>cancelDiaryEdit());
 if(activeDiaryEditId&&items.some(x=>String(x.id)===activeDiaryEditId)){
  $('diaryEditGrams').addEventListener('input',updateDiaryEditPreview);
  $('diaryEditMeal').addEventListener('change',updateDiaryEditPreview);
  updateDiaryEditPreview();
 }
 const notice=$('foodDiaryNotice');
 if(notice){
  notice.innerHTML=diaryLastRemoved?
   'Запис видалено. <button type="button" id="diaryUndoBtn">Скасувати видалення</button>':'';
  const undo=$('diaryUndoBtn');
  if(undo)undo.addEventListener('click',undoDiaryRemove);
 }
}
function startDiaryEdit(id){
 const entry=loadDiary().find(x=>x.date===localDayKey()&&String(x.id)===String(id));
 if(!entry)return;
 diaryLastRemoved=null;
 activeDiaryEditId=String(id);
 renderDiary();
 const editor=$('diaryEditGrams');
 if(editor)editor.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function cancelDiaryEdit(){
 activeDiaryEditId=null;
 renderDiary();
}
function diaryDraft(){
 const raw=String($('diaryEditGrams').value??'').trim().replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
 const grams=Number(raw);
 if(!Number.isFinite(grams)||grams<1||grams>5000)return null;
 const meal=$('diaryEditMeal').value;
 if(!FOOD_MEALS.includes(meal))return null;
 return {grams,meal};
}
function updateDiaryEditPreview(){
 if(!activeDiaryEditId)return;
 const entry=loadDiary().find(x=>x.date===localDayKey()&&String(x.id)===activeDiaryEditId);
 const draft=diaryDraft(),totals=entry&&draft?diaryTotalsForGrams(entry,draft.grams):null;
 const preview=$('diaryEditPreview'),error=$('diaryEditError');
 if(!preview||!error)return;
 if(!totals){
  preview.textContent='';
  error.textContent='Введи кількість від 1 до 5000 г.';
  return;
 }
 error.textContent='';
 preview.textContent=foodFmt(totals.kcal)+' ккал · Б '+foodFmt(totals.protein)+
  ' · Ж '+foodFmt(totals.fat)+' · В '+foodFmt(totals.carbs);
}
function saveDiaryEdit(id){
 if(String(id)!==activeDiaryEditId)return false;
 const draft=diaryDraft(),error=$('diaryEditError');
 if(!draft){if(error)error.textContent='Введи кількість від 1 до 5000 г.';return false}
 const all=loadDiary();
 const idx=all.findIndex(x=>x.date===localDayKey()&&String(x.id)===String(id));
 if(idx<0)return false;
 const entry=all[idx],totals=diaryTotalsForGrams(entry,draft.grams);
 if(!totals){if(error)error.textContent='Не вдалося перерахувати продукт.';return false}
 const {per100,...values}=totals;
 all[idx]={...entry,...values,per100,meal:draft.meal};
 if(!saveDiary(all)){
  if(error)error.textContent='Не вдалося зберегти. Перевір вільне місце в браузері.';
  return false;
 }
 diaryLastRemoved=null;
 activeDiaryEditId=null;
 renderDiary();
 return true;
}
function removeDiaryEntry(id){
 const all=loadDiary();
 const index=all.findIndex(x=>x.date===localDayKey()&&String(x.id)===String(id));
 if(index<0)return false;
 const removed=all[index];
 all.splice(index,1);
 if(!saveDiary(all))return false;
 diaryLastRemoved={entry:removed,index};
 if(activeDiaryEditId===String(id))activeDiaryEditId=null;
 renderDiary();
 return true;
}
function undoDiaryRemove(){
 if(!diaryLastRemoved)return false;
 const {entry,index}=diaryLastRemoved,all=loadDiary();
 if(all.some(x=>String(x.id)===String(entry.id)))return false;
 all.splice(Math.min(index,all.length),0,entry);
 if(!saveDiary(all))return false;
 diaryLastRemoved=null;
 renderDiary();
 return true;
}
function addFoodToDiary(){
 const status=$('foodAddStatus');
 if(!selectedFood||!currentFoodTotals)return;
 if(foodPrepMeta&&foodWeightBasis==='cooked'&&!currentPrepValid){
  status.textContent='Спочатку обери варіант, для якого знайдено профіль готового продукту.';return;
 }
 if(!Number.isFinite(currentFoodTotals.grams)||currentFoodTotals.grams<1||
    currentFoodTotals.grams>5000){
  status.textContent='Введи кількість від 1 до 5000 г.';return;
 }
 const meal=$('foodMeal').value;
 if(!FOOD_MEALS.includes(meal)){
  status.textContent='Обери прийом їжі.';return;
 }
 const prep=foodPrepMeta?(prepModeLabel()+' · '+(foodWeightBasis==='raw'?'до приготування':'після приготування')):'';
 const item=activeFoodProfile||selectedFood;
 const per100={
  kcal_100:Number(item.kcal_100)||0,
  protein_100:Number(item.protein_100)||0,
  fat_100:Number(item.fat_100)||0,
  carbs_100:Number(item.carbs_100)||0,
 };
 const entry={
  id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
  date:localDayKey(),meal,name:selectedFood.name,brand:selectedFood.brand||'',
  grams:currentFoodTotals.grams,kcal:currentFoodTotals.kcal,protein:currentFoodTotals.protein,
  fat:currentFoodTotals.fat,carbs:currentFoodTotals.carbs,oil:currentFoodTotals.oil||0,
  per100,prep,source:selectedFood.source||'',source_id:selectedFood.source_id||'',
  barcode:selectedFood.barcode||''
 };
 const all=loadDiary();all.push(entry);
 if(!saveDiary(all)){
  status.textContent='Не вдалося зберегти. Перевір вільне місце в браузері.';return;
 }
 diaryLastRemoved=null;
 renderDiary();
 status.textContent='Додано до щоденника.';
}

$('foodSearchBtn').addEventListener('click',()=>searchFoods());
$('foodQuery').addEventListener('input',()=>{
 const q=$('foodQuery').value.trim();
 resetFoodSearch(q);  // Also invalidates any previous external request.
 if(q.length<2){$('foodStatus').textContent='Введи хоча б 2 символи.';return}
 if(!showLocalFoodResults(q)){
  $('foodStatus').textContent='У базі ЄПЛАН немає збігів. Натисни «Знайти» для пошуку в інших базах.';
 }
});
$('foodQuery').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchFoods()}});
$('foodMoreBtn').addEventListener('click',()=>{if(!foodHasMore||!foodActiveQuery)return;searchFoods(foodActiveQuery,true)});
document.querySelectorAll('[data-food-query]').forEach(btn=>btn.addEventListener('click',()=>searchFoods(btn.dataset.foodQuery)));

renderDiary();
syncAdjust();
// The inline bootstrap is authoritative on every fresh page. Only fetch
// separately as fallback if the HTML did not include the food catalogue.
if(!foodLocalCatalog)warmLocalFoodCatalogue();
})();