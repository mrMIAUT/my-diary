"use strict";
// Integration test of real diary functions; mocked browser storage and DOM.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
const start=js.indexOf("function localDayKey(){");
const stop=js.indexOf("\n$('foodSearchBtn').addEventListener(",start);
assert.ok(start>=0&&stop>start,"Diary code located");
assert.ok(html.includes('id="foodDiaryNotice"'),"Undo notice present");
assert.ok(html.includes('scroll-margin-top:calc(78px + env(safe-area-inset-top,0px))'),
 "Safari safe-area anchor margin exists");
assert.ok(js.includes("scrollIntoView({behavior:'smooth',block:'start'})"));
const store=new Map();
const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
const ids=["diaryKcal","diaryProtein","diaryFat","diaryCarbs","foodDiaryDate",
 "foodDiaryEntries","foodDiaryNotice","foodAddStatus","foodMeal","foodGrams",
 "diaryEditGrams","diaryEditMeal","diaryEditError","diaryEditPreview"];
const el=Object.fromEntries(ids.map(id=>[id,{value:"",textContent:"",innerHTML:"",
 addEventListener(){},querySelectorAll:()=>[],scrollIntoView(){},
 classList:{add(){},remove(){}}}]));
const $=id=>el[id]||null;
const foodEsc=x=>String(x??"").replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const foodFmt=x=>Number(x).toLocaleString("uk-UA",{maximumFractionDigits:1});
const ctx=vm.createContext({$,localStorage,Date,Math,console,foodEsc,foodFmt,
 FOOD_DIARY_KEY:"eplan12-food-diary-v1",
 selectedFood:null,activeFoodProfile:null,foodPrepMeta:null,
 currentPrepValid:true,foodWeightBasis:"raw",currentFoodTotals:null,
 prepModeLabel:()=>""});
vm.runInContext(js.slice(start,stop),ctx);
const api=vm.runInContext("({localDayKey,renderDiary,loadDiary,saveDiary,diaryTotalsForGrams,diaryNutritionProfile,startDiaryEdit,saveDiaryEdit,cancelDiaryEdit,removeDiaryEntry,undoDiaryRemove,addFoodToDiary,updateDiaryEditPreview})",ctx);
const day=api.localDayKey(),stored=()=>JSON.parse(localStorage.getItem("eplan12-food-diary-v1")||"[]");
const entry=id=>stored().find(x=>x.id===id);
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<0.00001,
 label+": expected "+expected+" got "+actual);
const milk100={id:"legacy-100",date:day,name:"Молоко 2,5%",brand:"Галичина",
 meal:"Сніданок",grams:100,kcal:51.7,protein:2.8,fat:2.5,carbs:4.5,oil:0};
const milk250={...milk100,id:"legacy-250",grams:250,kcal:129.25,
 protein:7,fat:6.25,carbs:11.25};
const fried={id:"fried-old",date:day,name:"Овочі смажені",brand:"",
 meal:"Обід",grams:100,kcal:190,protein:4,fat:12,carbs:10,oil:5,
 prep:"Смажене · після приготування"};
