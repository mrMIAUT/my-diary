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
assert.ok(style.includes('v16 — Native iPhone safe area'));
assert.ok(style.includes('padding-top:calc(8px + env(safe-area-inset-top, 0px))!important;'));
assert.ok(!style.includes('height:max(44px, env(safe-area-inset-top,0px))'));
assert.ok(!/body\.eplan-redesign\.trainer-ui\[data-eplan-theme="dark"\]::before/.test(style),
  'Fixed overlay must never cover the trainer PWA status bar');

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
assert.ok(core.includes("settings:'<path d=\"M "), 'Missing symmetric settings gear icon');
assert.ok(trainer.includes("uiIcon('settings')"), 'Theme settings menu icon not used');

const sharedIconStart=core.indexOf('function uiIcon(name){');
const sharedIconEnd=core.indexOf('function clientInitials(',sharedIconStart);
assert.ok(sharedIconStart>=0&&sharedIconEnd>sharedIconStart);
const iconContext={};
vm.createContext(iconContext);
vm.runInContext(core.slice(sharedIconStart,sharedIconEnd),iconContext,{timeout:1000});
const settingsGear=iconContext.uiIcon('settings');
assert.ok(settingsGear.startsWith('<svg class="ui-icon" viewBox="0 0 24 24"'), 'Expected shared 24px SVG');
assert.ok(settingsGear.includes('<circle cx="12" cy="12" r="3"/>'), 'Gear hub must be centered');
const gearOutline=settingsGear.match(/<path d="([^"]+)"/)?.[1]||'';
assert.ok(gearOutline.startsWith('M ')&&gearOutline.endsWith(' Z'));
assert.equal((gearOutline.match(/ L /g)||[]).length,31,'Symmetric eight-tooth gear needs 32 outline points');
assert.ok(read('js/more-redesign.js').includes("redesignMoreItem('settings'"),'Client settings must use shared SVG');


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

for(const token of ['--trainer-dark-bg:#000000','--trainer-dark-surface:#1c1e23','--trainer-dark-raised:#282b31','--trainer-dark-border:#353840','--trainer-dark-text:#f3f4f6']){
  assert.ok(style.includes(token),'Missing graphite palette token: '+token);
}
assert.ok(style.includes('.trainer-bottom-nav button.active'));
assert.ok(style.includes('.trainer-nutrition-page .nutrition-menu-meal-v2'));
assert.ok(style.includes('.trainer-client-page #profile>.card'));

for(const marker of ['.trainer-template-toolbar.modern','.trainer-nutrition-target-summary>div','.nutrition-menu-total-v6','.trainer-client-page #profile>.card','.trainer-nutrition-summary strong']){
  assert.ok(style.includes(marker),'Missing contrast repair: '+marker);
}
assert.ok(!/body\.eplan-redesign\.client-ui/.test(style),'Trainer overrides cannot leak into client screens');
const themeBackButton='<div class="trainer-client-navline"><button type="button" class="trainer-back-button trainer-theme-back" onclick="showTrainerMore()" aria-label="Назад">';
const themeTitleMarkup='<div class="trainer-page-title"><div><h1>Тема оформлення</h1>';
const themeSettingsPos=trainer.indexOf('function showTrainerThemeSettings(){');
const themeSettingsEnd=trainer.indexOf('async function openPendingWorkoutForClient',themeSettingsPos);
const themeSettingsSource=trainer.slice(themeSettingsPos,themeSettingsEnd);
const library=read('js/library.js');
assert.ok(library.includes('<div class="trainer-client-navline"><button type="button" class="trainer-back-button"'));
assert.ok(themeSettingsSource.includes(themeBackButton));
assert.ok(themeSettingsSource.includes(themeTitleMarkup));
assert.ok(themeSettingsSource.indexOf(themeBackButton)<themeSettingsSource.indexOf(themeTitleMarkup),
  'Theme Back button must be in a separate row above the heading like Exercise Library');
