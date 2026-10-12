import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createIndustrial} from './industrial.mjs';
import {createYarnMotion,crossingEvents} from './yarn-motion.mjs';
import {createStrandView} from './strand-view.mjs';
import {tensionRoute,tensionExit} from './tension-motion.mjs';
import {createTensionView} from './tension-view.mjs';
import {createTabletopSupply} from './tabletop-supply.mjs';
import {createCarrierMotion, carrierPartPose, wrapPhase} from './motion.mjs';
import {createBraidProfile} from './braid-profile.mjs';
const $=id=>document.getElementById(id), stage=$('stage');
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x0e1922,.00043);
const camera=new THREE.PerspectiveCamera(36,1,1,8000);camera.up.set(0,0,1);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;$('viewport').appendChild(renderer.domElement);
let renderRequested=true,renderCount=0,captureActive=false;
const orbit=new OrbitControls(camera,renderer.domElement);orbit.addEventListener('change',()=>{renderRequested=true;});orbit.enableDamping=true;orbit.dampingFactor=.09;orbit.minDistance=8;orbit.maxDistance=6000;orbit.maxPolarAngle=Math.PI*.98;
scene.add(new THREE.HemisphereLight(0xc9e8ff,0x49606d,2.1));const key=new THREE.DirectionalLight(0xffecd8,3.3);key.position.set(-300,-350,900);scene.add(key);const fill=new THREE.DirectionalLight(0x75cced,2.5);fill.position.set(350,150,600);scene.add(fill);
const grid=new THREE.GridHelper(1500,30,0x2e4654,0x21333f);grid.rotation.x=Math.PI/2;grid.position.z=-27;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
let assembly,parts,objects=[],model=new THREE.Group(),threads=new THREE.Group(),selected=null,highlight=null,n=8,explosion=0,playing=false,time=0,loadId=0,motion=null,speed=1,industrial=null,yarn=null,strandView=null,crossings=[],crossingIndex=0,inspectionPair=[0,1],tensionView=null,tabletopGuides=[];
scene.add(model,threads);
const crossingMarkers=[0,1].map(()=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:0xffffff}));m.visible=false;scene.add(m);return m;});
const geoCache=new Map(),matCache=new Map(),labels=[];
const labelDefs=[['01','Laser-cut base','Foundation'],['03','Geared drive','Rotor 1'],['05','Moving bobbins','Bobbin 1'],['07','Forming eye','Forming eye support'],['11','Motorised take-up','Driven capstan'],['13','ESP32 + drivers','Control tray']];
for(const [num,title,match] of labelDefs){const el=document.createElement('div');el.className='model-label';el.innerHTML=`<em>${num}</em>${title}`;$('labelsLayer').append(el);labels.push({el,match});}
function resize(){renderRequested=true;const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(assembly||industrial)frame();}new ResizeObserver(resize).observe(stage);
function frame(view='home') {
  const damping=orbit.enableDamping;orbit.enableDamping=false;orbit.update();orbit.enableDamping=damping;
  if(['formation','bobbin'].includes($('focus').value)){
    const bobbin=$('focus').value==='bobbin',p=motion.posesAt(time)[0];
    const a=bobbin?p.heading+(industrial?.5:Math.PI+.7):(crossings[crossingIndex]?.angle??0);
    if(industrial){orbit.target.set(bobbin?-58:111.5,bobbin?p.x:14*Math.cos(a),bobbin?225+p.y:225+14*Math.sin(a));camera.position.copy(orbit.target).add(new THREE.Vector3(bobbin?85:-14,Math.cos(a)*(bobbin?90:30),Math.sin(a)*(bobbin?90:30)+(bobbin?25:5)));}
    else{orbit.target.set(bobbin?p.x:0,bobbin?p.y:0,bobbin?140:384.5);camera.position.copy(orbit.target).add(new THREE.Vector3(Math.cos(a)*(bobbin?185:28),Math.sin(a)*(bobbin?185:28),bobbin?65:8));}
    if(camera.aspect<.8)camera.position.sub(orbit.target).multiplyScalar(.8/camera.aspect).add(orbit.target);orbit.update();return;
  }
  if(industrial){const b=new THREE.Box3();for(const o of objects)if(o.visible)b.expandByObject(o);const sphere=b.getBoundingSphere(new THREE.Sphere());orbit.target.copy(sphere.center);const d=Math.max(350,sphere.radius/Math.sin(camera.fov*Math.PI/360)/Math.min(camera.aspect,1)*1.1);const dir=view==='top'?new THREE.Vector3(1,0,.08):view==='front'?new THREE.Vector3(0,-1,.12):new THREE.Vector3(.52,-1,.55);camera.position.copy(sphere.center).addScaledVector(dir.normalize(),d);orbit.update();return;}const e=explosion, z=235+e*125, scale=1+e*.46;orbit.target.set(0,0,z);if(view==='top'){camera.position.set(0,-.01,z+1050*scale);}else if(view==='front'){camera.position.set(0,-1150*scale,z+60);}else{camera.position.set(720*scale,-1050*scale,z+650*scale);}if($('focus').value!=='all'&&objects.length){const b=new THREE.Box3();for(const o of objects)if(o.visible)b.expandByObject(o);const sphere=b.getBoundingSphere(new THREE.Sphere());orbit.target.copy(sphere.center);const d=Math.max(160,sphere.radius/Math.sin(Math.PI/10)*1.15);const dir=view==='top'?new THREE.Vector3(0,-.001,1):view==='front'?new THREE.Vector3(0,-1,.05):new THREE.Vector3(.65,-1,.65).normalize();camera.position.copy(sphere.center).addScaledVector(dir,d);}if(camera.aspect<.8&&$('focus').value==='all')camera.position.sub(orbit.target).multiplyScalar(.8/camera.aspect).add(orbit.target);orbit.update();}
