// Browser-level launch and nutrition calculator regression smoke.
// Served without a real database; the test must not access production accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../static');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/session'){
    res.writeHead(401,{'content-type':'application/json','cache-control':'no-store'});res.end('{"detail":"Unauthorized"}');return;
  }
  if(pathname.startsWith('/api/')){
    res.writeHead(404,{'content-type':'application/json'});res.end('{"detail":"Not found in browser smoke"}');return;
  }
  const relative=pathname==='/'?'index.html':pathname.startsWith('/static/')?pathname.slice('/static/'.length):pathname.slice(1);
  const full=path.resolve(root,relative);
  if(full!==root&&!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{
    const content=await fs.readFile(full);
    res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream','cache-control':'no-store'});
    res.end(content);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  await page.goto(base,{waitUntil:'load',timeout:30000});
  await page.locator('form.auth-card').waitFor({timeout:20000});
  assert.equal(await page.locator('#app').evaluate(el=>el.textContent.includes('Увійти')),true,'Login screen not rendered');
  await page.evaluate(async()=>{
    // Exercise the *real* client navigation and nutrition rendering,
    // not only an isolated modal on the login screen.
    session={role:'client',client_id:999};
    window.currentClientData={
      client:{id:999,name:'Test client',kcal:2500,protein:160,fat:70,carbs:300,
        access:{features:{nutrition:true,workouts:true,meal_plan:false}}},
      nutrition:[]
    };
    await showClientNutrition(999);
    window.openNutritionTargetsModal(999);
  });
  await page.locator('.redesign-nutrition-today').waitFor({timeout:3000});
  await page.locator('#nutritionTargetsModal').waitFor({timeout:3000});
  await page.locator('#nutritionTargetsModal #calcAge').fill('29');
  await page.locator('#calcHeight').fill('178');
  await page.locator('#calcWeight').fill('82');
  await page.locator('#calcSteps').fill('5000');
  await page.locator('#calcStrength').selectOption('5');
  await page.locator('.nutrition-calc-button').click();
  await page.locator('.nutrition-calc-result').waitFor({timeout:3000});
  const values=await page.evaluate(()=>window.pendingNutritionTargets);
  assert.ok(values.kcal>2000&&values.kcal<4200,'Invalid calorie result: '+values.kcal);
  assert.ok(values.protein>100&&values.fat>40&&values.carbs>0,'Invalid macros');
  await page.locator('.nutrition-calc-manual summary').click();
  assert.equal(await page.locator('#targetKcal').inputValue(),'2500','Manual fallback changed');
  assert.deepEqual(pageErrors,[],'Unexpected JS errors during app launch/calculator');
  console.log('BROWSER STARTUP + NUTRITION CALCULATOR: PASS');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
