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
assert.ok(style.includes('v4 — trainer dark contrast repairs from iPhone QA'));
assert.ok(style.includes('v5 — iPhone trainer dark-theme follow-up'));
assert.ok(style.includes('v6 — trainer iPhone QA'));
assert.ok(style.includes('v7 — trainer graphite polish'));
assert.ok(style.includes('v8 — neutralize accidental inherited container paints'));
assert.ok(style.includes('v9 — trainer graphite clean-up'));
assert.ok(style.includes('v10 — trainer template editor and library graphite cleanup'));
assert.ok(style.includes('v11 — trainer assigned meal icons and client progress graphite polish'));
assert.ok(style.includes('v12 — separated home avatars + one optically centered SVG Back button'));
assert.ok(style.includes('v13 — new-client nutrition targets'));
assert.ok(style.includes('v14 — Library taxonomy admin'));
assert.ok(style.includes('v15 — final trainer dark QA'));
for(const selector of [
  '.trainer-library-page .library-muscle-picker>div{',
  '.trainer-library-page .library-check-grid label:has(input:checked){',
  '.trainer-nutrition-page .trainer-nutrition-summary .trainer-stat-icon.green{',
  '.trainer-nutrition-page .trainer-nutrition-summary .trainer-stat-icon.orange{',
  '.trainer-nutrition-page .trainer-nutrition-summary .trainer-stat-icon.blue{',
  '#trainerPendingReviewQueue .trainer-review-toggle{',
  '#trainerPendingReviewQueue .trainer-review-main strong{',
  '#trainerPendingReviewQueue .trainer-review-comment textarea{',
  '#trainerPendingReviewQueue .trainer-review-actions button.dark{'
])assert.ok(style.includes(selector),'Missing trainer dark QA style: '+selector);

for(const selector of [
  '.trainer-library-page .trainer-library-admin-body{',
  '.trainer-library-page .trainer-library-admin-section-head strong{',
  '.trainer-library-page .trainer-library-admin-form input{',
  '.trainer-library-page .library-muscle-admin-list>div{',
  '.trainer-library-page .library-muscle-admin-list>div>span{',
  '.trainer-library-page .library-muscle-admin-list>div>.library-delete-btn{'
])assert.ok(style.includes(selector),'Missing dark library taxonomy styling: '+selector);
assert.ok(style.includes('pointer-events:none;'));

for(const selector of [
  '.trainer-new-client-modal .trainer-new-client-section{',
  '.trainer-new-client-modal .trainer-new-client-section-head strong{',
  '.trainer-new-client-macros label>span',
  '.trainer-new-client-modal .trainer-new-client-macros input{',
  '.trainer-new-client-modal .trainer-new-client-macros input::placeholder{',
  '.trainer-new-client-modal .trainer-new-client-macros input:focus{'
])assert.ok(style.includes(selector),'Missing dark add-client nutrition style: '+selector);
assert.ok(style.includes('.trainer-home-page .trainer-hero-card .trainer-avatar-stack>.trainer-client-avatar'));
assert.ok(style.includes('.trainer-client-navline button.trainer-back-button'));
assert.ok(style.includes('.trainer-theme-settings button.trainer-back-button'));
assert.ok(read('js/core.js').includes("'chevron-left':'<path"));
assert.ok(trainer.includes("uiIcon('chevron-left')"));
assert.ok(read('js/library.js').includes("uiIcon('chevron-left')"));

for(const selector of [
  '.nutrition-menu-meal-v2 .nutrition-meal-icon-breakfast',
  '.nutrition-menu-meal-v2 .nutrition-meal-icon-lunch',
  '.nutrition-menu-meal-v2 .nutrition-meal-icon-dinner',
  '.trainer-progress-summary>div',
  '.trainer-progress-activity-stats>div',
  '.trainer-progress-activity-list>div',
  '.trainer-progress-pr-card',
  '.trainer-workout-calendar-nav>button',
  '.trainer-volume-muscle-row>div'
])assert.ok(style.includes(selector),'Missing v11 graphite selector: '+selector);

