(function(){
const $=id=>document.getElementById(id);
function showError(message){const e=$('calcError');e.textContent=message;e.style.display='block'}
function recommendedAdjust(g,bf,exp){
 if(g==='loss'){if(bf){if(bf>=30)return -20;if(bf>=20)return -15;return exp==='advanced'?-10:-15}return exp==='advanced'?-10:-15}
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
  const proteinRate=g==='loss'||g==='recomp'?2.0:1.8,protein=Math.round(w*proteinRate),fat=Math.max(Math.round(w*.8),50),carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  const strategy=adjustment===0?'підтримання':(adjustment<0?'дефіцит '+Math.abs(adjustment)+'%':'профіцит '+adjustment+'%');
  const result=$('result');
  result.innerHTML='<span class="kicker">ВАША СТАРТОВА ЦІЛЬ</span><strong class="kcal">'+kcal.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><div class="macros"><div class="macro"><b>'+protein+'</b> г<small>Білки</small></div><div class="macro"><b>'+fat+'</b> г<small>Жири</small></div><div class="macro"><b>'+carbs+'</b> г<small>Вуглеводи</small></div></div><p class="note"><b>Є ПЛАН скоригує ціль за вашою реальною динамікою.</b> Калорії можуть змінюватися в межах поточного циклу, але сама ціль змінюється лише після вашого підтвердження.</p><details class="note"><summary>Як розраховано?</summary><p>Mifflin–St Jeor · '+strategy+'. '+(bf?'Вказаний % жиру використано як додатковий модифікатор стартової рекомендації. ':'')+'Досвід: '+$('experience').selectedOptions[0].textContent+'. Активність: '+steps.toLocaleString('uk-UA')+' кроків/день, '+strength+' силових і '+cardio+' кардіо/тиждень.</p></details>';
  result.classList.add('show');$('currentTarget').value=kcal;setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 }catch(err){showError('Помилка калькулятора: '+(err&&err.message?err.message:'невідома помилка'))}
}

let adaptiveDays=14;
function renderDays(){
 const box=$('dailyRows'),old=[...box.querySelectorAll('.dayRow')].map(r=>({w:r.querySelector('.dayWeight').value,k:r.querySelector('.dayCalories').value}));
 box.innerHTML='<div style="display:grid;grid-template-columns:54px 1fr 1fr;gap:8px;margin-bottom:8px;font-size:12px;font-weight:800;color:#7b8797"><span>День</span><span>Вага, кг</span><span>Ккал</span></div>';
 for(let i=0;i<adaptiveDays;i++){
  const d=document.createElement('div');d.className='dayRow';d.style.cssText='display:grid;grid-template-columns:54px 1fr 1fr;gap:8px;margin-bottom:8px;align-items:center';
  d.innerHTML='<b style="font-size:13px;color:#718096">'+(i+1)+'</b><input class="dayWeight" type="number" inputmode="decimal" placeholder="кг" value="'+(old[i]?.w||'')+'"><input class="dayCalories" type="number" inputmode="numeric" placeholder="ккал" value="'+(old[i]?.k||'')+'">';
  box.appendChild(d);
 }
}
function adapt(){
 try{
  const error=$('adaptError'),result=$('adaptResult');error.style.display='none';
  const target=Number($('currentTarget').value),g=$('goal').value,rows=[...document.querySelectorAll('.dayRow')];
  if(!target||target<800||target>7000){error.textContent='Перевір поточну ціль калорій.';error.style.display='block';return}
  const data=rows.map((r,i)=>({day:i+1,w:Number(r.querySelector('.dayWeight').value)||0,k:Number(r.querySelector('.dayCalories').value)||0}));
  const weights=data.filter(x=>x.w>=35&&x.w<=300),foods=data.filter(x=>x.k>=800&&x.k<=7000);
  if(data.length<14||weights.length<10||foods.length<10){result.innerHTML='<span class="kicker">ПОКИ ЩО БЕЗ КОРЕКЦІЇ</span><strong class="kcal">'+target.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><p class="note">Потрібно щонайменше 14 днів спостереження та достатньо записів ваги й харчування. Є ПЛАН продовжить збирати дані.</p>';result.classList.add('show');return}
  const first=weights.filter(x=>x.day<=7),last=weights.filter(x=>x.day>data.length-7);
  if(first.length<5||last.length<5){result.innerHTML='<span class="kicker">ПОКИ ЩО БЕЗ КОРЕКЦІЇ</span><strong class="kcal">'+target.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><p class="note">Для надійного тренду потрібно щонайменше 5 зважувань у першому та останньому 7-денному вікні.</p>';result.classList.add('show');return}
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,firstAvg=mean(first.map(x=>x.w)),lastAvg=mean(last.map(x=>x.w)),avgCalories=mean(foods.map(x=>x.k));
  const change=(lastAvg-firstAvg)/firstAvg;
  let desired=0;if(g==='loss')desired=-0.005;else if(g==='gain')desired=$('experience').value==='advanced'?0.0015:0.0025;else if(g==='recomp')desired=-0.001;
  const tolerance=g==='maintain'?0.002:0.0025,diff=change-desired;
  let delta=0,reason='Динаміка відповідає поточній цілі.';
  if(Math.abs(diff)>tolerance){if(g==='loss')delta=diff>0?-100:100;else if(g==='gain')delta=diff<0?100:-100;else if(g==='recomp')delta=diff>0?-100:100;else delta=change>0?-100:100;reason='Стійкий тренд середньої ваги не відповідає обраній цілі.'}
  if(Math.abs(avgCalories-target)/target>.12){delta=0;reason='Фактичне харчування поки занадто відрізняється від цілі. Спочатку потрібно стабілізувати виконання плану.'}
  const next=Math.max(1200,Math.round((target+delta)/10)*10),title=delta===0?'ЗАЛИШАЄМО БЕЗ ЗМІН':'РЕКОМЕНДОВАНА КОРЕКЦІЯ';
  result.innerHTML='<span class="kicker">'+title+'</span><strong class="kcal">'+next.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><p class="note">'+reason+'</p><p class="note">Оцінено '+weights.length+' записів ваги та '+foods.length+' днів харчування. Рішення базується на 7-денних середніх, а не на одному зважуванні.</p>';
  result.classList.add('show');setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 }catch(err){const e=$('adaptError');e.textContent='Помилка перевірки цілі: '+(err&&err.message?err.message:'невідома помилка');e.style.display='block'}
}
$('goal').addEventListener('change',syncAdjust);$('bf').addEventListener('input',syncAdjust);$('experience').addEventListener('change',syncAdjust);$('calcBtn').addEventListener('click',calculate);$('adaptBtn').addEventListener('click',adapt);$('addDayBtn').addEventListener('click',()=>{if(adaptiveDays<21){adaptiveDays++;renderDays()}});renderDays();syncAdjust();
})();