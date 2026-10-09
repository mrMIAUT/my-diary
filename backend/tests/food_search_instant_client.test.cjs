"use strict";
// Offline unit tests for instant EPLAN 1.2 local food suggestions.
// Tests real JS helper bodies, with no browser, USDA or OFF calls.
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const source=fs.readFileSync("backend/static/calculator-prototype.js","utf8");
const start=source.indexOf("function foodPreviewNormalize(");
const end=source.indexOf("function warmLocalFoodCatalogue(",start);
assert.ok(start>=0&&end>start,"Local preview helpers must exist");
assert.ok(source.includes("const localPreview=localFoodMatches(q)"),
          "Search must display local suggestions before network completion");
assert.ok(source.includes("warmLocalFoodCatalogue();"),
          "Local catalogue must be preloaded on page entry");
const ctx=vm.createContext({
 foodLocalCatalog:{
  query_replacements:{
   "курица":"курятина",
   "картошка":"картопля",
   "рис басмати":"рис басматі",
   "куриная грудка":"куряча грудка"
  },
  english_aliases:[
   ["курятина","chicken"],
   ["куряча грудка","chicken breast"],
   ["картопля","potato"],
   ["рис","rice"]
  ],
  items:[
   {name:"Куряче філе (сире)",kcal_100:120,approximate:true,
    search_aliases:["Chicken breast, raw","Куриное филе сырое"]},
   {name:"Куряча печінка (сира)",kcal_100:119,approximate:false,
    search_aliases:["Chicken liver, raw","Куриная печень"]},
   {name:"Картопля (сира)",kcal_100:77,approximate:false,
    search_aliases:["Potatoes, raw"]},
   {name:"Рис басматі (сухий)",kcal_100:355,approximate:false,
    search_aliases:["Basmati rice, raw"]},
   {name:"Нут (сухий)",kcal_100:378,approximate:false,
    search_aliases:["Chickpeas, dry"]}
  ]
 }
});
const helpers=vm.runInContext(source.slice(start,end)+
 "\n({foodPreviewNormalize,localFoodMatches})",ctx);
const labels=q=>Array.from(helpers.localFoodMatches(q),x=>x.name);
assert.equal(helpers.foodPreviewNormalize("Курица"),"курятина");
assert.equal(helpers.foodPreviewNormalize("Рис басмати"),"рис басматі");
assert.ok(labels("Курица").includes("Куряче філе (сире)"));
assert.ok(labels("Курица").includes("Куряча печінка (сира)"));
assert.ok(!labels("Курица").includes("Нут (сухий)"));
assert.ok(labels("Chicken breast").includes("Куряче філе (сире)"));
assert.ok(labels("Куриная грудка").includes("Куряче філе (сире)"));
assert.ok(labels("картошка").includes("Картопля (сира)"));
assert.ok(labels("Рис басмати").includes("Рис басматі (сухий)"));
assert.deepEqual(labels("9960041234567"),[]);
assert.deepEqual(labels("Кобра без масла"),[]);
console.log("Instant local food search: multilingual and relevance checks passed.");
