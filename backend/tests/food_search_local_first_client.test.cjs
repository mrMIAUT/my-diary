"use strict";
// Execute the real client search functions with a fake browser and network.
// Ensures an existing local match never waits for USDA / OFF.
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const src=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const a=src.indexOf("let foodItems=[]");
const b=src.indexOf("\nconst PREP_PATTERNS=",a);
assert.ok(a>=0&&b>a,"Search client block must exist");
const products=Array.from({length:12},(_,i)=>({
 name:"Куряче філе "+i,source:"reference",
 source_id:i===0?"eplan12-fdc-123":"local-"+i,
 source_fdc_id:i===0?123:undefined,
 kcal_100:120+i,protein_100:23,fat_100:2.6,carbs_100:0,
 approximate:false,search_aliases:["Курятина","Chicken breast"],
}));
const decoys=Array.from({length:14},(_,i)=>({
 name:"Картопля "+i,source:"reference",source_id:"potato-"+i,
 kcal_100:77,protein_100:2,fat_100:0,carbs_100:17,
 approximate:false,search_aliases:["Potatoes"],
}));
const catalogue={savedAt:Date.now(),items:[...products,...decoys],
 query_replacements:{"курица":"курятина"},
 english_aliases:[["курятина","chicken"]]};
const store={"eplan12-local-food-catalog-v1":JSON.stringify(catalogue)};
const localStorage={
 getItem:key=>store[key]??null,
 setItem:(key,value)=>{store[key]=value},
};
const elementIds=["foodResults","foodPortion","foodStatus",
                  "foodMoreBtn","foodSearchBtn","foodQuery"];
const elements=Object.fromEntries(elementIds.map(id=>[id,{
 value:"",textContent:"",innerHTML:"",hidden:false,disabled:false,
 classList:{remove(){},add(){}},
 querySelectorAll:()=>[],
}]));
const $=id=>{
 assert.ok(elements[id],"Missing fake element "+id);
 return elements[id];
};
const requests=[];
const networkResponse=(q,page)=>{
 if(q==="Відсутній"){
  return {items:[{name:"External food",source:"off",
   source_id:"off-1",kcal_100:25,protein_100:1,fat_100:0,carbs_100:5}],
   has_more:false};
 }
 if(/^\d{8,14}$/.test(q))return {items:[],has_more:false};
 if(page===1)return {items:[
  {name:"Chicken duplicate",source:"usda",source_id:123,
   kcal_100:120,protein_100:23,fat_100:2.6,carbs_100:0},
  {name:"Новий бренд",source:"off",source_id:"off-2",
   kcal_100:150,protein_100:19,fat_100:5,carbs_100:1},
 ],has_more:true};
 return {items:[{
  name:"Інший бренд",source:"off",source_id:"off-3",
  kcal_100:145,protein_100:12,fat_100:7,carbs_100:1,
 }],has_more:false};
};
async function fetch(url){
 requests.push(url);
 if(url.includes("local-catalog"))throw Error("Warm preload was not needed");
 const u=new URL(url,"https://eplan.test");
 const result=networkResponse(u.searchParams.get("q"),Number(u.searchParams.get("page")));
 return {ok:true,json:async()=>result};
}
const ctx=vm.createContext({$,localStorage,fetch,console,
 setTimeout,Date,Intl,URL});
vm.runInContext(src.slice(a,b),ctx);
const api=vm.runInContext("({searchFoods,localFoodMatches})",ctx);
const state=()=>vm.runInContext("({names:foodItems.map(x=>x.name),shown:foodLocalShown,stage:foodSearchStage,page:foodRemotePage,hasMore:foodHasMore,selected:selectedFood&&selectedFood.name})",ctx);

(async()=>{
 // Initial local matches are synchronous from localStorage; the async
 // search method must not call the full endpoint.
 await api.searchFoods("Курица");
 assert.equal(requests.length,0);
 assert.equal(state().names.length,8);
 assert.equal(state().stage,"local");
 assert.equal(elements.foodMoreBtn.hidden,false);

 // First click shows the four remaining local foods without HTTP calls.
 vm.runInContext("selectedFood=foodItems[0]",ctx);
 elements.foodPortion.innerHTML="selected portion";
 await api.searchFoods("Курица",true);
 assert.equal(requests.length,0);
 assert.equal(state().names.length,12);
 assert.equal(state().selected,products[0].name);
 assert.equal(elements.foodPortion.innerHTML,"selected portion");

 // Only after exhausting local products does Show More contact OFF/USDA.
 await api.searchFoods("Курица",true);
 assert.equal(requests.length,1);
 assert.match(requests[0],/page=1/);
 // The same USDA FDC ID must not be duplicated across data sources.
 assert.equal(state().names.length,13);
 assert.ok(state().names.includes("Новий бренд"));
 assert.ok(!state().names.includes("Chicken duplicate"));
 assert.equal(state().selected,products[0].name);
 assert.equal(elements.foodPortion.innerHTML,"selected portion");

 await api.searchFoods("Курица",true);
 assert.equal(requests.length,2);
 assert.match(requests[1],/page=2/);
 assert.equal(state().names.length,14);
 assert.equal(state().hasMore,false);

 // If our own catalogue has no matches, the external search starts
 // automatically on Search; it doesn't wait for Show More.
 await api.searchFoods("Відсутній");
 assert.equal(requests.length,3);
 assert.equal(state().stage,"remote");
 assert.deepEqual(Array.from(state().names),["External food"]);

 // Barcode lookup bypasses local products and retains the API behavior.
 await api.searchFoods("4820045702266");
 assert.equal(requests.length,4);
 assert.match(requests[3],/q=4820045702266/);

 console.log("Local-first UI: no external wait, pagination, FDC dedupe, fallback, barcode, selection PASS");
})().catch(err=>{console.error(err);process.exitCode=1});
