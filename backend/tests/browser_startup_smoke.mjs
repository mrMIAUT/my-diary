// Browser-level launch and nutrition calculator regression smoke.
// Served without a real database; the test must not access production accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp'};
let remoteSearchCalls=0,previewCalls=0;
let mealPlanPreviewCalls=0,mealPlanWriteCalls=0;
let structuredCatalogCalls=0,mealPlanSavedPayload=null;
let diarySeq=0;const diaryRows=[];const diaryDays=new Set();
const calculated=(row)=>({...row,...Object.fromEntries(['kcal','protein','fat','carbs'].map(k=>[k,+(Number(row[k+'_100'])*Number(row.grams)/100).toFixed(1)]))});
const diaryPayload=(day)=>{const items=diaryRows.filter(x=>x.day===day).map(calculated);
 return {day,active:diaryDays.has(day),items,totals:Object.fromEntries(['kcal','protein','fat','carbs'].map(k=>[k,+(items.reduce((sum,x)=>sum+x[k],0)).toFixed(1)]))};};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/session'){
    res.writeHead(401,{'content-type':'application/json','cache-control':'no-store'});res.end('{"detail":"Unauthorized"}');return;
  }
  if(pathname==='/api/client/999'&&req.method==='GET'){
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({
      client:{id:999,name:'Test client',kcal:2500,protein:160,fat:70,carbs:300,
        access:{features:{nutrition:true,meal_plan:true,workouts:true}}},
      nutrition_plan:(mealPlanSavedPayload?.meals||[]).map(item=>({
        meal_number:item.meal_number,variant_number:item.variant_number,
        content:item.content,sort:item.sort,foods_json:JSON.stringify(item.foods)
      }))
    }));
    return;
  }
  if(pathname==='/api/trainer/foods/catalog'){
    structuredCatalogCalls++;
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    const mk=(source_id,name,kcal,p,f,c,unit='g',optional_vegetable=false)=>({
      source_id,name,state:'cooked',kcal_100:kcal,protein_100:p,fat_100:f,carbs_100:c,
      unit,optional_vegetable,grams_per_piece:unit==='pcs'?50:null
    });
    res.end(JSON.stringify({items:[
      mk('eplan12-fdc-101','Вівсяні пластівці (сухі)',379,13.15,6.52,67.7),
      mk('eplan12-fdc-102','Куряче філе (запечене)',165,31.02,3.57,0),
      mk('eplan12-fdc-103','Гречка (відварена)',92,3.38,0.62,19.94),
      mk('eplan12-fdc-104','Яйце куряче (варене круто)',155,12.58,10.61,1.12,'pcs'),
      mk('eplan12-fdc-105','Помідор (сирий)',18,.88,.2,3.89,'g',true)
    ]}));
    return;
  }
  if(pathname==='/api/trainer/client/999/nutrition/auto-plan'){
    mealPlanPreviewCalls++;
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({
      targets:{kcal:2500,protein:160,fat:70,carbs:300},
      totals:{kcal:2470,protein:159,fat:71,carbs:296},
      deviations_pct:{kcal:-1.2,protein:-0.6,fat:1.4,carbs:-1.3},
      within_tolerance:true,review_required:true,
      warnings:['Потрібна перевірка тренером','Не гарантує відсутності алергенів'],
      meals:[
       {meal_number:1,meal_name:'Сніданок',variant_number:1,sort:0,totals:{kcal:600,protein:30,fat:20,carbs:70},
        foods:[{source_id:'eplan12-fdc-101',name:'Вівсяні пластівці (сухі)',grams:65,count:null,count_in_targets:true}],content:'Вівсяні пластівці (сухі) — 65 г'},
       {meal_number:2,meal_name:'Обід',variant_number:1,sort:1,totals:{kcal:920,protein:65,fat:20,carbs:115},
        foods:[{source_id:'eplan12-fdc-102',name:'Куряче філе (запечене)',grams:170,count:null,count_in_targets:true}],content:'Куряче філе (запечене) — 170 г'},
       {meal_number:3,meal_name:'Вечеря',variant_number:1,sort:2,totals:{kcal:950,protein:64,fat:31,carbs:111},
        foods:[{source_id:'eplan12-fdc-103',name:'Гречка (відварена)',grams:230,count:null,count_in_targets:true}],content:'Гречка (відварена) — 230 г'}
      ]
    }));
    return;
  }
  if(pathname==='/api/client/999/nutrition'&&req.method==='PATCH'){
    mealPlanWriteCalls++;
    let raw='';
    for await(const part of req)raw+=part;
    try{mealPlanSavedPayload=JSON.parse(raw)}catch{mealPlanSavedPayload=null}
    res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;
  }
  if(pathname==='/api/nutrition/diary/overview'){
    const days=[...diaryDays].map(day=>({
      ...diaryPayload(day).totals,day,item_count:diaryRows.filter(x=>x.day===day).length
    }));
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({days}));return;
  }
  if(pathname==='/api/nutrition/diary'&&req.method==='GET'){
    const day=new URL(req.url,'http://localhost').searchParams.get('day');
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify(diaryPayload(day)));return;
  }
  if(pathname==='/api/nutrition/diary'&&req.method==='POST'){
    let raw='';for await(const part of req)raw+=part;
    const body=JSON.parse(raw);const row={...body,id:++diarySeq};
    diaryRows.push(row);diaryDays.add(body.day);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({item:calculated(row)}));return;
  }
  if(pathname.startsWith('/api/nutrition/diary/')&&['PATCH','DELETE'].includes(req.method)){
    const id=Number(pathname.split('/').at(-1)),row=diaryRows.find(x=>x.id===id);
    if(!row){res.writeHead(404,{'content-type':'application/json'});res.end('{"detail":"Not found"}');return;}
    if(req.method==='DELETE'){
      diaryRows.splice(diaryRows.indexOf(row),1);
      res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;
    }
    let raw='';for await(const part of req)raw+=part;
    const body=JSON.parse(raw);row.grams=body.grams;row.meal=body.meal;
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({item:calculated(row)}));return;
  }
  if(pathname==='/api/foods/preview'){
    previewCalls++;
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({items:[{name:'Гречка варена',source:'USDA',source_label:'ЄПЛАН · джерело USDA',approximate:false,kcal_100:100,protein_100:4,fat_100:1,carbs_100:20}]}));
    return;
  }
  if(pathname==='/api/foods/search'){
    remoteSearchCalls++;
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({items:[{name:'Гречка варена',source:'USDA',source_label:'Перевірений довідник',approximate:false,kcal_100:100,protein_100:4,fat_100:1,carbs_100:20}],has_more:false}));
    return;
  }
  if(pathname.startsWith('/api/')){
    res.writeHead(404,{'content-type':'application/json'});res.end('{"detail":"Not found in browser smoke"}');return;
  }
  const relative=pathname==='/'?'index.html':pathname.startsWith('/static/')?pathname.slice('/static/'.length):pathname.slice(1);
  const full=path.resolve(root,relative);
  if(full!==root&&!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{
    const content=await fs.readFile(full);
    res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream','cache-control':'no-store'});
    res.end(content);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  await page.goto(base,{waitUntil:'load',timeout:30000});
  await page.locator('form.auth-card').waitFor({timeout:20000});
  // Navigation must settle before simulating a signed-in client.
  await page.locator('#eplanSplash').waitFor({state:'detached',timeout:20000});
  assert.equal(await page.locator('#app').evaluate(el=>el.textContent.includes('Увійти')),true,'Login screen not rendered');
  await page.evaluate(async()=>{
    // Exercise the *real* client navigation and nutrition rendering,
    // not only an isolated modal on the login screen.
    session={role:'client',client_id:999};
    window.currentClientData={
      client:{id:999,name:'Test client',kcal:2500,protein:160,fat:70,carbs:300,
        access:{features:{nutrition:true,workouts:true,meal_plan:false}}},
      nutrition:[]
    };
    await showClientNutrition(999);
  });
  await page.locator('.redesign-nutrition-today').waitFor({timeout:3000});
  assert.equal(await page.locator('.nutrition-targets-button').count(),0,'Client should not edit targets');
  assert.equal(await page.evaluate(()=>typeof window.openNutritionTargetsModal),'undefined','Client target calculator still exposed');
  const lazyBefore=await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('food-lookup.js')));
  assert.equal(lazyBefore,false,'Food lookup loaded during startup');
  await page.locator('.nutrition-food-search-button').click();
  await page.locator('#foodSearchModal').waitFor({timeout:5000});
  await page.locator('#foodLookupQuery').fill('гречка');
  await page.locator('.food-lookup-row').first().waitFor({timeout:5000});
  assert.match(await page.locator('.food-lookup-row').first().innerText(),/Гречка варена/);
  assert.ok(previewCalls>=1,'Local preview endpoint was not called');
  assert.equal(remoteSearchCalls,0,'Full external search ran before user requested it');
  await page.locator('#foodLookupMore').click();
  await page.waitForFunction(()=>document.querySelector('#foodLookupStatus')?.textContent?.includes('Розширена база'),null,{timeout:5000});
  assert.equal(remoteSearchCalls,1,'Expanded search did not run exactly once');
  await page.locator('.food-lookup-row').first().click();
  await page.locator('#foodLookupGrams').fill('150');
  await page.locator('#foodLookupMacros').getByText('150',{exact:true}).waitFor({timeout:3000});
  const portions=await page.locator('#foodLookupMacros .food-lookup-macros b').allInnerTexts();
  assert.deepEqual(portions.map(v=>Number(v.replace(',','.'))),[150,6,1.5,30],'Incorrect macro portion');
  assert.equal(await page.locator('#foodLookupMeal option').count(),4);
  await page.locator('#foodLookupMeal').selectOption('lunch');
  await page.locator('#foodLookupAddToDiary').click();
  await page.locator('#foodSearchModal').waitFor({state:'detached',timeout:5000});
  await page.locator('.nutrition-diary-meal[data-meal="lunch"] .nutrition-diary-item').waitFor({timeout:5000});
  assert.equal(await page.locator('.nutrition-diary-item').count(),1,'Search product never reached diary');
  assert.ok((await page.locator('.nutrition-diary-day-total').innerText()).includes('150'),
    'Diary total did not reflect new consumed meal');
  const afterAdd=await page.evaluate(()=>window.nutritionDiaryState);
  assert.equal(afterAdd.items[0].grams,150);
  assert.equal(afterAdd.items[0].protein,6);
  assert.equal(afterAdd.totals.carbs,30);
  assert.ok(await page.locator('.redesign-calorie-card').innerText().then(x=>x.includes('150')),
    'Main calorie progress was not connected to recorded products');
  await page.locator('.nutrition-diary-item-actions button').first().click();
  await page.locator('#nutritionDiaryEditGrams').fill('200');
  await page.locator('#nutritionDiaryEditMeal').selectOption('breakfast');
  await page.locator('#nutritionDiaryEditModal button.primary').click();
  await page.locator('.nutrition-diary-meal[data-meal="breakfast"] .nutrition-diary-item').waitFor({timeout:5000});
  assert.equal((await page.evaluate(()=>window.nutritionDiaryState)).totals.kcal,200,
    'Editing portion should update day total');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.nutrition-diary-item-actions button').nth(1).click();
  await page.waitForFunction(()=>window.nutritionDiaryState?.items?.length===0);
  assert.equal((await page.evaluate(()=>window.nutritionDiaryState)).active,true,
    'Deleting last product must keep diary mode instead of restoring old manual totals');
  assert.equal((await page.evaluate(()=>window.nutritionDiaryState)).totals.kcal,0);
  assert.equal(await page.locator('#foodSearchModal').count(),0,'Search modal remained open');
  await page.evaluate(()=>{
    session={role:'trainer',user_id:1};
    document.body.classList.remove('client-ui');
    document.body.classList.add('eplan-redesign','trainer-ui');
    const d={
      client:{id:999,name:'Test client',kcal:2500,protein:160,fat:70,carbs:300,
        access:{features:{nutrition:true,meal_plan:true}}},nutrition_plan:[]
    };
    window.currentClientData=d;
    app.innerHTML='<div id="nutrition">'+nutritionHTML(d,true)+'</div>';
  });
  // Existing assigned goals remain visible as a read-only hint, not input defaults.
  assert.equal(await page.locator('#nkcal').inputValue(),'','Trainer kcal field must start empty');
  assert.equal(await page.locator('#nprotein').inputValue(),'','Trainer protein must start empty');
  assert.match(await page.locator('.trainer-nutrition-current').innerText(),/2500 ккал/);
  const dialogMessages=[];
  page.on('dialog',async dialog=>{dialogMessages.push(dialog.message());await dialog.accept().catch(()=>{});});
  await page.locator('#nutritionActions button').first().click();
  assert.match(dialogMessages.join(' '),/Заповни всі чотири/,'Empty targets were accepted');
  await page.locator('#nutrition .trainer-nutrition-calc-launch').click();
  await page.locator('#trainerNutritionCalcModal').waitFor({timeout:3000});
  for(const id of ['calcSex','calcAge','calcHeight','calcWeight','calcSteps','calcStrength','calcCardio','calcCardioMin','calcExperience','calcGoal','calcAdjust']){
    assert.equal(await page.locator('#'+id).inputValue(),'','Unexpected prefilled field: '+id);
  }
  // iPhone-sized layout should open with visible header and blue controls.
  const layout=await page.evaluate(()=>{
    const modal=document.querySelector('#trainerNutritionCalcModal');
    const card=modal.querySelector('.trainer-nutrition-calc-card');
    const header=modal.querySelector('.trainer-nutrition-calc-head');
    const launch=document.querySelector('.trainer-nutrition-calc-launch');
    const grid=modal.querySelector('.nutrition-calc-grid');
    const b=card.getBoundingClientRect(),h=header.getBoundingClientRect();
    return {top:b.top,bottom:b.bottom,viewHeight:innerHeight,headTop:h.top,scrollTop:card.scrollTop,
      columns:getComputedStyle(grid).gridTemplateColumns,
      background:getComputedStyle(launch).backgroundColor};
  });
  assert.ok(layout.top>=-1&&layout.bottom<=layout.viewHeight+1,'Modal clipped on phone: '+JSON.stringify(layout));
  assert.ok(layout.headTop>=0&&layout.scrollTop===0,'Modal does not open at heading');
  assert.equal(layout.columns.split(' ').length,2,'Expected compact 2-column phone layout');
  assert.notEqual(layout.background,'rgb(255, 208, 0)','Old yellow launcher styling returned');
  await page.locator('#calcSex').selectOption('male');
  await page.locator('#calcGoal').selectOption('maintain');
  await page.locator('#calcCardio').selectOption('0');
  assert.equal(await page.locator('#calcCardioMin').inputValue(),'','Cardio minutes should remain empty');
  await page.locator('#calcAge').fill('29');
  await page.locator('#calcHeight').fill('178');
  await page.locator('#calcWeight').fill('82');
  await page.locator('#calcSteps').fill('5000');
  await page.locator('#calcStrength').selectOption('5');
  await page.locator('#trainerNutritionCalcModal .nutrition-calc-button').click();
  await page.locator('.nutrition-calc-result').waitFor({timeout:3000});
  const values=await page.evaluate(()=>window.pendingTrainerNutritionTargets);
  assert.ok(values.kcal>2000&&values.kcal<4200,'Invalid calorie result: '+values.kcal);
  assert.ok(values.protein>100&&values.fat>40&&values.carbs>0,'Invalid macros');
  await page.locator('.nutrition-calc-result button').click();
  assert.equal(await page.locator('#nkcal').inputValue(),String(values.kcal),'Trainer targets not populated');
  assert.equal(await page.locator('#nprotein').inputValue(),String(values.protein),'Trainer protein not populated');
  assert.equal(await page.locator('#trainerNutritionCalcModal').count(),0,'Calculator remained open');

  // Stage-only automatic meal plan: optional module, source-linked preview,
  // no data writes before explicit trainer approval.
  const autoLazyBefore=await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('auto-meal-plan.js')));
  assert.equal(autoLazyBefore,false,'Automatic planner eagerly loaded at startup');
  await page.locator('.meal-autoplan-open').click();
  await page.locator('#autoMealPlanModal').waitFor({timeout:4000});
  assert.equal(await page.locator('#autoMealCount').inputValue(),'','Meal count unexpectedly preset');
  await page.locator('#autoMealCount').selectOption('3');
  await page.locator('#autoMealVariants').selectOption('1');
  await page.locator('#autoMealGenerate').click();
  await page.locator('#autoMealApply').waitFor({timeout:5000});
  assert.equal(mealPlanPreviewCalls,1,'Draft request did not call trainer API');
  assert.equal(mealPlanWriteCalls,0,'Generator wrote meal plan without approval');
  assert.match(await page.locator('#autoMealPreview').innerText(),/Гречка/);
  await page.locator('#autoMealApply').click();
  await page.locator('#autoMealPlanModal').waitFor({state:'detached',timeout:6000});
  assert.equal(mealPlanWriteCalls,0,'Applying draft directly wrote nutrition');
  assert.equal(structuredCatalogCalls,1,'Trainer structured food catalog did not load');
  assert.match(await page.locator('.structured-food-row').first().innerText(),/Вівсяні пластівці/);
  assert.equal(await page.locator('.structured-food-row').count(),3,'Unexpected structured rows');
  assert.equal(mealPlanWriteCalls,0,'Applying structured food draft wrote to production');
  // Live grams changes must alter macros and model without rebuilding the screen.
  const gramsInput=page.locator('.structured-food-row').first().locator('.structured-grams');
  const before=await page.locator('.structured-food-row').first().locator('.structured-food-macro').innerText();
  await gramsInput.fill('130');
  const after=await page.locator('.structured-food-row').first().locator('.structured-food-macro').innerText();
  assert.notEqual(before,after,'Grams change did not recalculate item macros');
  assert.equal(await page.evaluate(()=>nutritionPlanDraft[0].foods[0].grams),130);
  // Replace oats with whole eggs in the searchable product picker.
  await page.locator('.structured-food-name').first().click();
  await page.locator('#structuredFoodSearch').fill('Яйце');
  await page.locator('#structuredFoodMatches button').first().click();
  assert.match(await page.locator('.structured-food-row').first().innerText(),/Яйце куряче/);
  const eggInput=page.locator('.structured-food-row').first().locator('.structured-grams');
  await eggInput.fill('2');
  assert.equal(await page.evaluate(()=>nutritionPlanDraft[0].foods[0].grams),100,
    'Two eggs should correspond to approx 100 edible grams');
  assert.equal(await page.evaluate(()=>nutritionPlanDraft[0].foods[0].count),2);
  // Add tomato; non-starchy vegetable is excluded from target, but tracked in
  // actual food energy. User may opt back into counting with a checkbox.
  await page.locator('.structured-meal-editor').first().locator('.structured-add').click();
  await page.locator('#structuredFoodSearch').fill('Помідор');
  await page.locator('#structuredFoodMatches button').first().click();
  const veg=page.locator('.structured-meal-editor').first().locator('.structured-food-row').nth(1);
  assert.equal(await veg.locator('.structured-veg-opt input').isChecked(),false);
  assert.equal(await page.evaluate(()=>nutritionPlanDraft[0].foods[1].count_in_targets),false);
  const tally=await page.locator('.structured-meal-editor').first().locator('.structured-meal-summary').innerText();
  assert.match(tally,/Фактично з овочами/,'Actual vegetable energy is not shown');
  await veg.locator('.structured-veg-opt input').check();
  assert.equal(await page.evaluate(()=>nutritionPlanDraft[0].foods[1].count_in_targets),true);
  assert.ok(await page.locator('#structuredDailySummary').count(),'Missing day total from primary variants');
  assert.equal(mealPlanWriteCalls,0,'Editing foods wrote before trainer save');
  
  assert.equal(await page.locator('#nutritionPlanBody').evaluate(x=>x.classList.contains('hidden')),false,
    'Plan editor was not expanded');

  // Explicit save must carry IDs and whole-egg pieces, not browser-supplied macros.
  await Promise.all([
    page.waitForResponse(r=>r.url().includes('/api/client/999/nutrition')&&r.request().method()==='PATCH',{timeout:3000}),
    page.locator('.meal-autoplan-save').click()
  ]);
  assert.equal(mealPlanWriteCalls,1,'Saved meal request not issued exactly once');
  assert.ok(mealPlanSavedPayload?.meals?.[0]?.foods?.length,'Structured food IDs not persisted');
  assert.equal(mealPlanSavedPayload.meals[0].foods[0].count,2);
  assert.equal(mealPlanSavedPayload.meals[0].foods[0].grams,100);
  assert.equal(mealPlanSavedPayload.meals[0].foods[1].count_in_targets,true);
  await page.locator('.meal-plan-edit-open').click();
  await page.locator('.structured-food-row').first().waitFor({timeout:4000});
  assert.equal(await page.locator('.structured-food-row').first().locator('.structured-grams').inputValue(),'2',
     'Saved whole-egg quantity was not restored in trainer editor');
  assert.equal(await page.evaluate(()=>nutritionPlanDraft[0].foods[0].source_id),'eplan12-fdc-104',
     'Saved source ID was not restored');

  assert.deepEqual(pageErrors,[],'Unexpected JS errors during app launch/calculator');
  console.log('BROWSER STARTUP + CALCULATOR + LAZY SEARCH: PASS');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