function geometry(key){if(geoCache.has(key))return geoCache.get(key);const p=parts[key],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.vertices.flat(),3));g.setIndex(p.faces.flat());g.computeVertexNormals();geoCache.set(key,g);return g;}
function material(color,category){const k=color+category;if(!matCache.has(k))matCache.set(k,new THREE.MeshStandardMaterial({color,metalness:category==='hardware'?.58:.1,roughness:category==='hardware'?.37:.67,side:THREE.DoubleSide,flatShading:true}));return matCache.get(k);}
function clearScene(){scene.remove(model,threads);if(tensionView){tensionView.dispose();tensionView=null;}if(strandView){strandView.dispose();strandView=null;}for(const o of objects)for(const child of o.children){child.geometry?.dispose();child.material?.dispose();}yarn=null;if(industrial){industrial.dispose();industrial=null;}else{for(const c of threads.children){c.geometry?.dispose();c.material?.dispose();}}model=new THREE.Group();threads=new THREE.Group();scene.add(model,threads);objects=[];selected=null;if(highlight){scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=null;}}
function modeUI(isIndustrial){
  $('pairOnly').checked=false;
  scene.fog.density=isIndustrial?.00009:.00043;
  document.querySelector('.intro').textContent=isIndustrial?'A cable feeds through the centre. Moving bobbins braid its covering. A haul-off pulls it through.':'Spools exchange places. Threads cross. A second motor draws the braid upward.';
  $('tabletopOptions').hidden=isIndustrial;$('industrialOptions').hidden=!isIndustrial;
  $('tabletopMode').classList.toggle('active',!isIndustrial);$('industrialMode').classList.toggle('active',isIndustrial);
  $('downloadModels').hidden=isIndustrial;$('industrialGuide').hidden=!isIndustrial;
  $('prototypeTitle').textContent='Mechanism incomplete';
  $('prototypeText').textContent=isIndustrial?'Horn paths now drive the crossing history and braid. Guide contacts, tension hardware and material forces remain unverified. This is an axial maypole study, not a fabrication release.':'The braid now records the guides’ motion. The CAD still needs a constrained carrier shoe and a tension accumulator. Do not fabricate this as a working machine.';
  $('dimensionNote').textContent=isIndustrial?'Illustrative proportions':'420 × 380 mm base';$('unitsNote').textContent=isIndustrial?'Not dimensioned for fabrication':'Dimensions in mm';
  $('legend').hidden=isIndustrial;$('industrialLegend').hidden=!isIndustrial;
  $('top').textContent=isIndustrial?'Head view':'Top';
  $('partTitle').textContent=isIndustrial?'Two separate supplies':'The whole machine';
  $('partDescription').textContent=isIndustrial?'The large reel pays out the cable core. The small moving bobbins supply its braided covering. Click either supply, the forming guide or haul-off to follow the process.':'Click a part to see what it does and how to make it. Explode the assembly to reveal the drive below the track.';
  $('partMeta').textContent='';
  $('coreCutawayLabel').hidden=!isIndustrial;$('industrialFacts').hidden=!isIndustrial;$('braidOptions').hidden=isIndustrial;
  $('focus').innerHTML=isIndustrial?'<option value="all">Complete cable line</option><option value="supply">Core supply reel</option><option value="track">Head & moving bobbins</option><option value="takeup">Forming guide & haul-off</option><option value="electronics">Industrial controls</option>':'<option value="all">Complete machine</option><option value="drive">Drive & gear train</option><option value="track">Track & carriers</option><option value="takeup">Forming eye & take-up</option><option value="electronics">ESP32 & electronics</option>';
  $('focus').insertAdjacentHTML('beforeend','<option value="formation">Braid formation · close-up</option><option value="bobbin">Bobbin 1 · rotation</option>');
  const defs=isIndustrial?[['01','Core supply','Core supply reel'],['02','Moving braid supplies','Braiding head'],['03','Braid forms here','Forming guide'],['04','Haul-off','Caterpillar haul-off'],['05','Finished cable','Finished cable reel'],['06','Controls','Industrial controls']]:labelDefs;
  labels.forEach((label,i)=>{const [num,title,match]=defs[i];label.match=match;label.el.innerHTML=`<em>${num}</em>${title}`;});
}
async function load(count,profileData=null){const id=++loadId;$('loading').style.display='grid';try{
  let next;if(count==='industrial'){const c=+$('industrialCount').value;next=window.BRAID_DATA?.industrial[c]||await(await fetch(`models/industrial-motion-${c}.json`)).json();if(id!==loadId)return;}else{if(!parts)parts=window.BRAID_DATA?.parts||await (await fetch('models/parts.json')).json();next=window.BRAID_DATA?.assemblies[count]||await(await fetch(`models/assembly-${count}.json`)).json();if(id!==loadId)return;}
  const profileCount=count==='industrial'?+$('industrialCount').value:count;
  if(!profileData)profileData=window.BRAID_DATA?.profiles?.[profileCount]||await(await fetch(`models/braid-profile-${profileCount}.json`)).json();
  if(id!==loadId)return;
  const profile=createBraidProfile(profileData);
  clearScene();n=count;playing=false;time=0;assembly=count==='industrial'?null:next;modeUI(count==='industrial');
  $('play').textContent='▶ Run path study';$('phase').value=0;$('phaseValue').textContent='0°';
  if(count==='industrial'){
    scene.remove(model,threads);industrial=createIndustrial(+$('industrialCount').value,+$('ends').value,next,profile);model=industrial.model;threads=industrial.threads;objects=industrial.objects;scene.add(model,threads);motion=industrial.motion;yarn=industrial.yarn;crossings=industrial.crossings;
    $('viewTitle').textContent=`${industrial.count}-CARRIER / CABLE OVERBRAIDER`;
    $('configNote').textContent=`${industrial.count} carriers × ${industrial.ends} ends = ${industrial.count*industrial.ends} wires`;
    $('wireTotal').textContent=`${industrial.count} moving bobbins × ${industrial.ends} wires = ${industrial.count*industrial.ends} wires`;
  }else{
    for(const inst of assembly.instances){const part=parts[inst.part],m=new THREE.Mesh(geometry(inst.part),material(inst.color,part.category));m.userData=inst;m.rotation.order='ZYX';m.rotation.set(...inst.rot.map(a=>a*Math.PI/180));model.add(m);objects.push(m);
      if(inst.part==='bobbin'){
        const mark=new THREE.Mesh(new THREE.BoxGeometry(9,1.8,.6),new THREE.MeshBasicMaterial({color:0x132b39}));mark.position.set(8,0,42.35);mark.raycast=()=>{};m.add(mark);
      }
    }
    motion=createCarrierMotion(assembly);
    const guides=assembly.instances.filter(a=>a.part==='yarn-eye-post');tabletopGuides=guides;
    const supply=createTabletopSupply(guides,{wireRadius:profile?.wireDiameter/2||.13}),packageRadius=supply.packageRadius;
    tensionView=createTensionView(n,{wireRadius:profile?.wireDiameter/2||.13});model.add(tensionView.group);
    yarn=createYarnMotion(motion,{profile,spanHeight:205,supplyRadius:packageRadius,guideAt:supply.exitAt});crossings=crossingEvents(yarn);
    const colors=guides.map(a=>a.carrierDirection==='CW'?'#f0b467':'#51d5d3');
    strandView=createStrandView(yarn,{count:n,colors,thickness:profile?.wireDiameter/2||.13,toWorld:(x,y,z)=>[x,y,383+z],
      supplyAt:(c,t)=>supply.pathAt(motion.posesAt(t)[c],c,yarn.stateAt(c,t).stored)});
    threads.add(strandView.group);
    $('viewTitle').textContent=`${n}-STRAND / ROUND BRAIDER`;$('configNote').textContent=`${assembly.gears} linked rotors · ${n} carriers`;
    for(const [link,path] of [['cadLink',`cad/braidbench-${n}.step`],['glbLink',`models/braidbench-${n}.glb`],['freecadLink',`cad/braidbench-${n}.FCStd`]])$(link).href=path;
  }
  crossingIndex=0;inspectionPair=[0,crossings[0].b];
  $('phase').max=Math.round(motion.period*180/Math.PI);$('partCount').textContent=`${objects.length} components`;
  document.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('active',+b.dataset.count===n));updateModel();frame();$('loading').style.display='none';
}catch(err){$('loading').textContent='The model could not load. Run ./start.sh, then open http://localhost:8765. '+err.message;console.error(err);}}

