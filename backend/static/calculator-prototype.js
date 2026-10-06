(function(){
const $=id=>document.getElementById(id);
function showError(message){const e=$('calcError');e.textContent=message;e.style.display='block'}
function recommendedAdjust(g,bf){
 if(g==='loss') return bf?(bf>=30?-20:bf>=20?-15:-10):-15;
 if(g==='recomp') return bf?(bf>=25?-10:bf>=18?-5:0):-5;
 if(g==='gain') return bf&&bf>=25?0:5;
 return 0;
}
function syncAdjust(){
 const g=$('goal').value,bf=Number($('bf').value)||0,rec=recommendedAdjust(g,bf),sel=$('adjust');
 const values=g==='loss'?[-5,-10,-15,-20,-25]:g==='recomp'?[0,-5,-10]:g==='gain'?[0,5,10,15]:[0];
 sel.innerHTML=values.map(v=>'<option value="'+v+'"'+(v===rec?' selected':'')+'>'+(v>0?'+':'')+v+'%'+(v===rec?' · рекомендовано':'')+'</option>').join('');
 $('adjustHint').textContent=g==='maintain'?'Підтримання без дефіциту чи профіциту.':'Можна змінити рекомендований стартовий відсоток.';
}
function calculate(){
 try{
  $('calcError').style.display='none';
  const sex=$('sex').value,age=Number($('age').value),h=Number($('height').value),w=Number($('weight').value),bf=Number($('bf').value)||0,g=$('goal').value;
  const steps=Number($('steps').value),strength=Number($('strength').value),cardio=Number($('cardio').value),cardioMin=Number($('cardioMin').value);
  if(!age||!h||!w||age<18||age>100||h<120||h>230||w<35||w>300){showError('Перевір вік, зріст і вагу.');return}
  if(bf&&(bf<3||bf>60)){showError('Перевір відсоток жиру.');return}
  if(steps<0||steps>50000||strength<0||strength>7||cardio<0||cardio>7||cardioMin<0||cardioMin>240){showError('Перевір дані активності.');return}
  const ffm=bf?w*(1-bf/100):null;
  const rmr=10*w+6.25*h-5*age+(sex==='male'?5:-161);
  const base=rmr*1.2;
  const stepKcal=steps*w*0.0005;
  const strengthDaily=(strength*5*w)/7;
  const cardioDaily=(cardio*cardioMin*0.07*w)/7;
  const tdee=base+stepKcal+strengthDaily+cardioDaily;
  const adjustment=Number($('adjust').value)||0;
  const factor=1+adjustment/100;
  const strategy=adjustment===0?'підтримання':(adjustment<0?'дефіцит '+Math.abs(adjustment)+'%':'профіцит '+adjustment+'%');
  const kcal=Math.round(tdee*factor/10)*10;
  const proteinRate=g==='loss'||g==='recomp'?2.0:g==='gain'?1.8:1.8;
  const protein=Math.round(w*proteinRate);
  const fat=Math.max(Math.round(w*.8),50);
  const carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  const method='Mifflin–St Jeor';
  const goal=strategy;
  const result=$('result');
  result.innerHTML='<span class="kicker">ВАША СТАРТОВА ЦІЛЬ</span><strong class="kcal">'+kcal.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><div class="macros"><div class="macro"><b>'+protein+'</b> г<small>Білки</small></div><div class="macro"><b>'+fat+'</b> г<small>Жири</small></div><div class="macro"><b>'+carbs+'</b> г<small>Вуглеводи</small></div></div><p class="note"><b>Є ПЛАН скоригує ціль за вашою реальною динамікою.</b></p><details class="note"><summary>Як розраховано?</summary><p>'+method+' · '+goal+'. '+(bf?'Вказаний % жиру використано для персоналізації цілі, але не для заміни базової формули. ':'')+'Активність: '+steps.toLocaleString('uk-UA')+' кроків/день, '+strength+' силових і '+cardio+' кардіо/тиждень.</p></details>';
  result.classList.add('show');setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 }catch(err){showError('Помилка калькулятора: '+(err&&err.message?err.message:'невідома помилка'))}
}
$('goal').addEventListener('change',syncAdjust);
$('bf').addEventListener('input',syncAdjust);
$('calcBtn').addEventListener('click',calculate);
syncAdjust();
})();