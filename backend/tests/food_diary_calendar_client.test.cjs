"use strict";
// Tests actual EPLAN 1.2 diary history code without modifying production.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
const begin=js.indexOf("function localDayKey(){");
const end=js.indexOf("\n$('foodCalendarToggle').addEventListener(",begin);
assert.ok(begin>=0&&end>begin,"Actual calendar and diary code should be present");
for(const id of ["foodCalendar","foodCalendarToggle","foodDiaryTodayBtn"]){
 assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
}
assert.ok(html.includes(".foodCalendarDot{"),"Green dot styling missing");
assert.ok(html.includes("v=43"),"iPhone asset version wasn't updated");
const store=new Map(),diaryKey="eplan12-food-diary-v1";
const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
const ids=["foodCalendar","foodCalendarToggle","foodDiaryTodayBtn",
 "foodDiaryDayKicker","foodEntryTargetDate","foodDiaryDate",
 "diaryKcal","diaryProtein","diaryFat","diaryCarbs","foodDiaryEntries",
 "foodDiaryNotice","diaryEditGrams","diaryEditMeal","diaryEditError",
 "diaryEditPreview","foodAddStatus","foodMeal","foodGrams"];
const elements=Object.fromEntries(ids.map(id=>[id,{
 textContent:"",innerHTML:"",value:"",hidden:false,
 attrs:{},setAttribute(k,v){this.attrs[k]=v},
 addEventListener(){},querySelectorAll:()=>[],
 scrollIntoView(){},classList:{add(){},remove(){}},
}]));
const $=id=>elements[id]||null;
const foodFmt=n=>Number(n).toLocaleString("uk-UA",{maximumFractionDigits:1});
const foodEsc=x=>String(x??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const ctx=vm.createContext({$,foodFmt,foodEsc,localStorage,
 Date,Number,Math,console,FOOD_DIARY_KEY:diaryKey,
 selectedFood:null,activeFoodProfile:null,foodPrepMeta:null,
 currentPrepValid:true,foodWeightBasis:"raw",currentFoodTotals:null,
 prepModeLabel:()=>""});
vm.runInContext(js.slice(begin,end),ctx);
const api=vm.runInContext("({localDayKey,diaryDateFromKey,diaryDateLabel,diaryCalendarMarkup,loadDiary,saveDiary,renderDiary,toggleFoodCalendar,moveDiaryCalendarMonth,selectDiaryDate,startDiaryEdit,saveDiaryEdit,removeDiaryEntry,undoDiaryRemove,addFoodToDiary})",ctx);
const dayKey=date=>date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
const today=api.localDayKey(),now=api.diaryDateFromKey(today);
const yesterday=dayKey(new Date(now.getFullYear(),now.getMonth(),now.getDate()-1,12));
const tomorrow=dayKey(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,12));
const older="2024-02-29";
const milk=(id,date,grams=200)=>({id,date,meal:"Сніданок",name:"Молоко 2,5%",
 brand:"Галичина",grams,kcal:51.7*grams/100,protein:2.8*grams/100,
 fat:2.5*grams/100,carbs:4.5*grams/100});
const banana=(id,date,grams=150)=>({id,date,meal:"Перекус",name:"Банан",
 grams,kcal:89*grams/100,protein:1.09*grams/100,
 fat:.33*grams/100,carbs:22.84*grams/100});
const initial=[milk("today",today),banana("yesterday",yesterday),
               milk("leap",older,100)];
