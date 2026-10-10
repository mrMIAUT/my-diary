"use strict";
// Regression for compact FatSecret-inspired EPLAN layout; no borrowed assets.
// Exercises the real diary JS with localStorage and browser elements mocked.
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
assert.ok(html.includes("/static/calculator-prototype.js?v=47"),"Safari cache version");
for(const css of [
 ".foodDiaryMealIcon.is-sunrise",".foodDiaryMealIcon.is-day",
 ".foodDiaryMealIcon.is-sunset",".foodDiaryMealIcon.is-snack",
 ".foodDiaryMealSummaryToggle{",".foodDiaryEntryRight{"
])assert.ok(html.includes(css),"Missing compact design "+css);
const start=js.indexOf("function localDayKey(){");
const end=js.indexOf("\n$('foodWeekPrev').addEventListener(",start);
assert.ok(start>=0&&end>start,"Diary source extracted");
const store=new Map(),storageKey="eplan12-food-diary-v1";
const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
let boundToggles=[];
function control(){return {innerHTML:"",textContent:"",value:"",hidden:false,
 setAttribute(){},addEventListener(){},scrollIntoView(){},querySelectorAll:()=>[]}}
const elems=Object.fromEntries([
 "diaryKcal","diaryProtein","diaryFat","diaryCarbs","foodDiaryDate",
 "foodDiaryEntries","foodDiaryNotice","diaryEditGrams","diaryEditMeal",
 "diaryEditError","diaryEditPreview","foodAddStatus"
].map(id=>[id,control()]));
elems.foodDiaryEntries.querySelectorAll=selector=>{
 if(selector!=="[data-diary-meal-toggle]")return [];
 boundToggles=Array.from(elems.foodDiaryEntries.innerHTML.matchAll(
  /data-diary-meal-toggle="([^"]+)"/g),m=>({
   dataset:{diaryMealToggle:m[1]},onclick:null
  }));
 return boundToggles;
};
const $=id=>elems[id]||null;
const foodEsc=x=>String(x??"").replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const foodFmt=x=>Number(x).toLocaleString("uk-UA",{maximumFractionDigits:1});
const ctx=vm.createContext({$,localStorage,foodEsc,foodFmt,FOOD_DIARY_KEY:storageKey,
 Date,Number,Math,console});
vm.runInContext(js.slice(start,end),ctx);
const diary=vm.runInContext("({localDayKey,saveDiary,loadDiary,renderDiary,toggleDiaryMeal,diaryMealGroupHtml})",ctx);
const date=diary.localDayKey();
const breakfast={id:"oats",date,meal:"Сніданок",name:"Вівсянка з молоком",
 brand:"Галичина",grams:200,kcal:165.45,protein:8.14,fat:3.25,carbs:26.7};
const lunch={id:"rice",date,meal:"Обід",name:"Рис",grams:150,
 kcal:180,protein:3.5,fat:.3,carbs:39.3};
assert.equal(diary.saveDiary([breakfast,lunch]),true);
const stored=localStorage.getItem(storageKey);
diary.renderDiary();
assert.equal(elems.diaryKcal.textContent,"345,5");
function mealBlock(meal){
 const h=elems.foodDiaryEntries.innerHTML,p=h.indexOf('data-diary-meal="'+meal+'"');
 return p<0?"":h.slice(h.lastIndexOf("<section",p),h.indexOf("</section>",p)+10);
}
let head=mealBlock("Сніданок");
assert.ok(head.includes('class="foodDiaryMealIcon is-sunrise"'));
assert.ok(mealBlock("Обід").includes('class="foodDiaryMealIcon is-day"'));
assert.ok(mealBlock("Вечеря").includes('class="foodDiaryMealIcon is-sunset"'));
assert.ok(mealBlock("Перекус").includes('class="foodDiaryMealIcon is-snack"'));
assert.equal((head.match(/data-diary-meal-toggle="Сніданок"/g)||[]).length,2,
 "Header and macro strip are both toggles");
assert.ok(head.includes('class="foodDiaryMealSummaryToggle"'));
assert.ok(head.includes('aria-label="Білки: 8,1 грамів"'));
assert.ok(head.includes('aria-label="Жири: 3,3 грамів"'));
assert.ok(head.includes('aria-label="Вуглеводи: 26,7 грамів"'));
assert.ok(head.includes('class="foodDiaryEntryKcal">165,5<small>ккал</small>'));
assert.ok(head.includes('data-diary-edit="oats"'));
assert.ok(head.includes('data-diary-remove="oats"'));
assert.ok(head.includes('200 г'));
assert.ok(head.includes("Галичина"));
assert.ok(!head.includes("продуктів"));
const headerClick=boundToggles.find(b=>b.dataset.diaryMealToggle==="Сніданок");
assert.ok(headerClick&&typeof headerClick.onclick==="function");
headerClick.onclick();
head=mealBlock("Сніданок");
assert.ok(head.includes("is-collapsed"));
assert.ok(head.includes('aria-expanded="false"'));
assert.ok(head.includes('class="foodDiaryMealSummaryToggle"'));
assert.ok(head.includes('aria-label="Білки: 8,1 грамів"'),
 "Folded meal must still show macros");
assert.ok(head.includes("165,5"),"Folded meal must still show calories");
assert.ok(!head.includes("Вівсянка з молоком"),"Folded meal must hide foods");
assert.ok(!head.includes("foodDiaryMealEntries"));
assert.equal(elems.diaryKcal.textContent,"345,5");
assert.equal(localStorage.getItem(storageKey),stored,"Folding is UI only");
const summaryClick=boundToggles.filter(x=>x.dataset.diaryMealToggle==="Сніданок")[1];
assert.ok(summaryClick&&typeof summaryClick.onclick==="function");
summaryClick.onclick();
head=mealBlock("Сніданок");
assert.ok(head.includes("Вівсянка з молоком"));
assert.equal(localStorage.getItem(storageKey),stored);
assert.equal(mealBlock("Вечеря").includes('data-diary-meal-add="Вечеря"'),true);
console.log("Diary tracker layout: daypart icons, kcal aligned, macro strip survives folding, edit/delete and records intact PASS");
