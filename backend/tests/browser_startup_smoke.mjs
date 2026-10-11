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
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/session'){
    res.writeHead(401,{'content-type':'application/json','cache-control':'no-store'});res.end('{"detail":"Unauthorized"}');return;
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
        foods:[{name:'Вівсяні пластівці (сухі)',grams:65}],content:'Вівсяні пластівці (сухі) — 65 г'},
       {meal_number:2,meal_name:'Обід',variant_number:1,sort:1,totals:{kcal:920,protein:65,fat:20,carbs:115},
        foods:[{name:'Куряче філе (запечене)',grams:170}],content:'Куряче філе (запечене) — 170 г'},
       {meal_number:3,meal_name:'Вечеря',variant_number:1,sort:2,totals:{kcal:950,protein:64,fat:31,carbs:111},
        foods:[{name:'Гречка (відварена)',grams:230}],content:'Гречка (відварена) — 230 г'}
      ]
    }));
    return;
  }
  if(pathname==='/api/client/999/nutrition'&&req.method==='PATCH'){
    mealPlanWriteCalls++;
    res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;
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
  await page.locator('#foodSearchClose').click();
  assert.equal(await page.locator('#foodSearchModal').count(),0,'Food modal remains open');
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
  page.on('dialog',async dialog=>{dialogMessages.push(dialog.message());await dialog.accept();});
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
  assert.equal(await page.locator('#autoMealPlanModal').count(),0,'Preview did not close');
  assert.equal(mealPlanWriteCalls,0,'Applying draft directly wrote nutrition');
  assert.match(await page.locator('#nutritionPlanBody').innerText(),/Вівсяні пластівці/);
  assert.equal(await page.locator('#nutritionPlanBody').evaluate(x=>x.classList.contains('hidden')),false,
    'Plan editor was not expanded');

  assert.deepEqual(pageErrors,[],'Unexpected JS errors during app launch/calculator');
  console.log('BROWSER STARTUP + CALCULATOR + LAZY SEARCH: PASS');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
