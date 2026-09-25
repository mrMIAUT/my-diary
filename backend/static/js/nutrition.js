// V89 global function declarations. Shared state is initialized by app.js.
// Keep this file declaration-only so all functions exist before startup runs.

function planFromData(d){
 let items=(d.nutrition_plan||[]).map(x=>({meal_number:+x.meal_number||1,variant_number:+x.variant_number||1,content:x.content||'',sort:+x.sort||0}));
 if(!items.length&&d.client.meal_plan)items=[{meal_number:1,variant_number:1,content:d.client.meal_plan,sort:0}];
 if(!items.length)items=[{meal_number:1,variant_number:1,content:'',sort:0},{meal_number:2,variant_number:1,content:'',sort:0},{meal_number:3,variant_number:1,content:'',sort:0}];
 return items;
}

function mealPlanEditorHTML(d,editing=false){
 if(!nutritionPlanDraft)nutritionPlanDraft=planFromData(d);
 let nums=[...new Set(nutritionPlanDraft.map(x=>x.meal_number))].sort((a,b)=>a-b);
 return `<div class="card meal-plan-card"><button class="exercise-toggle meal-plan-head" onclick="toggleCalendar('nutritionPlanBody',this)"><span><strong>План харчування</strong><span class="muted" style="display:block;margin-top:5px">Прийоми їжі та альтернативні варіанти</span></span><span class="arrow">⌄</span></button><div id="nutritionPlanBody" class="hidden meal-plan-body">${nums.map(n=>mealEditorBlock(n,editing)).join('')}<div class="meal-actions">${editing?`<button class="dark icon-btn" onclick="addMealBlock()">${uiIcon('plus')} Додати прийом їжі</button>`:''}</div></div></div>`;
}

function mealEditorBlock(n,editing){
 let xs=nutritionPlanDraft.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number);
 if(!editing)return `<div class="meal-view"><strong>Прийом їжі ${n}</strong>${xs.filter(x=>x.content.trim()).map(x=>`<div class="meal-option"><span class="variant-pill">Варіант ${x.variant_number}</span><div style="white-space:pre-wrap;line-height:1.55;margin-top:7px">${esc(x.content)}</div></div>`).join('')||'<div class="muted" style="margin-top:8px">Ще не заповнено.</div>'}</div>`;
 return `<div class="meal-editor"><div class="meal-editor-head"><strong>Прийом їжі ${n}</strong>${nutritionPlanDraft.some(x=>x.meal_number!==n)?`<button class="dark icon-btn" onclick="removeMealBlock(${n})">${uiIcon('trash')} Видалити</button>`:''}</div>${xs.map(x=>`<div class="meal-variant"><div class="between"><span class="muted">Варіант ${x.variant_number}</span>${xs.length>1?`<button class="dark icon-btn" onclick="removeMealVariant(${n},${x.variant_number})">${uiIcon('trash')}</button>`:''}</div><textarea data-meal="${n}" data-variant="${x.variant_number}" oninput="updateMealDraft(this)" placeholder="Продукти, кількість, примітки...">${esc(x.content)}</textarea></div>`).join('')}<div class="meal-actions"><button class="dark icon-btn" onclick="addMealVariant(${n})">${uiIcon('plus')} Додати варіант</button></div></div>`;
}

function updateMealDraft(el){let x=nutritionPlanDraft.find(v=>v.meal_number===+el.dataset.meal&&v.variant_number===+el.dataset.variant);if(x)x.content=el.value}

function rerenderNutritionPlan(editing=true){let old=$('#nutritionPlanBody'),wasOpen=old&&!old.classList.contains('hidden');let host=$('#nutritionPlanHost');if(host)host.innerHTML=mealPlanEditorHTML(window.currentClientData,editing);if(wasOpen){let b=$('#nutritionPlanBody');if(b)b.classList.remove('hidden')}}

function addMealBlock(){let n=Math.max(0,...nutritionPlanDraft.map(x=>x.meal_number))+1;nutritionPlanDraft.push({meal_number:n,variant_number:1,content:'',sort:0});rerenderNutritionPlan(true)}

