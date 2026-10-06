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
$('goal').addEventListener('change',syncAdjust);$('bf').addEventListener('input',syncAdjust);$('experience').addEventListener('change',syncAdjust);$('height').addEventListener('input',syncAdjust);$('weight').addEventListener('input',syncAdjust);$('calcBtn').addEventListener('click',calculate);$('adaptBtn').addEventListener('click',adapt);$('changeGoalBtn').addEventListener('click',changeGoal);$('stopGoalBtn').addEventListener('click',stopGoal);syncAdjust();
})();