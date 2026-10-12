import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Exercises actual main-app trainer modules without signing in to production.
// All API calls, food values and customer data in this test are local mocks.
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><body class="eplan-redesign trainer-ui"><section id="nutritionPlanHost"></section><div id="nutrition"></div></body></html>');
 await page.addStyleTag({path:'backend/static/css/refinements.css'});
 const foodCatalog=[
  {source_id:'smoke-rice',name:'Рис білий (відварений)',unit:'g',kcal_100:130,protein_100:2.8,fat_100:.3,carbs_100:28.7,optional_vegetable:false},
  {source_id:'smoke-egg',name:'Яйце куряче (варене круто)',unit:'pcs',grams_per_piece:50,kcal_100:155,protein_100:12.6,fat_100:10.6,carbs_100:1.1,optional_vegetable:false},
  {source_id:'smoke-tomato',name:'Помідор (свіжий)',unit:'g',kcal_100:18,protein_100:.9,fat_100:.2,carbs_100:3.9,optional_vegetable:true},
  {source_id:'smoke-oil',name:'Оливкова олія',unit:'g',kcal_100:884,protein_100:0,fat_100:100,carbs_100:0,optional_vegetable:false}
 ];
 await page.evaluate(catalog=>{
  window.$=s=>document.querySelector(s);
  window.esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
  window.uiIcon=()=>'+';
  window.session={role:'trainer'};
  window.clientAccess=()=>({features:{meal_plan:true}});
  window.confirm=()=>true;
  window.alert=msg=>{(window.__alerts||=[]).push(msg)};
  window.setActionLoading=()=>()=>{};
  window.currentClientData={client:{id:123,kcal:2380,protein:160,fat:60,carbs:300},nutrition_plan:[]};
  window.loadClientData=async()=>{
   const request=window.__requests?.findLast(x=>x.path==='/client/123/nutrition');
   if(!request)return window.currentClientData;
   const saved=JSON.parse(request.opts.body);
   return {client:window.currentClientData.client,nutrition_plan:saved.meals.map(item=>({
    ...item,foods_json:JSON.stringify(item.foods),
    content:'Страва: '+(item.dish_title||'Страва без назви')+'\n'
     +item.foods.map(f=>f.source_id+' — '+f.grams+' г').join('\n')
     +'\n\nДо цільових БЖВ: '+(item.variant_number===1?'2300':'2450')
     +' ккал · Б 140 · Ж 70 · В 290\n\nПриготування: '+item.preparation
   }))};
  };
  window.nutritionHTML=()=>'<p>Saved</p>';
  window.__requests=[];
  const cats=['breakfast','lunch','dinner','snack'];
  const recipes=cats.flatMap((category,index)=>Array.from({length:15},(_,i)=>({
   id:'mock-'+category+'-'+i,category,title:'Страва '+category+' '+i,
   preparation:'Змішай готові продукти у страву.',source_name:'CI recipe fixture',
   source_url:'https://example.org/mock-recipe',minutes:12,tags:['quick'],
   foods:[
    {source_id:'smoke-rice',grams:180,count:null,count_in_targets:true,
       portion_rules:{min_grams:100,max_grams:350,step_grams:5}},
    {source_id:'smoke-egg',grams:100,count:2,count_in_targets:true,
       portion_rules:{min_grams:50,max_grams:200,step_grams:50}},
    {source_id:'smoke-oil',grams:7,count:null,count_in_targets:true,
       usage_note:'Заправка, не окремий продукт',
       portion_rules:{min_grams:3,max_grams:16,step_grams:1}},
    {source_id:'smoke-tomato',grams:110,count:null,count_in_targets:false,
       portion_rules:{min_grams:90,max_grams:220,step_grams:5}}
   ]
  })));
  window.api=async(path,opts)=>{
   window.__requests.push({path,opts});
   if(path==='/trainer/foods/recipes')return {templates:recipes};
   if(path==='/client/123/nutrition')return {ok:true};
   if(path==='/trainer/foods/catalog')return {items:catalog};
   throw Error('Unknown test API: '+path);
  };
 },foodCatalog);
 await page.addScriptTag({path:'backend/static/js/nutrition.js'});
 await page.addScriptTag({path:'backend/static/js/nutrition-portion-fitter.js'});
 await page.addScriptTag({path:'backend/static/js/structured-meal-editor.js'});
 await page.addScriptTag({path:'backend/static/js/recipe-template-picker.js'});
 await page.evaluate(catalog=>{
  window.structuredCatalog=catalog;
  const foods=[
   {source_id:'smoke-rice',grams:180,count:null,count_in_targets:true},
   {source_id:'smoke-egg',grams:100,count:2,count_in_targets:true}
  ];
  window.nutritionPlanDraft=[1,2].flatMap(v=>[1,2,3,4].map(n=>({
   meal_number:n,variant_number:v,sort:n,content:'Готова страва',
   dish_title:'Вихідне блюдо '+v+' '+n,
   preparation:'Змішай готові продукти.',foods:foods.map(x=>({...x,grams:x.grams+10*(v-1)}))
  })));
  document.querySelector('#nutritionPlanHost').innerHTML=mealPlanEditorHTML(window.currentClientData,true);
  document.querySelector('#nutritionPlanBody').classList.remove('hidden');
 },foodCatalog);
 assert.equal(await page.locator('.trainer-ration-tab').count(),2,'Expected whole-day ration tabs');
 assert.equal(await page.locator('.meal-editor').count(),4,'Should show only four meals in one ration');
 const rationOne=await page.locator('#structuredDailySummary').innerText();
 const oneState=await page.evaluate(()=>JSON.stringify(nutritionPlanDraft.filter(x=>x.variant_number===1)));
 await page.locator('.trainer-ration-tab').nth(1).click();
 assert.equal(await page.locator('.meal-editor').count(),4,'Ration switch stacked extra variants');
 const rationTwo=await page.locator('#structuredDailySummary').innerText();
 assert.notEqual(rationOne,rationTwo,'Switching rations did not update daily macros');
 const before=await page.evaluate(()=>JSON.stringify(nutritionPlanDraft.filter(x=>x.variant_number===1)));
 await page.locator('.meal-editor').nth(1).locator('.trainer-meal-recipe button').click();
 await page.locator('#recipeTemplatePicker').waitFor();
 assert.equal(await page.locator('.recipe-template-card').count(),15);
 // A stable SVG cross must be exactly centered in its square tap target.
 const closeOffset=await page.locator('#recipeTemplateClose').evaluate(button=>{
  const a=button.getBoundingClientRect(),b=button.querySelector('svg').getBoundingClientRect();
  return Math.max(Math.abs(a.x+a.width/2-b.x-b.width/2),Math.abs(a.y+a.height/2-b.y-b.height/2));
 });
 assert.ok(closeOffset<1,'Recipe library close icon is not visually centered: '+closeOffset);
 await page.locator('#recipeTemplateList [data-recipe="mock-lunch-3"]').click();
 await page.locator('#recipeTemplatePicker').waitFor({state:'detached'});
 const selected=await page.evaluate(()=>nutritionPlanDraft.find(x=>x.meal_number===2&&x.variant_number===2));
 assert.equal(selected.dish_title,'Страва lunch 3');
 assert.ok(selected.auto_fit?.diff);
 assert.ok(selected.foods.filter(x=>x.count==null).every(x=>x.grams%10===0),
  'Automatic recipe portions should all end in zero grams');
 assert.ok(selected.foods.every(x=>x.grams>=x.portion_rules.min_grams&&x.grams<=x.portion_rules.max_grams));
 assert.deepEqual(await page.evaluate(()=>JSON.stringify(nutritionPlanDraft.filter(x=>x.variant_number===1))),before,'Cross-ration mutation');

 // Real structured quantity input recalculates without changing other rations.
 const firstGram=page.locator('.structured-grams').first();
 const initial=await firstGram.inputValue();
 await firstGram.fill('155');
 await firstGram.blur();
 assert.equal(await firstGram.inputValue(),'160','Hand-entered gram portions should snap to tens on blur');
 assert.equal(await page.evaluate(()=>nutritionPlanDraft.find(x=>x.meal_number===1&&x.variant_number===2).foods[0].grams),160);
 const stale=await page.evaluate(()=>nutritionPlanDraft.find(x=>x.meal_number===2&&x.variant_number===2).auto_fit);
 assert.ok(stale,'Editing breakfast must not accidentally erase the lunch recipe');
 await page.locator('.trainer-ration-tab').first().click();
 assert.equal(await page.locator('#structuredDailySummary').innerText(),rationOne,'Ration one totals changed after editing ration two');

 // One more entire daily ration duplicates, then can be edited independently.
 await page.locator('.trainer-ration-add').click();
 assert.equal(await page.locator('.trainer-ration-tab').count(),3);
 assert.equal(await page.locator('.meal-editor').count(),4);
 await page.locator('.trainer-ration-tab').nth(1).click();
 const payload=await page.evaluate(async()=>{
  await saveTrainerMealPlanDraft(123,null);
  return window.__requests.findLast(x=>x.path==='/client/123/nutrition');
 });
 assert.ok(payload,'No client save API call');
 const saved=JSON.parse(payload.opts.body);
 assert.equal(saved.meals.length,12,'Rations must persist as meal/variant combinations');
 assert.ok(saved.meals.some(x=>x.dish_title==='Страва lunch 3'&&x.preparation.includes('Змішай')));
 assert.ok(saved.meals.every(x=>x.foods.length>0));
 // After trainer saves, the persisted assigned plan is visible without another tap.
 assert.equal(await page.locator('#nutrition .trainer-saved-ration-tab').count(),3,
  'Saved plan must render ration tabs in the trainer client card immediately');
 assert.equal(await page.locator('#nutrition #nutritionPlanBody.hidden').count(),0,
  'Saved plan card unexpectedly collapsed after saving');
 assert.equal(await page.locator('#nutrition .trainer-saved-ration-page:not([hidden])').count(),1,
  'Trainer preview stacks independent whole-day rations');
 assert.equal(await page.locator('#nutrition .trainer-assigned-meal').count(),12,
  'Trainer preview must include all saved dishes across three rations');
 assert.equal(await page.locator('#nutrition .nutrition-meal-icon svg').count(),12,
   'All meal cards must render SVGs instead of food-emoji thumbnails');
 for (const category of ['breakfast','lunch','snack','dinner'])
  assert.equal(await page.locator('#nutrition .nutrition-meal-icon-'+category).count(),3);
 // Regress the actual Lucide 0.456.0 SVG geometry shown to the user.
 // Equivalent-looking custom art is NOT acceptable for this UI decision.
 const lucideIcons={
  breakfast:[
   'M10 2v2','M14 2v2',
   'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1',
   'M6 2v2'
  ],
  lunch:[
   'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
   'M7 2v20',
   'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'
  ],
  snack:[
   'M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z',
   'M10 2c1 .5 2 2 2 5'
  ],
  dinner:['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z']
 };
 for(const [category,paths] of Object.entries(lucideIcons)){
  const svg=page.locator('#nutrition .nutrition-meal-icon-'+category+' svg').first();
  assert.deepEqual(await svg.locator('path').evaluateAll(all=>all.map(p=>p.getAttribute('d'))),paths,
   'The '+category+' icon differs from the approved Lucide artwork');
  assert.equal(await svg.getAttribute('stroke-width'),'2');
  const style=await svg.evaluate(el=>({
   stroke:getComputedStyle(el).stroke,
   width:Math.round(el.getBoundingClientRect().width)
  }));
  assert.equal(style.width,28,'The '+category+' icon size has drifted');
 }
 const iconBackgrounds=await page.locator('#nutrition .nutrition-meal-icon').evaluateAll(
  nodes=>[...new Set(nodes.map(x=>getComputedStyle(x).backgroundColor))]);
 assert.equal(iconBackgrounds.length,1,'All meal-category icons should use the same neutral background');

 assert.equal(await page.locator('#nutrition .nutrition-menu-v2-nutrients').count(),12,
   'Each assigned dish needs a compact calorie and BJU rail');
 assert.equal(await page.locator('#nutrition .trainer-assigned-day-total').count(),3,
  'Saved, structured full-day totals are missing');
 assert.ok(await page.locator('#nutrition .nutrition-menu-ingredient').count()>4,
  'Saved meals must present clean ingredient and gram rows');
 const viewed=await page.locator('#nutrition .trainer-saved-ration-page:not([hidden])').innerText();
 assert.ok(!viewed.includes('До цільових БЖВ:'),'Technical source summary leaked into the polished menu');
 const preparation=page.locator('#nutrition .nutrition-menu-method').first();
 assert.equal(await preparation.getAttribute('open'),null,'Preparation should start collapsed');
 await preparation.locator('summary').click();
 assert.ok((await preparation.innerText()).includes('Змішай'),'Recipe steps should expand on demand');
 const seenOne=await page.locator('#nutrition .trainer-saved-ration-page:not([hidden])').innerText();
 assert.ok(seenOne.includes('Вихідне блюдо 1 1'));
 assert.ok(seenOne.replace(/\s/g,'').includes('2300ккал'));
 await page.locator('#nutrition .trainer-saved-ration-tab').nth(1).click();
 const seenTwo=await page.locator('#nutrition .trainer-saved-ration-page:not([hidden])').innerText();
 assert.ok(seenTwo.includes('Страва lunch 3'));
 assert.ok(seenTwo.replace(/\s/g,'').includes('2450ккал'));
 assert.notEqual(seenOne,seenTwo);
 assert.equal(await page.locator('#nutrition .trainer-saved-ration-tab[aria-selected="true"]').count(),1);
 assert.equal(await page.locator('#nutrition .trainer-saved-plan-actions button').count(),1);
 await page.locator('#nutrition .trainer-saved-plan-actions button').click();
 assert.equal(await page.locator('#nutrition .meal-editor').count(),4,
   'Edit button did not reopen the assigned meal editor');
 assert.equal(await page.locator('#nutrition .trainer-nutrition-target-card.is-saved').count(),1,
   'Editing dishes should not reset previously saved calorie/BJU targets');


 // Daily fitting must correct a high-calorie whole-day menu toward its goal,
 // preserve an egg count, and avoid out-of-bounds recipe changes.
 const fit=await page.evaluate(catalog=>{
  const source=[1,2,3,4].map(n=>({
   meal_number:n,variant_number:1,content:'Страва: Тестова',
   dish_title:'Тестова страва',preparation:'',
   foods:[{source_id:'smoke-rice',grams:350,count:null,count_in_targets:true},
    {source_id:'smoke-egg',grams:100,count:2,count_in_targets:true},
    ...(n===2?[{source_id:'smoke-oil',grams:20,count:null,count_in_targets:true}]:[])]
  }));
  const result=window.fitAssignedNutritionToGoal(source,{
   kcal:2500,protein:90,fat:56,carbs:395
  },catalog);
  return {
   reports:result.reports,
   actual:result.meals.flatMap(x=>x.foods),
   before:source.flatMap(x=>x.foods)
  };
 },foodCatalog);
 assert.ok(Math.abs(fit.reports[0].result[0]-2500)<Math.abs(fit.reports[0].original[0]-2500),
  'Day optimizer did not reduce calorie error versus 2500-kcal goal');
 assert.ok(fit.reports[0].result[0]<fit.reports[0].original[0],
  'Over-target meal plan was pushed further upward');
 assert.ok(fit.actual.every(f=>f.count!=null||f.grams%10===0),
  'Every suggested non-egg portion must be a multiple of ten');
 assert.ok(fit.actual.filter(f=>f.count!=null).every(f=>f.count===2&&f.grams===100),
  'Eggs must remain whole pieces');
 assert.ok(fit.actual.every((f,i)=>f.count!=null||Math.abs(f.grams-fit.before[i].grams)<=
  Math.max(20,Math.round(fit.before[i].grams*.3/10)*10)),
  'Fitting should not radically change the original recipe');

 // Previously saved plans can contain five-gram quantities: the trainer has an
 // explicit rounding action, not a misleading display-only transformation.
 await page.evaluate(meals=>{
  const legacy=meals.map(x=>({
   ...x,foods_json:JSON.stringify(x.foods.map((row,i)=>
     x.meal_number===1&&x.variant_number===1&&i===0?{...row,grams:155}:row
   ))
  }));
  const adjusted=legacy.find(x=>x.meal_number===1&&x.variant_number===1);
  adjusted.content='Страва: Тестова страва з рисом\nРис білий (відварений) — 155 г\nЯйце куряче — 2 шт.\n\nДо цільових БЖВ: 500 ккал · Б 25 · Ж 15 · В 65\n\nПриготування: Приготуй рис.';
  window.currentClientData={client:window.currentClientData.client,nutrition_plan:legacy};
  document.querySelector('#nutrition').innerHTML=nutritionHTML(window.currentClientData);
 },saved.meals);
 assert.equal(await page.locator('#nutrition .nutrition-menu-round-prompt button').count(),1,
   'Trainer should be able to rebalance assigned nutrition to daily goals');
 const unchanged=await page.locator('#nutrition .trainer-saved-ration-page:not([hidden])').innerText();
 assert.ok(unchanged.includes('155 г'),'Old nutrition quantities were silently changed in the saved view');
 await page.locator('#nutrition .nutrition-menu-round-prompt button').click();
 const rounded=await page.evaluate(()=>{
  const requests=window.__requests.filter(x=>x.path==='/client/123/nutrition');
  return JSON.parse(requests.at(-1).opts.body);
 });
 assert.ok(rounded.meals.every(x=>x.foods.every(f=>f.count!=null||f.grams%10===0)),
   'Confirmed plan must persist all gram ingredients on the 10-g grid');
 assert.equal(rounded.meals.find(x=>x.meal_number===1&&x.variant_number===1).foods[1].count,2,
   'Eggs must stay whole pieces');
 assert.ok(await page.locator('#nutrition .nutrition-meal-icon svg').count()>0,
   'Saved and reloaded nutrition must retain the SVG meal-type design');

 // Older incomplete or text-only alternatives remain readable with no
 // invented macro total when meal nutrition provenance is unavailable.
 await page.evaluate(meals=>{
  const legacy=meals.filter(x=>!(x.meal_number===4&&x.variant_number===2))
   .map(x=>({...x,foods_json:'[]',content:'Звичайний текстовий план <script>невідоме</script>'}));
  document.querySelector('#nutrition').innerHTML=nutritionHTML({
   client:window.currentClientData.client,nutrition_plan:legacy
  });
 },saved.meals);
 assert.equal(await page.locator('#nutrition .trainer-saved-ration-tab').count(),0,
  'Incomplete legacy alternatives falsely grouped into whole-day rations');
 assert.ok((await page.locator('#nutrition').innerText()).includes('Варіант 2'));
 assert.equal(await page.locator('#nutrition .trainer-assigned-day-total').count(),0);
 assert.equal(await page.locator('#nutrition script').count(),0,'Legacy text must be escaped');

 // Empty plan keeps old creation actions, rather than showing phantom rations.
 await page.evaluate(()=>{
  document.querySelector('#nutrition').innerHTML=nutritionHTML({
   client:{...window.currentClientData.client,meal_plan:''},nutrition_plan:[]
  });
 });
 assert.equal(await page.locator('#nutrition .trainer-saved-plan').count(),0);
 assert.equal(await page.locator('#nutrition .meal-autoplan-open').count(),1);

 // Real client view: select one complete ration, never stack incompatible
 // daily choices. Legacy incomplete per-meal alternatives remain readable.
 await page.evaluate(meals=>{
  const host=document.createElement('section');host.id='clientRationSmoke';document.body.appendChild(host);
  host.innerHTML=clientMealPlanHTML({client:{meal_plan:''},nutrition_plan:meals.map(item=>({
   ...item,foods_json:JSON.stringify(item.foods),
   content:'Страва: '+item.dish_title+'\n'
    +item.foods.map(food=>food.source_id+' — '+food.grams+' г').join('\n')
    +'\n\nДо цільових БЖВ: 500 ккал · Б 30 · Ж 15 · В 65'
    +'\n\nПриготування: '+item.preparation
  }))});
 },saved.meals);
 assert.equal(await page.locator('#clientRationSmoke .client-ration-tab').count(),3,
   'Client cannot choose complete rations');
 assert.equal(await page.locator('#clientRationSmoke #clientMealPlanBody.hidden').count(),0,
   'Client assigned ration should be open upon entering nutrition');
 assert.ok(await page.locator('#clientRationSmoke .nutrition-meal-icon svg').count()>0,
   'Client must see the same meal-category SVGs as the trainer');
 assert.ok(await page.locator('#clientRationSmoke .nutrition-menu-v2-nutrients').count()>0,
   'Client meal macros should use the chosen compact design');
 assert.equal(await page.locator('#clientRationSmoke .client-ration-page:not([hidden])').count(),1,
   'Client sees several daily rations stacked together');
 assert.ok(await page.locator('#clientRationSmoke .nutrition-menu-ingredient').count()>0,
  'Client menu must show the same readable ingredient rows');
 const clientRationOne=await page.locator('#clientRationSmoke .client-ration-page:not([hidden])').innerText();
 await page.locator('#clientRationSmoke .client-ration-tab').nth(1).click();
 const clientRationTwo=await page.locator('#clientRationSmoke .client-ration-page:not([hidden])').innerText();
 assert.notEqual(clientRationOne,clientRationTwo,'Client ration selector did not switch dishes');
 assert.equal(await page.locator('#clientRationSmoke .client-ration-tab[aria-selected="true"]').count(),1,
   'Client selection aria state is incorrect');
 await page.evaluate(meals=>{
  const old=meals.filter(x=>!(x.meal_number===4&&x.variant_number===2));
  document.querySelector('#clientRationSmoke').innerHTML=
   clientMealPlanHTML({client:{meal_plan:''},nutrition_plan:old});
 },saved.meals);
 assert.equal(await page.locator('#clientRationSmoke .client-ration-tab').count(),0,
   'Incomplete legacy alternatives were converted to invalid complete rations');
 assert.ok((await page.locator('#clientRationSmoke').innerText()).includes('Варіант 2'),
   'Legacy incomplete variants no longer visible');
 assert.equal(errors.length,0,'JS runtime failures '+errors.join(','));
 console.log('TRAINER NUTRITION UI PASS: ration tabs, real edit, recipe library, autosize, isolated state and explicit client save');
}finally{
 await browser.close();
}
