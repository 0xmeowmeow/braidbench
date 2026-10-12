// Browser smoke/regression checks. Set PLAYWRIGHT_MODULE, CHROMIUM_PATH and
// BRAIDBENCH_URL when running outside the original local workspace.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),url=process.env.BRAIDBENCH_URL||'http://localhost:8765';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1060},deviceScaleFactor:1}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 const state=()=>page.evaluate(()=>window.braidbench.getState());
 const seek=degrees=>page.locator('#phase').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},degrees);
 const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(250);await page.screenshot({path:path.join(root,'previews',name+'.png')});};
 await page.goto(url);await page.waitForFunction(()=>window.braidbench?.getState().loaded);await shot('assembled');
 for(const n of [8,12,16]){
  await page.click(`[data-count="${n}"]`);await page.waitForFunction(n=>window.braidbench.getState().loaded&&window.braidbench.getState().n===n,n);
  assert.equal(Number(await page.locator('#phase').getAttribute('max')),n/4*360);
  await seek(267.5);const phase=(await state()).time;
  assert.equal(await page.locator('#speed').getAttribute('type'),'range');
  for(const speed of ['0.25','0.5','1','1.35','2','4']){await page.locator('#speed').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},speed);assert.equal((await state()).speed,Number(speed));assert.equal((await state()).time,phase);}
  await page.click('#play');await page.waitForTimeout(300);assert.ok((await state()).time>phase);await page.click('#play');
  const paused=(await state()).time;await page.waitForTimeout(150);assert.equal((await state()).time,paused);
  await page.click('#exploded');assert.equal((await state()).explosion,1);
  await seek(135);assert.equal((await state()).explosion,0);assert.ok(Math.abs((await state()).time-135*Math.PI/180)<1e-8);
  console.log(`Playback passed: ${n} strands`);checks.push(`${n} strands: full circuit phase, continuous speed slider preserves phase, play/pause, seek from exploded`);
 }
 await page.click('[data-count="8"]');await page.waitForFunction(()=>window.braidbench.getState().loaded&&window.braidbench.getState().n===8);await page.click('#exploded');await shot('exploded');
 await page.selectOption('#focus','drive');await shot('drive');await page.selectOption('#focus','all');await page.click('#assembled');
 // Expose real crossing histories in every topology and inspect independent spool rotation.
 for(const choice of [8,12,16,'industrial']){
  await page.evaluate(c=>window.braidbench.load(c),choice);await page.click('#formation');await page.click('#atCrossing');
  let s=await state();assert.equal(s.focus,'formation');assert.ok(Math.abs(s.time-s.crossing.phase)<1e-10);assert.ok(s.threadPoints.length>140);assert.equal(await page.locator('#pairOnly').isChecked(),false);assert.equal(await page.locator('#filterBadge').isVisible(),false);
  await page.click('#afterCrossing');s=await state();assert.ok(s.time>s.crossing.phase);assert.match(await page.textContent('#crossingDistance'),/carried/);
  if(choice===8)await shot('formation-tabletop-all');if(choice==='industrial')await shot('formation-industrial-all');await page.check('#pairOnly');assert.equal(await page.locator('#filterBadge').isVisible(),true);if(choice===8)await shot('formation-tabletop');if(choice==='industrial')await shot('formation-industrial');await page.uncheck('#pairOnly');
  const partner=s.crossing.b;await page.click('#nextCrossing');assert.notEqual((await state()).crossing.b,partner);
  await page.evaluate(()=>{const s=window.braidbench.getState();window.braidbench.seek(s.period-.001)});const before=await state();
  await page.evaluate(()=>{const s=window.braidbench.getState();window.braidbench.seek(s.period+.001)});const after=await state();
  assert.ok(after.yarn.paid>=before.yarn.paid);assert.ok(Math.abs(after.yarn.spoolAngle-before.yarn.spoolAngle)<.02);
  const diff=after.rotations.spool-after.rotations.carrier-after.yarn.spoolAngle;assert.ok(Math.abs(Math.sin(diff))<1e-8);
  await page.selectOption('#focus','bobbin');if(choice===8)await shot('bobbin-tension');if(choice==='industrial')await shot('industrial-bobbin');
 }
 checks.push('All topologies: exposed crossings, before/at/after, next partner, visible continuous supply/loop/output, independent marked spool rotation and continuous payout over circuit seam');
 console.log('Crossing and rendered rotation checks passed');
 await page.evaluate(()=>window.braidbench.load(8));
 // Pick a mesh by scanning the central part of the canvas; no fixed camera-pixel dependency.
 const canvas=page.locator('#viewport canvas');let picked=false;
 for(const y of [600,500,700]){for(const x of [400,500,600]){await canvas.click({position:{x,y}});if(await page.textContent('#partTitle')!=='The whole machine'){picked=true;break;}}if(picked)break;}
 assert.ok(picked);checks.push('Tabletop part picking, drive isolation and explosion');
 await page.click('#industrialMode');await page.waitForFunction(()=>window.braidbench.getState().loaded&&window.braidbench.getState().mode==='industrial');assert.equal((await state()).carriers,72);assert.equal((await state()).ends,8);assert.match(await page.textContent('#wireTotal'),/576 wires/);await shot('industrial');
 await page.click('#top');await page.selectOption('#focus','track');await shot('industrial-head');await page.selectOption('#focus','all');await page.click('#home');
 for(const count of ['48','72'])for(const ends of ['1','4','8']){
  await page.evaluate(async ({count,ends})=>{document.getElementById('industrialCount').value=count;document.getElementById('ends').value=ends;await window.braidbench.load('industrial');},{count,ends});
  assert.equal((await state()).carriers,Number(count));assert.equal((await state()).ends,Number(ends));
  assert.match(await page.textContent('#wireTotal'),new RegExp(`${Number(count)*Number(ends)} wires$`));
  await seek(220);await page.click('#play');await page.waitForTimeout(100);await page.click('#play');assert.ok((await state()).time>220*Math.PI/180);
 }
 await page.click('#exploded');assert.equal((await state()).explosion,1);await shot('industrial-exploded');await page.click('#assembled');
 assert.equal(await page.locator('#downloadModels').isVisible(),false);checks.push('Industrial: all 6 carrier/end configurations, count arithmetic, animation, explosion, head isolation; fabrication links hidden');
 await page.click('#tabletopMode');await page.waitForFunction(()=>window.braidbench.getState().loaded&&window.braidbench.getState().n===8);assert.equal(await page.locator('#downloadModels').isVisible(),true);checks.push('Switch back restores tabletop controls and downloads');
 // Deterministic browser clock checks verify the actual animation loop multiplier.
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 const rate=[];
 for(const speed of ['0.25','1','4']){await seek(0);await page.locator('#speed').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},speed);await page.click('#play');await page.clock.runFor(1000);await page.click('#play');rate.push((await state()).time);}
 assert.ok(rate[0]>.04&&rate[0]<.09);assert.ok(Math.abs(rate[1]/rate[0]-4)<.3);assert.ok(Math.abs(rate[2]/rate[1]-4)<.3);checks.push('Controlled browser clock: actual playback rates follow 0.25× / 1× / 4×');
 await page.clock.resume();
 await page.goto('file://'+path.join(root,'OPEN-MODEL.html'));await page.waitForFunction(()=>window.braidbench?.getState().loaded);
 await page.click('[data-count="16"]');await page.waitForFunction(()=>window.braidbench.getState().loaded&&window.braidbench.getState().n===16);await page.click('#industrialMode');await page.waitForFunction(()=>window.braidbench.getState().loaded&&window.braidbench.getState().mode==='industrial');assert.equal((await state()).carriers,72);checks.push('Offline file switches tabletop and industrial models without fetch');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const speedBox=await page.locator('#speed').boundingBox();assert.ok(speedBox.x>=0&&speedBox.x+speedBox.width<=width&&speedBox.y+speedBox.height<700);
  await shot(width===390?'industrial-mobile':'industrial-mobile-320');
  await page.click('#tabletopMode');await page.waitForFunction(()=>window.braidbench.getState().loaded&&window.braidbench.getState().n===8);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width===390)await shot('mobile');
  await page.evaluate(()=>document.getElementById('formation').click());
  for(const id of ['speed','stageBefore','stageAfter']){const b=await page.locator('#'+id).boundingBox();assert(b.x>=0&&b.x+b.width<=width+.1);assert(b.y+b.height<700);}
  await shot('formation-mobile-'+width);
  await page.click('#industrialMode');
 }
 checks.push('320px and 390px: both modes fit width; simulation speed remains visible');
 await page.goto(url+'/docs/build-guide.html');await page.emulateMedia({media:'print'});await page.pdf({path:root+'/docs/build-guide.pdf',format:'A4',printBackground:true});
 await page.goto(url+'/docs/mechanism-audit.html');await page.pdf({path:root+'/docs/mechanism-audit.pdf',format:'A4',printBackground:true});
 await page.goto(url+'/docs/industrial-braiding.html');await page.pdf({path:root+'/docs/industrial-braiding.pdf',format:'A4',printBackground:true});await page.goto(url+'/docs/validation-method.html');await page.pdf({path:root+'/docs/validation-method.pdf',format:'A4',printBackground:true});checks.push('Build guide, industrial guide, audit and validation method print to PDF');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(root+'/docs/software-validation.json',JSON.stringify({browser:'Chromium / Playwright',checks,actual_phase_after_one_second:rate,page_errors:errors,limits:'Browser controls and render-state checks only. Pure topology, continuity and guide clearances are separate reports. Carrier-shoe contact, physical tensioner and hardware build are unqualified.'},null,2)+'\n');console.log(JSON.stringify({checks,rate,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
