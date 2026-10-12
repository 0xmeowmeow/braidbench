// Focused GPU review: finite tubes, cell-boundary continuity, orbit/cutaway,
// pulley picking and render-on-demand. Run after the geometry checks.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1060}}),errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state=()=>page.evaluate(()=>window.braidbench.getState());
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const click=id=>page.evaluate(id=>document.getElementById(id).click(),id);
  await page.goto(process.env.BRAIDBENCH_URL||'http://localhost:8765');await page.waitForFunction(()=>window.braidbench?.getState().loaded);
  for(const count of [8,12,16,48,72]){
   await page.evaluate(async count=>{if(count>20){document.getElementById('industrialCount').value=count;document.getElementById('ends').value=8;await window.braidbench.load('industrial');}else await window.braidbench.load(count);},count);
   await click('formation');await page.uncheck('#trace');await settle();let s=await state();assert.equal(s.profile.wireDiameter,count>20?.16:.45);assert(s.render.solidInstances>0);assert(s.render.supplyTriangles>0);
   await page.waitForTimeout(300);const idle=(await state()).render.count;await page.waitForTimeout(300);assert.equal((await state()).render.count,idle,'Paused, untouched model should not keep rendering');
   let maximumChangedFraction=0;
   for(const boundary of [Math.PI/4,2*Math.PI,s.period]){
    await page.evaluate(t=>window.braidbench.seek(t),boundary-1e-7);await settle();
    await page.evaluate(()=>{const source=document.querySelector('#viewport canvas'),copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;const context=copy.getContext('2d');context.drawImage(source,0,0);window.__braidPixels=context.getImageData(0,0,copy.width,copy.height).data;});
    await page.evaluate(t=>window.braidbench.seek(t),boundary+1e-7);await settle();
    const changed=await page.evaluate(()=>{const source=document.querySelector('#viewport canvas'),copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;const context=copy.getContext('2d');context.drawImage(source,0,0);const a=window.__braidPixels,b=context.getImageData(0,0,copy.width,copy.height).data;let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>60)changed++;return changed/(a.length/4);});
    maximumChangedFraction=Math.max(maximumChangedFraction,changed);assert(changed<.003,`Visible geometry jumps at ${count}/${boundary}: ${changed}`);
   }
   await click('formation');await click('stageAfter');await page.uncheck('#trace');await settle();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:root+`/previews/braid-close-${count}.png`});
   const canvas=page.locator('#viewport canvas'),box=await canvas.boundingBox();
   for(let i=0;i<3;i++){await page.mouse.move(box.x+box.width*.3,box.y+box.height*.52);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.56,{steps:4});await page.mouse.up();await page.waitForTimeout(400);s=await state();assert(s.render.solidInstances>0,'Orbit must retain visible output sectors');}
   if(count>20){await click('formation');await settle();const before=(await state()).render.solidInstances;await page.check('#coreCutaway');await settle();assert((await state()).render.solidInstances>=before);await page.screenshot({path:root+`/previews/braid-cutaway-${count}.png`});await page.uncheck('#coreCutaway');}
   await page.selectOption('#focus','bobbin');await settle();assert((await state()).render.supplyTriangles>0,'Bobbin close-up must use finite-width supply tubes');
   const points=await page.evaluate(()=>window.braidbench.getPickablePoints()),target=points.find(p=>p.name.includes('Upper return pulley'));assert(target&&target.depth<1);const rect=await canvas.boundingBox();await page.mouse.click(rect.x+target.x,rect.y+target.y);assert.match(await page.textContent('#partTitle'),/Upper return pulley/);
   await page.evaluate(()=>window.scrollTo(0,0));await settle();await page.screenshot({path:root+`/previews/bobbin-close-${count}.png`});
   results.push({carriers:count,ends:count>20?8:1,maximum_cell_or_circuit_seam_changed_pixel_fraction:maximumChangedFraction,paused_rendering:'idle',formation_and_supply:'solid close-up tubes',orbit_and_cutaway:'pass',return_pulley_picking:'pass'});console.log(results.at(-1));
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(root+'/docs/render-validation.json',JSON.stringify({results,page_errors:errors,scope:'Chromium rendering and interaction checks. Pixel continuity uses a small phase change around a profile vertex, geometric-cell seam and full carrier circuit. No physical mechanism claim.'},null,2)+'\n');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