const past={...milk100,id:"yesterday",date:"2001-01-01"};
assert.ok(api.saveDiary([milk100,milk250,fried,past]));
api.renderDiary();
assert.match(el.foodDiaryEntries.innerHTML,/Галичина/);
assert.match(el.foodDiaryEntries.innerHTML,/data-diary-edit="legacy-250"/);
assert.match(el.foodDiaryEntries.innerHTML,/data-diary-remove="legacy-250"/);
assert.match(el.foodDiaryEntries.innerHTML,/Редагувати/);
assert.match(el.foodDiaryEntries.innerHTML,/Видалити/);
assert.match(el.foodDiaryEntries.innerHTML,/100 г/);
// Edits a legacy saved row (without per100 snapshot), keeping other rows.
api.startDiaryEdit("legacy-250");
assert.match(el.foodDiaryEntries.innerHTML,/diaryEditGrams/);
el.diaryEditGrams.value="300";
el.diaryEditMeal.value="Вечеря";
api.updateDiaryEditPreview();
assert.match(el.diaryEditPreview.textContent,/155,1/);
assert.equal(el.diaryEditError.textContent,"");
assert.equal(api.saveDiaryEdit("legacy-250"),true);
near(entry("legacy-250").kcal,155.1,"legacy kcal");
near(entry("legacy-250").protein,8.4,"legacy protein");
near(entry("legacy-250").fat,7.5,"legacy fat");
near(entry("legacy-250").carbs,13.5,"legacy carbs");
assert.equal(entry("legacy-250").meal,"Вечеря");
assert.equal(entry("legacy-250").brand,"Галичина");
assert.equal(entry("legacy-100").grams,100);
assert.equal(entry("yesterday").date,"2001-01-01");
assert.ok(entry("legacy-250").per100);
// Invalid save cannot mutate the saved row.
api.startDiaryEdit("legacy-250");
for(const grams of ["0","-1","5001","abc","","3.123"]){
 el.diaryEditGrams.value=grams;
 el.diaryEditMeal.value="Сніданок";
 assert.equal(api.saveDiaryEdit("legacy-250"),false,grams);
 assert.equal(entry("legacy-250").grams,300);
}
el.diaryEditGrams.value="250,5";
el.diaryEditMeal.value="Десерт";
assert.equal(api.saveDiaryEdit("legacy-250"),false);
el.diaryEditMeal.value="Сніданок";
assert.equal(api.saveDiaryEdit("legacy-250"),true);
near(entry("legacy-250").kcal,129.5085,"comma grams kcal");
api.startDiaryEdit("legacy-250");el.diaryEditGrams.value="1000";
api.cancelDiaryEdit();near(entry("legacy-250").grams,250.5,"cancel");
// Prepared food keeps 5g oil while grams change.
api.startDiaryEdit("fried-old");
el.diaryEditGrams.value="200";el.diaryEditMeal.value="Обід";
assert.equal(api.saveDiaryEdit("fried-old"),true);
near(entry("fried-old").kcal,335,"fried kcal");
near(entry("fried-old").protein,8,"fried protein");
near(entry("fried-old").fat,19,"fried fat");
near(entry("fried-old").carbs,20,"fried carbs");
near(entry("fried-old").oil,5,"oil constant");
assert.equal(entry("fried-old").prep,fried.prep);
// Delete and undo preserve exact source row and daily totals.
const total=()=>stored().filter(x=>x.date===day).reduce((v,x)=>v+x.kcal,0);
const oldTotal=total();
assert.equal(api.removeDiaryEntry("legacy-100"),true);
assert.equal(entry("legacy-100"),undefined);
near(total(),oldTotal-51.7,"delete updates daily kcal");
assert.match(el.foodDiaryNotice.innerHTML,/Скасувати видалення/);
assert.equal(api.undoDiaryRemove(),true);
near(entry("legacy-100").kcal,51.7,"undo row kcal");
near(total(),oldTotal,"undo totals");
assert.equal(api.removeDiaryEntry("nonexistent"),false);
// New food entry captures exact per100 and unique ID even rapid double-add.
ctx.selectedFood={name:"Молоко 2,5%",brand:"Галичина",source:"reference",
 source_id:"eplan12-manufacturer-galychyna-milk-25",
 kcal_100:51.7,protein_100:2.8,fat_100:2.5,carbs_100:4.5};
ctx.activeFoodProfile=ctx.selectedFood;
ctx.currentFoodTotals={grams:250,kcal:129.25,protein:7,fat:6.25,carbs:11.25,oil:0};
el.foodMeal.value="Сніданок";api.addFoodToDiary();api.addFoodToDiary();
const added=stored().filter(x=>x.source_id==="eplan12-manufacturer-galychyna-milk-25");
assert.equal(added.length,2);
assert.notEqual(added[0].id,added[1].id);
assert.equal(added[0].brand,"Галичина");
near(added[0].per100.kcal_100,51.7,"snapshot");
assert.equal(el.foodAddStatus.textContent,"Додано до щоденника.");
api.startDiaryEdit(added[0].id);
el.diaryEditGrams.value="100";el.diaryEditMeal.value="Перекус";
assert.equal(api.saveDiaryEdit(added[0].id),true);
near(entry(added[0].id).kcal,51.7,"new entry 100g");
assert.equal(entry(added[0].id).meal,"Перекус");
assert.equal(entry(added[1].id).grams,250);
// Untrusted historical diary strings must remain HTML escaped.
const saved=stored();
saved.push({...milk100,id:"untrusted",brand:'<img src=x onerror="alert(1)">'});
api.saveDiary(saved);api.renderDiary();
assert.ok(!el.foodDiaryEntries.innerHTML.includes('<img src=x'));
assert.ok(el.foodDiaryEntries.innerHTML.includes('&lt;img'));
console.log("Food diary: brand, edit grams/meal, exact macros, legacy and cooked oil, invalid/cancel, delete/undo, IDs, XSS PASS");
