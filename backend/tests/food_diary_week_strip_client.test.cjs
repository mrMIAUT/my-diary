"use strict";
// EPLAN 1.2 seven-day calendar: actual JS functions, mocked DOM and storage.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const js=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const html=fs.readFileSync("backend/static/calculator-prototype.html","utf8");
assert.ok(html.includes('id="foodDiaryWeekDays"'),"Seven day row missing");
assert.ok(html.includes('id="foodWeekPrev"'),"Previous week arrow missing");
assert.ok(html.includes('id="foodWeekNext"'),"Next week arrow missing");
assert.ok(html.includes(".foodWeekDayCircle{"),"Circular day CSS missing");
assert.ok(html.includes(".foodWeekDay.is-selected .foodWeekDayCircle{"),"Selected day contrast missing");
assert.ok(html.includes(".foodWeekDay.has-entry:not(.is-selected)"),"Logged day highlighting missing");
assert.ok(html.includes("/static/calculator-prototype.js?v=44"),"Safari asset cache version not bumped");
const a=js.indexOf("function localDayKey(){");
const b=js.indexOf("\n$('foodWeekPrev').addEventListener(",a);
assert.ok(a>=0&&b>a,"Actual diary functions missing");
const diaryKey="eplan12-food-diary-v1",store=new Map();
const localStorage={getItem:k=>store.get(k)||null,
 setItem:(k,v)=>store.set(k,String(v))};
const elements={},boundDays=[];
function control(){return {textContent:"",innerHTML:"",value:"",hidden:false,disabled:false,
 attrs:{},setAttribute(k,v){this.attrs[k]=v},querySelectorAll:()=>[],
 addEventListener(){},scrollIntoView(){}}}
for(const id of ["foodDiaryWeekDays","foodDiaryWeekTitle","foodWeekPrev","foodWeekNext",
 "foodCalendar","foodCalendarToggle","foodDiaryTodayBtn","foodDiaryDayKicker",
 "foodEntryTargetDate","foodAddStatus","foodDiaryDate","diaryKcal","diaryProtein",
 "diaryFat","diaryCarbs","foodDiaryEntries","foodDiaryNotice"])elements[id]=control();
elements.foodDiaryWeekDays.querySelectorAll=selector=>{
 if(selector!=="[data-diary-week-day]")return [];
 boundDays.length=0;
 for(const m of elements.foodDiaryWeekDays.innerHTML.matchAll(/data-diary-week-day="([^"]+)"/g)){
  boundDays.push({dataset:{diaryWeekDay:m[1]},handlers:{},
   addEventListener(event,handler){this.handlers[event]=handler}});
 }
 return boundDays;
};
const $=id=>elements[id]||null;
const foodEsc=x=>String(x??"").replace(/[&<>"']/g,ch=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const foodFmt=x=>Number(x).toLocaleString("uk-UA",{maximumFractionDigits:1});
const ctx=vm.createContext({$,localStorage,FOOD_DIARY_KEY:diaryKey,
 Date,Number,Math,console,foodEsc,foodFmt});
vm.runInContext(js.slice(a,b),ctx);
const api=vm.runInContext("({localDayKey,diaryDateFromKey,diaryWeekMonday,diaryWeekLabel,diaryWeekMarkup,renderDiaryWeekStrip,moveDiaryWeek,selectDiaryDate,renderDiary,saveDiary})",ctx);
const today=api.localDayKey(),monday=api.diaryWeekMonday(today);
const toKey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const lastMonday=api.diaryDateFromKey(monday);
lastMonday.setDate(lastMonday.getDate()-7);
const previousMonday=toKey(lastMonday);
const records=[
 {id:"now",date:today,meal:"Обід",name:"Рис",grams:100,
  kcal:120,protein:2,fat:.3,carbs:25},
 {id:"prev",date:previousMonday,meal:"Сніданок",name:"Молоко",grams:100,
  kcal:51.7,protein:2.8,fat:2.5,carbs:4.5}
];
assert.ok(api.saveDiary(records));
const raw=localStorage.getItem(diaryKey);
api.renderDiary();
assert.equal(elements.diaryKcal.textContent,"120");
assert.equal((elements.foodDiaryWeekDays.innerHTML.match(/class="foodWeekDay/g)||[]).length,7);
assert.equal(boundDays.length,7);
assert.ok(elements.foodDiaryWeekTitle.textContent);
assert.equal(elements.foodWeekNext.disabled,true,"Can't move beyond current week");
assert.equal(elements.foodWeekPrev.disabled,false);
function dayMarkup(key){
 const h=elements.foodDiaryWeekDays.innerHTML,p=h.indexOf('data-diary-week-day="'+key+'"');
 return p<0?"":h.slice(h.lastIndexOf("<button",p),h.indexOf("</button>",p)+9);
}
assert.ok(dayMarkup(today).includes("is-selected"));
assert.ok(dayMarkup(today).includes("has-entry"));
assert.ok(dayMarkup(today).includes('aria-pressed="true"'));
assert.equal(api.moveDiaryWeek(1),false);
assert.equal(localStorage.getItem(diaryKey),raw);
assert.equal(api.moveDiaryWeek(-1),true);
assert.equal(elements.foodWeekNext.disabled,false);
assert.ok(elements.foodDiaryWeekDays.innerHTML.includes('data-diary-week-day="'+previousMonday+'"'));
assert.equal(elements.diaryKcal.textContent,"0");
assert.equal(localStorage.getItem(diaryKey),raw);
const mondayButton=boundDays[0];
assert.equal(mondayButton.dataset.diaryWeekDay,previousMonday);
assert.equal(typeof mondayButton.handlers.click,"function");
mondayButton.handlers.click();
assert.equal(elements.diaryKcal.textContent,"51,7");
assert.ok(dayMarkup(previousMonday).includes('aria-pressed="true"'));
assert.equal(localStorage.getItem(diaryKey),raw);
assert.equal(api.moveDiaryWeek(1),true);
assert.equal(elements.diaryKcal.textContent,"0");
assert.equal(elements.foodWeekNext.disabled,true);
// Monday-first weeks and leap year/month boundaries.
assert.equal(api.diaryWeekMonday("2024-02-29"),"2024-02-26");
assert.equal(api.diaryWeekMonday("2026-10-01"),"2026-09-28");
const crossing=api.diaryWeekLabel("2026-09-28");
assert.ok(crossing.includes("вересня")&&crossing.includes("жовтня"));
assert.equal(api.diaryWeekMonday("2026-10-04"),"2026-09-28");
assert.equal(api.diaryWeekMonday("2026-10-05"),"2026-10-05");
assert.equal(api.selectDiaryDate(today),true);
const d=api.diaryDateFromKey(today);
d.setDate(d.getDate()+1);
const tomorrow=toKey(d);
if(api.diaryWeekMonday(tomorrow)===monday)
 assert.ok(dayMarkup(tomorrow).includes('disabled aria-disabled="true"'));
assert.equal(localStorage.getItem(diaryKey),raw);
console.log("Food diary week strip: circles, green dots, real taps, week arrows, boundaries, no future, no data edits PASS");
