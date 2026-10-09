"use strict";
// First-visit search test: no localStorage and no warmup HTTP requests.
// HTML already contains complete reviewed/approximate local food bootstrap.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const src=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const begin=src.indexOf("let foodItems=[]");
const end=src.indexOf("\nconst PREP_PATTERNS=",begin);
assert.ok(begin>=0&&end>begin);
const chickens=Array.from({length:12},(_,i)=>({
 name:"Куряче філе "+i,source:"reference",source_id:"chicken-"+i,
 kcal_100:120,protein_100:23,fat_100:2.6,carbs_100:0,
 approximate:false,search_aliases:["Chicken breast, raw","Куриное филе сырое"],
}));
const beefs=Array.from({length:10},(_,i)=>({
 name:"Яловича вирізка "+i,source:"reference",source_id:"beef-"+i,
 kcal_100:180,protein_100:22,fat_100:10,carbs_100:0,
 approximate:false,search_aliases:["Beef tenderloin, raw","Говяжья вырезка сырая"],
}));
const potato=Array.from({length:5},(_,i)=>({
 name:"Картопля "+i,source:"reference",source_id:"potato-"+i,
 kcal_100:77,protein_100:2,fat_100:0,carbs_100:17,
 approximate:false,search_aliases:["Potato raw","Картофель сырой"],
}));
const bootstrap={items:[...chickens,...beefs,...potato],
 query_replacements:{"курица":"курятина","говядина":"яловичина"},
 english_aliases:[["курятина","chicken"],["яловичина","beef"]],preliminary:true};
let networkCount=0;
const storage={};
const localStorage={
 getItem:k=>storage[k]??null,
 setItem:(k,v)=>{storage[k]=v},
};
const domIds=["foodResults","foodPortion","foodStatus",
 "foodMoreBtn","foodSearchBtn","foodQuery"];
const elements=Object.fromEntries(domIds.map(id=>[id,{
 value:"",innerHTML:"",textContent:"",hidden:false,disabled:false,
 classList:{add(){},remove(){}},
 querySelectorAll:()=>[],
}]));
const document={
 getElementById(id){
  if(id==="eplan-local-food-catalog-bootstrap")return {
   textContent:JSON.stringify(bootstrap)
  };
  return elements[id]??null;
 }
};
const $=id=>{
 assert.ok(elements[id],"Unknown fake element "+id);
 return elements[id];
};
const ctx=vm.createContext({
 $,document,localStorage,Date,Intl,URL,console,setTimeout,
 fetch:async()=>{networkCount++;throw Error("Unexpected network request")},
});
vm.runInContext(src.slice(begin,end),ctx);
const api=vm.runInContext("({searchFoods,localFoodMatches})",ctx);
const state=()=>vm.runInContext("({stage:foodSearchStage,items:foodItems.map(x=>x.name)})",ctx);
(async()=>{
 assert.equal(vm.runInContext("foodLocalCatalog.items.length",ctx),27);
 assert.equal(vm.runInContext("foodLocalLoadPromise",ctx),null);
 assert.ok(storage["eplan12-local-food-catalog-v1"]);
 await api.searchFoods("Курица");
 assert.equal(networkCount,0);
 assert.equal(state().stage,"local");
 assert.ok(state().items.some(x=>x.startsWith("Куряче")));
 await api.searchFoods("Говядина");
 assert.equal(networkCount,0);
 assert.equal(state().stage,"local");
 assert.ok(state().items.some(x=>x.startsWith("Яловича")));
 await api.searchFoods("Курица");
 assert.equal(networkCount,0);
 assert.equal(state().stage,"local");
 console.log("First-visit inline food bootstrap: RU chicken, beef, repeat query without HTTP PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
