// Pure deterministic nutrition portion fitter for the isolated Є ПЛАН demo.
// It optimizes ONLY the inserted dish against the remaining daily goal, never
// silently changes the already-edited other meals. No network or persistence.
(function(){
'use strict';
const MACROS=['kcal','protein','fat','carbs'];
const KEYS=['kcal_100','protein_100','fat_100','carbs_100'];
const WEIGHTS=[1.6,2.6,2.1,1.4];
const EPS=1e-10;
const copy=o=>JSON.parse(JSON.stringify(o));
function sumRows(rows,catalog){
 const total=[0,0,0,0];
 const byId=new Map(catalog.map(f=>[f.source_id,f]));
 for(const row of rows||[]){
  if(row.count_in_targets===false)continue;
  const food=byId.get(row.source_id);
  if(!food)throw Error('Unknown nutrition source: '+row.source_id);
  for(let j=0;j<4;j++)total[j]+=Number(food[KEYS[j]]||0)*Number(row.grams||0)/100;
 }
 return total;
}
function goalVector(goal){return MACROS.map(k=>Number(goal?.[k]||0))}
function assess(actual,goal){
 const diff=actual.map((v,i)=>v-goal[i]);
 const percent=diff.map((v,i)=>goal[i]>0?100*v/goal[i]:0);
 const limits=[10,15,20,15];
 return {diff:Object.fromEntries(MACROS.map((key,i)=>[key:+diff[i].toFixed(1)])),
  pct:Object.fromEntries(MACROS.map((key,i)=>[key:+percent[i].toFixed(1)])),
  within_tolerance:percent.every((p,i)=>Math.abs(p)<=limits[i]),
  limits_pct:Object.fromEntries(MACROS.map((key,i)=>[key,limits[i]]))};
}
function fit(recipe,remaining,goal,catalog){
 if(!recipe?.foods?.length)throw Error('Recipe ingredients are missing');
 const reference=copy(recipe.foods);
 const byId=new Map(catalog.map(f=>[f.source_id,f]));
 const entries=reference.map((r,i)=>{
  const f=byId.get(r.source_id);if(!f)throw Error('Missing approved food source '+r.source_id);
  const cfg=r.portion_rules||{};
  const egg=f.unit==='pcs';
  const size=egg?Number(f.grams_per_piece||50):1;
  const min=egg?Math.max(1,Math.ceil(Number(cfg.min_grams??50)/size))*size:
   Math.max(1,Number(cfg.min_grams??(f.name.includes('Оливкова олія')?3:30)));
  const max=egg?Math.min(8,Math.floor(Number(cfg.max_grams??400)/size))*size:
   Math.max(min,Number(cfg.max_grams??2000));
  const step=egg?size:Math.max(1,Number(cfg.step_grams??5));
  const start=Number(r.grams)||min;
  const clamp=g=>Math.max(min,Math.min(max,min+Math.round((g-min)/step)*step));
  return {row:r,f,min,max,step,original:clamp(start),egg,clamp,index:i};
 });
 const current=entries.map(e=>e.original);
 // Compare the new meal with exact *remaining* daily calories and macros.
 // Normalise by daily targets, not residuals (may be negative).
 function error(values){
  const totals=[0,0,0,0];
  let portion=0;
  for(let i=0;i<values.length;i++){
   const e=entries[i],v=values[i],f=e.f;
   if(e.row.count_in_targets!==false){
    for(let j=0;j<4;j++)totals[j]+=Number(f[KEYS[j]]||0)*v/100;
   }
   // Stronger penalty for implausible scaling, while allowing meaningful fit.
   const rel=(v-e.original)/Math.max(40,e.original);
   portion+=0.018*rel*rel;
  }
  let score=portion;
  for(let j=0;j<4;j++){
   const denom=Math.max([180,20,15,35][j],goal[j]);
   const diff=(totals[j]-remaining[j])/denom;
   score+=WEIGHTS[j]*diff*diff;
  }
  return score;
 }
 for(let round=0;round<12;round++){
  let changed=false;
  for(let i=0;i<entries.length;i++){
   const e=entries[i],trial=current.slice();
   let best=current[i],bestScore=error(current);
   const upper=e.min+Math.floor((e.max-e.min)/e.step)*e.step;
   for(let v=e.min;v<=upper;v+=e.step){
    if(v===current[i])continue;
    trial[i]=v;
    const score=error(trial);
    if(score<bestScore-EPS){
     best=v;bestScore=score;
    }
   }
   if(best!==current[i]){current[i]=best;changed=true}
  }
  if(!changed)break;
 }
 const foods=entries.map((e,i)=>({
  ...e.row,grams:current[i],count:e.egg?current[i]/Number(e.f.grams_per_piece||50):null,
  portion_rules:{
   min_grams:e.min,max_grams:e.max,step_grams:e.step
  }
 }));
 const meal=sumRows(foods,catalog);
 const daily=meal.map((x,i)=>x+(goal[i]-remaining[i]));
 return {foods,meal:Object.fromEntries(MACROS.map((k,i)=>[k:+meal[i].toFixed(1)])),
  day:Object.fromEntries(MACROS.map((k,i)=>[k:+daily[i].toFixed(1)])),
  remaining:Object.fromEntries(MACROS.map((k,i)=>[k:+remaining[i].toFixed(1)])),
  ...assess(daily,goal),score:error(current)};
}
window.NutritionPortionFitter={fit,sumRows,assess,goalVector,macroKeys:MACROS};
})();
