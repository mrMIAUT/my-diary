// iPhone trainer v9 — access, notification center, More, public profile, meal CTA.
// Load actual CSS order; assert rendered colors and light-mode isolation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const styles=['css/base.css','css/components.css','css/refinements.css',
 'css/redesign.css','css/theme.css','css/trainer-avatars.css','css/trainer-dark.css'];
const markup=`<!doctype html><html lang="uk">
<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body class="eplan-redesign trainer-ui" data-eplan-theme="dark">
<div class="trainer-client-page">
  <div id="profile"><section class="card access-card">
    <div id="accessEditBox" class="access-edit-box">
     <div class="access-editor-head"><small>РЕДАГУВАННЯ ДОСТУПУ</small><strong>Тариф і термін</strong></div>
     <div class="access-grid">
      <div class="access-field"><label>Тариф</label><select id="accessPlan"><option>Онлайн-ведення</option></select></div>
      <div class="access-field"><label>Доступ до</label><input type="date" id="accessUntil" value="2026-11-16"></div>
     </div>
     <div class="access-quick-title">Швидко продовжити</div>
     <div class="access-quick-actions"><button>+ 1 місяць</button><button>+ 3 місяці</button><button>+ 6 місяців</button></div>
     <div class="access-editor-actions"><button class="access-primary">Зберегти доступ</button><button class="access-secondary">Скасувати</button></div>
     <div class="access-editor-note"><span>i</span><p>Дані не видаляються.</p></div>
    </div>
  </section></div>
  <section id="nutrition"><div class="trainer-nutrition-page">
    <div class="trainer-saved-plan-actions"><button>Редагувати план</button></div>
  </div></section>
</div>
<div class="trainer-more-page modern">
  <div class="trainer-more-list modern">
    <button class="trainer-more-item"><span class="trainer-more-icon"><svg class="ui-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg></span><span class="trainer-more-copy"><strong>Тема оформлення</strong><small>Світла, темна або як на пристрої</small></span><span class="trainer-more-chevron">›</span></button>
  </div>
</div>
<div class="trainer-more-page modern trainer-public-profile-editor is-collapsed">
 <section class="trainer-profile-collapsed">
  <div class="trainer-profile-collapsed-top"><span class="trainer-profile-editor-avatar has-photo">М</span><div class="trainer-profile-collapsed-copy"><h2>Михайло</h2><p>Тренер ЄПЛАН</p></div></div>
  <div class="trainer-profile-collapsed-stats">
   <div><strong>4</strong><span>років досвіду</span></div>
   <div><strong>11</strong><span>клієнтів всього</span></div>
   <div><strong>6 активних</strong><span>завантаження</span></div>
  </div>
  <div class="trainer-profile-collapsed-tags"><span>Набір м’язової маси</span><span>Схуднення</span></div>
  <button class="trainer-profile-edit-toggle">Редагувати профіль</button>
 </section>
</div>
<div class="trainer-more-page modern trainer-public-profile-editor is-editing">
  <div class="trainer-profile-editor-preview card">
    <span class="trainer-profile-editor-avatar has-photo">М</span>
    <div><strong>Михайло</strong><span>Тренер ЄПЛАН</span></div>
    <label class="trainer-avatar-upload"><input type="file"><span>Змінити фото</span></label>
  </div>
  <div class="trainer-profile-editor-stats"><div><strong>6</strong><span>ведеш зараз</span></div><div><strong>11</strong><span>клієнтів всього</span></div><div><strong>4</strong><span>років досвіду</span></div></div>
  <section class="card trainer-public-profile-card">
   <div class="trainer-profile-form-head"><div><strong>Редагування профілю</strong><span>Зміни буде видно у каталозі.</span></div><button class="trainer-profile-collapse-btn">Згорнути</button></div>
   <label><span>Ім’я у профілі</span><input value="Михайло"></label>
  </section>
</div>
<div class="modal notification-modal" id="notificationModal">
  <div class="card notification-modal-card">
    <div class="notification-modal-head"><div><small>ЦЕНТР ПОДІЙ</small><h2>Сповіщення</h2></div><div class="notification-modal-actions"><button class="notification-clear-all">Очистити все</button><button class="notification-close">×</button></div></div>
    <button class="notification-phone-toggle push-enabled">✓ Сповіщення на телефоні увімкнено</button>
    <div class="notification-list">
      <div class="notification-swipe"><button class="notification-delete-bg notification-delete">×</button><div class="notification-item"><div class="notification-item-top"><strong>Аліна</strong><time>2026-10-15</time></div><p>Оновив кардіо</p></div></div>
      <div class="notification-swipe"><button class="notification-delete-bg notification-delete">×</button><div class="notification-item unread"><span class="notification-dot"></span><div class="notification-item-top"><strong>Тестовий</strong><time>2026-10-14</time></div><p>Завершив тренування. Потрібно перевірити.</p></div></div>
    </div>
  </div>
</div>
</body></html>`;
const rgb=(r,g,b)=>`rgb(${r}, ${g}, ${b})`;
const browser=await chromium.launch({headless:true});
try{
  for(const width of [320,390]){
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2});
    await page.setContent(markup);
    for(const s of styles)await page.addStyleTag({content:fs.readFileSync(path.join(root,s),'utf8')});
    await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}'});
    const val=(sel,key)=>page.locator(sel).first().evaluate((el,key)=>getComputedStyle(el)[key],key);
    const check=async(sel,key,want)=>assert.equal(await val(sel,key),want,`${width}px ${sel} ${key}`);
    const card=rgb(28,30,35),raised=rgb(40,43,49),light=rgb(243,244,246),transparent='rgba(0, 0, 0, 0)';
    await check('#accessEditBox','backgroundColor',card);
    await check('#accessEditBox .access-editor-head strong','color',light);
    await check('#accessEditBox .access-field select','backgroundColor',raised);
    await check('#accessEditBox .access-field input','color',light);
    await check('#accessEditBox .access-quick-actions button','backgroundColor',rgb(41,61,88));
    await check('#accessEditBox .access-editor-actions .access-secondary','backgroundColor',rgb(48,56,70));
    await check('#accessEditBox .access-editor-note','backgroundColor',rgb(37,43,52));
    await check('#accessEditBox .access-editor-note p','color',rgb(182,195,211));

    await check('#notificationModal .notification-modal-card','backgroundColor',card);
    await check('#notificationModal .notification-modal-head h2','color',light);
    await check('#notificationModal .notification-close','backgroundColor',rgb(48,56,70));
    await check('#notificationModal .notification-clear-all','backgroundColor',rgb(57,39,46));
    await check('#notificationModal .notification-phone-toggle.push-enabled','backgroundColor',rgb(33,58,46));
    await check('#notificationModal .notification-item','backgroundColor',raised);
    await check('#notificationModal .notification-item.unread','backgroundColor',rgb(36,51,71));
    await check('#notificationModal .notification-item-top strong','color',light);
    await check('#notificationModal .notification-item p','color',rgb(224,230,239));

    await check('.trainer-more-page .trainer-more-list.modern','backgroundColor',transparent);
    await check('.trainer-more-page .trainer-more-list.modern .trainer-more-item','backgroundColor',card);
    await check('.trainer-more-page .trainer-more-icon','backgroundColor',rgb(41,61,88));
    await check('.trainer-more-page .trainer-more-copy strong','color',light);

    await check('.trainer-public-profile-editor.is-collapsed .trainer-profile-collapsed','backgroundColor',card);
    await check('.trainer-profile-collapsed-stats','backgroundColor',transparent);
    await check('.trainer-profile-collapsed-stats>div','backgroundColor',raised);
    await check('.trainer-profile-collapsed-stats strong','color',light);
    await check('.trainer-profile-collapsed-tags','backgroundColor',transparent);
    await check('.trainer-profile-collapsed-tags>span','backgroundColor',rgb(41,61,88));
    await check('.trainer-public-profile-editor .trainer-profile-edit-toggle','backgroundColor',rgb(41,61,88));
    await check('.trainer-profile-editor-stats','backgroundColor',transparent);
    await check('.trainer-profile-editor-stats>div','backgroundColor',raised);
    await check('.trainer-profile-editor-stats strong','color',light);
    await check('.trainer-avatar-upload>span','backgroundColor',rgb(41,61,88));
    await check('.trainer-profile-form-head','backgroundColor',transparent);
    await check('.trainer-public-profile-editor .trainer-public-profile-card input','backgroundColor',raised);
    await check('#nutrition .trainer-saved-plan-actions','backgroundColor',transparent);

    await page.locator('body').evaluate(el=>el.dataset.eplanTheme='light');
    await check('#accessEditBox','backgroundColor',rgb(251,252,254));
    await check('#notificationModal .notification-item','backgroundColor',rgb(255,255,255));
    await check('.trainer-profile-editor-stats>div','backgroundColor',rgb(255,255,255));
    await check('.trainer-profile-collapsed-stats>div','backgroundColor',rgb(248,250,252));
    await page.close();
  }
  // Evaluate the actual generated SVG source, not just its background box.
  const core=fs.readFileSync(path.join(root,'js/core.js'),'utf8');
  const start=core.indexOf('function uiIcon(name){');
  const end=core.indexOf('function clientInitials',start);
  assert.ok(start>=0&&end>start,'uiIcon function source not found');
  const sandbox={};vm.createContext(sandbox);
  vm.runInContext(core.slice(start,end),sandbox);
  const svg=vm.runInContext("uiIcon('settings')",sandbox);
  assert.ok(svg.includes('<circle')&&svg.includes('<path'),'Theme settings SVG must contain visible strokes');
  console.log('PASS: trainer dark v9 cards, notifications, profiles, access, menu icon and light isolation at 320/390px');
} finally{await browser.close();}