assert.ok(!themeSettingsSource.includes('trainer-page-title trainer-more-title'));
assert.ok(style.includes('v21 — trainer theme screen uses exactly the library back-button layout'));
assert.ok(style.includes('.trainer-theme-settings .trainer-client-navline{'));
assert.ok(style.includes('.trainer-more-page.modern.trainer-theme-settings{'));
assert.match(trainer,/function showTrainerThemeSettings\(/);
assert.match(trainer,/onclick="showTrainerThemeSettings\(\)"/);
for(const shell of [index,sw]){
  assert.ok(shell.includes('/static/css/trainer-dark.css?v=30'));
  assert.ok(shell.includes('/static/js/theme.js?v=3'));
  assert.ok(shell.includes('/static/js/trainer.js?v=322'));
}
assert.ok(sw.includes("const VERSION='eplan-v260'"));

const refined=style.slice(style.indexOf('/* v24 — follow-up dark trainer polish'));
assert.ok(refined.includes('#nutrition .trainer-actual-diary-date>button{'));
assert.ok(refined.includes('background:#2b3b4d!important;'),'Date controls need dark graphite rather than inherited yellow');
assert.ok(refined.includes('max-width:44px!important;'),'Date arrows must never overlap date input');
assert.ok(refined.includes('#progress .trainer-workout-calendar-cell.has-workout.selected{'));
assert.ok(refined.includes('background:#30435c!important;'),'Selected dark date should be quiet steel blue');
assert.ok(refined.includes('#progress .trainer-volume-panel .trainer-progress-empty.compact{'));
assert.ok(refined.includes('background:#282d35!important;'),'Empty volume should not have a white background');
assert.ok(refined.includes('#progress .trainer-workout-calendar-comment p{'));
assert.ok(refined.includes('color:#edf8f1!important;'),'Review comment text must be readable');
assert.ok(refined.includes('#progress .trainer-calendar-day-volume,'));
assert.ok(refined.includes('background:transparent!important;'),'Progress KPI backdrop must be transparent');
for(const macro of ['kcal','protein','fat','carbs']){
 assert.ok(refined.includes('#nutrition .trainer-nutrition-target-summary .'+macro+'{'),
  'Dark nutrition targets missing '+macro+' accent');
}
assert.ok(refined.includes('trainer-ui:not([data-eplan-theme="dark"])'),'Light palette must stay isolated');


const nutritionSrc=read('js/nutrition.js');
const apiSource=read('../app.py');
assert.ok(index.includes('/static/js/nutrition.js?v=329'));
assert.ok(sw.includes('/static/js/nutrition.js?v=329'));
assert.ok(index.includes('/static/js/trainer.js?v=322'));
assert.ok(sw.includes('/static/js/trainer.js?v=322'));
assert.ok(apiSource.includes('@app.get("/api/trainer/clients/{cid}/nutrition/diary")'));
assert.ok(apiSource.includes('def trainer_food_diary_get(cid:int,day:date,user:AuthUser=Depends(require_trainer)):'));
assert.match(apiSource,/authorize_client\(user,cid\)\s+diary_view_client\(cid\)\s+return diary_day_payload\(cid,diary_day_checked\(day\)\)/);

assert.ok(/if\(!cid\|\|!\/\^\\d\{4\}/.test(nutritionSrc),'Trainer date control must validate ISO dates');
const actualHelper=nutritionSrc.slice(nutritionSrc.indexOf('function trainerActualDiaryNumber('),
  nutritionSrc.indexOf('function nutritionHTML('));
const diaryVM={esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')};
vm.createContext(diaryVM);
vm.runInContext(actualHelper,diaryVM,{timeout:1000});
const actualHTML=diaryVM.trainerActualDiaryDetails(
 {active:true,items:[{meal:'breakfast',name:'Вівсянка',grams:100,portion_unit:'g',kcal:250}],
  totals:{kcal:250,protein:8,fat:5,carbs:40}},
 {kcal:1800,protein:110,fat:60,carbs:190},null);
assert.ok(actualHTML.includes('Продукти зі щоденника'));
assert.ok(actualHTML.includes('Вівсянка'));
assert.ok(actualHTML.includes('Ціль 1'));
const manualHTML=diaryVM.trainerActualDiaryDetails({active:false,items:[]},
 {kcal:1800},{kcal:1500,protein:100,fat:50,carbs:200});
assert.ok(manualHTML.includes('Внесено вручну'));
assert.ok(!manualHTML.includes('Вівсянка'));
assert.ok(nutritionSrc.includes('function trainerActualDiaryHTML(d){'));
assert.ok(nutritionSrc.includes('function trainerActualDiaryDetails(payload,client,manual){'));
assert.ok(nutritionSrc.includes('function loadTrainerActualDiary()'));
assert.ok(nutritionSrc.includes('trainerActualDiaryHTML(d)}'));
assert.ok(trainer.includes("if(id==='nutrition'&&typeof loadTrainerActualDiary==='function')loadTrainerActualDiary();"));
assert.ok(style.includes('v23 — trainer read-only actual calorie/macros per day'));


const resultsSource=read('js/results.js');
assert.ok(index.includes('/static/js/results.js?v=182'));
assert.ok(sw.includes('/static/js/results.js?v=182'));
assert.ok(resultsSource.includes("st={cid,month:String(latest).slice(0,7),day:String(latest),sid:0};"));
assert.ok(resultsSource.includes('aria-pressed=')&&resultsSource.includes('selectTrainerWorkoutCalendarDay(this.dataset.day)'));
assert.ok(resultsSource.includes('У цей день завершених тренувань немає.'));
assert.ok(resultsSource.includes('st.day=day;'));
assert.ok(style.includes('v22 — trainer progress calendar'));
assert.ok(style.includes('#progress .trainer-workout-calendar-cell.has-workout.selected'));
assert.ok(style.includes('#progress .trainer-workout-calendar-exercises .trainer-review-exercise{'));

const authTheme=read('css/theme.css');
const authMarkup=read('js/auth.js');
assert.ok(index.includes('/static/css/theme.css?v=38'));
assert.ok(sw.includes('/static/css/theme.css?v=38'));
assert.ok(authTheme.includes('v38 — auth screens follow'));
assert.ok(authTheme.includes('body.eplan-auth-page[data-eplan-theme="dark"] .auth-card{'));
assert.ok(authTheme.includes('body.eplan-auth-page[data-eplan-theme="dark"] .auth-heading h1{'));
assert.ok(authTheme.includes('body.eplan-auth-page[data-eplan-theme="dark"] .auth-field input{'));
assert.ok(authTheme.includes('body.eplan-auth-page[data-eplan-theme="dark"] .remember-row input[type="checkbox"]:checked::after{'));
assert.ok(authTheme.includes('body.eplan-auth-page[data-eplan-theme="dark"] .auth-secondary{'));
assert.ok(authTheme.includes('body.eplan-auth-page[data-eplan-theme="dark"] .auth-logo-name{'));
assert.ok(authTheme.includes('body.eplan-auth-page[data-eplan-theme="dark"] .eplan-splash{'));
assert.ok(!/body\.eplan-redesign\.(?:client-ui|trainer-ui)\[data-eplan-theme="dark"\]/.test(authTheme.slice(authTheme.indexOf('/* v38 — auth screens follow'))),
  'Auth overrides must not affect signed-in trainer/client pages');
for(const fn of ['function renderLogin(){','function renderForgotPassword(){','function renderResetPassword(token){'])
  assert.ok(authMarkup.includes(fn),'Auth view missing: '+fn);


const clientTheme=read('css/theme.css');
assert.ok(index.includes('/static/css/theme.css?v=37'));
assert.ok(sw.includes('/static/css/theme.css?v=37'));
assert.ok(clientTheme.includes('v37 — client third-concept navigation'));
assert.ok(clientTheme.includes('bottom:calc(19px + env(safe-area-inset-bottom, 0px))!important;'));
assert.ok(clientTheme.includes('min-height:50px!important;'));
assert.ok(clientTheme.includes('fill:#55c27a!important;'));
assert.ok(clientTheme.includes('client-ui[data-eplan-theme="dark"] .client-bottom-nav'));


// Reuse parsed core from the earlier smoke assertions.
assert.ok(index.includes('/static/js/core.js?v=174'));
assert.ok(sw.includes('/static/js/core.js?v=174'));
assert.ok(core.includes('function trainerNavIcon(name)'));
assert.ok(core.includes('trainerNavIcon(icon)'));
assert.ok(core.includes("item('programs','Програми','programs'"));
assert.ok(core.includes("item('nutrition','Харчування','nutrition'"));
assert.ok(style.includes('v19 — raised trainer nav 10px'));
assert.ok(style.includes('bottom:calc(19px + env(safe-area-inset-bottom, 0px))!important;'));
assert.ok(!style.includes('bottom:calc(9px + env(safe-area-inset-bottom, 0px))!important;'));
assert.ok(style.includes('min-height:50px!important;'));
assert.ok(style.includes('padding:5px 6px!important;'));
assert.ok(style.includes('fill:#55c27a!important;'));
assert.ok(!style.includes('.trainer-bottom-nav .trainer-nav-accent'));
assert.ok(!core.includes('trainer-nav-accent'));
const iconStart=core.indexOf('function trainerNavIcon(name){');
const iconEnd=core.indexOf('function trainerBottomNavHTML(){',iconStart);
assert.ok(iconStart>=0&&iconEnd>iconStart);
const navIcons={};
vm.createContext(navIcons);
vm.runInContext(core.slice(iconStart,iconEnd),navIcons,{timeout:1000});
for(const key of ['home','clients','programs','nutrition','more']){
  const icon=navIcons.trainerNavIcon(key);
  assert.ok(icon.startsWith('<svg')&&icon.endsWith('</svg>'));
  assert.ok(!icon.includes('trainer-nav-accent'));
}
assert.ok(navIcons.trainerNavIcon('nutrition').includes('fill="#55c27a"'));
assert.equal((navIcons.trainerNavIcon('more').match(/<circle/g)||[]).length,3);

const clientIconStart=core.indexOf('function clientNavIcon(name){');
const clientIconEnd=core.indexOf('function clientBottomNavHTML(){',clientIconStart);
assert.ok(clientIconStart>=0&&clientIconEnd>clientIconStart);
vm.runInContext(core.slice(clientIconStart,clientIconEnd),navIcons,{timeout:1000});
for(const key of ['home','programs','progress','nutrition','more']){
 const svg=navIcons.clientNavIcon(key);
 assert.ok(svg.includes('client-nav-icon'),'Bad client SVG icon: '+key);
 assert.ok(!svg.includes('trainer-nav-accent'),'Blue dots returned: '+key);
}
assert.ok(navIcons.clientNavIcon('progress').includes('m6.7 15.7 4.1-4.2'));
assert.ok(navIcons.clientNavIcon('nutrition').includes('fill="#55c27a"'));


const trainerNavIndex=core.indexOf('function trainerBottomNavHTML(){');
const clientNavIndex=core.indexOf('function clientBottomNavHTML(){');
assert.ok(clientNavIndex>=0&&clientNavIndex<trainerNavIndex);
assert.ok(core.slice(clientNavIndex,core.indexOf('function trainerNavIcon(',clientNavIndex)).includes('clientNavIcon(icon)'),
  'The client navigation must use new matching icons');


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
assert.equal(meta.content,'#000000');
assert.equal(els[1]['aria-checked'],'true');
ctx.window.eplanSetTheme('light');
assert.equal(body.dataset.eplanTheme,'light');
ctx.window.eplanSetTheme('system');
media.matches=true;
ctx.window.eplanSetTheme('system');
assert.equal(body.dataset.eplanTheme,'dark');
assert.equal(meta.content,'#000000');
body.classList.contains=name=>name==='client-ui';
ctx.window.eplanSetTheme('dark');
assert.equal(meta.content,'#0b1117'); // Client dark system color stays unchanged.
body.classList.contains=name=>name==='trainer-ui';
ctx.window.eplanSetTheme('dark');
assert.equal(meta.content,'#000000');
assert.ok(style.includes('v26 — black canvas'));
assert.ok(style.includes('html:has(> body.eplan-redesign.trainer-ui[data-eplan-theme="dark"])'));
assert.ok(style.includes('.wrap.trainer-shell,'));
assert.ok(style.includes('.trainer-measurements-page,'));
assert.ok(style.includes('.trainer-theme-settings'));
assert.ok(style.includes('background-color:#000000!important;'));
assert.ok(style.includes('--trainer-dark-surface:#1c1e23;'));
assert.ok(!style.includes('--trainer-dark-bg:#101114;'));
assert.ok(!style.includes('--trainer-dark-bg:#0b1117;'));

const glass=style.slice(style.indexOf('/* v27 — quiet curved-glass'));
assert.ok(glass.includes('body.eplan-redesign.trainer-ui[data-eplan-theme="dark"] :is('));
for(const card of ['.card,','.trainer-home-stats>button,','.trainer-client-row,',
 '.trainer-nutrition-target-card,','.trainer-workout-calendar-card,',
 '.trainer-measurements-page .measurement-place-card,',
 '.trainer-client-page .trainer-program-root .trainer-program-day-card']){
 assert.ok(glass.includes(card),'Trainer curved glass omitted card '+card);
}
assert.ok(glass.includes('.trainer-more-page .trainer-more-list.modern .trainer-more-item{'));
assert.ok(glass.includes('.trainer-hero-card{'));
assert.ok(glass.includes('linear-gradient(135deg,#0c3865 0%,#0c4e8a 62%,#1466b3 100%)'));
assert.ok(glass.includes('radial-gradient(ellipse 115% 70%'));
assert.ok(glass.includes('inset 0 1px 0 rgba(245,250,255,.10)'));
assert.ok(!glass.includes('backdrop-filter:')&&!glass.includes('transform:')&&!glass.includes('::after'),'Glass highlights must not distort text or overlay controls');
assert.ok(!glass.includes('client-ui')&&!glass.includes('[data-eplan-theme="light"]'),'Glass accents must be trainer dark only');
assert.ok(style.includes('--trainer-dark-bg:#000000;'),'Page canvas must stay black');
assert.ok(style.includes('--trainer-dark-surface:#1c1e23;'),'Graphite card fill must remain');

const premium=style.slice(style.indexOf('/* v29 — trainer premium-contrast palette'));
assert.ok(premium.startsWith('/* v29 — trainer premium-contrast palette'));
assert.ok(premium.includes('--trainer-dark-bg:#000000;'));
assert.ok(premium.includes('--trainer-dark-surface:#171c24;'));
assert.ok(premium.includes('--trainer-dark-raised:#1c2330;'));
assert.ok(premium.includes('--trainer-dark-text:#f4f7fb;'));
assert.ok(premium.includes('--trainer-dark-accent:#4a86ff;'));
assert.ok(premium.includes('.trainer-hero-card .more-chevron{\n  color:#f4f7fb!important;'),'Hero chevron must remain legible on brighter blue');
assert.ok(premium.includes('linear-gradient(132deg,#123e7a 0%,#204f92 55%,#2d63b3 100%)'));
for(const klass of ['.trainer-client-row,','.trainer-nutrition-summary>div,','.trainer-template-card,',
 '.trainer-library-group,','.trainer-progress-section,','.trainer-measurements-page .measurement-place-card']){
 assert.ok(premium.includes(klass),'Missing premium card palette: '+klass);
}
for(const type of ['orange','green','blue']){
 assert.ok(premium.includes('.trainer-stat-icon.'+type),'Missing premium colored glyph: '+type);
}
for(const index of [1,2,3,4]){
 assert.ok(premium.includes('.trainer-more-item:nth-child('+index+') .trainer-more-icon'));
}
assert.ok(premium.includes('.trainer-smart-status.risk'),'Risk still requires a semantic red');
assert.ok(premium.includes('.trainer-bottom-nav button.active'));
assert.ok(premium.includes('--tpo-panel:#171c24'),'Program page should match the palette');
assert.ok(!premium.includes('body.eplan-redesign.client-ui'),'Client UI must remain unchanged');
assert.ok(!premium.includes('data-eplan-theme="light"'),'Trainer light UI must remain unchanged');
assert.ok(!premium.includes('position:')&&!premium.includes('padding:')&&!premium.includes('width:')&&!premium.includes('transform:'),'Palette must not alter geometry');

const unified=style.slice(style.indexOf('/* v30 — trainer dark mirrors'));
assert.ok(unified.startsWith('/* v30 — trainer dark mirrors'));
for(const k of ['--trainer-dark-bg:#000000;','--trainer-dark-surface:#1d2025;',
 '--trainer-dark-raised:#292d34;','--trainer-dark-muted:#b6bdc8;',
 '--trainer-dark-border:#383d46;','--trainer-dark-text:#f5f6f8;']){
 assert.ok(unified.includes(k),'Missing unified palette '+k);
}
for(const s of ['.trainer-home-stats>button,','.trainer-client-row,',
 '.trainer-template-card,','.trainer-library-group,','.trainer-nutrition-summary>div,',
 '.trainer-review-card,','.trainer-workout-calendar-card,',
 '.trainer-measurements-page .measurement-place-card,',
 '.trainer-public-profile-editor .trainer-profile-editor-form',
 '#trainerPendingReviewQueue .trainer-review-card,',
 '.trainer-more-page .trainer-more-list.modern .trainer-more-item,',
 '.trainer-client-page .trainer-program-root .trainer-program-day-card,']){
 assert.ok(unified.includes(s),'Missing unified trainer surface '+s);
}
assert.ok(unified.includes('background-image:none!important;'));
assert.ok(unified.includes('linear-gradient(135deg,#205da9 0%,#367bce 100%)'));
assert.ok(unified.includes('--tpo-panel:#1d2025;'));
assert.ok(unified.includes('.trainer-bottom-nav button.active'));
assert.ok(!unified.includes('body.eplan-redesign.client-ui')&&!unified.includes('[data-eplan-theme="light"]'));
assert.ok(!/\b(?:display|position|padding|margin|width|height|gap|transform|z-index):/.test(unified),'Palette must not alter geometry');
console.log('PASS: trainer dark theme scope, theme picker and PWA assets');
