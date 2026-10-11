// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function planFromData(d){
 let items=(d.nutrition_plan||[]).map(x=>{
  let foods=[];
  try{const raw=x.foods_json||x.foods||'[]';foods=Array.isArray(raw)?raw:JSON.parse(raw);}
  catch(e){console.warn('Invalid structured meal draft',e)}
  return {meal_number:+x.meal_number||1,variant_number:+x.variant_number||1,
          content:x.content||'',sort:+x.sort||0,foods:Array.isArray(foods)?foods:[]};
 });
 if(!items.length&&d.client.meal_plan)items=[{meal_number:1,variant_number:1,content:d.client.meal_plan,sort:0}];
 if(!items.length)items=[{meal_number:1,variant_number:1,content:'',sort:0},{meal_number:2,variant_number:1,content:'',sort:0},{meal_number:3,variant_number:1,content:'',sort:0}];
 return items;
}

function mealPlanEditorHTML(d,editing=false){
 if(!nutritionPlanDraft)nutritionPlanDraft=planFromData(d);
 let nums=[...new Set(nutritionPlanDraft.map(x=>x.meal_number))].sort((a,b)=>a-b);
 return `<div class="card meal-plan-card"><button class="exercise-toggle meal-plan-head" onclick="toggleCalendar('nutritionPlanBody',this)"><span><strong>План харчування</strong><span class="muted" style="display:block;margin-top:5px">Прийоми їжі та альтернативні варіанти</span></span><span class="arrow">⌄</span></button>
  <div class="meal-autoplan-toolbar">
   <button type="button" class="meal-autoplan-open" onclick="openAutoMealPlanBuilder(${d.client.id})">${uiIcon('plus')} Створити план автоматично</button>
   ${!editing?'<button class="meal-plan-edit-open" type="button" onclick="openTrainerStructuredMealPlan()">Редагувати план</button>':''}
  </div>
  <div id="nutritionPlanBody" class="hidden meal-plan-body">${nums.map(n=>mealEditorBlock(n,editing)).join('')}<div class="meal-actions">${editing?`<button type="button" class="dark icon-btn" onclick="addMealBlock()">${uiIcon('plus')} Додати прийом їжі</button><button type="button" class="meal-autoplan-save" onclick="saveTrainerMealPlanDraft(${d.client.id},this)">Зберегти план клієнту</button>`:''}</div></div></div>`;
}

function mealEditorBlock(n,editing){
 let xs=nutritionPlanDraft.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number);
 if(!editing)return `<div class="meal-view"><strong>Прийом їжі ${n}</strong>${xs.filter(x=>x.content.trim()).map(x=>`<div class="meal-option"><span class="variant-pill">Варіант ${x.variant_number}</span><div style="white-space:pre-wrap;line-height:1.55;margin-top:7px">${esc(x.content)}</div></div>`).join('')||'<div class="muted" style="margin-top:8px">Ще не заповнено.</div>'}</div>`;
 return `<div class="meal-editor"><div class="meal-editor-head"><strong>Прийом їжі ${n}</strong>${nutritionPlanDraft.some(x=>x.meal_number!==n)?`<button class="dark icon-btn" onclick="removeMealBlock(${n})">${uiIcon('trash')} Видалити</button>`:''}</div>${xs.map(x=>`<div class="meal-variant"><div class="between"><span class="muted">Варіант ${x.variant_number}</span>${xs.length>1?`<button class="dark icon-btn" onclick="removeMealVariant(${n},${x.variant_number})">${uiIcon('trash')}</button>`:''}</div>${Array.isArray(x.foods)&&x.foods.length
 ? (typeof window.renderStructuredMealHTML==='function'
    ? window.renderStructuredMealHTML(x)
    : `<div class="structured-meal-loader"><p>Продукти збережено зі своїми БЖВ</p><button type="button" onclick="openTrainerStructuredMealPlan()">Редагувати продукти</button></div>`)
 : `<textarea data-meal="${n}" data-variant="${x.variant_number}" oninput="updateMealDraft(this)" placeholder="Продукти, кількість, примітки...">${esc(x.content)}</textarea>
   <button type="button" class="structured-start" onclick="addStructuredMealFood(${n},${x.variant_number})">+ Додати продукт з бази</button>`}</div>`).join('')}<div class="meal-actions"><button class="dark icon-btn" onclick="addMealVariant(${n})">${uiIcon('plus')} Додати варіант</button></div></div>`;
}

