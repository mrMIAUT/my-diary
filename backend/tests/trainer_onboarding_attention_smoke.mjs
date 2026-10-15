// Guard against new clients being marked as "Ризик" before enough workout history exists.
// Run with: node backend/tests/trainer_onboarding_attention_smoke.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const js=fs.readFileSync(path.join(root,'static/js/trainer.js'),'utf8');
const api=fs.readFileSync(path.join(root,'app.py'),'utf8');
const start=js.indexOf('function trainerCompliance(c){');
const end=js.indexOf('function trainerClientInitials(c){');
assert.ok(start>=0&&end>start,'Client status helpers must remain available');
assert.ok(api.includes('"first_standard_finished_at"'),'API must expose the first standard workout');
assert.ok(api.includes('MIN(COALESCE(finished_at,started_at)) FILTER'),'First workout date must be aggregated in SQL');

const sandbox={clientAccess:()=>({
  expired:false,manually_frozen:false,effective_plan:'online',
  plan_code:'online',features:{trainer_review:true}
})};
vm.createContext(sandbox);
vm.runInContext(js.slice(start,end),sandbox,{timeout:2000});

const daysAgo=n=>new Date(Date.now()-n*86400000).toISOString();
const client=(change={})=>({
  status:'Активний',live_status:'Активний',
  created_at:daysAgo(1),first_standard_finished_at:daysAgo(0),
  last_finished_at:daysAgo(0),finished_workout_count:1,
  workouts_28d:1,program_days_count:6,
  needs_review_count:0,checkin_pending_count:0,nutrition_days_7d:0,
  ...change
});
const status=c=>sandbox.trainerAttention(c).level;
const compliance=c=>sandbox.trainerCompliance(c);

assert.equal(status(client()),'new','First training is not a risk');
assert.equal(compliance(client()),null,'First training must not be measured against four weeks');
assert.equal(status(client({created_at:daysAgo(90)})),'new','Old signup does not imply an old training history');
assert.equal(status(client({needs_review_count:1})),'attention','An unreviewed first workout is a coach task, not a risk');
assert.equal(status(client({first_standard_finished_at:null,last_finished_at:null,finished_workout_count:0,workouts_28d:0})),'new');
assert.equal(status(client({created_at:daysAgo(20),first_standard_finished_at:null,last_finished_at:null,finished_workout_count:0,workouts_28d:0})),'new','Signup date cannot determine when a plan was assigned');
assert.equal(status(client({first_standard_finished_at:daysAgo(10),last_finished_at:daysAgo(1)})),'new');
assert.equal(compliance(client({first_standard_finished_at:daysAgo(10),last_finished_at:daysAgo(1)})),null,'The first two weeks are onboarding');
const active=client({created_at:daysAgo(90),first_standard_finished_at:daysAgo(15),
  last_finished_at:daysAgo(1),finished_workout_count:12,workouts_28d:12});
assert.equal(status(active),'ok','Consistent training without food log is not a risk');
assert.ok(compliance(active)>80&&compliance(active)<=100);
assert.equal(status(client({created_at:daysAgo(90),first_standard_finished_at:daysAgo(25),
  last_finished_at:daysAgo(15)})),'risk','Two weeks of inactivity is a real risk');
assert.equal(status(client({created_at:daysAgo(90),first_standard_finished_at:daysAgo(23),
  last_finished_at:daysAgo(8),finished_workout_count:2,workouts_28d:2})),'risk');
assert.equal(status(client({created_at:daysAgo(90),first_standard_finished_at:daysAgo(15),
  last_finished_at:daysAgo(1)})),'attention','Poor adherence after two weeks is a warning, not immediately risk');
assert.equal(status(client({status:'Заморожений'})),'paused');
assert.equal(status(client({live_status:'Тренується'})),'training');
console.log('PASS: trainer onboarding and risk classification');
