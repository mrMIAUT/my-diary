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
let customFoodSeq=0,recipeSeq=0;const personalFoods=[],personalRecipes=[],publicFoods=[];
const calculated=(row)=>({...row,portion_unit:row.portion_unit||'g',portion_amount:row.grams,
  ...Object.fromEntries(['kcal','protein','fat','carbs'].map(k=>[k,+(Number(row[k+'_100'])*Number(row.grams)/100).toFixed(1)]))});
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
  if(pathname==='/api/trainer/client/999/nutrition/four-week'&&req.method==='GET'){
    const params=new URL(req.url,'http://localhost').searchParams;
    assert.equal(params.get('start_date'),'2026-09-18');
    assert.equal(params.get('goal'),'loss');
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({
      status:'suggested',goal:'loss',period_start:'2026-09-18',period_end:'2026-10-15',
      weight:{first:80,last:80,delta:0,entries:4,weekly_counts:[1,1,1,1],
        weeks:[1,2,3,4].map((week,i)=>({week,day:'2026-09-'+String(18+7*i).padStart(2,'0'),
            weight:80,entries:1})),method:'weekly_latest'},
      waist:{first:85,last:85,delta:0,entries:2,method:'week1_to_week4'},circumferences:{},
      nutrition:{days:28,early_days:14,late_days:14,average_kcal:2500,target_kcal:2500},
      activity:{days:28,first_steps:8000,last_steps:8000},
      current:{kcal:2500,protein:160,fat:70,carbs:300},
      recommended:{kcal:2350,protein:160,fat:70,carbs:270},
      reasons:['Вага й талія суттєво не змінилися'],
      warnings:['Тренер повинен підтвердити зміну']
    }));return;
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
  if(pathname==='/api/nutrition/my-foods'&&['GET','POST'].includes(req.method)){
    if(req.method==='GET'){
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({items:personalFoods}));return;
    }
    let raw='';for await(const part of req)raw+=part;
    const values=JSON.parse(raw);const item={...values,id:++customFoodSeq,
      review_status:values.submit_for_review?'pending':'private'};
    personalFoods.push(item);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({item}));return;
  }
  if(pathname.startsWith('/api/nutrition/my-foods/')&&['PATCH','DELETE'].includes(req.method)){
    const id=Number(pathname.split('/').at(-1)),item=personalFoods.find(x=>x.id===id);
    if(!item){res.writeHead(404);res.end();return}
    if(req.method==='DELETE'){
      personalFoods.splice(personalFoods.indexOf(item),1);
      res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;
    }
    let raw='';for await(const part of req)raw+=part;
    const update=JSON.parse(raw);Object.assign(item,update);
    item.review_status=update.submit_for_review?'pending':'private';
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({item}));return;
  }
  if(pathname==='/api/trainer/foods/submissions'&&req.method==='GET'){
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({items:personalFoods.filter(x=>x.review_status==='pending')
      .map(x=>({...x,author:'Test client'}))}));return;
  }
  if(pathname.startsWith('/api/trainer/foods/submissions/')&&req.method==='POST'){
    let raw='';for await(const part of req)raw+=part;
    const body=JSON.parse(raw),id=Number(pathname.split('/')[5]);
    const item=personalFoods.find(x=>x.id===id);
    if(!item){res.writeHead(404);res.end();return;}
    item.review_status=body.decision==='approve'?'approved':'rejected';
    if(body.decision==='approve')publicFoods.push({...body,id});
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({status:item.review_status}));return;
  }
  if(pathname==='/api/nutrition/recipes'&&['GET','POST'].includes(req.method)){
    if(req.method==='GET'){
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({items:personalRecipes}));return;
    }
    let raw='';for await(const part of req)raw+=part;
    const body=JSON.parse(raw);
    const ingredients=diaryRows.filter(x=>x.day===body.day&&x.meal===body.meal);
    const grams=ingredients.reduce((v,x)=>v+Number(x.grams),0);
    const nutrients=Object.fromEntries(['kcal','protein','fat','carbs'].map(k=>
      [k+'_100',+((ingredients.reduce((v,x)=>v+Number(x[k+'_100'])*Number(x.grams)/100,0))/grams*100).toFixed(2)]));
    const record={name:body.name,id:++recipeSeq,ingredients,grams,...nutrients};
    personalRecipes.push(record);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({id:record.id}));return;
  }
  if(pathname.startsWith('/api/nutrition/recipes/')&&req.method==='POST'){
    let raw='';for await(const part of req)raw+=part;
    const body=JSON.parse(raw),id=Number(pathname.split('/')[4]);
    const recipe=personalRecipes.find(x=>x.id===id);
    const row={...body,name:recipe.name,source_id:'recipe:'+id,
      ...Object.fromEntries(['kcal','protein','fat','carbs'].map(k=>[k+'_100',recipe[k+'_100']])),
      id:++diarySeq};
    diaryRows.push(row);diaryDays.add(row.day);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({item:calculated(row)}));return;
  }
  if(pathname.startsWith('/api/nutrition/recipes/')&&req.method==='DELETE'){
    const id=Number(pathname.split('/')[4]);personalRecipes.splice(personalRecipes.findIndex(x=>x.id===id),1);
    res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;
  }
  if(pathname==='/api/foods/preview'){
    previewCalls++;
    const term=new URL(req.url,'http://localhost').searchParams.get('q')||'';
    const liquid={name:'Напій протеїновий High Protein Banana 250 мл',brand:'Ehrmann',
      source:'reference',source_label:'Дані виробника · 100 мл',
      source_id:'eplan12-manufacturer-ehrmann-high-protein-drink-banana-250ml',
      portion_unit:'ml',source_nutrition_basis:'per_100ml_product',
      package_size_ml:250,approximate:false,
      kcal_100:55,protein_100:8,fat_100:.1,carbs_100:5.6,saturated_fat_100:.1,sugars_100:5.3};
    const solid={name:'Гречка варена',source:'USDA',source_label:'ЄПЛАН · джерело USDA',
      approximate:false,kcal_100:100,protein_100:4,fat_100:1,carbs_100:20};
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({items:[term.toLowerCase().includes('ehrmann')?liquid:solid]}));
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
  const diaryDate=page.locator('#nutritionDiaryDate');
  assert.ok(await diaryDate.inputValue(),'Date input must keep the native YYYY-MM-DD value');
  assert.equal(await page.locator('.nutrition-diary-date-pill svg').count(),2,
    'Date chip must show the calendar and dropdown SVGs');
  assert.ok((await page.locator('.nutrition-diary-date-pill strong').innerText()).length>4,
    'Human-readable compact Ukrainian date is missing');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    const rects=await page.locator('.nutrition-diary-date-pill').evaluate(el=>{
      const picker=el.querySelector('input[type=date]');
      const control=el.getBoundingClientRect(),hit=picker.getBoundingClientRect();
      return {width:control.width,height:control.height,
        pickerWidth:hit.width,pickerHeight:hit.height,
        opacity:getComputedStyle(picker).opacity,
        within:control.left>=-1&&control.right<=document.documentElement.clientWidth+1,
        label:el.querySelector('strong').textContent
      };
    });
    assert.ok(rects.within,'Diary date chip spills outside '+width+'px viewport');
    assert.ok(rects.width<240&&rects.height<=48,'Date control became oversized on '+width+'px screen');
    assert.ok(Math.abs(rects.pickerWidth-rects.width)<=2.1,
      'Native date hit-target does not cover its visual pill beyond the 1px border');
    assert.ok(Math.abs(rects.pickerHeight-rects.height)<=2.1,
      'Native picker tap target differs from pill beyond the 1px border');
    assert.equal(rects.opacity,'0','Browser-native date content should not overlap the custom label');
  }
  await page.setViewportSize({width:390,height:844});
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
  assert.equal(await page.getByRole('button',{name:/Мій щоденник/}).count(),0,
    'Redundant diary navigation should disappear once food is logged');
  assert.equal(await page.locator('.redesign-nutrition-actions button').count(),1,
    'Only the functional add-product action should remain in diary mode');
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
  // Verified RTD is measured in ml, not displayed/stored as an implicit gram weight.
  await page.locator('.nutrition-food-search-button').click();
  await page.locator('#foodLookupQuery').fill('Ehrmann');
  await page.locator('.food-lookup-row').first().waitFor({timeout:5000});
  assert.match(await page.locator('.food-lookup-row').first().innerText(),/100 мл/);
  await page.locator('.food-lookup-row').first().click();
  assert.match(await page.locator('#foodLookupPortion label').first().innerText(),/Об’єм, мл/);
  assert.equal(await page.locator('#foodLookupGrams').inputValue(),'250');
  assert.deepEqual((await page.locator('#foodLookupMacros .food-lookup-macros b').allInnerTexts())
    .map(v=>Number(v.replace(',','.'))),[137.5,20,.3,14]);
  await page.locator('#foodLookupMeal').selectOption('snack');
  await page.locator('#foodLookupAddToDiary').click();
  await page.waitForFunction(()=>window.nutritionDiaryState?.items?.length===1);
  let liquidState=await page.evaluate(()=>window.nutritionDiaryState);
  assert.equal(liquidState.items[0].portion_unit,'ml');
  assert.equal(liquidState.totals.kcal,137.5);
  assert.match(await page.locator('.nutrition-diary-meal[data-meal=snack] .nutrition-diary-item').innerText(),/250 мл/);
  assert.equal(await page.locator('.nutrition-diary-meal[data-meal=snack] .nutrition-diary-save-recipe').count(),0);
  await page.locator('.nutrition-diary-meal[data-meal=snack] .nutrition-diary-item-actions button').first().click();
  assert.match(await page.locator('#nutritionDiaryEditModal label').first().innerText(),/Об’єм, мл/);
  await page.locator('#nutritionDiaryEditGrams').fill('125');
  await page.locator('#nutritionDiaryEditModal button.primary').click();
  await page.waitForFunction(()=>window.nutritionDiaryState?.items?.[0]?.grams===125);
  liquidState=await page.evaluate(()=>window.nutritionDiaryState);
  assert.equal(liquidState.items[0].portion_unit,'ml');
  assert.equal(liquidState.items[0].kcal,68.8);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.nutrition-diary-meal[data-meal=snack] .nutrition-diary-item-actions button[aria-label="Видалити продукт"]').click();
  await page.waitForFunction(()=>window.nutritionDiaryState?.items?.length===0);
  // Custom foods remain private unless deliberately submitted for review.
  await page.locator('.nutrition-food-search-button').click();
  await page.locator('#foodSearchModal').waitFor();
  assert.equal(await page.locator('.food-custom-actions button').count(),3);
  await page.getByRole('button',{name:'+ Свій продукт',exact:true}).click();
  await page.locator('#customFoodName').fill('Домашній сир CI');
  await page.locator('#customFoodBrand').fill('Особистий');
  await page.locator('#customFood_kcal_100').fill('142');
  await page.locator('#customFood_protein_100').fill('18');
  await page.locator('#customFood_fat_100').fill('7');
  await page.locator('#customFood_carbs_100').fill('2');
  assert.equal(await page.locator('#customFood_saturated_fat_100').inputValue(),'');
  assert.equal(await page.locator('#customFood_sugars_100').inputValue(),'');
  await page.locator('#customFood_saturated_fat_100').fill('8');
  await page.locator('#saveCustomFoodButton').click();
  assert.ok((await page.locator('#customFoodError').innerText()).includes('Насичені'),
    'Saturated fat larger than total fat should fail on client');
  await page.locator('#customFood_saturated_fat_100').fill('3.2');
  await page.locator('#customFood_sugars_100').fill('1.2');
  await page.locator('#saveCustomFoodButton').click();
  await page.locator('#myProductModal').waitFor({state:'detached',timeout:4000});
  assert.equal(personalFoods.length,1);
  assert.equal(personalFoods[0].review_status,'private');
  assert.equal(personalFoods[0].saturated_fat_100,3.2);
  assert.equal(personalFoods[0].sugars_100,1.2);
  assert.equal(publicFoods.length,0,'Personal food appeared in public catalogue without approval');
  assert.equal(await page.locator('#foodLookupPortion strong').first().innerText(),'Домашній сир CI');
  await page.locator('#foodLookupGrams').fill('120');
  assert.match(await page.locator('#foodLookupMacros .food-lookup-details').innerText(),/3,8 г/);
  assert.match(await page.locator('#foodLookupMacros .food-lookup-details').innerText(),/1,4 г/);
  await page.locator('#foodLookupMeal').selectOption('breakfast');
  await page.locator('#foodLookupAddToDiary').click();
  await page.locator('.nutrition-diary-meal[data-meal=breakfast] .nutrition-diary-item').waitFor({timeout:4000});
  assert.equal((await page.evaluate(()=>window.nutritionDiaryState)).items[0].kcal,170.4);
  const onRecipeDialog=async dialog=>{
   if(dialog.type()==='prompt')await dialog.accept('Мій сирний сніданок');
   else await dialog.accept();
  };
  page.on('dialog',onRecipeDialog);
  const recipeSave=page.waitForResponse(r=>r.url().includes('/api/nutrition/recipes')&&r.request().method()==='POST');
  await page.locator('.nutrition-diary-meal[data-meal=breakfast] .nutrition-diary-save-recipe').click();
  await recipeSave;
  page.off('dialog',onRecipeDialog);
  assert.equal(personalRecipes.length,1,'Saving a logged meal did not create a reusable recipe');
  await page.locator('.nutrition-food-search-button').click();
  await page.getByRole('button',{name:'Мої рецепти'}).click();
  await page.locator('.my-food-row').waitFor({timeout:4000});
  page.once('dialog',dialog=>dialog.accept('120'));
  await page.locator('#myRecipesList .my-food-row-actions button').first().click();
  await page.waitForFunction(()=>window.nutritionDiaryState?.items?.length===2);
  assert.equal((await page.evaluate(()=>window.nutritionDiaryState)).totals.kcal,340.8,
   'Logging a saved recipe did not update totals');
  const onDeleteConfirm=dialog=>dialog.accept();
  page.on('dialog',onDeleteConfirm);
  for(let i=0;i<2;i++){
   await page.locator('.nutrition-diary-meal[data-meal=breakfast] .nutrition-diary-item-actions button[aria-label="Видалити продукт"]').first().click();
   await page.waitForFunction(n=>window.nutritionDiaryState?.items?.length===n,1-i);
  }
  page.off('dialog',onDeleteConfirm);
  // Client submitted an unrelated private product, which must stay out of
  // shared search until trainer explicitly approves it.
  await page.locator('.nutrition-food-search-button').click();
  await page.getByRole('button',{name:'+ Свій продукт',exact:true}).click();
  await page.locator('#customFoodName').fill('Йогурт CI на перевірку');
  await page.locator('#customFood_kcal_100').fill('88');
  await page.locator('#customFood_protein_100').fill('6');
  await page.locator('#customFood_fat_100').fill('3');
  await page.locator('#customFood_carbs_100').fill('10');
  await page.locator('#customFood_saturated_fat_100').fill('1.1');
  await page.locator('#customFood_sugars_100').fill('8');
  await page.locator('#customFoodSubmitReview').check();
  await page.locator('#saveCustomFoodButton').click();
  await page.waitForFunction(()=>document.querySelector('#myProductModal')===null);
  assert.equal(personalFoods.filter(x=>x.review_status==='pending').length,1);
  assert.equal(personalFoods.find(x=>x.review_status==='pending').sugars_100,8);
  assert.equal(publicFoods.length,0);
  await page.locator('#foodSearchClose').click();
  await page.evaluate(()=>window.openTrainerFoodReview());
  await page.locator('.trainer-food-review-row').waitFor({timeout:4000});
  assert.equal(await page.locator('.trainer-food-review-row').count(),1);
  await page.locator('.trainer-food-review-row .food-review-kcal_100').fill('81');
  assert.equal(await page.locator('.trainer-food-review-row .food-review_saturated_fat_100').count(),0);
  assert.equal(await page.locator('.trainer-food-review-row .food-review-saturated_fat_100').inputValue(),'1.1');
  assert.equal(await page.locator('.trainer-food-review-row .food-review-sugars_100').inputValue(),'8');
  await page.locator('.trainer-food-review-row .food-review-saturated_fat_100').fill('1.4');
  await page.locator('.trainer-food-review-row .food-review-sugars_100').fill('8.6');
  await page.locator('.trainer-food-review-row .food-review-note').fill('Verified CI test label');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.trainer-food-review-actions button.primary').click();
  await page.waitForFunction(()=>document.querySelector('.trainer-food-review-row')===null);
  assert.equal(publicFoods.length,1,'Trainer approval did not publish the reviewed product');
  assert.equal(publicFoods[0].kcal_100,81,
   'The shared catalogue ignored trainer-corrected nutrition values');
  assert.equal(publicFoods[0].saturated_fat_100,1.4);
  assert.equal(publicFoods[0].sugars_100,8.6);
  await page.locator('#trainerFoodReviewModal button.dark').click();
  assert.equal(await page.locator('#foodSearchModal').count(),0);

  // Picking another day must keep the existing native control, then restore
  // today's diary data without losing the selected tab or saved records.
  const today=await diaryDate.inputValue();
  const yesterday=await page.evaluate(today=>{
    const d=new Date(today+'T12:00:00');d.setDate(d.getDate()-1);
    const pad=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  },today);
  await diaryDate.fill(yesterday);
  await diaryDate.dispatchEvent('change');
  await page.waitForFunction(day=>
    document.querySelector('#nutritionDiaryDate')?.value===day&&window.nutritionDiaryDay===day,
    yesterday,{timeout:3500});
  assert.ok(await page.locator('.nutrition-diary-date-pill strong').innerText(),
    'The formatted chip label should update with the selected day');
  await page.locator('#nutritionDiaryDate').fill(today);
  await page.locator('#nutritionDiaryDate').dispatchEvent('change');
  await page.waitForFunction(day=>
    document.querySelector('#nutritionDiaryDate')?.value===day&&window.nutritionDiaryDay===day,
    today,{timeout:3500});
  assert.equal(await page.locator('#foodSearchModal').count(),0,'Search modal remained open');
  // The two modes must remain separate: plan = assigned, diary = consumed.
  assert.equal(await page.locator('.client-nutrition-view-tabs [role=tab]').count(),2);
  assert.equal(await page.locator('.client-nutrition-view-tabs [aria-selected=true]').innerText(),'Щоденник');
  assert.equal(await page.locator('.redesign-nutrition-tabs button').count(),3,
   'Today/week/month tabs missing from Diary mode');
  assert.equal(await page.locator('.nutrition-diary-meal').count(),4);
  assert.equal(await page.locator('.nutrition-diary-meal .nutrition-meal-icon svg').count(),4,
   'The approved category SVGs are missing from the diary');
  assert.deepEqual(
   await page.locator('.nutrition-diary-meal .nutrition-meal-icon').evaluateAll(nodes=>
    nodes.map(el=>getComputedStyle(el).color)),
   ['rgb(57, 125, 236)','rgb(35, 137, 95)','rgb(120, 85, 196)','rgb(183, 110, 46)'],
   'Diary SVG category palette differs from the approved plan icons');
  await page.locator('.client-nutrition-view-tabs button').first().click();
  await page.locator('.nutrition-coaching-upsell').waitFor({timeout:3500});
  assert.equal(await page.locator('.nutrition-diary-card').count(),0,
   'Assigned ration mode must not show the diary list');
  assert.equal(await page.locator('.redesign-nutrition-tabs').count(),0,
   'Today/week/month must belong only to diary mode');
  await page.locator('.client-nutrition-view-tabs button').nth(1).click();
  await page.locator('.nutrition-diary-card').waitFor({timeout:3500});
  assert.equal(await page.locator('.nutrition-coaching-upsell').count(),0,
   'Diary view must not mix the trainer-assigned ration card');
  await page.locator('.redesign-nutrition-tabs button').nth(1).click();
  await page.locator('.redesign-nutrition-history').waitFor({timeout:3500});
  await page.locator('.redesign-nutrition-tabs button').nth(2).click();
  await page.locator('.redesign-nutrition-history').waitFor({timeout:3500});
  await page.locator('.redesign-nutrition-tabs button').first().click();
  await page.locator('.nutrition-diary-card').waitFor({timeout:3500});
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
  // The four-week analysis is strictly read-only until the trainer uses the
  // existing explicit Save nutrition action.
  await page.locator('.trainer-four-week-launch button').click();
  await page.locator('#trainerFourWeekModal').waitFor({timeout:3000});
  assert.equal(await page.locator('#trainerFourWeekGoal').inputValue(),'');
  await page.locator('#trainerFourWeekGoal').selectOption('loss');
  await page.locator('#trainerFourWeekStart').fill('2026-09-18');
  await page.locator('#trainerFourWeekModal .trainer-four-week-action').click();
  await page.locator('.trainer-four-week-proposal').waitFor({timeout:3000});
  assert.equal(await page.locator('.trainer-four-week-weeks > div').count(),4);
  assert.match(await page.locator('.trainer-four-week-report').innerText(),/Вага: 1-й → 4-й тиждень/);
  assert.equal(mealPlanWriteCalls,0,'Four-week calculation mutated the meal plan');
  assert.equal(await page.locator('#nkcal').inputValue(),'');
  await page.locator('.trainer-four-week-proposal button').click();
  assert.equal(await page.locator('#trainerFourWeekModal').count(),0);
  assert.equal(await page.locator('#nkcal').inputValue(),'2350');
  assert.equal(await page.locator('#ncarbs').inputValue(),'270');
  assert.equal(mealPlanWriteCalls,0,'Four-week draft wrote goals without trainer confirmation');
  await page.evaluate(()=>editNutritionTargets());
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

// Keep the trainer UI smoke in the existing browser CI lane.
await import('./trainer_program_overview_browser.mjs');
await import('./trainer_nav_theme_parity_browser.mjs');