function updateMealDraft(el){let x=nutritionPlanDraft.find(v=>v.meal_number===+el.dataset.meal&&v.variant_number===+el.dataset.variant);if(x)x.content=el.value}

function rerenderNutritionPlan(editing=true){let old=$('#nutritionPlanBody'),wasOpen=old&&!old.classList.contains('hidden');let host=$('#nutritionPlanHost');if(host)host.innerHTML=mealPlanEditorHTML(window.currentClientData,editing);if(wasOpen){let b=$('#nutritionPlanBody');if(b)b.classList.remove('hidden')}}

function addMealBlock(){let n=Math.max(0,...nutritionPlanDraft.map(x=>x.meal_number))+1;nutritionPlanDraft.push({meal_number:n,variant_number:1,content:'',sort:0});rerenderNutritionPlan(true)}

function removeMealBlock(n){nutritionPlanDraft=nutritionPlanDraft.filter(x=>x.meal_number!==n);let nums=[...new Set(nutritionPlanDraft.map(x=>x.meal_number))].sort((a,b)=>a-b);nutritionPlanDraft=nutritionPlanDraft.map(x=>({...x,meal_number:nums.indexOf(x.meal_number)+1}));rerenderNutritionPlan(true)}

function addMealVariant(n){let xs=nutritionPlanDraft.filter(x=>x.meal_number===n),v=Math.max(0,...xs.map(x=>x.variant_number))+1;nutritionPlanDraft.push({meal_number:n,variant_number:v,content:'',sort:0});rerenderNutritionPlan(true)}

function removeMealVariant(n,v){nutritionPlanDraft=nutritionPlanDraft.filter(x=>!(x.meal_number===n&&x.variant_number===v));let xs=nutritionPlanDraft.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number);xs.forEach((x,i)=>x.variant_number=i+1);rerenderNutritionPlan(true)}

// Optional generator UI is loaded only on trainer request. It cannot delay app startup.
window.openAutoMealPlanBuilder = async function(cid){
 const c=window.currentClientData?.client;
 if(session?.role!=='trainer'||!c||+c.id!==+cid||!clientAccess(c).features?.meal_plan)return;
 try {
   if(!window.eplanAutoPlanLoader){
     window.eplanAutoPlanLoader=new Promise((resolve,reject)=>{
       const script=document.createElement('script');
       script.src='/static/js/auto-meal-plan.js?v=1';
       script.onload=resolve;
       script.onerror=()=>reject(new Error('Meal planner module unavailable'));
       document.head.appendChild(script);
     }).catch(e=>{window.eplanAutoPlanLoader=null;throw e;});
   }
   await window.eplanAutoPlanLoader;
   if(typeof window.openAutoMealPlanModal!=='function')throw Error('Meal planner unavailable');
   window.openAutoMealPlanModal(cid);
 }catch(e){console.warn('Meal planner error',e);alert('Не вдалося відкрити генератор плану. Спробуй ще раз.');}
};

// Save generated or manually edited meals without changing assigned kcal/macros.
// The nutrition-target editor has deliberately blank fields, so it must NOT
// be reused for saving the meal plan alone.
window.saveTrainerMealPlanDraft = async function(cid,button){
 const data=window.currentClientData||{},c=data.client||{};
 if(session?.role!=='trainer'||+c.id!==+cid||!clientAccess(c).features?.meal_plan)return;
 const items=(nutritionPlanDraft||[]).filter(x=>String(x.content||'').trim()).map((x,i)=>({
   meal_number:+x.meal_number,variant_number:+x.variant_number,content:String(x.content).trim(),sort:i,
   foods:Array.isArray(x.foods)?x.foods.map(food=>({
     source_id:food.source_id,grams:food.grams,count:food.count,
     count_in_targets:food.count_in_targets!==false
   })):[]
 }));
 if(!items.length)return alert('Спочатку додай хоча б один прийом їжі.');
 if(items.some(item=>item.foods.length&&item.foods.some(food=>!food.source_id||!Number.isFinite(Number(food.grams))||food.grams<=0)))
   return alert('Перевір порції та продукти у плані.');
 if(!confirm('Призначити цей план харчування клієнту? Перевір грамовки та БЖВ.'))return;
 let restore=setActionLoading(button,'Зберігаємо…');
 try{
   await api('/client/'+cid+'/nutrition',{method:'PATCH',
     body:JSON.stringify({kcal:+c.kcal||0,protein:+c.protein||0,fat:+c.fat||0,carbs:+c.carbs||0,meal_plan:'',meals:items})});
   window.currentClientData=await loadClientData(cid);
   nutritionPlanDraft=null;
   const host=document.querySelector('#nutrition');
   if(host)host.innerHTML=nutritionHTML(window.currentClientData);
 }catch(e){restore();alert(e.message||'Не вдалося зберегти план.');}
};

