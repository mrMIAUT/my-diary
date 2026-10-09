"use strict";
// Regression guard for the 2026-10 EPLAN 1.2 visual cleanup.
// Uses actual diary functions with mocked browser storage; no live data edited.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
assert.ok(html.includes('id="foodQuery"'),"Search box must remain");
assert.ok(html.includes('placeholder="Пошук продуктів або штрихкод"'),"Single search field expected");
assert.ok(!html.includes('class="foodChips"'),"Preset suggestion chips must be removed");
assert.ok(!html.includes('data-food-query='),"Hardcoded demo food suggestions must not appear");
assert.ok(!js.includes("querySelectorAll('[data-food-query]')"),"Preset handlers must be absent");
assert.ok(html.includes("/static/calculator-prototype.js?v=45"),"Refresh Safari JS cache");
assert.ok(html.includes(".foodWeekDay.is-selected .foodWeekDayCircle{background:#3868cb"),"Selected week day must use brand blue");
assert.ok(html.includes(".foodCalendarDay.is-selected{background:#e9f0ff"),"Month selection must use brand blue");
assert.ok(html.includes(".foodCalendarDot{background:#4679d0"),"History indicators must use brand blue");
for(const field of ["diaryKcal","diaryProtein","diaryFat","diaryCarbs"])
 assert.ok(html.includes('id="'+field+'"'),"Keep exact diary totals "+field);
for(const heading of ["Білки","Жири","Вуглеводи"])
 assert.ok(html.includes('class="foodDiaryMacroLabel">'+heading),"Readable daily labels");
const begin=js.indexOf("function localDayKey(){");
const end=js.indexOf("\n$('foodWeekPrev').addEventListener(",begin);
assert.ok(begin>=0&&end>begin);
let rawDiary="[]",writes=0,toggleControls=[];
const localStorage={getItem:()=>rawDiary,setItem:(key,value)=>{rawDiary=String(value);writes++}};
function control(){return {textContent:"",innerHTML:"",value:"",hidden:false,
 setAttribute(){},querySelectorAll:()=>[],addEventListener(){},
 scrollIntoView(){}}}
const byId=Object.fromEntries([
 "foodDiaryEntries","foodDiaryNotice","diaryKcal","diaryProtein","diaryFat",
 "diaryCarbs","foodDiaryDate","foodAddStatus","foodMeal","diaryEditGrams",
 "diaryEditMeal","diaryEditError","diaryEditPreview"
].map(k=>[k,control()]));
byId.foodDiaryEntries.querySelectorAll=selector=>{
 if(selector!=="[data-diary-meal-toggle]")return [];
 toggleControls=Array.from(byId.foodDiaryEntries.innerHTML.matchAll(
  /data-diary-meal-toggle="([^"]+)"/g),m=>({
   dataset:{diaryMealToggle:m[1]},onclick:null
  }));
 return toggleControls;
};
const $=id=>byId[id]||null;
const foodEsc=s=>String(s??"").replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const foodFmt=n=>Number(n).toLocaleString("uk-UA",{maximumFractionDigits:1});
const ctx=vm.createContext({$,localStorage,foodEsc,foodFmt,Date,Math,Number,console,
 FOOD_DIARY_KEY:"eplan12-food-diary-v1",selectedFood:null,
 activeFoodProfile:null,foodPrepMeta:null,currentPrepValid:true,
 foodWeightBasis:"raw",currentFoodTotals:null,prepModeLabel:()=>""});
vm.runInContext(js.slice(begin,end),ctx);
const f=vm.runInContext("({localDayKey,diaryDateFromKey,saveDiary,loadDiary,renderDiary,toggleDiaryMeal,selectDiaryDate,addFoodToDiary,startDiaryEdit,saveDiaryEdit})",ctx);
const today=f.localDayKey(),date=f.diaryDateFromKey(today);
date.setDate(date.getDate()-1);
const prev=date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
const milk={id:"milk",date:today,meal:"Сніданок",name:"Молоко 2,5%",
 brand:"Галичина",grams:200,kcal:103.4,protein:5.6,fat:5,carbs:9};
const banana={id:"banana",date:today,meal:"Перекус",name:"Банан",
 grams:150,kcal:133.5,protein:1.65,fat:.45,carbs:34.2};
