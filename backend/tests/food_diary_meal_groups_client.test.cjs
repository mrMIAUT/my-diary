"use strict";
// Run the actual EPLAN prototype diary logic in Node: verify meal groups,
// meal-level macros, separate total, editing between groups, delete/undo.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
assert.ok(html.includes('class="foodDiaryDaySummary"'),"Daily totals must have a separate visual container");
assert.ok(html.includes("Разом за день"),"Explicit daily total heading");
assert.ok(html.includes(".foodDiaryMealMacros{"),"Meal-level BJU styling must exist");
const start=js.indexOf("function localDayKey(){"),end=js.indexOf("\n$('foodWeekPrev').addEventListener(",start);
assert.ok(start>=0&&end>start,"Actual diary logic located");
const store=new Map(),key="eplan12-food-diary-v1";
const localStorage={
 getItem:k=>store.get(k)||null,
 setItem:(k,v)=>store.set(k,String(v))
};
const elements=Object.fromEntries([
 "diaryKcal","diaryProtein","diaryFat","diaryCarbs","foodDiaryDate",
 "foodDiaryEntries","foodDiaryNotice","diaryEditGrams","diaryEditMeal",
 "diaryEditError","diaryEditPreview"
].map(id=>[id,{textContent:"",innerHTML:"",value:"",
 classList:{add(){},remove(){}},
 querySelectorAll:()=>[],addEventListener(){},scrollIntoView(){}}]));
const $=id=>elements[id]||null;
const foodFmt=n=>Number(n).toLocaleString("uk-UA",{maximumFractionDigits:1});
const foodEsc=x=>String(x??"").replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const ctx=vm.createContext({$,foodFmt,foodEsc,localStorage,Date,Number,Math,console,
 FOOD_DIARY_KEY:key});
vm.runInContext(js.slice(start,end),ctx);
const f=vm.runInContext("({localDayKey,loadDiary,saveDiary,renderDiary,startDiaryEdit,saveDiaryEdit,removeDiaryEntry,undoDiaryRemove,diaryNutritionTotals})",ctx);
const date=f.localDayKey();
const milk={id:"milk",date,meal:"Сніданок",name:"Молоко 2,5%",
 brand:"Галичина",grams:200,kcal:103.4,protein:5.6,fat:5,carbs:9};
const banana={id:"banana",date,meal:"Перекус",name:"Банан свіжий",
 brand:"",grams:150,kcal:133.5,protein:1.65,fat:0.45,carbs:34.2};
const past={...milk,id:"yesterday",date:"2026-10-08",kcal:9999};
function entries(){return JSON.parse(localStorage.getItem(key)||"[]")}
function mealMarkup(meal){
 const all=elements.foodDiaryEntries.innerHTML,phrase='data-diary-meal="'+meal+'"';
 const begin=all.indexOf(phrase);
 return begin<0?"":all.slice(begin,all.indexOf("</section>",begin));
}
function expectNear(actual,expected,label){
 assert.ok(Math.abs(actual-expected)<1e-8,
 label+": "+actual+" != "+expected);
}
assert.ok(f.saveDiary([milk,banana,past]));
f.renderDiary();
assert.equal(elements.diaryKcal.textContent,"236,9");
assert.equal(elements.diaryProtein.textContent,"7,3");
assert.equal(elements.diaryFat.textContent,"5,5");
assert.equal(elements.diaryCarbs.textContent,"43,2");
assert.ok(mealMarkup("Сніданок").includes("103,4"));
assert.ok(mealMarkup("Сніданок").includes("5,6"));
assert.ok(mealMarkup("Сніданок").includes("Галичина"));
assert.ok(mealMarkup("Перекус").includes("133,5"));
assert.ok(mealMarkup("Перекус").includes("Банан свіжий"));
assert.ok(mealMarkup("Обід").includes("data-diary-meal-add"));
assert.ok(mealMarkup("Вечеря").includes("data-diary-meal-add"));
assert.ok(!elements.foodDiaryEntries.innerHTML.includes("9999"));
assert.ok(elements.foodDiaryEntries.innerHTML.indexOf('data-diary-meal="Сніданок"')<
 elements.foodDiaryEntries.innerHTML.indexOf('data-diary-meal="Перекус"'));
// Edit milk 200->300g, move to Dinner. Totals follow edited entries.
f.startDiaryEdit("milk");
elements.diaryEditGrams.value="300";elements.diaryEditMeal.value="Вечеря";
assert.equal(f.saveDiaryEdit("milk"),true);
assert.ok(!mealMarkup("Сніданок").includes("foodDiaryMealEntries"));
assert.ok(mealMarkup("Вечеря").includes("155,1"));
assert.ok(mealMarkup("Перекус").includes("133,5"));
assert.ok(elements.foodDiaryEntries.innerHTML.indexOf('data-diary-meal="Вечеря"')<
 elements.foodDiaryEntries.innerHTML.indexOf('data-diary-meal="Перекус"'));
assert.equal(elements.diaryKcal.textContent,"288,6");
assert.equal(entries().find(x=>x.id==="milk").meal,"Вечеря");
expectNear(entries().find(x=>x.id==="milk").protein,8.4,"Protein edited");
// Delete banana and undo. Per-meal and day totals update consistently.
assert.equal(f.removeDiaryEntry("banana"),true);
assert.ok(!mealMarkup("Перекус").includes("foodDiaryMealEntries"));
assert.equal(elements.diaryKcal.textContent,"155,1");
assert.equal(f.undoDiaryRemove(),true);
assert.ok(mealMarkup("Перекус").includes("133,5"));
assert.equal(elements.diaryKcal.textContent,"288,6");
// Historical/unknown meal label must never silently disappear.
const legacy={...milk,id:"legacy-other",meal:"Полуденок",kcal:60};
assert.ok(f.saveDiary([...entries(),legacy]));
f.renderDiary();
assert.ok(mealMarkup("Інше").includes("legacy-other"));
assert.equal(elements.diaryKcal.textContent,"348,6");
assert.equal(entries().find(x=>x.id==="legacy-other").meal,"Полуденок");
// Original stored records are retained (no migration/destructive rewrite).
assert.equal(entries().find(x=>x.id==="yesterday").kcal,9999);
// Empty day has zero totals and a user-friendly empty state.
assert.ok(f.saveDiary([]));
f.renderDiary();
assert.equal(elements.diaryKcal.textContent,"0");
assert.equal((elements.foodDiaryEntries.innerHTML.match(/data-diary-meal-add=/g)||[]).length,4);
assert.ok(mealMarkup("Сніданок").includes("foodDiaryMealAdd"));
console.log("Food diary groups: meal BJU, separate daily totals, edit/move, undo, legacy grouping and empty state PASS");
