(function(){
const $=id=>document.getElementById(id);
function showError(message){const e=$('calcError');e.textContent=message;e.style.display='block'}
function calculate(){
 try{
  $('calcError').style.display='none';
  const sex=$('sex').value,age=Number($('age').value),h=Number($('height').value),w=Number($('weight').value),bf=Number($('bf').value)||0,g=$('goal').value;
  const steps=Number($('steps').value),strength=Number($('strength').value),cardio=Number($('cardio').value),cardioMin=Number($('cardioMin').value);
  if(!age||!h||!w||age<18||age>100||h<120||h>230||w<35||w>300){showError('Перевір вік, зріст і вагу.');return}
  if(bf&&(bf<3||bf>60)){showError('Перевір відсоток жиру.');return}
  if(steps<0||steps>50000||strength<0||strength>7||cardio<0||cardio>7||cardioMin<0||cardioMin>240){showError('Перевір дані активності.');return}
  const ffm=bf?w*(1-bf/100):null;
  const rmr=ffm?500+22*ffm:10*w+6.25*h-5*age+(sex==='male'?5:-161);
  const base=rmr*1.2;
  const stepKcal=steps*w*0.0005;
  const strengthDaily=(strength*5*w)/7;
  const cardioDaily=(cardio*cardioMin*0.07*w)/7;
  const tdee=base+stepKcal+strengthDaily+cardioDaily;
  let factor=1, strategy='підтримання';
  if(g==='loss'){
    const deficit=bf?(bf>=30?.20:bf>=20?.17:.12):.15;
    factor=1-deficit; strategy='дефіцит '+Math.round(deficit*100)+'%';
  }else if(g==='recomp'){
    const deficit=bf?(bf>=25?.10:bf>=18?.05:0):.05;
    factor=1-deficit; strategy=deficit?'невеликий дефіцит '+Math.round(deficit*100)+'%':'біля підтримання';
  }else if(g==='gain'){
    const surplus=bf?(bf>=25?0:.05):.05;
    factor=1+surplus; strategy=surplus?'помірний профіцит '+Math.round(surplus*100)+'%':'біля підтримання';
  }
  const kcal=Math.round(tdee*factor/10)*10;
  const proteinRate=g==='loss'||g==='recomp'?2.0:g==='gain'?1.8:1.8;
  const protein=Math.round(w*proteinRate);
  const fat=Math.max(Math.round(w*.8),50);
  const carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  const method=ffm?'Cunningham · за безжировою масою':'Mifflin–St Jeor · без % жиру';
  const goal=strategy;
  const result=$('result');
  result.innerHTML='<span class="kicker">ВАША СТАРТОВА ЦІЛЬ</span><strong class="kcal">'+kcal.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><div class="macros"><div class="macro"><b>'+protein+'</b> г<small>Білки</small></div><div class="macro"><b>'+fat+'</b> г<small>Жири</small></div><div class="macro"><b>'+carbs+'</b> г<small>Вуглеводи</small></div></div><p class="note">'+method+' · '+goal+'. Активність: '+steps.toLocaleString('uk-UA')+' кроків/день, '+strength+' силових і '+cardio+' кардіо/тиждень. <b>Є ПЛАН скоригує ціль за вашою реальною динамікою.</b></p>';
  result.classList.add('show');setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 }catch(err){showError('Помилка калькулятора: '+(err&&err.message?err.message:'невідома помилка'))}
}
$('calcBtn').addEventListener('click',calculate);
})();