// Structured nutrition controls are optional. The application loads unchanged
// without this module; catalogue is fetched only if a trainer enters this editor.
window.ensureStructuredMealEditor=async function(){
 if(typeof window.renderStructuredMealHTML==='function'&&window.structuredCatalog?.length)return;
 if(!window.eplanStructuredMealPromise){
   window.eplanStructuredMealPromise=(async()=>{
     await new Promise((resolve,reject)=>{
       const script=document.createElement('script');
       script.src='/static/js/structured-meal-editor.js?v=1';
       script.onload=resolve;script.onerror=()=>reject(Error('Editor JS unavailable'));
       document.head.appendChild(script);
     });
     await window.loadStructuredMealCatalog();
   })().catch(e=>{window.eplanStructuredMealPromise=null;throw e;});
 }
 return window.eplanStructuredMealPromise;
};
window.openTrainerStructuredMealPlan=async function(){
 try{
   await window.ensureStructuredMealEditor();
   if(!document.querySelector('#nutritionPlanBody textarea')&&!document.querySelector('.meal-editor')){
     editNutritionTargets();
   }else if(!document.querySelector('#nutritionPlanBody .meal-editor')){
     editNutritionTargets();
   }
   rerenderNutritionPlan(true);
   document.querySelector('#nutritionPlanBody')?.classList.remove('hidden');
 }catch(e){console.warn(e);alert('Не вдалося відкрити редактор продуктів.');}
};
window.addStructuredMealFood=async function(n,v){
 try{
   await window.ensureStructuredMealEditor();
   window.pickStructuredFood(n,v,-1);
 }catch(e){console.warn(e);alert('Не вдалося завантажити базу продуктів.');}
};

function nutritionTargetSummaryHTML(c){
 return `<div class="card trainer-nutrition-target-card is-saved">
   <div class="trainer-nutrition-target-head">
     <div><h2>Цільове харчування</h2><p class="muted">Збережені цільові калорії та БЖВ клієнта.</p></div>
     <button type="button" class="trainer-nutrition-edit icon-btn" onclick="editNutritionTargets()">${uiIcon('edit')} Редагувати</button>
   </div>
   <div class="trainer-nutrition-target-summary">
     <div class="kcal"><span>Ккал</span><strong>${c.kcal||0}</strong></div>
     <div class="protein"><span>Білки</span><strong>${c.protein||0} <small>г</small></strong></div>
     <div class="fat"><span>Жири</span><strong>${c.fat||0} <small>г</small></strong></div>
     <div class="carbs"><span>Вуглеводи</span><strong>${c.carbs||0} <small>г</small></strong></div>
   </div>
 </div>`;
}

function syncTrainerNutritionTargetKcal(){
 let kcal=document.getElementById('nkcal'),protein=document.getElementById('nprotein'),fat=document.getElementById('nfat'),carbs=document.getElementById('ncarbs');
 if(!kcal||!protein||!fat||!carbs)return;
 let allMacros=[protein,fat,carbs].every(el=>String(el.value||'').trim()!=='');
 if(!allMacros){kcal.value='';return;}
 let p=Math.max(0,+protein.value||0),f=Math.max(0,+fat.value||0),c=Math.max(0,+carbs.value||0);
 kcal.value=Math.round(p*4+f*9+c*4);
}

