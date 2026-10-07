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

let foodItems=[],selectedFood=null,activeFoodProfile=null,foodPage=1,foodActiveQuery='',foodHasMore=false,foodPrepMode='raw',foodWeightBasis='raw',foodPrepCache={};
const FOOD_CACHE_KEY='eplan12-food-cache-v2';
const foodEsc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function foodKey(item){return String(item.barcode||'')||((item.source||'')+':'+String(item.source_id||''))}
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
  const hay=((item.name||'')+' '+(item.brand||'')).toLowerCase();
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
 return n.toLocaleString('uk-UA',{maximumFractionDigits:n<10?1:0});
};
function foodResultLabel(item){
 const brand=item.brand?'<span class="foodBrand">'+foodEsc(item.brand)+'</span>':'';
 const macro='<span class="foodMacros">'+foodFmt(item.kcal_100)+' ккал<br>Б '+foodFmt(item.protein_100)+' · Ж '+foodFmt(item.fat_100)+' · В '+foodFmt(item.carbs_100)+'</span>';
 return '<span><strong>'+foodEsc(item.name)+'</strong>'+brand+'<span class="foodSource">'+foodEsc(item.source_label||item.source)+'</span></span>'+macro;
}
function renderFoodResults(items){
 const box=$('foodResults'),portion=$('foodPortion');selectedFood=null;portion.classList.remove('show');portion.innerHTML='';
 if(!items.length){box.innerHTML='';$('foodStatus').textContent='Нічого не знайдено. Спробуй уточнити бренд або назву.';$('foodMoreBtn').hidden=true;return}
 $('foodStatus').textContent='Показано '+items.length+' варіант'+(items.length===1?'':'ів')+'. Обери продукт.';
 box.innerHTML=items.map((item,i)=>'<button type="button" class="foodItem" data-food-index="'+i+'">'+foodResultLabel(item)+'</button>').join('');
 box.querySelectorAll('[data-food-index]').forEach(btn=>btn.onclick=()=>selectFood(Number(btn.dataset.foodIndex)));
 $('foodMoreBtn').hidden=!foodHasMore;
}
async function searchFoods(query,append=false){
 const q=String(query||$('foodQuery').value||'').trim();
 if(q.length<2){$('foodStatus').textContent='Введи хоча б 2 символи.';return}
 if(!append){foodPage=1;foodActiveQuery=q;foodHasMore=false;foodItems=[];$('foodResults').innerHTML='';$('foodPortion').classList.remove('show')}
 $('foodQuery').value=q;$('foodStatus').textContent=append?'Завантажуємо ще…':'Шукаємо в Open Food Facts та USDA…';
 $('foodSearchBtn').disabled=true;$('foodMoreBtn').disabled=true;
 try{
  const response=await fetch('/api/prototype/foods/search?q='+encodeURIComponent(q)+'&limit=8&page='+foodPage,{headers:{'Accept':'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не вдалося виконати пошук');
  const incoming=Array.isArray(data.items)?data.items:[];
  saveFoodCache(incoming);
  // Fresh server ranking is authoritative. Cache is fallback-only.
  foodItems=append?mergeFoodItems(foodItems,incoming):incoming;
  foodHasMore=Boolean(data.has_more);
  renderFoodResults(foodItems);
  if(data.normalized_query&&data.normalized_query.toLowerCase()!==q.toLowerCase())$('foodStatus').textContent+=' Запит нормалізовано: «'+data.normalized_query+'».';
 }catch(err){
  if(!append)foodItems=cachedFoodMatches(q);
  if(!foodItems.length)$('foodStatus').textContent='Пошук тимчасово недоступний: '+(err&&err.message?err.message:'невідома помилка');
  else $('foodStatus').textContent='Показано кешовані результати. Зовнішній пошук тимчасово недоступний.';
  foodHasMore=false;
  renderFoodResults(foodItems);
 }finally{$('foodSearchBtn').disabled=false;$('foodMoreBtn').disabled=false}
}

function isChickenFood(item){
 const low=((item&&item.name)||'').toLowerCase();
 return /кур(яча|яче|ине|иное|иный)|chicken/.test(low)&&(low.includes('філе')||low.includes('филе')||low.includes('груд')||low.includes('breast'));
}
function prepControlsHtml(){
 return '<div class="foodPrep" id="foodPrepBox">'
  +'<div class="foodPrepGrid">'
  +'<label>Спосіб приготування<select id="foodPrepMode"><option value="raw">Сире</option><option value="boiled">Варене</option><option value="steamed">На парі</option><option value="grilled">Гриль</option><option value="baked">Запечене</option><option value="fried">Смажене</option></select></label>'
  +'<label>Коли зважено<select id="foodWeightBasis"><option value="raw">До приготування</option><option value="cooked">Після приготування</option></select></label>'
  +'</div>'
  +'<div class="foodOil" id="foodOilBox" hidden><label>Олія, що потрапила у порцію, г<input id="foodOilGrams" type="number" inputmode="decimal" min="0" max="200" value="0"></label></div>'
  +'<div class="foodPrepStatus" id="foodPrepStatus">Завантажуємо профіль USDA для сирого філе…</div>'
  +'</div>';
}
async function loadChickenPrep(mode){
 if(foodPrepCache[mode])return foodPrepCache[mode];
 const response=await fetch('/api/prototype/foods/chicken-preparation?mode='+encodeURIComponent(mode),{headers:{'Accept':'application/json'}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не вдалося завантажити спосіб приготування');
 foodPrepCache[mode]=data;
 return data;
}
function setPrepStatus(data,usedMode){
 const el=$('foodPrepStatus');if(!el)return;
 if(!data||!data.item){
  el.textContent='Точного профілю USDA не знайдено. Тимчасово використано дані вибраного продукту.';
  return;
 }
 const approx=data.approximate?' · орієнтовно':'';
 const source=data.fallback?'резервний довідковий профіль':'USDA FoodData Central';
 el.textContent='Профіль: '+(data.label||'')+' · '+source+approx;
}
async function refreshChickenProfile(){
 if(!selectedFood||!isChickenFood(selectedFood))return;
 const prep=$('foodPrepMode'),basis=$('foodWeightBasis');
 foodPrepMode=prep?prep.value:'raw';foodWeightBasis=basis?basis.value:'raw';
 const oilBox=$('foodOilBox');if(oilBox)oilBox.hidden=foodPrepMode!=='fried';
 // If the user weighed the food raw, the concrete product label is the best
 // source. Cooking method does not change the amount logged from that raw weight.
 if(foodWeightBasis==='raw'||foodPrepMode==='raw'){
  activeFoodProfile=selectedFood;
  if($('foodPrepStatus'))$('foodPrepStatus').textContent='Зважено до приготування · використовуємо БЖВ з етикетки вибраного продукту. Спосіб приготування не змінює цей розрахунок.';
  updateFoodPer100();updateFoodPortion();return;
 }
 if($('foodPrepStatus'))$('foodPrepStatus').textContent='Завантажуємо профіль готового філе…';
 try{
  const data=await loadChickenPrep(foodPrepMode);
  activeFoodProfile=(data&&data.item)?data.item:selectedFood;
  setPrepStatus(data,foodPrepMode);
 }catch(err){
  activeFoodProfile=selectedFood;
  if($('foodPrepStatus'))$('foodPrepStatus').textContent='Профіль готового продукту тимчасово недоступний.';
 }
 updateFoodPer100();updateFoodPortion();
}
function updateFoodPer100(){
 const item=activeFoodProfile||selectedFood;if(!item)return;
 const el=$('foodPer100');if(el)el.textContent='На 100 г: '+foodFmt(item.kcal_100)+' ккал · Б '+foodFmt(item.protein_100)+' · Ж '+foodFmt(item.fat_100)+' · В '+foodFmt(item.carbs_100);
}
function selectFood(index){
 const item=foodItems[index];if(!item)return;selectedFood=item;activeFoodProfile=item;foodPrepMode='raw';foodWeightBasis='raw';
 const portion=$('foodPortion'),chicken=isChickenFood(item);
 portion.innerHTML='<div class="foodPortionHead"><div><span class="kicker">ОБРАНИЙ ПРОДУКТ</span><strong>'+foodEsc(item.name)+'</strong>'+(item.brand?'<span class="foodBrand">'+foodEsc(item.brand)+'</span>':'')+'</div><span class="foodSource">'+foodEsc(item.source_label||item.source)+'</span></div>'
  +'<div class="foodPer100" id="foodPer100">На 100 г: '+foodFmt(item.kcal_100)+' ккал · Б '+foodFmt(item.protein_100)+' · Ж '+foodFmt(item.fat_100)+' · В '+foodFmt(item.carbs_100)+'</div>'
  +(chicken?prepControlsHtml():'')
  +'<div class="foodGramRow"><label>Кількість, г<input id="foodGrams" type="number" inputmode="decimal" min="1" max="5000" value="100"></label><div><span class="kicker">ПОРЦІЯ</span><b id="foodPortionName">100 г</b></div></div>'
  +'<div class="foodTotals"><span><b id="foodKcal">0</b>ккал</span><span><b id="foodProtein">0</b>білки, г</span><span><b id="foodFat">0</b>жири, г</span><span><b id="foodCarbs">0</b>вуглеводи, г</span></div>'
  +(chicken?'<p class="note">Якщо зважено <b>до приготування</b>, ЄПЛАН рахує за сирим профілем. Якщо <b>після</b> — за окремим профілем способу приготування. Для смаження олія додається окремо, без формули «вбирання».</p>':'<p class="note">У повній версії кнопка «Додати» збереже цю порцію в щоденник і автоматично додасть її до БЖВ дня.</p>');
 portion.classList.add('show');
 $('foodGrams').addEventListener('input',updateFoodPortion);
 if(chicken){
  $('foodPrepMode').addEventListener('change',refreshChickenProfile);
  $('foodWeightBasis').addEventListener('change',refreshChickenProfile);
  $('foodOilGrams').addEventListener('input',updateFoodPortion);
  refreshChickenProfile();
 }else updateFoodPortion();
 setTimeout(()=>portion.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
}
function updateFoodPortion(){
 const item=activeFoodProfile||selectedFood;if(!item)return;
 const grams=Math.max(0,Math.min(5000,Number($('foodGrams').value)||0)),factor=grams/100;
 let kcal=(Number(item.kcal_100)||0)*factor;
 let protein=(Number(item.protein_100)||0)*factor;
 let fat=(Number(item.fat_100)||0)*factor;
 let carbs=(Number(item.carbs_100)||0)*factor;
 const oilInput=$('foodOilGrams');
 if(isChickenFood(selectedFood)&&foodPrepMode==='fried'&&oilInput){
  const oil=Math.max(0,Math.min(200,Number(oilInput.value)||0));
  // Oil is a separate ingredient: 1 g fat ≈ 9 kcal. We do not estimate
  // absorption from pan amount, because that would create false precision.
  kcal+=oil*9;fat+=oil;
 }
 $('foodPortionName').textContent=foodFmt(grams)+' г';
 $('foodKcal').textContent=foodFmt(kcal);
 $('foodProtein').textContent=foodFmt(protein);
 $('foodFat').textContent=foodFmt(fat);
 $('foodCarbs').textContent=foodFmt(carbs);
}

$('foodSearchBtn').addEventListener('click',()=>searchFoods());
$('foodQuery').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchFoods()}});
$('foodMoreBtn').addEventListener('click',()=>{if(!foodHasMore||!foodActiveQuery)return;foodPage+=1;searchFoods(foodActiveQuery,true)});
document.querySelectorAll('[data-food-query]').forEach(btn=>btn.addEventListener('click',()=>searchFoods(btn.dataset.foodQuery)));

syncAdjust();
})();