function removeMealBlock(n){nutritionPlanDraft=nutritionPlanDraft.filter(x=>x.meal_number!==n);let nums=[...new Set(nutritionPlanDraft.map(x=>x.meal_number))].sort((a,b)=>a-b);nutritionPlanDraft=nutritionPlanDraft.map(x=>({...x,meal_number:nums.indexOf(x.meal_number)+1}));rerenderNutritionPlan(true)}

function addMealVariant(n){let xs=nutritionPlanDraft.filter(x=>x.meal_number===n),v=Math.max(0,...xs.map(x=>x.variant_number))+1;nutritionPlanDraft.push({meal_number:n,variant_number:v,content:'',sort:0});rerenderNutritionPlan(true)}

function removeMealVariant(n,v){nutritionPlanDraft=nutritionPlanDraft.filter(x=>!(x.meal_number===n&&x.variant_number===v));let xs=nutritionPlanDraft.filter(x=>x.meal_number===n).sort((a,b)=>a.variant_number-b.variant_number);xs.forEach((x,i)=>x.variant_number=i+1);rerenderNutritionPlan(true)}

function nutritionHTML(d){let c=d.client;nutritionPlanDraft=planFromData(d);let locked=!!(c.kcal||c.protein||c.fat||c.carbs||(d.nutrition_plan||[]).length||c.meal_plan);let dis=locked?' disabled':'';return `<div class="card"><h2>Цільове харчування</h2><p class="muted">Вкажи калорійність та БЖВ клієнта.</p><div class="grid"><div><div class="muted">Ккал</div><input id="nkcal" type="number" value="${c.kcal||0}"${dis}></div><div><div class="muted">Білки, г</div><input id="nprotein" type="number" value="${c.protein||0}"${dis}></div><div><div class="muted">Жири, г</div><input id="nfat" type="number" value="${c.fat||0}"${dis}></div><div><div class="muted">Вуглеводи, г</div><input id="ncarbs" type="number" value="${c.carbs||0}"${dis}></div></div><br><div id="nutritionActions">${locked?`<button class="dark icon-btn" onclick="editNutritionTargets()">${uiIcon('edit')} Редагувати</button><span class="muted" style="margin-left:12px">Збережено ✓</span>`:`<button onclick="saveNutritionTargets(${c.id},event.currentTarget)">Зберегти харчування</button>`}</div></div><div id="nutritionPlanHost">${mealPlanEditorHTML(d,false)}</div>`}

function editNutritionTargets(){['nkcal','nprotein','nfat','ncarbs'].forEach(id=>{let el=$('#'+id);if(el)el.disabled=false});nutritionPlanDraft=planFromData(window.currentClientData);let a=$('#nutritionActions');if(a)a.innerHTML=`<button onclick="saveNutritionTargets(${window.currentClientData.client.id},event.currentTarget)">Зберегти харчування</button><button class="dark" style="margin-left:8px" onclick="document.querySelector('#nutrition').innerHTML=nutritionHTML(window.currentClientData)">Скасувати</button>`;let host=$('#nutritionPlanHost');if(host)host.innerHTML=mealPlanEditorHTML(window.currentClientData,true)}

async function saveNutritionTargets(cid,button=null){
 let restore=setActionLoading(button,'Зберігаємо…');
 try{let meals=(nutritionPlanDraft||[]).filter(x=>x.content.trim()).map((x,i)=>({...x,sort:i}));let body={kcal:+nkcal.value||0,protein:+nprotein.value||0,fat:+nfat.value||0,carbs:+ncarbs.value||0,meal_plan:'',meals};await api('/client/'+cid+'/nutrition',{method:'PATCH',body:JSON.stringify(body)});let d=await api('/client/'+cid);window.currentClientData=d;nutritionPlanDraft=null;let box=$('#nutrition');if(box)box.innerHTML=nutritionHTML(d)
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