function nutritionTargetEditorHTML(c,editing=false){
 return `<div class="card trainer-nutrition-target-card is-editing">
   <div class="trainer-nutrition-target-head">
     <div><h2>Цільове харчування</h2><p class="muted">Вкажи БЖВ або скористайся калькулятором — калорійність перерахується автоматично.</p></div>
   </div>
   <button type="button" class="nutrition-calc-button trainer-nutrition-calc-launch" onclick="openTrainerNutritionCalculator(${c.id})">${uiIcon('chart')} Розрахувати калорії та БЖВ</button>
   ${(+c.kcal||+c.protein||+c.fat||+c.carbs)?`<p class="trainer-nutrition-current">Збережено: ${c.kcal||0} ккал · Б ${c.protein||0} · Ж ${c.fat||0} · В ${c.carbs||0}</p>`:''}
   <div class="trainer-nutrition-target-fields">
     <label><span>Ккал</span><input id="nkcal" type="number" min="0" autocomplete="off" value="" placeholder="Ккал" inputmode="numeric"></label>
     <label><span>Білки, г</span><input id="nprotein" type="number" min="0" autocomplete="off" value="" placeholder="Білки, г" inputmode="numeric" oninput="syncTrainerNutritionTargetKcal()"></label>
     <label><span>Жири, г</span><input id="nfat" type="number" min="0" autocomplete="off" value="" placeholder="Жири, г" inputmode="numeric" oninput="syncTrainerNutritionTargetKcal()"></label>
     <label><span>Вуглеводи, г</span><input id="ncarbs" type="number" min="0" autocomplete="off" value="" placeholder="Вуглеводи, г" inputmode="numeric" oninput="syncTrainerNutritionTargetKcal()"></label>
   </div>
   <div id="nutritionActions" class="trainer-nutrition-target-actions">
     <button onclick="saveTrainerNutritionTargets(${c.id},event.currentTarget)">Зберегти харчування</button>
     ${editing?`<button class="dark" onclick="document.querySelector('#nutrition').innerHTML=nutritionHTML(window.currentClientData)">Скасувати</button>`:''}
   </div>
 </div>`;
}

function nutritionHTML(d,editing=false){
 let c=d.client;
 nutritionPlanDraft=planFromData(d);
 let locked=!!(c.kcal||c.protein||c.fat||c.carbs||(d.nutrition_plan||[]).length||c.meal_plan);
 let target=(locked&&!editing)?nutritionTargetSummaryHTML(c):nutritionTargetEditorHTML(c,editing);
 return `<div class="trainer-nutrition-page">${target}${clientAccess(c).features?.meal_plan?`<div id="nutritionPlanHost">${mealPlanEditorHTML(d,editing)}</div>`:''}</div>`;
}

function editNutritionTargets(){
 nutritionPlanDraft=planFromData(window.currentClientData);
 let box=document.querySelector('#nutrition');
 if(box)box.innerHTML=nutritionHTML(window.currentClientData,true);
}

async function saveTrainerNutritionTargets(cid,button=null){
 // Empty inputs must NEVER silently replace previously assigned goals with zero.
 const fields=['nkcal','nprotein','nfat','ncarbs'];
 if(fields.some(id=>!document.getElementById(id)||document.getElementById(id).value.trim()===''))
   return alert('Заповни всі чотири поля БЖВ або скористайся калькулятором.');
 const vals=fields.map(id=>Number(document.getElementById(id).value));
 if(vals.some(v=>!Number.isFinite(v)||v<0)||vals[0]<=0||vals[1]<=0||vals[2]<=0||vals.some(v=>v>100000))
   return alert('Перевір цільові калорії та БЖВ.');
 let restore=setActionLoading(button,'Зберігаємо…');
 try{let meals=(nutritionPlanDraft||[]).filter(x=>x.content.trim()).map((x,i)=>({...x,sort:i}));let body={kcal:+nkcal.value||0,protein:+nprotein.value||0,fat:+nfat.value||0,carbs:+ncarbs.value||0};let access=clientAccess(window.currentClientData?.client||{});if(access.features?.meal_plan)await api('/client/'+cid+'/nutrition',{method:'PATCH',body:JSON.stringify({...body,meal_plan:'',meals})});else await api('/client/'+cid+'/nutrition-targets',{method:'PATCH',body:JSON.stringify(body)});let d=await loadClientData(cid);window.currentClientData=d;nutritionPlanDraft=null;let box=$('#nutrition');if(box)box.innerHTML=nutritionHTML(d)
 }catch(e){restore();alert(e.message||'Не вдалося зберегти харчування. Спробуй ще раз.')}
}

