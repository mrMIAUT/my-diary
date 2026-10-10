"use strict";
// New UI only: show exact saved per-portion B/J/V and weight beneath foods.
// Uses production diary renderer in an isolated mock browser; no server DB.
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
for(const required of [
 ".foodDiaryEntryNutrition{",".foodDiaryEntryMacro{",
 ".foodDiaryEntryWeight{",".foodDiaryPrep{"
])assert.ok(html.includes(required),"Missing per-food nutrient CSS: "+required);
assert.ok(html.includes("/static/calculator-prototype.js?v=48"),"Updated Safari asset required");
const start=js.indexOf("function localDayKey(){");
const stop=js.indexOf("\n$('foodWeekPrev').addEventListener(",start);
assert.ok(start>=0&&stop>start);
const storageKey="eplan12-food-diary-v1",stored=new Map();
let writes=0;
const localStorage={
 getItem:key=>stored.get(key)||null,
 setItem:(key,value)=>{writes++;stored.set(key,String(value));}
};
const els=Object.fromEntries([
 "diaryKcal","diaryProtein","diaryFat","diaryCarbs",
 "foodDiaryDate","foodDiaryEntries","foodDiaryNotice",
 "diaryEditGrams","diaryEditMeal","diaryEditError","diaryEditPreview"
].map(id=>[id,{innerHTML:"",textContent:"",value:"",
 addEventListener(){},querySelectorAll:()=>[],scrollIntoView(){}}]));
const $=id=>els[id]||null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const fmt=n=>Number(n).toLocaleString("uk-UA",{maximumFractionDigits:1});
const ctx=vm.createContext({$,localStorage,foodEsc:esc,foodFmt:fmt,
 FOOD_DIARY_KEY:storageKey,Math,Date,Number,console});
vm.runInContext(js.slice(start,stop),ctx);
const f=vm.runInContext("({localDayKey,saveDiary,loadDiary,renderDiary,saveDiaryEdit,startDiaryEdit,toggleDiaryMeal,diaryEntryHtml})",ctx);
const today=f.localDayKey();
const potato={
 id:"potato",date:today,meal:"Вечеря",name:"Картопля (сира)",
 grams:200,kcal:154,protein:4.1,fat:.2,carbs:35,
 prep:"Сира · до приготування",brand:""
};
const milk={
 id:"milk",date:today,meal:"Перекус",name:"Молоко 2,5%",
 brand:"Галичина",grams:200,kcal:103.4,protein:5.6,fat:5,carbs:9
};
const old={
 id:"legacy",date:today,meal:"Перекус",name:"Стара позиція",
 grams:120,kcal:120,protein:undefined,fat:undefined,carbs:undefined
};
const yesterday={...potato,id:"yesterday",date:"2001-01-01",kcal:9999};
assert.equal(f.saveDiary([potato,milk,old,yesterday]),true);
const before=stored.get(storageKey),writesBefore=writes;
f.renderDiary();
assert.equal(stored.get(storageKey),before,"Pure display must not rewrite diary");
assert.equal(writes,writesBefore);
const potatoHtml=f.diaryEntryHtml(potato);
assert.ok(potatoHtml.includes('class="foodDiaryEntryNutrition"'));
assert.ok(potatoHtml.includes('<span class="foodDiaryEntryWeight">200 г</span>'));
assert.ok(potatoHtml.includes('aria-label="Білки: 4,1 грамів"'));
assert.ok(potatoHtml.includes('aria-label="Жири: 0,2 грамів"'));
assert.ok(potatoHtml.includes('aria-label="Вуглеводи: 35 грамів"'));
assert.ok(potatoHtml.includes('class="foodDiaryEntryKcal">154<small>ккал</small>'));
assert.ok(potatoHtml.includes('Сира · до приготування'));
assert.ok(potatoHtml.includes('data-diary-edit="potato"'));
assert.ok(potatoHtml.includes('data-diary-remove="potato"'));
const milkHtml=f.diaryEntryHtml(milk);
assert.ok(milkHtml.includes("Галичина"));
assert.ok(milkHtml.includes('<span class="foodDiaryEntryWeight">200 г</span>'));
for(const expected of ["Білки: 5,6 грамів","Жири: 5 грамів","Вуглеводи: 9 грамів"])
 assert.ok(milkHtml.includes(expected),expected);
assert.ok(f.diaryEntryHtml(old).includes("Білки: 0 грамів"),
 "Legacy incomplete records must not display NaN");
assert.equal(els.diaryKcal.textContent,"377,4");
// Collapse hides foods, retains per-meal totals without changing storage.
assert.equal(f.toggleDiaryMeal("Вечеря"),true);
assert.equal(els.foodDiaryEntries.innerHTML.includes('data-diary-entry="potato"'),false);
assert.ok(els.foodDiaryEntries.innerHTML.includes('aria-label="Білки: 4,1 грамів"'));
assert.equal(stored.get(storageKey),before);
assert.equal(f.toggleDiaryMeal("Вечеря"),true);
// Editing recalculates the actual per-food display; data remains unchanged
// until explicit save, and unrelated records and old days stay intact.
f.startDiaryEdit("potato");
els.diaryEditGrams.value="300";
els.diaryEditMeal.value="Вечеря";
assert.equal(f.saveDiaryEdit("potato"),true);
const updated=f.loadDiary().find(x=>x.id==="potato");
assert.equal(updated.grams,300);
assert.equal(updated.kcal,231);
assert.ok(Math.abs(updated.protein-6.15)<1e-8);
assert.ok(Math.abs(updated.fat-.3)<1e-8);
assert.equal(updated.carbs,52.5);
const modifiedHtml=f.diaryEntryHtml(updated);
assert.ok(modifiedHtml.includes('<span class="foodDiaryEntryWeight">300 г</span>'));
assert.ok(modifiedHtml.includes("Білки: 6,2 грамів"));
assert.ok(modifiedHtml.includes("Жири: 0,3 грамів"));
assert.ok(modifiedHtml.includes("Вуглеводи: 52,5 грамів"));
assert.ok(modifiedHtml.includes("231<small>ккал</small>"));
assert.equal(f.loadDiary().find(x=>x.id==="milk").grams,200);
assert.equal(f.loadDiary().find(x=>x.id==="yesterday").kcal,9999);
assert.equal(els.diaryKcal.textContent,"454,4");
const escaped=f.diaryEntryHtml({...milk,id:"unsafe",name:'<img src=x onerror="alert(1)">'});
assert.ok(!escaped.includes('<img src=x'),"HTML injection must remain escaped");
console.log("Per-product BJU: weight, protein/fat/carbs, brand, cooking, kcal, old entries, fold/edit and totals PASS");
