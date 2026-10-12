// Deterministic 1080 × 1920 exports of the actual viewer, with readable captions.
// npm install; npx playwright install chromium; npm start (in another terminal).
// node tools/export_social.cjs [tabletop|industrial|all] [--preview]
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),{once}=require('node:events');
const root=path.resolve(__dirname,'..'),choice=process.argv[2]||'all',preview=process.argv.includes('--preview');
const encoders=new Set();
const fps=24,duration=18,width=1080,height=1920;
const {createHash}=require('node:crypto');
function sourceHashes(kind){
 const files=['viewer/app.js',...fs.readdirSync(root+'/viewer').filter(n=>n.endsWith('.mjs')&&!['transfer-contact.mjs','transfer-lab.mjs','tension-mechanics.mjs','tension-lab.mjs'].includes(n)).map(n=>'viewer/'+n),`models/braid-profile-${kind==='tabletop'?8:72}.json`];
 return Object.fromEntries(files.sort().map(name=>[name,createHash('sha256').update(fs.readFileSync(root+'/'+name)).digest('hex')]));
}
const subtitleTime=seconds=>'00:00:'+String(seconds).padStart(2,'0')+',000';
function writeCaptions(kind){fs.writeFileSync(root+`/social/braidbench-${kind}.srt`,shots[kind].map((s,i)=>`${i+1}\n${subtitleTime(s.start)} --> ${subtitleTime(s.end)}\n${s.title.replace(/<br>/g,' ')}\n${s.caption}\n`).join('\n'));}
const shots={
 tabletop:[
  {start:0,end:4,focus:'track',phase:.45,rate:.65,zoom:.81,title:'How does motion<br>become a braid?',caption:'Eight moving bobbins exchange places.',tag:'08 STRANDS / TABLETOP'},
  {start:4,end:8,focus:'bobbin',phase:.45+4*.65,rate:.44,zoom:.85,title:'Follow the<br>thread.',caption:'The spool pays out. The dancer stores slack.',tag:'BOBBIN → GUIDES → BRAID'},
  {start:8,end:18,focus:'formation',phase:.45+4*.65+4*.44,rate:.3,zoom:.87,title:'Watch the<br>crossings form.',caption:'The take-up carries those crossings into the cord.',tag:'THE FORMING POINT / EXPOSED'}
 ],
 industrial:[
  {start:0,end:4,focus:'track',phase:.35,rate:.40,zoom:.78,title:'72 carriers.<br>576 wires.',caption:'Two families of bobbins travel around the core.',tag:'CABLE OVERBRAID / 72 × 8'},
  {start:4,end:8,focus:'bobbin',phase:.35+4*.4,rate:.35,zoom:1.05,roll:-1.5707963267948966,title:'One bobbin.<br>Eight ends.',caption:'Separate guides keep the parallel wires ordered.',tag:'FOLLOW THE SUPPLY'},
  {start:8,end:18,focus:'formation',phase:.35+4*.4+4*.35,rate:.24,zoom:.90,title:'Every wire.<br>Every crossing.',caption:'Individual paths interlace around the cable core.',tag:'THE FORMING POINT / EXPOSED'}
 ]
};
const css=`html,body{width:1080px!important;height:1920px!important;overflow:hidden!important;background:#0b151e!important}body>header,aside{display:none!important}main{display:block!important;width:1080px!important;height:1920px!important;min-height:0!important}#stage{position:absolute!important;left:0!important;top:355px!important;width:1080px!important;height:1290px!important;min-height:0!important;border:0!important;background:radial-gradient(ellipse at 50% 44%,#203746,#101e29 62%,#0b151e)!important}#viewport{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}#viewport canvas{width:1080px!important;height:1290px!important}#stage>*:not(#viewport){display:none!important}.social-head{position:fixed;top:85px;left:70px;right:70px;z-index:10}.social-brand{font:600 22px system-ui;letter-spacing:6px;color:#62d9d2;margin-bottom:36px}.social-title{font:500 80px/1.04 system-ui;letter-spacing:-4px;color:#edf5f7}.social-foot{position:fixed;bottom:112px;left:70px;right:110px;z-index:10}.social-tag{font:500 21px ui-monospace,monospace;letter-spacing:2px;color:#62d9d2;border-top:1px solid #36505f;padding-top:23px;margin-bottom:20px}.social-caption{font:400 34px/1.35 system-ui;color:#e1ebef;max-width:850px;margin-bottom:30px}.social-note{font:400 19px system-ui;color:#99adb9}.social-progress{height:3px;position:fixed;left:70px;right:70px;bottom:74px;background:#223845;z-index:10}.social-progress i{height:3px;display:block;background:#60d7cf;width:0}`;
(async()=>{
 fs.mkdirSync(root+'/social',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const kind of choice==='all'?['tabletop','industrial']:[choice]){
   if(!shots[kind])throw Error('Choose tabletop, industrial or all');
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(process.env.BRAIDBENCH_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>window.braidbench?.getState().loaded);
   if(kind==='industrial')await page.evaluate(()=>window.braidbench.load('industrial'));
   await page.addStyleTag({content:css});await page.evaluate(()=>{
    for(const id of ['labels','trace','pairOnly'])document.getElementById(id).checked=false;
    document.body.insertAdjacentHTML('beforeend','<div class="social-head"><div class="social-brand">⌁ BRAIDBENCH</div><div class="social-title"></div></div><div class="social-foot"><div class="social-tag"></div><div class="social-caption"></div><div class="social-note">Geometric simulation · prototype hardware</div></div><div class="social-progress"><i></i></div>');
   });await page.waitForTimeout(100);
   const indices=preview?[0,4*fps,8*fps,13*fps]:Array.from({length:duration*fps},(_,i)=>i);
   let encoder,done;
   if(!preview){encoder=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-threads','2','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart','-r',String(fps),root+`/social/braidbench-${kind}.mp4`],{stdio:['pipe','inherit','inherit']});encoders.add(encoder);done=once(encoder,'close');}
   for(const i of indices){
    const t=i/fps,shot=shots[kind].find(s=>t>=s.start&&t<s.end),local=(t-shot.start)/(shot.end-shot.start);
    await page.evaluate(({shot,local,t,duration})=>{
     document.querySelector('.social-title').innerHTML=shot.title;document.querySelector('.social-caption').textContent=shot.caption;document.querySelector('.social-tag').textContent=shot.tag;document.querySelector('.social-progress i').style.width=100*t/duration+'%';
     window.braidbench.captureFrame({phase:shot.phase+(t-shot.start)*shot.rate,focus:shot.focus,orbitAngle:shot.focus==='bobbin'?0:(local-.5)*.20,zoom:shot.zoom,roll:shot.roll||0});
    },{shot,local,t,duration});
    const png=await page.screenshot({type:'png',animations:'disabled'});
    if(preview)fs.writeFileSync(root+`/social/preview-${kind}-${Math.floor(t)}.png`,png);
    else{if(!encoder.stdin.write(png))await once(encoder.stdin,'drain');if(i%fps===0)console.log(kind,Math.floor(t)+'/'+duration+' sec');}
   }
   if(encoder){encoder.stdin.end();const [code]=await done;encoders.delete(encoder);if(code!==0)throw Error('ffmpeg failed: '+code);fs.writeFileSync(root+`/social/${kind}-export.json`,JSON.stringify({width,height,fps,duration,frames:indices.length,source:'actual Braidbench WebGL scene',audio:'none',page_errors:errors,shots:shots[kind],source_hashes:sourceHashes(kind)},null,2)+'\n');writeCaptions(kind);}
   if(errors.length)throw Error(errors.join('\n'));await page.close();
  }
 }finally{for(const encoder of encoders){encoder.stdin.destroy();encoder.kill('SIGTERM');}await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
