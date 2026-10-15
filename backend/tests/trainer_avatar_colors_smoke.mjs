// Regression for the shared, deterministic trainer client avatar palette.
// Run with: node backend/tests/trainer_avatar_colors_smoke.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const trainer=fs.readFileSync(path.join(root,'static/js/trainer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'static/css/trainer-avatars.css'),'utf8');
const index=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'static/sw.js'),'utf8');

const begin=trainer.indexOf('function trainerClientInitials(c){');
const end=trainer.indexOf('async function trainerHome(){');
assert.ok(begin>=0&&end>begin,'Shared avatar functions must be loaded before trainer views');
const context={esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')};
vm.createContext(context);
vm.runInContext(trainer.slice(begin,end),context,{timeout:1000});
const colors=Array.from({length:8},(_,i)=>context.trainerClientAvatarTone({id:i+1,name:'Тест'}));
assert.equal(new Set(colors).size,8,'Eight consecutive IDs must be visually distinct');
assert.equal(context.trainerClientAvatarTone({id:2,name:'Олена'}),context.trainerClientAvatarTone({id:2,name:'Інше ім’я'}));
assert.equal(context.trainerClientAvatarTone({name:'Гість'}),context.trainerClientAvatarTone({name:'Гість'}));
assert.match(context.trainerClientAvatarHTML({id:2,name:'Олена Коваль'}),/trainer-avatar-tone-2/);
assert.match(context.trainerClientAvatarHTML({id:2,name:'Олена Коваль'},'large'),/trainer-client-avatar trainer-avatar-tone-2 large/);
assert.match(context.trainerClientAvatarHTML({id:2,name:'<TEST>'}),/&lt;/,'Initials must be HTML-escaped');
assert.ok((trainer.match(/trainerClientAvatarHTML\(c/g)||[]).length>=7,'All trainer list/profile screens use the shared helper');
assert.ok(trainer.includes('trainer-client-avatar more'),'The +N counter must remain a neutral avatar');
for(let i=0;i<8;i++)assert.ok(css.includes('.trainer-avatar-tone-'+i+'{'),'Missing color '+i);
assert.ok(css.includes('.trainer-client-avatar.more'),'Counter must have a neutral palette override');
for(const doc of [index,sw]){
 assert.ok(doc.includes('/static/css/trainer-avatars.css?v=2'),'Palette CSS must be loaded');
 assert.ok(doc.includes('/static/js/trainer.js?v=319'),'New trainer script must be used');
}
console.log('PASS: stable trainer avatar colors and PWA asset versions');
