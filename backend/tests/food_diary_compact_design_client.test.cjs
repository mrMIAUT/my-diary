"use strict";
// Non-destructive UI regression for compact meals and one-tap add workflow.
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
for(const selector of [
 "foodDiaryDaySummary","foodDiaryDailyKcal","foodDiaryDailyMacros",
 "foodDiaryMealAdd","foodDiaryEditBtn"
])assert.ok(html.includes(selector)||js.includes(selector),"Missing "+selector);
assert.ok(html.includes("/static/calculator-prototype.js?v=46"),"iOS browser assets must refresh");
assert.ok(!html.includes('ПІДСУМОК ЗА ДЕНЬ'),"Duplicated summary caption removed");
const start=js.indexOf("function localDayKey(){");
const end=js.indexOf("\n$('foodWeekPrev').addEventListener(",start);
assert.ok(start>=0&&end>start);
const savedData=[];
let stored=JSON.stringify(savedData),lastFocus=null,scrolls=0,bound=[];
const entries={innerHTML:"",querySelectorAll(selector){
 if(selector==="[data-diary-meal-add]"){
  bound=Array.from(this.innerHTML.matchAll(/data-diary-meal-add="([^"]+)"/g),
    m=>({dataset:{diaryMealAdd:m[1]},onclick:null}));
  return bound;
 }
 return [];
}};
const ids=["diaryKcal","diaryProtein","diaryFat","diaryCarbs","foodDiaryDate",
 "foodDiaryEntries","foodDiaryNotice"];
const controls=Object.fromEntries(ids.map(id=>[id,{textContent:"",innerHTML:"",
 addEventListener(){},querySelectorAll:()=>[]}]));
controls.foodDiaryEntries=entries;
const foodQuery={focus(options){lastFocus=options},scrollIntoView(){scrolls++},value:""};
const foodMeal={value:"Сніданок"};
const $=id=>id==="foodQuery"?foodQuery:id==="foodMeal"?foodMeal:
 controls[id]||null;
const localStorage={getItem:()=>stored,setItem:(k,v)=>{stored=v}};
const foodEsc=value=>String(value??"").replace(/[&<>"]/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
}[c]));
const foodFmt=x=>Number(x).toLocaleString("uk-UA",{maximumFractionDigits:1});
const ctx=vm.createContext({$,localStorage,foodEsc,foodFmt,
 FOOD_DIARY_KEY:"eplan12-food-diary-v1",foodPreferredMeal:"Сніданок",
 console,Date,Math});
vm.runInContext(js.slice(start,end),ctx);
const api=vm.runInContext("({renderDiary,selectMealForFoodSearch})",ctx);
api.renderDiary();
assert.equal((entries.innerHTML.match(/class="foodDiaryMeal is-empty"/g)||[]).length,4);
assert.equal((entries.innerHTML.match(/data-diary-meal-add=/g)||[]).length,4);
assert.equal(controls.diaryKcal.textContent,"0");
const buttons=bound;
assert.deepEqual(buttons.map(b=>b.dataset.diaryMealAdd),
 ["Сніданок","Обід","Вечеря","Перекус"]);
// Click the real bound handler; it must never initiate an external search.
assert.equal(typeof buttons[3].onclick,"function");
buttons[3].onclick();
assert.equal(ctx.foodPreferredMeal,"Перекус");
assert.equal(foodMeal.value,"Перекус");
assert.equal(scrolls,1);
assert.equal(lastFocus.preventScroll,true);
assert.equal(api.selectMealForFoodSearch("Випадкове"),false);
assert.equal(ctx.foodPreferredMeal,"Перекус");
assert.equal(stored,JSON.stringify(savedData),"UI navigation must never touch diary storage");
console.log("Compact food diary: four meal add shortcuts, preselected meal, focus, compact totals, no localStorage changes PASS");