function visible(inst){
  if(!$('hardware').checked&&parts[inst.part].category==='hardware')return false;
  const f=$('focus').value;
  if($('cutaway').checked&&inst.part==='forming-guide')return false;
  if(f==='formation')return inst.part==='forming-guide'||['carriers','bobbins','yarn'].includes(inst.group);
  if(f==='bobbin')return inst.carrier===0;
  if(f==='all')return inst.group!=='yarn'||$('threads').checked;
  if(f==='drive')return inst.group==='drive';
  if(f==='track')return ['track','carriers','bobbins','yarn'].includes(inst.group)&&(inst.group!=='yarn'||$('threads').checked);
  return inst.group===f;
}
function inspectOptions(){return {cutaway:$('cutaway').checked,coreCutaway:$('coreCutaway').checked,trace:$('trace').checked,pair:inspectionPair,onlyPair:$('pairOnly').checked};}
function updateReadout(){
  $('stageCrossings').hidden=$('focus').value!=='formation';$('filterBadge').hidden=!$('pairOnly').checked;
  if(!yarn)return;const e=crossings[crossingIndex],state=yarn.stateAt(0,time),p=motion.posesAt(time)[0];
  const noun=industrial&&industrial.ends>1?'Bundle':'Strand';
  $('crossingText').textContent=`${noun} 1 ${e.outer===0?'passes outside':'passes inside'} ${noun.toLowerCase()} ${e.b+1}. Outside passes over; inside passes under.`;
  $('motionReadout').textContent=`Carrier heading ${(wrapPhase(p.heading,2*Math.PI)*180/Math.PI).toFixed(0)}° · spool ${(state.spoolAngle/(2*Math.PI)).toFixed(2)} turns relative to carrier · ${state.paid.toFixed(1)} mm paid out`;
  $('patternReadout').textContent=`Measured from ${noun.toLowerCase()} 1: `+crossings.map(v=>v.outer===0?'O':'U').slice(0,16).join(' ')+` · over 2 / under 2${industrial&&industrial.ends>1?' bundles':''}`;
  const distance=(time-e.phase)*yarn.feedPerRadian;
  $('crossingDistance').textContent=distance<0?'· before this crossing':`· crossing carried ${distance.toFixed(2)} mm forward`;
  crossingMarkers.forEach((marker,i)=>{
    marker.visible=$('trace').checked&&$('threads').checked&&explosion===0&&distance>=0&&distance<(industrial?490:140)&&['all','formation'].includes($('focus').value);
    const c=inspectionPair[i],point=yarn.depositedPoint(c,time,Math.max(0,distance));
    const radius=Math.hypot(point.x,point.y),wireRadius=yarn.profile?.wireDiameter/2||(industrial?.08:.13),markRadius=wireRadius*.22,side=industrial?(Math.floor(industrial.ends/2)-(industrial.ends-1)/2)*.2:0,angle=Math.atan2(point.y,point.x)+side/radius,markedRadius=radius+wireRadius+markRadius*.7;
    marker.scale.setScalar(markRadius);
    if(industrial)marker.position.set(110+distance,markedRadius*Math.cos(angle),225+markedRadius*Math.sin(angle));else marker.position.set(markedRadius*Math.cos(angle),markedRadius*Math.sin(angle),383+distance);
  });
  $('tensionReadout').textContent=`Required stored slack: ${state.stored.toFixed(1)} mm. The shown dancer stores it with ${(state.stored/2).toFixed(1)} mm of travel. Its spring/brake and mounting are a mechanism study; they are not in the fabrication release.`;
}
function updateModel(){
  renderRequested=true;
  if(industrial){industrial.update(time,explosion,$('focus').value,$('threads').checked,$('hardware').checked,inspectOptions());updateReadout();if(selected&&highlight)highlight.setFromObject(selected);return;}
  if(!assembly)return;const positions=motion.posesAt(time);
  for(const ob of objects){const a=ob.userData;ob.visible=visible(a);ob.position.fromArray(a.pos).addScaledVector(new THREE.Vector3(...a.explode),explosion);
    if(a.carrier!==undefined)ob.rotation.z=a.rot[2]*Math.PI/180;
    if(a.carrier!==undefined&&explosion===0){const p=carrierPartPose(a,positions[a.carrier]);ob.position.x=p.x;ob.position.y=p.y;ob.rotation.z=p.yaw;
      if(['bobbin','yarn-package'].includes(a.part))ob.rotation.z+=yarn.stateAt(a.carrier,time).spoolAngle;
    }
    if(a.part.startsWith(`rotor-${n}-`)){const i=+a.part.split('-').at(-1)-1;ob.rotation.z=((-1)**i)*time;}
    if(a.part==='drive-pinion')ob.rotation.z=a.rot[2]*Math.PI/180-time*2;
    if(a.part==='capstan'||a.part==='idler'){ob.rotation.set(...a.rot.map(v=>v*Math.PI/180));ob.rotateZ((a.part==='capstan'?-1:1)*yarn.feedPerRadian*time/(a.part==='capstan'?20:18));}
  }
  tensionView.update(positions,tabletopGuides.map(a=>carrierPartPose(a,positions[a.carrier])),yarn,time,{visible:explosion===0&&['all','formation','bobbin','track'].includes($('focus').value),onlyFirst:$('focus').value==='bobbin'});
  threads.visible=$('threads').checked&&explosion<.02&&['all','formation','bobbin'].includes($('focus').value);
  if(threads.visible)strandView.update(time,$('focus').value==='bobbin'?{trace:false,pair:[0,0],onlyPair:true}:inspectOptions());
  updateReadout();if(selected&&highlight)highlight.setFromObject(selected);
}
function seekCrossing(offset=0,next=false){
  playing=false;$('play').textContent='▶ Run path study';
  if(explosion)setExplosion(0);
  if(next)crossingIndex=(crossingIndex+1)%crossings.length;
  const e=crossings[crossingIndex];inspectionPair=[0,e.b];time=e.phase+offset;
  $('phase').value=wrapPhase(time,motion.period)*180/Math.PI;$('phaseValue').textContent=`${Math.round(wrapPhase(time,motion.period)*180/Math.PI)}°`;
  $('trace').checked=true;$('focus').value='formation';updateModel();frame();
}
$('formation').onclick=()=>{$('pairOnly').checked=false;seekCrossing(-.16);};
$('beforeCrossing').onclick=()=>seekCrossing(-.16);$('atCrossing').onclick=()=>seekCrossing(0);$('afterCrossing').onclick=()=>seekCrossing(.16);$('nextCrossing').onclick=()=>seekCrossing(-.16,true);
$('stageBefore').onclick=()=>seekCrossing(-.16);$('stageAt').onclick=()=>seekCrossing(0);$('stageAfter').onclick=()=>seekCrossing(.16);$('stageNext').onclick=()=>seekCrossing(-.16,true);
for(const id of ['cutaway','coreCutaway','trace','pairOnly'])$(id).onchange=()=>updateModel();
function setExplosion(v){explosion=v/100;$('explode').value=v;$('explodeValue').textContent=`${Math.round(v)}%`;if(explosion>0){playing=false;$('play').textContent='▶ Run path study';time=0;$('phase').value=0;$('phaseValue').textContent='0°';}updateModel();frame();}
$('tabletopMode').onclick=()=>load(8);$('industrialMode').onclick=()=>load('industrial');$('industrialCount').onchange=$('ends').onchange=()=>load('industrial');
$('explode').oninput=e=>setExplosion(+e.target.value);$('assembled').onclick=()=>setExplosion(0);$('exploded').onclick=()=>setExplosion(100);$('home').onclick=()=>frame();$('top').onclick=()=>frame('top');$('front').onclick=()=>frame('front');document.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>load(+b.dataset.count));for(const id of ['hardware','threads','focus'])$(id).onchange=()=>{updateModel();if(id==='focus'){let target=$('focus').value==='drive'||$('focus').value==='track'?80:$('focus').value==='electronics'?30:$('focus').value==='takeup'?420:235;orbit.target.z=target+explosion*180;frame();}};
$('labels').onchange=()=>{renderRequested=true;};
$('play').onclick=()=>{if(explosion)setExplosion(0);playing=!playing;$('play').textContent=playing?'Ⅱ Pause path study':'▶ Run path study';};
$('speed').oninput=$('speed').onchange=e=>{speed=Number(e.target.value);const text=`${speed}×`;$('speedValue').textContent=text;$('speed').setAttribute('aria-valuetext',text);};
$('phase').oninput=e=>{const degrees=Number(e.target.value);playing=false;$('play').textContent='▶ Run path study';if(explosion)setExplosion(0);time=degrees*Math.PI/180;$('phase').value=degrees;$('phaseValue').textContent=`${degrees}°`;updateModel();};
let down;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect(),p=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(p,camera);const hits=ray.intersectObjects([...objects.filter(o=>o.visible),...((industrial?.tensionView??tensionView)?.getPickables()??[])]);if(!hits.length)return;selected=hits[0].object;const a=selected.userData,d=a.description?{description:a.description,category:a.category}:parts[a.part];$('partTitle').textContent=a.name.replace(/^\d+ \/ /,'');$('partDescription').textContent=d.description;let content=`${d.category.toUpperCase()} · ${a.part}`;if(['printed','experimental'].includes(d.category)&&!a.part.startsWith('track'))content+=`<a href="fabrication/printed/${a.part}.stl" download>Download prototype STL ↓</a>`;if(d.category==='laser'||a.part.startsWith('track'))content+=`<a href="fabrication/laser/${a.part}.svg" download>Laser SVG · nominal dimensions ↓</a>`;$('partMeta').innerHTML=content;if(highlight){scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();}highlight=new THREE.BoxHelper(selected,0x83ffff);scene.add(highlight);renderRequested=true;});
$('capture').onclick=()=>{renderView();const a=document.createElement('a');a.download=`braidbench-${n}-${explosion?'exploded':'assembled'}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();};
// Deterministic capture uses the same geometry and scene as interactive playback.
function captureFrame({phase=time,focus=$('focus').value,orbitAngle=0,zoom=1,roll=0}={}){
  captureActive=true;playing=false;time=phase;$('focus').value=focus;updateModel();frame();
  const offset=camera.position.clone().sub(orbit.target);
  offset.applyAxisAngle(new THREE.Vector3(...(industrial&&focus==='formation'?[1,0,0]:[0,0,1])),orbitAngle).multiplyScalar(zoom);
  camera.position.copy(orbit.target).add(offset);camera.lookAt(orbit.target);camera.updateMatrixWorld();
  if(roll)camera.rotateZ(roll);camera.updateMatrixWorld();
  renderView();renderRequested=false;
}
const clock=new THREE.Clock();function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.08);if(playing&&(assembly||industrial)){time+=dt*.25*speed;const phase=wrapPhase(time,motion.period);$('phase').value=phase*180/Math.PI;$('phaseValue').textContent=`${Math.round(phase*180/Math.PI)}°`;updateModel();}if(!captureActive)orbit.update();if(renderRequested){renderRequested=false;renderView();}}
function renderView(){if(threads.visible)(industrial?.strandView??strandView)?.updateCamera(camera,stage.clientHeight);
  const fell=$('fellLabel');if(['all','formation'].includes($('focus').value)&&explosion===0){const p=(industrial?new THREE.Vector3(110,0,225):new THREE.Vector3(0,0,383)).project(camera);const x=(p.x*.5+.5)*stage.clientWidth,y=(-p.y*.5+.5)*stage.clientHeight;fell.style.display=p.z<1&&x>0&&x<stage.clientWidth-80&&y>80&&y<stage.clientHeight-145?'block':'none';}else fell.style.display='none';
  for(const {el,match} of labels){const ob=objects.find(o=>o.userData.name.endsWith(match));if(!ob||!ob.visible||!$('labels').checked){el.style.display='none';continue;}const p=new THREE.Vector3();new THREE.Box3().setFromObject(ob).getCenter(p);p.project(camera);const x=(p.x*.5+.5)*stage.clientWidth,y=(-p.y*.5+.5)*stage.clientHeight;el.style.display=p.z<1&&x>0&&x<stage.clientWidth-110&&y>85&&y<stage.clientHeight-130?'block':'none';el.style.left=x+'px';el.style.top=y+'px';}renderer.render(scene,camera);renderCount++;}resize();frame();load(8);animate();window.braidbench={getState:()=>({n,explosion,time,components:objects.length,playing,speed,period:motion?.period,mode:industrial?'industrial':'tabletop',carriers:industrial?.count,ends:industrial?.ends,inspectionPair,crossing:crossings[crossingIndex],yarn:yarn?.stateAt(0,time),focus:$('focus').value,profile:{wireDiameter:yarn?.profile?.wireDiameter,formationFrames:yarn?.profile?.formation?.frames},render:{count:renderCount,...renderer.info.render,...(industrial?.strandView??strandView)?.getStats()},rotations:industrial?industrial.getRotations():{spool:objects.find(o=>o.userData.part==='bobbin'&&o.userData.carrier===0)?.rotation.z,carrier:objects.find(o=>o.userData.part==='carrier-body'&&o.userData.carrier===0)?.rotation.z},threadPoints:(industrial?.strandView??strandView)?.points[0],loaded:$('loading').style.display==='none'&&(!!assembly||!!industrial)}),setExplosion,load,captureFrame,endCapture:()=>{captureActive=false;orbit.update();renderRequested=true;},getPickablePoints:()=>((industrial?.tensionView??tensionView)?.getPickables()??[]).map(o=>{const p=o.getWorldPosition(new THREE.Vector3()).project(camera);return {name:o.userData.name,x:(p.x*.5+.5)*stage.clientWidth,y:(-p.y*.5+.5)*stage.clientHeight,depth:p.z};}),seek:(t)=>{time=t;const degrees=wrapPhase(t,motion.period)*180/Math.PI;$('phase').value=degrees;$('phaseValue').textContent=`${Math.round(degrees)}°`;updateModel();}};
