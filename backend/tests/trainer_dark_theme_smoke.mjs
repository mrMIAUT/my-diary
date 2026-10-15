// Focused trainer-dark theme regression smoke — no account or database required.
// Run with: node backend/tests/trainer_dark_theme_smoke.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','static');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const style=read('css/trainer-dark.css');
const index=read('index.html');
const sw=read('sw.js');
const trainer=read('js/trainer.js');
const theme=read('js/theme.js');
new vm.Script(trainer);
new vm.Script(theme);

assert.ok(style.includes('body.eplan-redesign.trainer-ui[data-eplan-theme="dark"]'));
assert.equal((style.match(/\{/g)||[]).length,(style.match(/\}/g)||[]).length);
assert.ok(style.includes('.trainer-bottom-nav'));
assert.ok(style.includes('.trainer-client-row'));
assert.ok(style.includes('.trainer-program-editor'));
assert.ok(style.includes('.trainer-review-card'));
assert.ok(style.includes('.trainer-nutrition-target-card'));
assert.ok(style.includes('.trainer-library-group'));
assert.ok(style.includes('.trainer-theme-settings .eplan-theme-option'));
assert.ok(style.includes('.trainer-smart-status.risk'));
assert.ok(style.includes('v2 — iPhone QA'));
assert.ok(style.includes('v3 — shared graphite system'));
for(const token of ['--trainer-dark-bg:#101114','--trainer-dark-surface:#1c1e23','--trainer-dark-raised:#282b31','--trainer-dark-border:#353840','--trainer-dark-text:#f3f4f6']){
  assert.ok(style.includes(token),'Missing graphite palette token: '+token);
}
assert.ok(style.includes('.trainer-bottom-nav button.active'));
assert.ok(style.includes('.trainer-nutrition-page .nutrition-menu-meal-v2'));
assert.ok(style.includes('.trainer-client-page #profile>.card'));

for(const marker of ['.trainer-template-toolbar.modern','.trainer-nutrition-target-summary>div','.nutrition-menu-total-v6','.trainer-client-page #profile>.card','.trainer-nutrition-summary strong']){
  assert.ok(style.includes(marker),'Missing contrast repair: '+marker);
}
assert.ok(!/body\.eplan-redesign\.client-ui/.test(style),'Trainer overrides cannot leak into client screens');
assert.match(trainer,/function showTrainerThemeSettings\(/);
assert.match(trainer,/onclick="showTrainerThemeSettings\(\)"/);
for(const shell of [index,sw]){
  assert.ok(shell.includes('/static/css/trainer-dark.css?v=3'));
  assert.ok(shell.includes('/static/js/theme.js?v=2'));
  assert.ok(shell.includes('/static/js/trainer.js?v=319'));
}
assert.ok(sw.includes("const VERSION='eplan-v226'"));

const stored=new Map();
const media={matches:false,addEventListener(){}};
const meta={content:''};
const els=['light','dark','system'].map(mode=>({dataset:{mode},setAttribute(k,v){this[k]=v}}));
const body={dataset:{},classList:{contains(name){return name==='trainer-ui'}}};
const ctx={
  window:{matchMedia:()=>media},
  document:{body,querySelector:()=>meta,querySelectorAll:()=>els,addEventListener(){}},
  localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
  MutationObserver:class{observe(){}},
};
vm.createContext(ctx);
vm.runInContext(theme,ctx,{timeout:1500});
assert.equal(body.dataset.eplanTheme,'light');
ctx.window.eplanSetTheme('dark');
assert.equal(body.dataset.eplanTheme,'dark');
assert.equal(meta.content,'#0b1117');
assert.equal(els[1]['aria-checked'],'true');
ctx.window.eplanSetTheme('light');
assert.equal(body.dataset.eplanTheme,'light');
ctx.window.eplanSetTheme('system');
media.matches=true;
ctx.window.eplanSetTheme('system');
assert.equal(body.dataset.eplanTheme,'dark');
console.log('PASS: trainer dark theme scope, theme picker and PWA assets');
