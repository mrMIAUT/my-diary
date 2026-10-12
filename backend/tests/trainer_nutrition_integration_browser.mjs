import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Exercises actual main-app trainer modules without signing in to production.
// All API calls, food values and customer data in this test are local mocks.
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><body><section id="nutritionPlanHost"></section><div id="nutrition"></div></body></html>');
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
  window.loadClientData=async()=>window.currentClientData;
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
 await page.locator('#recipeTemplateList [data-recipe="mock-lunch-3"]').click();
 await page.locator('#recipeTemplatePicker').waitFor({state:'detached'});
 const selected=await page.evaluate(()=>nutritionPlanDraft.find(x=>x.meal_number===2&&x.variant_number===2));
 assert.equal(selected.dish_title,'Страва lunch 3');
 assert.ok(selected.auto_fit?.diff);
 assert.ok(selected.foods.every(x=>x.grams>=x.portion_rules.min_grams&&x.grams<=x.portion_rules.max_grams));
 assert.deepEqual(await page.evaluate(()=>JSON.stringify(nutritionPlanDraft.filter(x=>x.variant_number===1))),before,'Cross-ration mutation');

 // Real structured quantity input recalculates without changing other rations.
 const firstGram=page.locator('.structured-grams').first();
 const initial=await firstGram.inputValue();
 await firstGram.fill(String(+initial+5));
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
 assert.equal(errors.length,0,'JS runtime failures '+errors.join(','));
 console.log('TRAINER NUTRITION UI PASS: ration tabs, real edit, recipe library, autosize, isolated state and explicit client save');
}finally{
 await browser.close();
}