const old={...milk,id:"old",date:prev,grams:100,kcal:51.7};
assert.ok(f.saveDiary([milk,banana,old]));
const storageBefore=rawDiary,writesBefore=writes;
function block(meal){
 const html=byId.foodDiaryEntries.innerHTML;
 const start=html.indexOf('data-diary-meal="'+meal+'"');
 if(start<0)return "";
 return html.slice(html.lastIndexOf("<section",start),html.indexOf("</section>",start)+10);
}
f.renderDiary();
assert.ok(block("Сніданок").includes('data-diary-meal-body="Сніданок"'));
assert.ok(block("Перекус").includes('data-diary-meal-body="Перекус"'));
assert.ok(block("Сніданок").includes("Білки"));
assert.ok(block("Сніданок").includes("Жири"));
assert.ok(block("Сніданок").includes("Вуглеводи"));
assert.equal(byId.diaryKcal.textContent,"236,9");
assert.ok(toggleControls.some(btn=>btn.dataset.diaryMealToggle==="Сніданок"));
const first=toggleControls.find(btn=>btn.dataset.diaryMealToggle==="Сніданок");
assert.equal(typeof first.onclick,"function");
first.onclick();
assert.ok(block("Сніданок").includes("is-collapsed"));
assert.ok(block("Сніданок").includes('aria-expanded="false"'));
assert.ok(block("Сніданок").includes("103,4"));
assert.ok(!block("Сніданок").includes('data-diary-meal-body="Сніданок"'));
assert.ok(!block("Сніданок").includes("Молоко 2,5%"));
assert.ok(block("Сніданок").includes('data-diary-meal-add="Сніданок"'));
assert.ok(block("Перекус").includes("Банан"));
assert.equal(byId.diaryKcal.textContent,"236,9","Fold must not affect daily totals");
assert.equal(rawDiary,storageBefore,"Folding must not change localStorage");
assert.equal(writes,writesBefore,"No hidden storage writes");
// Collapsed state survives re-render and switching dates in this session.
f.renderDiary();
assert.ok(block("Сніданок").includes("is-collapsed"));
assert.equal(f.selectDiaryDate(prev),true);
assert.ok(!block("Сніданок").includes("is-collapsed"));
assert.equal(byId.diaryKcal.textContent,"51,7");
assert.equal(f.selectDiaryDate(today),true);
assert.ok(block("Сніданок").includes("is-collapsed"));
assert.equal(f.toggleDiaryMeal("Сніданок"),true);
assert.ok(block("Сніданок").includes('aria-expanded="true"'));
assert.ok(block("Сніданок").includes("Молоко 2,5%"));
assert.equal(f.toggleDiaryMeal("Обід"),false,"Empty meals cannot unfold");
assert.equal(f.toggleDiaryMeal("Чай"),false,"Unknown meal must not affect data");
// Moving an item into a folded destination must auto-expand its new section.
assert.equal(f.toggleDiaryMeal("Перекус"),true);
assert.ok(block("Перекус").includes("is-collapsed"));
f.startDiaryEdit("milk");
byId.diaryEditGrams.value="300";
byId.diaryEditMeal.value="Перекус";
assert.equal(f.saveDiaryEdit("milk"),true);
assert.ok(!block("Перекус").includes("is-collapsed"));
assert.ok(block("Перекус").includes("Молоко 2,5%"));
assert.equal(byId.diaryKcal.textContent,"288,6");
// Adding a new product into a folded section must reveal it.
assert.equal(f.toggleDiaryMeal("Сніданок"),false,"Empty after move");
assert.equal(f.toggleDiaryMeal("Перекус"),true);
ctx.selectedFood={name:"Молоко 2,5%",brand:"Галичина",source:"reference",
 kcal_100:51.7,protein_100:2.8,fat_100:2.5,carbs_100:4.5};
ctx.activeFoodProfile=ctx.selectedFood;
ctx.currentFoodTotals={grams:100,kcal:51.7,protein:2.8,fat:2.5,carbs:4.5,oil:0};
byId.foodMeal.value="Перекус";
f.addFoodToDiary();
assert.ok(!block("Перекус").includes("is-collapsed"));
assert.ok(block("Перекус").includes("51,7"));
assert.equal(byId.diaryKcal.textContent,"340,3");
assert.equal(f.loadDiary().filter(x=>x.date===prev).length,1);
console.log("Diary visual polish: brand-blue calendar, clean BJU, no preset chips, fold/unfold meals, historical state and safe edits PASS");