function clientMealPlanHTML(d){let items=planFromData(d).filter(x=>x.content.trim());if(!items.length)return '';let nums=[...new Set(items.map(x=>x.meal_number))].sort((a,b)=>a-b);return `<div class="card meal-plan-card"><button class="exercise-toggle meal-plan-head" onclick="toggleCalendar('clientMealPlanBody',this)"><span><strong>Мій план харчування</strong><span class="muted" style="display:block;margin-top:5px">Натисни, щоб переглянути прийоми їжі</span></span><span class="arrow">⌄</span></button><div id="clientMealPlanBody" class="hidden meal-plan-body">${nums.map(n=>{let xs=items.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number);return `<div class="meal-view"><strong>Прийом їжі ${n}</strong>${xs.map(x=>`<div class="meal-option"><span class="variant-pill">Варіант ${x.variant_number}</span><div style="white-space:pre-wrap;line-height:1.55;margin-top:7px">${esc(x.content)}</div></div>`).join('')}</div>`}).join('')}</div></div>`}


async function addDailyNutrition(cid,nid=null,button=null){
 let k=+$('#dkcal').value||0,p=+$('#dprotein').value||0,f=+$('#dfat').value||0,c=+$('#dcarbs').value||0;
 if(!k&&!p&&!f&&!c)return alert('Вкажи дані харчування');
 let restore=setActionLoading(button,'Зберігаємо…');
 try{
  if(nid) await api('/nutrition/'+nid,{method:'PATCH',body:JSON.stringify({client_id:cid,kcal:k,protein:p,fat:f,carbs:c})});
  else await api('/nutrition',{method:'POST',body:JSON.stringify({client_id:cid,kcal:k,protein:p,fat:f,carbs:c})});
  clearDailyDraft('nutrition',cid);
  await clientCabinet(cid);
 }catch(e){restore();alert(e.message||'Не вдалося зберегти БЖВ. Перевір інтернет і спробуй ще раз.')}
}

function editDailyNutrition(cid,nid){
 let d=window.currentClientData||{},x=(d.nutrition||[]).find(z=>z.id===nid);if(!x)return;
 let box=$('#dailyNutritionBox');if(!box)return;
 box.innerHTML=`<h2>Редагувати БЖВ</h2><div class="grid"><input id="dkcal" type="number" value="${x.kcal||0}" placeholder="Ккал"><input id="dprotein" type="number" value="${x.protein||0}" placeholder="Білки, г"><input id="dfat" type="number" value="${x.fat||0}" placeholder="Жири, г"><input id="dcarbs" type="number" value="${x.carbs||0}" placeholder="Вуглеводи, г"></div><br><button onclick="addDailyNutrition(${cid},${nid},event.currentTarget)">Зберегти зміни</button>`;restoreDailyDraft('nutrition',cid);
}

function dailyNutritionHTML(d,cid){
 let today=(d.nutrition||[]).filter(x=>x.day===isoToday()).sort((a,b)=>b.id-a.id),x=today[0];
 if(x)return `<div class="card client-collapsible done" id="dailyNutritionBox"><button class="exercise-toggle" onclick="toggleClientPanel('bjuPanel',this)"><span><strong>БЖВ за сьогодні</strong><span class="client-status" style="display:block;margin-top:5px">Виконано ✓</span></span><span class="arrow">⌄</span></button><div id="bjuPanel" class="client-collapsible-body hidden"><div class="daily-macros-line"><div class="daily-macro"><strong>${x.kcal}</strong><br>ккал</div><div class="daily-macro"><strong>${x.protein}</strong><br>Б</div><div class="daily-macro"><strong>${x.fat}</strong><br>Ж</div><div class="daily-macro"><strong>${x.carbs}</strong><br>В</div></div><button class="dark compact-edit" style="margin-top:12px" onclick="editDailyNutrition(${cid},${x.id})">Редагувати</button></div></div>`;
 return `<div class="card client-collapsible" id="dailyNutritionBox"><button class="exercise-toggle" onclick="toggleClientPanel('bjuPanel',this)"><span><strong>БЖВ за сьогодні</strong></span><span class="arrow">⌄</span></button><div id="bjuPanel" class="client-collapsible-body hidden"><div class="grid"><input id="dkcal" type="number" placeholder="Ккал"><input id="dprotein" type="number" placeholder="Білки, г"><input id="dfat" type="number" placeholder="Жири, г"><input id="dcarbs" type="number" placeholder="Вуглеводи, г"></div><br><button onclick="addDailyNutrition(${cid},null,event.currentTarget)">Зберегти БЖВ</button></div></div>`;
}

