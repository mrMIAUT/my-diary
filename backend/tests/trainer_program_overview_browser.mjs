// Focused UI smoke for trainer program overview and separate exercise editor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const files=['css/base.css','css/components.css','css/refinements.css',
  'css/redesign.css','css/theme.css','css/trainer-avatars.css',
  'css/trainer-dark.css','css/trainer-program-overview.css'];
const browser=await chromium.launch({headless:true});
try {
 for(const theme of ['light','dark']){
  for(const width of [375,430]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent('<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="eplan-redesign trainer-ui" data-eplan-theme="'+theme+'"><div class="trainer-client-page"><div id="program"></div></div></body></html>');
   for(const filename of files)await page.addStyleTag({content:fs.readFileSync(path.join(root,filename),'utf8')});
   await page.addScriptTag({content:`
window.esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
window.$=(selector)=>document.querySelector(selector);
window.safeTechniqueUrl=(value)=>String(value||'');
window.exerciseLibrary={exercises:[]};
window.selected=15;
`});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/program.js'),'utf8')});
   await page.evaluate(()=>{
    const exercise=(id,day,name)=>({id,client_id:15,day_name:day,exercise:name,sets:3,reps:'8-12',rir_by_set:'2,2,2',target_rir:2,alternatives_json:'[]'});
    window.currentClientData={
     client:{id:15,show_rir:true},
     program:[exercise(1,'День 1','Присідання'),exercise(2,'День 1','Тяга блока'),
      exercise(3,'День 1','Жим гантелей'),exercise(4,'День 1','Махи в сторони'),
      exercise(5,'День 1','Згинання рук'),exercise(6,'День 2','Румунська тяга')],
     program_days:[{day_name:'День 1',title:'Ноги + Спина'}, {day_name:'День 2',title:'Ноги + Руки'}]
    };
    document.querySelector('#program').innerHTML=programHTML(window.currentClientData);
   });
   const first=page.locator('.trainer-program-day-card').first();
   assert.equal(await page.locator('.trainer-program-day-card').count(),2);
   assert.equal(await page.locator('.trainer-program-view-body').first().isVisible(),true);
   assert.equal(await page.locator('.trainer-program-edit-body').first().isVisible(),false);
   assert.equal(await page.locator('.trainer-program-form-overlay').isVisible(),false);
   assert.equal(await first.locator('.trainer-program-preview-row:visible').count(),4);
   await first.locator('.trainer-program-preview-more').click();
   assert.equal(await first.locator('.trainer-program-preview-row:visible').count(),5);
   await page.locator('.trainer-program-mode-toggle').click();
   assert.equal(await first.locator('.trainer-program-edit-body').isVisible(),true);
   assert.equal(await first.locator('.trainer-program-view-body').isVisible(),false);
   await first.locator('.trainer-program-day-add button').click();
   assert.equal(await page.locator('#trainerProgramFormOverlay').isVisible(),true);
   assert.equal(await page.locator('#dn').inputValue(),'День 1');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#trainerProgramFormOverlay').isVisible(),false);
   await page.locator('.trainer-program-new-day').click();
   assert.equal(await page.locator('#dn').inputValue(),'День 3');
   await page.locator('.trainer-program-form-close').click();
   await page.locator('.trainer-program-mode-toggle').click();
   assert.equal(await first.locator('.trainer-program-view-body').isVisible(),true);
   const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(horizontalOverflow,false,'horizontal overflow '+theme+' '+width);
   await page.close();
  }
 }
 console.log('PASS: trainer program overview / edit toggle / modal / themes');
} finally {await browser.close()}
