// Final focused review after the main browser run reached its PDF-export step.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1060}}),errors=[],checks=[],rates=[];page.on('pageerror',e=>errors.push(e.message));
 const state=()=>page.evaluate(()=>window.braidbench.getState());
 const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);await page.screenshot({path:root+'/previews/'+name+'.png'});};
 const click=id=>page.evaluate(id=>document.getElementById(id).click(),id);
 const focus=async value=>page.evaluate(value=>{const e=document.getElementById('focus');e.value=value;e.dispatchEvent(new Event('change'));},value);
 await page.goto(process.env.BRAIDBENCH_URL||'http://localhost:8765');await page.waitForFunction(()=>window.braidbench?.getState().loaded);
 for(const n of [8,12,16,48,72]){
  await page.evaluate(async n=>{if(n>20){document.getElementById('industrialCount').value=n;await window.braidbench.load('industrial');}else await window.braidbench.load(n);},n);
  await click('formation');await click('stageAt');let s=await state();assert.equal(s.time,s.crossing.phase);assert.equal(s.focus,'formation');assert.equal(await page.locator('#filterBadge').isVisible(),false);
  await click('stageAfter');s=await state();assert.ok(s.time>s.crossing.phase);assert.ok(s.threadPoints.length>140);
  if(n===8||n===72){await shot(n===8?'formation-tabletop-all':'formation-industrial-all');await click('pairOnly');await shot(n===8?'formation-tabletop':'formation-industrial');await click('pairOnly');}
  await page.evaluate(()=>{const s=window.braidbench.getState();window.braidbench.seek(s.period-.001)});const before=await state();
  await page.evaluate(()=>{const s=window.braidbench.getState();window.braidbench.seek(s.period+.001)});s=await state();assert(s.yarn.paid>=before.yarn.paid);assert(Math.abs(s.yarn.spoolAngle-before.yarn.spoolAngle)<.02);assert(Math.abs(Math.sin(s.rotations.spool-s.rotations.carrier-s.yarn.spoolAngle))<1e-8);
  if(n===8){await page.evaluate(()=>window.braidbench.seek(.7));await focus('bobbin');await shot('bobbin-tension');}
  if(n===72){await focus('all');await shot('industrial');}
  console.log('Reviewed',n);checks.push(`${n}: stage crossing controls, optional isolated-pair badge, continuous supply/loop/output, independent rendered spool angle and circuit-seam payout`);
 }
 await page.goto('file://'+root+'/OPEN-MODEL.html');await page.waitForFunction(()=>window.braidbench?.getState().loaded);
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 for(const speed of ['0.25','1','4']){
  await page.evaluate(speed=>{window.braidbench.seek(0);const e=document.getElementById('speed');e.value=speed;e.dispatchEvent(new Event('change'));document.getElementById('play').click();},speed);
  await page.clock.runFor(1000);await click('play');rates.push((await state()).time);
 }
 assert(rates[0]>.04&&rates[0]<.09);assert(Math.abs(rates[1]/rates[0]-4)<.3);assert(Math.abs(rates[2]/rates[1]-4)<.3);await page.clock.resume();
 checks.push('Offline viewer and controlled clock: 0.25× / 1× / 4× actual playback ratios');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await click('formation');await page.click('#stageBefore');const before=(await state()).time;await page.click('#stageAfter');assert((await state()).time>before);
  for(const id of ['speed','stageBefore','stageAfter']){const b=await page.locator('#'+id).boundingBox();assert(b.x>=0&&b.x+b.width<=width+.1);assert(b.y+b.height<700);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot('formation-mobile-'+width);
 }
 checks.push('320px / 390px: model and crossing controls visible together, speed in view, no horizontal overflow');
 await page.emulateMedia({media:'print'});
 for(const doc of ['build-guide','industrial-braiding','mechanism-audit','validation-method']){await page.goto('file://'+root+'/docs/'+doc+'.html');await page.pdf({path:root+'/docs/'+doc+'.pdf',format:'A4',printBackground:true});}
 checks.push('All four current guides exported as PDF');assert.deepEqual(errors,[]);
 fs.writeFileSync(root+'/docs/software-validation.json',JSON.stringify({browser:'Chromium / Playwright',checks,actual_phase_after_one_second:rates,page_errors:errors,limits:'No physical build, carrier-shoe contact, spring/brake or wire-torsion validation.'},null,2)+'\n');console.log(JSON.stringify({checks,rates,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