// Trainer-only calculator: intentionally declaration-only until the trainer opens it.
window.openTrainerNutritionCalculator = function(cid){
  document.getElementById('trainerNutritionCalcModal')?.remove();
  let c=(window.currentClientData||{}).client||{};
  if(session?.role!=='trainer'||!c.id||+c.id!==+cid)return;
  window.pendingTrainerNutritionTargets=null;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal trainer-nutrition-calc-overlay" id="trainerNutritionCalcModal" role="dialog" aria-modal="true" aria-labelledby="trainerNutritionCalcTitle"><div class="card redesign-nutrition-modal nutrition-targets-modal nutrition-calculator-modal trainer-nutrition-calc-card">'
    +'<div class="trainer-nutrition-calc-head"><div><h2 id="trainerNutritionCalcTitle">Розрахунок калорій і БЖВ</h2><p>Внеси дані клієнта, щоб отримати стартові орієнтири.</p></div><button type="button" class="trainer-nutrition-calc-close" aria-label="Закрити" onclick="trainerNutritionCalcModal.remove()">✕</button></div>'
    +'<div class="nutrition-calc-grid">'
      +'<label><span>Стать</span><select id="calcSex"><option value="" selected disabled>Обрати</option><option value="male">Чоловіча</option><option value="female">Жіноча</option></select></label>'
      +'<label><span>Вік</span><input id="calcAge" type="number" inputmode="numeric" min="18" max="100" placeholder="років"></label>'
      +'<label><span>Зріст</span><input id="calcHeight" type="number" inputmode="decimal" min="120" max="230" placeholder="см"></label>'
      +'<label><span>Вага</span><input id="calcWeight" type="number" inputmode="decimal" min="35" max="300" placeholder="кг"></label>'
      +'<label><span>Жир, % <small>(необов’язково)</small></span><input id="calcBodyFat" type="number" inputmode="decimal" min="3" max="60" placeholder="%"></label>'
      +'<label><span>Кроки на день</span><input id="calcSteps" type="number" min="0" max="50000" inputmode="numeric" autocomplete="off" placeholder="Кроків"></label>'
      +'<label><span>Силові / тиждень</span><select id="calcStrength"><option value="" selected disabled>Обрати</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option></select></label>'
      +'<label><span>Кардіо / тиждень</span><select id="calcCardio" onchange="syncTrainerNutritionCardioMinutes()"><option value="" selected disabled>Обрати</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option></select></label>'
      +'<label><span>Хвилин кардіо</span><input id="calcCardioMin" type="number" min="0" max="240" inputmode="numeric" autocomplete="off" placeholder="Хвилин"></label>'
      +'<label><span>Досвід</span><select id="calcExperience"><option value="" selected disabled>Обрати</option><option value="novice">До 6 місяців</option><option value="intermediate">6–24 місяці</option><option value="advanced">Понад 2 роки</option></select></label>'
      +'<label><span>Ціль</span><select id="calcGoal" onchange="syncTrainerNutritionCalcAdjustment()"><option value="" selected disabled>Обрати</option><option value="loss">Зменшення жиру</option><option value="recomp">Рекомпозиція</option><option value="maintain">Підтримання</option><option value="gain">Набір м’язів</option></select></label>'
      +'<label class="nutrition-calc-wide"><span>Корекція калорій</span><select id="calcAdjust"><option value="" selected disabled>Обрати</option><option value="-25">-25%</option><option value="-20">-20%</option><option value="-15">-15%</option><option value="-10">-10%</option><option value="-5">-5%</option><option value="0">0%</option><option value="5">+5%</option><option value="10">+10%</option><option value="15">+15%</option></select></label>'
    +'</div>'
    +'<button class="nutrition-calc-button trainer-nutrition-calc-submit" type="button" onclick="calculateTrainerNutritionTargets()">Розрахувати</button>'
    +'<div id="nutritionCalcResult"></div>'
    +'</div></div>');
  const modal=document.getElementById('trainerNutritionCalcModal');
  const card=modal?.querySelector('.trainer-nutrition-calc-card');
  if(card)card.scrollTop=0;
};

window.syncTrainerNutritionCardioMinutes = function(){
 const cardio=document.getElementById('calcCardio')?.value;
 const minutes=document.getElementById('calcCardioMin');
 if(!minutes)return;
 if(cardio==='0'){minutes.value='';minutes.disabled=true;}
 else minutes.disabled=false;
};

window.syncTrainerNutritionCalcAdjustment = function(){
 let g=document.getElementById('calcGoal')?.value;document.getElementById('calcAdjust').value=g==='loss'?'-15':g==='recomp'?'-5':g==='gain'?'5':'0';
};

