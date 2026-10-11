import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {connect} from 'node:net';
import {chromium} from 'playwright';
const port=17838;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory','nutrition-preview-dist'],{stdio:'ignore'});
let browser;
try{
 let ready=false;
 // Check the local server's TCP port rather than node:undici's fetch parser,
 // which can throw an unrelated stream assertion on the CI runner.
 for(let t=0;t<80;t++){
  ready=await new Promise(resolve=>{
   const socket=connect({host:'127.0.0.1',port});
   socket.once('connect',()=>{socket.end();resolve(true)});
   socket.once('error',()=>{socket.destroy();resolve(false)});
   socket.setTimeout(100,()=>{socket.destroy();resolve(false)});
  });
  if(ready)break;
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 assert.ok(ready,'Static nutrition preview server not ready');
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'});
 await page.locator('.structured-food-row').first().waitFor({timeout:15000});
 assert.equal(await page.locator('img').count(),0,'Food pictures should be absent');
 assert.match(await page.locator('#dailySummary').innerText(),/Добова ціль/);
 assert.ok(await page.locator('.variant-card').count()>=2,'Alternatives missing');
 // Primary and alternative variants must each show full kcal/protein/fat/carbs.
 const primaryVariant=page.locator('.variant-card').nth(0).locator('.variant-macros');
 const secondVariant=page.locator('.variant-card').nth(1).locator('.variant-macros');
 for(const text of [await primaryVariant.innerText(),await secondVariant.innerText()]){
  for(const key of ['ккал','Б ','Ж ','В '])assert.ok(text.includes(key),'Missing variant-header nutrient: '+key);
 }
 assert.notEqual(await primaryVariant.innerText(),await secondVariant.innerText(),
  'Alternatives must have independently calculated nutrients');
 const baselineFirstVariant=await primaryVariant.innerText();
 const baselineSecondVariant=await secondVariant.innerText();
 // Only individual variant headers show calories/BJU; no combined badge
 // should appear in the parent meal heading.
 assert.equal(await page.locator('.meal-day-totals').count(),0,'Combined daily total still appears in meal header');
 assert.equal(await page.locator('.meal-kcal').count(),0,'Duplicated first-variant kcal still appears in meal header');
 assert.equal(await page.locator('.variant-card').nth(0).locator('.variant-macros').count(),1);
 const original=await page.locator('.structured-food-row').first().locator('.structured-food-macro').innerText();
 await page.locator('.structured-food-row').first().locator('.stepper-plus').click();
 const adjusted=await page.locator('.structured-food-row').first().locator('.structured-food-macro').innerText();
 assert.notEqual(original,adjusted,'Plus did not recalculate macros');
 assert.notEqual(await primaryVariant.innerText(),baselineFirstVariant,
   'Primary variant header did not update after portion change');
 assert.equal(await secondVariant.innerText(),baselineSecondVariant,
   'Other variant header changed after editing primary');
 const firstDayAfter=await page.locator('#dailySummary .stat-kcal b').innerText();
 assert.ok(firstDayAfter,'Standalone daily overview disappeared');
 const previousDay=firstDayAfter;
 await page.locator('.structured-food-name').first().click();
 await page.locator('#structuredFoodPicker').waitFor();
 await page.locator('#structuredFoodSearch').fill('яйце');
 await page.locator('.picker-food').first().click();
 assert.match(await page.locator('.detail-title strong').innerText(),/Яйце куряче/);
 assert.match(await page.locator('.quantity-section').innerText(),/шт/);
 await page.locator('#pickerQty').fill('2');
 await page.locator('#pickerApply').click();
 await page.locator('#structuredFoodPicker').waitFor({state:'detached'});
 const first=page.locator('.structured-food-row').first();
 assert.match(await first.innerText(),/Яйце куряче/);
 assert.equal(await first.locator('input.structured-grams').inputValue(),'2');
 const changedDay=await page.locator('#dailySummary .stat-kcal b').innerText();
 assert.notEqual(previousDay,changedDay,'Replacing oats with eggs did not change day totals');
 await page.locator('.structured-meal-editor').first().locator('.structured-add').click();
 await page.locator('#structuredFoodSearch').fill('помідор');
 await page.locator('.picker-food').first().click();
 assert.equal(await page.locator('.veg-choice input').isChecked(),false,'Tomato defaults to excluded target');
 await page.locator('#pickerQty').fill('125');
 await page.locator('#pickerApply').click();
 assert.match(await page.locator('.vegetable-label').first().innerText(),/Овочі поза/);
 assert.match(await page.locator('.structured-meal-summary').first().innerText(),/Фактично з овочами/);
 await page.locator('.structured-food-row').filter({has:page.locator('.vegetable-label')}).first().locator('.structured-food-name').click();
 await page.locator('.veg-choice input').check();
 await page.locator('#pickerApply').click();
 assert.equal(await page.locator('.structured-meal-summary').first().innerText().then(x=>x.includes('Фактично з овочами')),false,'Tomato should be included in goal after toggle');
 // Editing a nonprimary alternative changes that variant only, not the day.
 const dayPrimaryBefore=await page.locator('#dailySummary').innerText();
 const primaryBeforeAltEdit=await primaryVariant.innerText();
 const secondBeforeAltEdit=await secondVariant.innerText();
 const otherVariant=page.locator('.variant-card').nth(1);
 await otherVariant.locator('.stepper-plus').first().click();
 const dayPrimaryAfter=await page.locator('#dailySummary').innerText();
 assert.equal(dayPrimaryAfter,dayPrimaryBefore,'Alternative variants were incorrectly added to day totals');
 assert.notEqual(await secondVariant.innerText(),secondBeforeAltEdit,'Second variant BJU did not refresh');
 assert.equal(await primaryVariant.innerText(),primaryBeforeAltEdit,'First variant BJU changed after editing the second');
 // Keep the demo editable in the same browser; never post customer data.
 await page.locator('#saveDemoButton').click();
 assert.match(await page.locator('#saveDemoStatus').innerText(),/Збережено/);
 await page.reload({waitUntil:'load'});
 await page.locator('.structured-food-row').first().waitFor({timeout:15000});
 assert.match(await page.locator('.structured-food-row').first().innerText(),/Яйце куряче/);
 assert.equal(await page.locator('.structured-food-row').first().locator('input.structured-grams').inputValue(),'2');
 assert.equal(await page.locator('img').count(),0);
 assert.equal(await page.locator('.meal-day-totals').count(),0);
 assert.match(await page.locator('.variant-card').nth(1).locator('.variant-macros').innerText(),/Б /);
 const viewport=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:innerWidth}));
 assert.ok(viewport.w<=viewport.v+2,'Unexpected horizontal overflow: '+JSON.stringify(viewport));
 await page.locator('.reset').click();
 assert.match(await page.locator('.structured-food-row').first().innerText(),/Вівсяні пластівці/);
 assert.deepEqual(errors,[],'Unexpected JS exceptions');
 console.log('NUTRITION PREVIEW MOBILE: PASS (independent variant BJU headers, instant changes, vegetable toggle, save, no photos)');
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
}
