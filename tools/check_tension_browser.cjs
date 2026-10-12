const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.BRAIDBENCH_URL||'http://127.0.0.1:8765')+'/docs/tension-lab.html');await page.waitForFunction(()=>window.tensionLab);
 let state=await page.evaluate(()=>tensionLab.getState());assert(state.brake<state.ideal);await page.screenshot({path:root+'/previews/tension-board.png'});
 await page.locator('#radius').evaluate(e=>{e.value=5.2;e.dispatchEvent(new Event('input'));});state=await page.evaluate(()=>tensionLab.getState());assert(state.brake>state.ideal);assert.match(await page.locator('#state').textContent(),/rise/);
 await page.evaluate(()=>tensionLab.set({position:80}));state=await page.evaluate(()=>tensionLab.getState());assert.equal(state.stored,80);const long=state.routeLength;
 await page.evaluate(()=>tensionLab.set({position:120}));state=await page.evaluate(()=>tensionLab.getState());assert.equal(state.stored,0);assert(Math.abs(long-state.routeLength-80)<1e-9);
 await page.click('#front');await page.screenshot({path:root+'/previews/tension-empty.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.screenshot({path:root+'/previews/tension-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.goto('file://'+root+'/OPEN-TENSION-TEST.html');await page.waitForFunction(()=>window.tensionLab);await page.evaluate(()=>tensionLab.set({mass:80}));state=await page.evaluate(()=>tensionLab.getState());assert(Math.abs(state.ideal-.392266)<1e-9);assert.deepEqual(errors,[]);
 fs.writeFileSync(root+'/docs/tension-browser-validation.json',JSON.stringify({status:'pass',checks:['package radius reverses ideal imbalance','two-leg loop stores 80 mm over 40 mm travel','front camera','390 px mobile without overflow','offline file loads and controls work'],page_errors:errors},null,2)+'\n');console.log('Tension lab browser checks pass');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