window.calculateTrainerNutritionTargets = function(){
  const v=id=>Number(document.getElementById(id)?.value)||0;
  const sex=document.getElementById('calcSex')?.value,age=v('calcAge'),height=v('calcHeight'),weight=v('calcWeight'),bf=v('calcBodyFat');
  const steps=v('calcSteps'),strength=v('calcStrength'),cardio=v('calcCardio'),cardioMin=v('calcCardioMin'),adjust=v('calcAdjust'),goal=document.getElementById('calcGoal')?.value;
  // No assumed activity, sex or goal: the trainer must enter/select them explicitly.
  const required=['calcSex','calcAge','calcHeight','calcWeight','calcSteps','calcStrength','calcCardio','calcGoal','calcAdjust'];
  if(required.some(id=>String(document.getElementById(id)?.value??'').trim()==='')||
     (cardio>0&&String(document.getElementById('calcCardioMin')?.value??'').trim()===''))
    return alert('Заповни всі обов’язкові поля для розрахунку.');
  if(!age||!height||!weight||age<18||age>100||height<120||height>230||weight<35||weight>300)return alert('Перевір вік, зріст і вагу.');
  if(bf&&(bf<3||bf>60))return alert('Перевір відсоток жиру.');
  if(steps<0||steps>50000||strength<0||strength>7||cardio<0||cardio>7||cardioMin<0||cardioMin>240)return alert('Перевір активність.');
  const rmr=10*weight+6.25*height-5*age+(sex==='male'?5:-161);
  const maintenance=rmr*1.2+steps*weight*.0005+strength*5*weight/7+cardio*cardioMin*.07*weight/7;
  const kcal=Math.round(maintenance*(1+adjust/100)/10)*10;
  if(kcal<800||kcal>7000)return alert('Калорійність поза звичайним діапазоном. Перевір дані.');
  const bmi=weight/Math.pow(height/100,2),bmi30=30*Math.pow(height/100,2),ffm=bf?weight*(1-bf/100):0;
  let macroWeight=weight,weightBasis='фактичної маси тіла';
  if(bmi>=30){macroWeight=Math.min(weight,bmi30);weightBasis='скоригованої маси тіла (BMI 30)';
    if(ffm>0){macroWeight=Math.min(macroWeight,Math.max(ffm,Math.min(weight,Math.max(ffm,bmi30*.8))));weightBasis='скоригованої маси з урахуванням складу тіла';}
  }
  const protein=Math.round(macroWeight*(goal==='loss'||goal==='recomp'?2:1.8));
  const fat=Math.max(50,Math.round((bmi>=30?macroWeight:weight)*.8));
  const carbs=Math.max(0,Math.round((kcal-protein*4-fat*9)/4));
  window.pendingTrainerNutritionTargets={kcal,protein,fat,carbs};
  let method='Mifflin–St Jeor + кроки, силові та кардіо';
  let goalText=(adjust>0?'+':'')+adjust+'% до підтримання';
  document.getElementById('nutritionCalcResult').innerHTML=
    '<div class="nutrition-calc-result"><span class="nutrition-kicker">Стартовий орієнтир клієнта</span><strong class="nutrition-calc-kcal">'+kcal.toLocaleString('uk-UA')+' <small>ккал/день</small></strong>'
    +'<div class="nutrition-calc-macros"><span><b>'+protein+'</b> г<small>Білки</small></span><span><b>'+fat+'</b> г<small>Жири</small></span><span><b>'+carbs+'</b> г<small>Вуглеводи</small></span></div>'
    +'<p>'+method+' · '+goalText+'. Білок '+(weightBasis)+'.</p>'
    +'<button class="trainer-nutrition-calc-apply" type="button" onclick="applyTrainerCalculatedNutritionTargets(this)">Підставити у форму</button></div>';
};

// Calculation populates the trainer editor only. Nothing is saved until
// the trainer confirms the existing "Зберегти харчування" action.
window.applyTrainerCalculatedNutritionTargets=function(){
 if(session?.role!=='trainer'||!document.getElementById('nutrition'))return;
 const t=window.pendingTrainerNutritionTargets;
 if(!t)return;
 for(const [id,key] of [['nkcal','kcal'],['nprotein','protein'],['nfat','fat'],['ncarbs','carbs']]){
   const el=document.getElementById(id);if(el)el.value=String(t[key]);
 }
 document.getElementById('trainerNutritionCalcModal')?.remove();
};

