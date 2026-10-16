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
window.exerciseLibrary={exercises:[{name:'Горизонтальна тяга блока до поясу вузькою рукояткою',technique_url:'https://example.org/technique'}]};
window.techniqueLinkHTML=(url,label)=>'<a class="alternative-tech-link" href="'+url+'">'+label+'</a>';
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
    window.currentClientData.program[1].alternatives_json=JSON.stringify([{exercise:'Горизонтальна тяга блока до поясу вузькою рукояткою',sets:3,reps:'8-12',rir_by_set:'2,2,2',rest_text:'2'}]);
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
   const alt=first.locator('.alternative-chip.alternative-chip-detailed').first();
   assert.equal(await alt.isVisible(),true,'alternative exercise visible in editor');
   const contrast=await alt.evaluate(chip=>{
     const name=chip.querySelector('.alternative-name');
     const meta=chip.querySelector('small');
     const tech=chip.querySelector('.alternative-tech-link');
     const rgb=s=>[...(s.match(/[0-9]+/g)||[])].slice(0,3).map(Number);
     const luminance=v=>rgb(v).map(c=>{
       const x=c/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
     }).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
     const ratio=(a,b)=>{let x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
     const surface=getComputedStyle(chip).backgroundColor;
     return {
       name:ratio(getComputedStyle(name).color,surface),
       meta:ratio(getComputedStyle(meta).color,surface),
       tech:ratio(getComputedStyle(tech).color,surface),
       nameSize:parseFloat(getComputedStyle(name).fontSize),
       metaSize:parseFloat(getComputedStyle(meta).fontSize),
       nameWrap:getComputedStyle(name).whiteSpace
     };
   });
   assert.ok(contrast.name>=7,'alternative title contrast '+theme+' '+JSON.stringify(contrast));
   assert.ok(contrast.meta>=4.5,'alternative meta contrast '+theme+' '+JSON.stringify(contrast));
   assert.ok(contrast.tech>=4.5,'tech link contrast '+theme+' '+JSON.stringify(contrast));
   assert.ok(contrast.nameSize>=12 && contrast.metaSize>=10,'alternative typography too small');
   assert.equal(contrast.nameWrap,'normal','long titles should wrap');
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
 console.log('PASS: trainer program overview / readable alternatives / edit toggle / modal / themes');
} finally {await browser.close()}
