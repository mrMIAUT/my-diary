import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {connect} from 'node:net';
import {chromium} from 'playwright';

const port=17838;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory','nutrition-preview-dist'],{stdio:'ignore'});
let browser;
try{
 let ready=false;
 for(let i=0;i<80;i++){
  ready=await new Promise(resolve=>{
   const socket=connect({host:'127.0.0.1',port});
   socket.once('connect',()=>{socket.end();resolve(true)});
   socket.once('error',()=>{socket.destroy();resolve(false)});
   socket.setTimeout(100,()=>{socket.destroy();resolve(false)});
  });
  if(ready)break;
  await new Promise(r=>setTimeout(r,200));
 }
 assert.ok(ready,'Preview web server did not start');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'});
 try{
  await page.locator('.structured-food-row').first().waitFor({timeout:5500});
 }catch(err){
  console.error('PREVIEW STARTUP DEBUG',JSON.stringify({
   pageErrors:errors,
   pageText:(await page.locator('body').innerText()).slice(0,1800),
   scriptUrls:await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src))
  }));
  throw err;
 }
 assert.equal(await page.locator('img').count(),0,'Images must be absent');
 assert.equal(await page.locator('.ration-tab:not(.ration-tab-add)').count(),2,'Two initial whole-day rations missing');
 assert.equal(await page.locator('.variant-card').count(),4,'Meals stacked as variants instead of ration pages');
 assert.equal(await page.locator('.meal-card').count(),4,'Expected four meals per ration');
 assert.match(await page.locator('#dailySummary').innerText(),/Добова ціль/);
 assert.equal(await page.locator('.meal-day-totals').count(),0,'Duplicated day summaries in meal headings');
 const firstRationDay=await page.locator('#dailySummary').innerText();
 const firstDish=await page.locator('.meal-card[data-meal="1"] .meal-recipe strong').innerText();
 await page.locator('[data-ration="2"]').click();
 const secondDish=await page.locator('.meal-card[data-meal="1"] .meal-recipe strong').innerText();
 assert.notEqual(firstDish,secondDish,'Switching rations did not switch dishes');
 assert.equal(await page.locator('.variant-card').count(),4,'Ration 2 does not have its own four meal cards');
 const secondRationBefore=await page.evaluate(()=>JSON.stringify(rationPlans.find(x=>x.id===2).meals));
 await page.locator('[data-ration="1"]').click();
 assert.equal(await page.locator('#dailySummary').innerText(),firstRationDay,'Switching ration changed ration 1 summary');

 // Each template must have trusted USDA food records, culinary attribution and
 // bounded individual portions. Sample overnight oats must be refrigerated.
 const library=await page.evaluate(()=>fetch('/recipe-library.json').then(r=>r.json()));
 assert.equal(library.templates.length,43);
 assert.ok(library.templates.every(r=>r.source_url.startsWith('https://')&&r.foods.length));
 assert.ok(library.templates.every(r=>r.foods.every(f=>f.portion_rules&&Number(f.portion_rules.max_grams)>0)),
   'Template missing bounded portion limits');
 const breakfast=page.locator('.meal-card[data-meal="1"]');
 assert.match(await breakfast.locator('.meal-recipe').innerText(),/нічна вівсянка/i);
 assert.match(await breakfast.locator('.meal-recipe').innerText(),/холодильнику на ніч/);

 // Pick lunch recipe: fit only that meal to the remaining daily target.
 const beforeOther=await page.evaluate(()=>JSON.stringify(nutritionPlanDraft.filter(x=>x.meal_number!==2)));
 const beforeTotal=await page.locator('#dailySummary').innerText();
 await page.locator('.meal-card[data-meal="2"] .open-recipe-library').click();
 await page.locator('#recipeTemplatePicker').waitFor({timeout:6000});
 await page.locator('[data-recipe="lu_tuna_whitebeans"]').click();
 await page.locator('#recipeTemplatePicker').waitFor({state:'detached'});
 const meal=await page.evaluate(()=>nutritionPlanDraft.find(x=>x.meal_number===2));
 assert.equal(meal.recipe_id,'lu_tuna_whitebeans');
 assert.ok(meal.auto_fit&&Number.isFinite(meal.auto_fit.diff.kcal));
 assert.equal(await page.evaluate(()=>JSON.stringify(nutritionPlanDraft.filter(x=>x.meal_number!==2))),beforeOther,
   'Replacing one meal silently changed other meals');
 assert.equal(await page.evaluate(()=>JSON.stringify(rationPlans.find(x=>x.id===2).meals)),secondRationBefore,
   'Changing ration 1 unexpectedly edited ration 2');
 for(const f of meal.foods){
  const {min_grams:min,max_grams:max}=f.portion_rules;
  assert.ok(f.grams>=min&&f.grams<=max,'Implausible portion: '+JSON.stringify(f));
 }
 const afterTotal=await page.locator('#dailySummary').innerText();
 assert.notEqual(beforeTotal,afterTotal,'Daily totals did not update on replacement');
 assert.equal(await page.locator('.auto-fit-notice').count(),1,'Expected auto-fit result notice');
 assert.match(await page.locator('.auto-fit-notice').innerText(),/Відхилення за день/);

 // Egg-based dishes use whole pieces, not arbitrary grams.
 await page.locator('.meal-card[data-meal="1"] .open-recipe-library').click();
 await page.locator('[data-recipe="bf_egg_avocado_toast"]').click();
 const eggs=await page.evaluate(()=>nutritionPlanDraft.find(x=>x.meal_number===1).foods.filter(
  f=>window.structuredCatalog.find(x=>x.source_id===f.source_id)?.unit==='pcs'));
 assert.ok(eggs.length>0,'No egg in selected breakfast recipe');
 for(const egg of eggs){
  assert.ok(Number.isInteger(egg.count)&&egg.count>=1&&egg.count<=8);
  assert.equal(egg.grams,egg.count*50);
 }
 // The oil in a new prepared lunch cannot be scaled to arbitrary amounts.
 await page.locator('.meal-card[data-meal="2"] .open-recipe-library').click();
 await page.locator('[data-recipe="lu_chicken_rice_salad"]').click();
 const oil=await page.evaluate(()=>{
  const meal=nutritionPlanDraft.find(x=>x.meal_number===2);
  return meal.foods.find(f=>window.structuredCatalog.find(x=>x.source_id===f.source_id)?.name==='Оливкова олія');
 });
 assert.ok(oil,'Oil dressing not present');
 assert.ok(oil.grams>=3&&oil.grams<=16,'Oil quantity is unrealistic');
 assert.match(await page.locator('.meal-card[data-meal="2"] .ingredient-role').last().innerText(),/заправка|Заправка/);

 // Manual change still updates macros live and does not change another ration.
 const firstRow=page.locator('.meal-card[data-meal="1"] .structured-food-row').first();
 const macroBefore=await firstRow.locator('.structured-food-macro').innerText();
 const accuracyBefore=await page.locator('#rationAccuracy').innerText();
 assert.equal(await page.locator('.meal-card[data-meal="1"] .auto-fit-notice').count(),1);
 await firstRow.locator('.stepper-plus').click();
 assert.notEqual(await firstRow.locator('.structured-food-macro').innerText(),macroBefore);
 assert.equal(await page.locator('.meal-card[data-meal="1"] .auto-fit-notice').count(),0,'Manual portion change left stale auto-fit badge');
 assert.notEqual(await page.locator('#rationAccuracy').innerText(),accuracyBefore,'Day target deviations not refreshed on manual change');
 assert.equal(await page.evaluate(()=>JSON.stringify(rationPlans.find(x=>x.id===2).meals)),secondRationBefore);

 // Add independent third ration, change one dish, restore saved state.
 await page.locator('#addRation').click();
 assert.equal(await page.locator('.ration-tab:not(.ration-tab-add)').count(),3);
 await page.locator('.meal-card[data-meal="3"] .open-recipe-library').click();
 await page.locator('[data-recipe="sn_eggs_tomato_bread"]').click();
 const thirdDish=await page.locator('.meal-card[data-meal="3"] .meal-recipe strong').innerText();
 await page.locator('#saveDemoButton').click();
 assert.match(await page.locator('#saveDemoStatus').innerText(),/Збережено/);
 await page.reload({waitUntil:'load'});
 await page.locator('[data-ration="3"]').waitFor({timeout:12000});
 assert.equal(await page.locator('.meal-card[data-meal="3"] .meal-recipe strong').innerText(),thirdDish);
 await page.locator('[data-ration="2"]').click();
 assert.equal(await page.evaluate(()=>JSON.stringify(rationPlans.find(x=>x.id===2).meals)),secondRationBefore);
 assert.equal(await page.locator('img').count(),0);
 const viewport=await page.evaluate(()=>({width:document.documentElement.scrollWidth,view:innerWidth}));
 assert.ok(viewport.width<=viewport.view+2,'Horizontal overflow '+JSON.stringify(viewport));
 await page.locator('.reset').click();
 assert.equal(await page.locator('.ration-tab:not(.ration-tab-add)').count(),2);
 assert.deepEqual(errors,[],'Unexpected JS exceptions');
 console.log('PASS preview rations and bounded automatic daily-macro portion fitting (food swap, whole eggs, oil, independent rations, reload, no images)');
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