const saved=()=>JSON.parse(localStorage.getItem(diaryKey)||"[]");
const byId=id=>saved().find(x=>x.id===id);
const val=id=>elements[id].textContent;
assert.equal(api.diaryDateFromKey("2024-02-29").getDate(),29);
for(const invalid of ["2024-02-30","2025-02-29","2026-13-01","2026-00-01",
 "2026-1-01","2026-01-1","xyz",""]){
 assert.equal(api.diaryDateFromKey(invalid),null,invalid);
}
assert.equal(api.diaryDateFromKey("2024-02-29").getHours(),12);
assert.ok(api.saveDiary(initial));
const unchanged=localStorage.getItem(diaryKey);
api.renderDiary();
assert.equal(val("diaryKcal"),"103,4");
assert.equal(elements.foodDiaryTodayBtn.hidden,true);
assert.equal(elements.foodCalendar.hidden,true);
assert.equal(val("foodDiaryDayKicker"),"СЬОГОДНІ");
assert.equal(localStorage.getItem(diaryKey),unchanged,"viewing must not rewrite storage");
// Opening calendar reveals green dots on previously recorded days.
api.toggleFoodCalendar();
assert.equal(elements.foodCalendar.hidden,false);
assert.equal(elements.foodCalendarToggle.attrs["aria-expanded"],"true");
const monthMarkup=elements.foodCalendar.innerHTML;
function hasDot(markup,key){
 const offset=markup.indexOf('data-diary-day="'+key+'"');
 return offset>=0&&markup.slice(Math.max(0,offset-140),offset+90).includes("has-entry");
}
assert.ok(hasDot(monthMarkup,today),"Today's record needs a green dot");
if(yesterday.slice(0,7)===today.slice(0,7)){
 assert.ok(hasDot(monthMarkup,yesterday),"Yesterday's record needs a green dot");
}
assert.equal(api.moveDiaryCalendarMonth(1),false,"Future month forbidden");
assert.equal(api.moveDiaryCalendarMonth(-1),true);
assert.notEqual(elements.foodCalendar.innerHTML,monthMarkup);
assert.equal(api.moveDiaryCalendarMonth(1),true);
assert.equal(localStorage.getItem(diaryKey),unchanged);
// Select yesterday, preserve everything originally stored.
assert.equal(api.selectDiaryDate(yesterday),true);
assert.equal(elements.foodCalendar.hidden,true);
assert.equal(val("foodDiaryDayKicker"),"ІСТОРІЯ ХАРЧУВАННЯ");
assert.equal(elements.foodDiaryTodayBtn.hidden,false);
assert.ok(val("foodEntryTargetDate").includes(api.diaryDateLabel(yesterday)));
assert.equal(val("diaryKcal"),"133,5");
assert.ok(elements.foodDiaryEntries.innerHTML.includes("Банан"));
assert.ok(!elements.foodDiaryEntries.innerHTML.includes("Галичина"));
assert.equal(localStorage.getItem(diaryKey),unchanged);
assert.equal(api.selectDiaryDate(tomorrow),false,"Future dates forbidden");
assert.equal(api.selectDiaryDate("2026-02-30"),false,"Invalid dates forbidden");
// Edit a historical entry; today's and leap day records don't change.
api.startDiaryEdit("yesterday");
elements.diaryEditGrams.value="100";
elements.diaryEditMeal.value="Обід";
assert.equal(api.saveDiaryEdit("yesterday"),true);
assert.equal(val("diaryKcal"),"89");
assert.equal(byId("yesterday").meal,"Обід");
assert.equal(byId("today").kcal,103.4);
assert.equal(byId("leap").grams,100);
assert.equal(api.removeDiaryEntry("today"),false,"Can't delete another date");
assert.equal(api.removeDiaryEntry("yesterday"),true);
assert.equal(val("diaryKcal"),"0");
assert.equal(api.undoDiaryRemove(),true);
assert.equal(val("diaryKcal"),"89");
// When switching dates clear the previous deletion's undo action.
assert.equal(api.removeDiaryEntry("yesterday"),true);
assert.equal(api.selectDiaryDate(today),true);
assert.equal(api.undoDiaryRemove(),false);
assert.equal(val("diaryKcal"),"103,4");
assert.equal(api.selectDiaryDate(yesterday),true);
assert.equal(val("diaryKcal"),"0");
// Add 250g of branded milk yesterday; today's total is untouched.
ctx.selectedFood={name:"Молоко 2,5%",brand:"Галичина",source:"reference",
 source_id:"eplan12-manufacturer-galychyna-milk-25",
 kcal_100:51.7,protein_100:2.8,fat_100:2.5,carbs_100:4.5};
ctx.activeFoodProfile=ctx.selectedFood;
ctx.currentFoodTotals={grams:250,kcal:129.25,protein:7,fat:6.25,carbs:11.25,oil:0};
elements.foodMeal.value="Вечеря";
api.addFoodToDiary();
const added=saved().filter(x=>x.date===yesterday&&x.source_id===ctx.selectedFood.source_id);
assert.equal(added.length,1);
assert.equal(added[0].brand,"Галичина");
assert.equal(val("diaryKcal"),"129,3");
assert.equal(byId("today").kcal,103.4);
// Leap day displays correctly. March navigation is possible.
assert.equal(api.selectDiaryDate(older),true);
api.toggleFoodCalendar();
const feb=elements.foodCalendar.innerHTML;
assert.ok(feb.includes('data-diary-day="2024-02-29"'));
assert.ok(!feb.includes('data-diary-day="2024-02-30"'));
assert.ok(hasDot(feb,"2024-02-29"));
assert.equal(api.moveDiaryCalendarMonth(1),true);
assert.ok(elements.foodCalendar.innerHTML.includes("березня")||
 elements.foodCalendar.innerHTML.includes("березень"));
api.selectDiaryDate(today);
assert.equal(val("diaryKcal"),"103,4");
assert.equal(elements.foodDiaryTodayBtn.hidden,true);
console.log("Food diary history: past dates, green dots, months/leap years, no future, backdated add/edit, delete/undo, totals, original storage PASS");
