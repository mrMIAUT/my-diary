(function(){
const $=id=>document.getElementById(id);
function showError(message){const e=$('calcError');e.textContent=message;e.style.display='block'}
function calculate(){
 try{
  $('calcError').style.display='none';
  const sex=$('sex').value, age=Number($('age').value), h=Number($('height').value), w=Number($('weight').value), bf=Number($('bf').value)||0, a=Number($('activity').value), g=$('goal').value;
  if(!age||!h||!w||age<18||age>100||h<120||h>230||w<35||w>300){showError('Перевір вік, зріст і вагу.');return}
  if(bf&&(bf<3||bf>60)){showError('Перевір відсоток жиру.');return}
  const ffm=bf?w*(1-bf/100):null;
  const rmr=ffm?500+22*ffm:10*w+6.25*h-5*age+(sex==='male'?5:-161);
  const tdee=rmr*a;
  const factor=g==='loss'?.85:g==='recomp'?.95:g==='gain'?1.08:1;
  const kcal=Math.round(tdee*factor/10)*10;
  const protein=Math.round((ffm||w)*(g==='loss'||g==='recomp'?2:1.8));
  const fat=Math.round(w*.8);
  const carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  const method=ffm?'Cunningham · за безжировою масою':'Mifflin–St Jeor · без % жиру';
  const goal=g==='loss'?'дефіцит 15%':g==='recomp'?'невеликий дефіцит 5%':g==='gain'?'профіцит 8%':'підтримання';
  const result=$('result');
  result.innerHTML='<span class="kicker">СТАРТОВИЙ ОРІЄНТИР</span><strong class="kcal">'+kcal.toLocaleString('uk-UA')+' <small>ккал/день</small></strong><div class="macros"><div class="macro"><b>'+protein+'</b> г<small>Білки</small></div><div class="macro"><b>'+fat+'</b> г<small>Жири</small></div><div class="macro"><b>'+carbs+'</b> г<small>Вуглеводи</small></div></div><p class="note">'+method+' · '+goal+'. Це початкова оцінка, а не точне вимірювання витрат енергії.</p>';
  result.classList.add('show');
  setTimeout(()=>result.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
 }catch(err){showError('Помилка калькулятора: '+(err&&err.message?err.message:'невідома помилка'))}
}
$('calcBtn').addEventListener('click',calculate);
})();