for(const selector of [
  '.trainer-template-editor-day-head{',
  '.trainer-template-editor-grid>label',
  '.trainer-library-page .trainer-library-summary strong',
  '.trainer-library-page .trainer-library-filter-chip',
  '.trainer-library-page .trainer-library-toggle-meta',
  '.trainer-library-page .trainer-library-video .redesign-library-video',
  '.trainer-library-page .library-edit-btn'
])assert.ok(style.includes(selector),'Missing v10 graphite selector: '+selector);
const library=read('js/library.js');
new vm.Script(library);
assert.ok(!library.includes('border:1px solid #dce5f1!important;border-radius:999px!important;background:#fff!important;color:#22324c!important;'),'Library chips must not hard-code important white color');

for(const selector of [
  '#accessEditBox.access-edit-box',
  '#notificationModal .notification-item.unread',
  '.trainer-more-list.modern .trainer-more-item',
  '.trainer-profile-collapsed-stats>div',
  '.trainer-profile-editor-stats>div',
  '.trainer-avatar-upload>span',
  '.trainer-saved-plan-actions button'
])assert.ok(style.includes(selector),'Missing v9 dark UI: '+selector);
const core=read('js/core.js');
new vm.Script(core);
assert.ok(core.includes("settings:'<circle cx="), 'Missing settings icon definition');
assert.ok(trainer.includes("uiIcon('settings')"), 'Theme settings menu icon not used');

for(const selector of [
  '#dayTitleModal .trainer-day-title-card .trainer-day-title-field',
  '.trainer-client-page .trainer-exercise-head :is(',
  '.trainer-client-page #nutrition .trainer-nutrition-target-actions',
  '#trainerNutritionCalcModal .trainer-nutrition-calc-card',
  '#structuredFoodPicker .structured-picker',
  '#structuredFoodPicker #structuredFoodMatches button'
])assert.ok(style.includes(selector),'Missing graphite v8: '+selector);

for(const selector of [
  '#dayTitleModal>.trainer-day-title-card',
  '.trainer-extra-day-modal-card .trainer-extra-day-note',
  '.trainer-client-page #nutrition .structured-food-name',
  '.trainer-client-page #nutrition .structured-remove',
  '.trainer-client-page #nutrition .structured-daily-summary',
  '.trainer-client-page #nutrition .structured-veg-opt input[type="checkbox"]'
])assert.ok(style.includes(selector),'Missing graphite v7: '+selector);

for(const selector of [
  '#editExerciseModal>.edit-exercise-card',
  '.trainer-program-editor .trainer-program-editor-grid>label',
  '.trainer-measurements-page .measurement-place-top>.measurement-generated-art',
  '.trainer-measurements-page .measurement-history-calendar-toggle',
  '.trainer-measurements-page .measurement-calendar-day.active',
  '.trainer-client-page .trainer-checkin-history-head>span'
]){
  assert.ok(style.includes(selector),'Missing trainer-dark v6 selector: '+selector);
}

for(const selector of [
  '.trainer-extra-manager-empty>span',
  '.trainer-superset-head>span:first-child',
  '.trainer-program-name-marquee',
  '.trainer-program-name-track>strong[aria-hidden="true"]',
  '.trainer-client-actions-pop .trainer-client-actions-head>button'
]){
  assert.ok(style.includes(selector),'Missing dark-mode mobile polish: '+selector);
}

for(const selector of [
  '.trainer-home-stats .trainer-stat-icon.orange',
  '.trainer-home-page .trainer-activity-card',
  '.trainer-program-rir-toggle',
  '.trainer-program-exercise-field>button',
  '.trainer-program-alternatives-block',
  '.trainer-inline-superset-toggle',
  '.trainer-client-page .trainer-exercise-head .trainer-program-title-line>strong',
  '.trainer-client-page .inner-actions button.danger',
  '.trainer-client-page .program-extra .badge'
]){
  assert.ok(style.includes(selector),'Missing mobile dark contrast repair: '+selector);
}

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
  assert.ok(shell.includes('/static/css/trainer-dark.css?v=15'));
  assert.ok(shell.includes('/static/js/theme.js?v=2'));
  assert.ok(shell.includes('/static/js/trainer.js?v=319'));
}
assert.ok(sw.includes("const VERSION='eplan-v229'"));

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
