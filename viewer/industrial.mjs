import * as THREE from 'three';
import {createCarrierMotion} from './motion.mjs';
import {createYarnMotion, crossingEvents} from './yarn-motion.mjs';
import {createStrandView} from './strand-view.mjs';
import {tensionRoute,tensionExit} from './tension-motion.mjs';
import {createTensionView} from './tension-view.mjs';
import {createIndustrialSupply} from './industrial-supply.mjs';
import {createTurningComb} from './guide-comb.mjs';
import {spurGeometry, hornGeometry, headPlane} from './horn-geometry.mjs';

// Axial maypole kinematics. Rotor geometry, pockets and carrier positions share
// one phase model. This is not a released industrial machine/contact design.
const TAU=Math.PI*2, height=225;
export function createIndustrial(count=72, ends=8, data,profile=null){
  const model=new THREE.Group(), threads=new THREE.Group(), objects=[], carriers=[], reels=[], rotors=[];
  const motion=createCarrierMotion(data),r=motion.orbitRadius,guideOffset=r*.35,packageRadius=r*.20;
  const supply=createIndustrialSupply(motion),{guideAt,dancerFrame}=supply;
  const yarn=createYarnMotion(motion,{profile,braidRadius:15.5,relief:.8,feedPerRadian:2/data.gears/.027,spanHeight:125,supplyRadius:packageRadius+.08,guideAt:p=>dancerFrame(p).exit,extraFreeAt:supply.extraFreeAt});
  const crossings=crossingEvents(yarn), colors=data.instances.map(a=>a.carrierDirection==='CW'?'#e9b26b':'#57d6d0');
  const mats=new Map(), geos=new Map();
  function mat(color){if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,metalness:.22,roughness:.48}));return mats.get(color);}
  function geo(key,build){if(!geos.has(key))geos.set(key,build());return geos.get(key);}
  function add(geometry,color,name,description,pos,group='frame',explode=[0,0,0]){
    const ob=new THREE.Mesh(geometry,mat(color));ob.position.fromArray(pos);ob.userData={part:'industrial',name,description,category:'illustration',group,pos:[...pos],explode,rot:[0,0,0]};model.add(ob);objects.push(ob);return ob;
  }
  function box(size,color,name,desc,pos,group,ex){return add(geo('b'+size,()=>new THREE.BoxGeometry(...size)),color,name,desc,pos,group,ex);}
  function cyl(r,length,color,name,desc,pos,group,ex,axis='x'){
    const ob=add(geo(`c${r}/${length}`,()=>new THREE.CylinderGeometry(r,r,length,40)),color,name,desc,pos,group,ex);
    if(axis==='x')ob.rotation.z=Math.PI/2;else if(axis==='z')ob.rotation.x=Math.PI/2;
    return ob;
  }
  function ring(r,t,color,name,desc,pos,group,ex){const ob=add(geo(`t${r}/${t}`,()=>new THREE.TorusGeometry(r,t,8,160)),color,name,desc,pos,group,ex);ob.rotation.y=Math.PI/2;return ob;}
  box([1480,355,18],'#2b414d','Machine bed','Schematic steel machine bed. This industrial comparison has no laser-cut or printed fabrication release.',[0,0,0]);
  const reelDesc='A large stationary-axis reel stores the central cable. It rotates to pay cable into the braiding head; it does not supply the diagonal braid wires.';
  for(const [x,out] of [[-560,false],[600,true]]){
    const name=out?'Finished cable reel':'Core supply reel',desc=out?'Collects the finished braided cable. A separate haul-off controls line speed; reel speed must change as the wound diameter changes.':reelDesc;
    for(const y of [-91,91]){box([155,18,137],'#526b78',name+' stand',desc,[x,y,78],out?'takeup':'supply',[out?100:-100,0,0]);
      reels.push(cyl(110,9,'#84929b',name,desc,[x,y,height-75],out?'takeup':'supply',[out?100:-100,0,20],'y'));}
    reels.push(cyl(75,170,out?'#ac8e65':'#344b60',name,desc,[x,0,height-75],out?'takeup':'supply',[out?100:-100,0,20],'y'));
    // A radial marker makes paying out / winding visible without implying capacity simulation.
    const marker=box([62,2,7],'#67d8d1',name+' rotation marker',desc,[x+35,-97,height-75],out?'takeup':'supply',[out?100:-100,0,20]);
    reels.push(marker);marker.userData.reelCentre=[x,-97,height-75];
  }
  const headDesc='An axial maypole: meshing spur gears turn four-pocket horn disks. Carriers transfer at neighbouring pockets. A real guide shoe must constrain both route and carrier orientation; its contact geometry is not qualified here.';
  for(const y of [-128,128])box([65,30,210],'#526b78','Braiding head pedestal',headDesc,[-155,y,112],'drive',[-50,0,0]);
  ring(173,13,'#526b78','Braiding head',headDesc,[-145,0,height],'drive',[-65,0,0]);
  let gearPhase=0;
  for(let i=0;i<data.gears;i++){
    const a=TAU*i/data.gears,y=146*Math.cos(a),z=height+146*Math.sin(a);
    if(i){const beta=TAU*(i-1)/data.gears+Math.PI/2+Math.PI/data.gears;gearPhase=(2*beta-Math.PI+Math.PI/40-gearPhase)%(TAU/40);}
    const gear=add(geo('spur',()=>headPlane(spurGeometry(r,40,5))),'#a5b8c0',`Drive gear ${i+1}`,headDesc,[-153,y,z],'drive',[-65,0,0]);
    const horn=add(geo('horn',()=>headPlane(hornGeometry(r,5))),'#e39b65',`Horn disk ${i+1}`,headDesc,[-125,y,z],'track',[-25,0,0]);
    const lane=ring(r,.32,'#698b9b',`Guide centreline ${i+1}`,'Ideal guide centreline only. This line is not a fabricated slot or a contact-qualified transfer shoe.',[-116,y,z],'track',[-20,0,0]);
    rotors.push({gear,horn,gearPhase,hornPhase:data.rotorPhases[i],sign:(-1)**i});
    cyl(r*.15,30,'#7592a3',`Rotor shaft ${i+1}`,headDesc,[-138,y,z],'drive',[-45,0,0]);
  }
  cyl(40,70,'#3b6976','Braider drive','Illustrative industrial drive. This machine class needs an engineered drive, tension control and guarding; the tabletop ESP32 firmware does not control it.',[-195,-170,95],'drive',[-95,-20,0]);
  const core=cyl(14,1160,'#263b50','Cable core','The cable enters from its own supply reel and passes along the centre of the braiding head. The moving bobbins supply the surrounding braid.',[20,0,height],'core',[0,0,-65]);
  const coreSections=[[-255,610],[375,450]].map(([x,length])=>cyl(14,length,'#263b50','Core outside the cutaway','The core remains visible upstream and downstream; only the 100 mm region around formation is cut away.',[x,0,height],'core',[0,0,-65]));
  const forming=ring(20,3,'#b3c4ce','Forming guide','Wires meet the cable at the fell. This guide supports the braid; it does not weave it. Cutaway mode exposes this point.',[110,0,height],'takeup',[65,0,40]);
  box([18,28,190],'#526b78','Forming guide support','Supports the forming guide downstream of the braiding head.',[110,0,115],'takeup',[65,0,0]);
  for(const z of [height-26,height+26]){
    box([170,62,18],'#526b78','Caterpillar haul-off','Opposed belts pull the braided cable at a controlled line speed. The ratio of haul-off speed to carrier motion sets braid angle and pitch.',[350,0,z],'takeup',[75,0,z>height?70:-40]);
    for(const x of [278,422])cyl(14,64,'#1e2e36','Haul-off roller','Illustrative belt drive rollers. Belt tracks and pressure adjustment are omitted.',[x,0,z],'takeup',[75,0,z>height?70:-40],'y');
  }
  box([68,58,85],'#526b78','Industrial controls','Industrial drives, carrier tension regulation, break/run-out detection and synchronized haul-off. This is not an ESP32 wiring plan.',[180,130,52],'electronics',[0,80,0]);
  box([2,43,32],'#65cfc8','Operator display','Carrier count describes moving packages. Ends per carrier describes parallel wires travelling together from each package.',[144,130,69],'electronics',[0,80,0]);
  for(let i=0;i<count;i++){
    const color=colors[i],desc=`Finite moving package carrying ${ends} parallel end(s). The marked flange rotates relative to its carrier as material pays out. Package radius is held constant in this kinematic study.`;
    const make=(geometry,color,name,description,group='bobbins')=>add(geometry,color,name,description,[0,0,0],group);
    const axial=(rr,length)=>geo(`axial${rr}/${length}`,()=>new THREE.CylinderGeometry(rr,rr,length,24).rotateZ(Math.PI/2));
    const base=make(axial(r*.24,4),'#6b8797',`Carrier ${i+1}`,headDesc,'carriers');
    const neck=make(axial(r*.10,12),'#91a8b5',`Carrier ${i+1} drive pin`,'Connects the moving carrier to its current horn pocket. The transfer route is prescribed; the contact shoe still requires engineering.','carriers');
    const spindle=make(axial(r*.075,47),'#c7d2d8',`Bobbin ${i+1} spindle`,'The bobbin rotates on this carrier-mounted spindle. The shaft and guide arm travel with the carrier, independently of spool payout.','carriers');
    const collar=make(axial(r*.14,2),'#8dabb9',`Bobbin ${i+1} retaining collar`,'Retains the rotating bobbin on its spindle. Illustrative mount, not a dimensioned bearing or fastening design.','carriers');
    const spool=make(axial(packageRadius,r*.9),color,`Braid supply bobbin ${i+1}`,desc);
    const flanges=[0,1].map(j=>make(axial(r*.27,1.2),'#adb7ba',`Bobbin ${i+1} flange`,desc));
    const stripe=make(geo('stripe',()=>new THREE.BoxGeometry(.10,r*.075,r*.045).translate(0,r*.2175,0)),'#172a36',`Spool index ${i+1}`,desc);
    const armLength=guideOffset-r*.09;
    const arm=make(geo('arm',()=>new THREE.BoxGeometry(2,armLength,r*.06).translate(0,armLength/2,0)),color,`Carrier arm ${i+1}`,'This offset arm makes carrier orientation visible. The arm follows the track tangent; physical guide contacts remain to be engineered.','carriers');
    const eye=make(geo('eye',()=>headPlane(new THREE.TorusGeometry(r*.10,r*.022,6,16))),color,`Yarn eye ${i+1}`,'The carrier brings its own supply and guide. No stationary outer creel feeds this moving bobbin.','carriers');
    const turningComb=make(geo('turning-comb',()=>createTurningComb({ends,orbitRadius:r,guideOffset,packageRadius})),'#819ca5',`Payout turning comb ${i+1}`,'Open curved channels support the parallel ends as they turn away from the package. Each end has its own turn radius. The backing and carrier brace remain visible; guide friction and manufacture are unqualified.','carriers');
    const bracket=make(geo('tension-bracket',()=>new THREE.CylinderGeometry(.5,.5,1,8)),'#91a8b5',`Carrier ${i+1} swivel support`,'Connects the carrier arm to the guide-bank pivot. The bearing, brake and fastening details remain a mechanism study.','carriers');
    const pivot=make(geo('tension-pivot',()=>headPlane(new THREE.TorusGeometry(1.1,.18,8,20))),'#d4c48e',`Carrier ${i+1} guide-bank pivot`,'An ideal self-aligning guide bank turns about the delivery axis to keep the parallel ends in order. This is prescribed guide orientation, not a solved bearing or wire-torsion model.','carriers');
    const crossbar=make(geo('tension-crossbar',()=>new THREE.BoxGeometry(1,r*.16+3,r*.12).translate(0,0,-r*.08)),'#91a8b5',`Carrier ${i+1} tensioner crossbar`,'Supports both dancer rails from the travelling guide-bank pivot.','carriers');
    carriers.push({base,neck,spindle,collar,spool,flanges,stripe,arm,eye,turningComb,bracket,pivot,crossbar});
  }
  const wireRadius=.08,wirePitch=.20;
  const tensionOptions={radius:r*.08,top:-15,bottom:-37,industrial:true,wireRadius,wirePitch,ends},tensionView=createTensionView(count,tensionOptions);model.add(tensionView.group);
  const strandView=createStrandView(yarn,{count,ends,length:490,colors,thickness:wireRadius,wirePitch,
    toWorld:(y,z,x)=>[110+x,y,height+z],
    supplyAt:(c,t,side)=>supply.pathAt(motion.posesAt(t)[c],side,yarn.stateAt(c,t).stored,c)});
  threads.add(strandView.group);
  let lastPoses;
  // Cache poses once per frame for supplyAt, which is called for every end.
  const originalPoses=motion.posesAt;let cachedT=NaN,cachedPoses;
  motion.posesAt=t=>{if(t!==cachedT){cachedT=t;cachedPoses=originalPoses(t);}return cachedPoses;};
  function update(t,explosion,focus,showThreads,showHardware,{cutaway=true,coreCutaway=false,trace=false,pair=[0,1],onlyPair=false}={}){
    const inspect=['formation','bobbin'].includes(focus);
    for(const ob of objects){const a=ob.userData;
      ob.position.fromArray(a.pos).addScaledVector(new THREE.Vector3(...a.explode),explosion);
      ob.visible=(focus==='all'||inspect||(focus==='track'?['drive','track','carriers','bobbins'].includes(a.group):a.group===focus))&&(showHardware||!['frame','drive'].includes(a.group));
      if(inspect&&['frame','electronics','takeup','supply'].includes(a.group))ob.visible=false;
    }
    core.visible=!coreCutaway&&(focus==='all'||focus==='formation');for(const section of coreSections)section.visible=coreCutaway&&(focus==='all'||focus==='formation');forming.visible=!cutaway&&(focus==='all'||inspect||focus==='takeup');
    lastPoses=motion.posesAt(t);
    for(const rotor of rotors){rotor.gear.rotation.x=rotor.gearPhase+rotor.sign*(data.initialPhase+t);rotor.horn.rotation.x=rotor.hornPhase+rotor.sign*(data.initialPhase+t);}
    for(let i=0;i<count;i++){
      const c=carriers[i],p=lastPoses[i],g=guideAt(p),state=yarn.stateAt(i,t),scale=1+explosion*.32;
      const y=p.x*scale,z=height+p.y*scale,x=-90+explosion*85;
      c.base.position.set(-112+explosion*20,y,z);c.base.rotation.x=p.heading;
      c.neck.position.set(-118+explosion*20,y,z);c.neck.rotation.x=p.heading;
      c.spindle.position.set(-88.5+explosion*20,y,z);c.spindle.rotation.x=p.heading;
      c.collar.position.set(x+r*.45+2.2,y,z);c.collar.rotation.x=p.heading;
      c.spool.position.set(x,y,z);c.spool.rotation.x=p.heading+state.spoolAngle;
      c.flanges.forEach((ob,j)=>{ob.position.set(x+(j-.5)*(r*.9+1.2),y,z);ob.rotation.x=p.heading+state.spoolAngle;});
      c.stripe.position.set(x+r*.45+1.25,y,z);c.stripe.rotation.x=p.heading+state.spoolAngle;
      c.arm.position.set(-65+explosion*85,y,z);c.arm.rotation.x=p.heading;
      c.eye.position.set(-65+explosion*85,y+guideOffset*Math.cos(p.heading),z+guideOffset*Math.sin(p.heading));
      const f=dancerFrame(p),shift=new THREE.Vector3(explosion*85,p.x*(scale-1),p.y*(scale-1));
      const turn=p.heading-Math.asin((packageRadius+.08)/guideOffset);c.turningComb.position.set(-88.6,g.x-1.4*Math.cos(turn),height+g.y-1.4*Math.sin(turn)).add(shift);c.turningComb.rotation.x=turn;
      const a=new THREE.Vector3(-65,p.x+(guideOffset-r*.10)*Math.cos(p.heading),height+p.y+(guideOffset-r*.10)*Math.sin(p.heading));
      const b=new THREE.Vector3(-28,f.exit.x-1.1*Math.sin(p.heading),height+f.exit.y+1.1*Math.cos(p.heading)),direction=b.clone().sub(a);
      c.bracket.position.copy(a).add(b).multiplyScalar(.5).add(shift);c.bracket.scale.y=direction.length();c.bracket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
      c.pivot.position.set(-28,f.exit.x,height+f.exit.y).add(shift);
      c.crossbar.position.set(-28,f.base.x,height+f.base.y).add(shift);c.crossbar.rotation.x=f.heading;
      if(focus==='bobbin')for(const ob of [c.base,c.neck,c.spindle,c.collar,c.spool,...c.flanges,c.stripe,c.arm,c.eye,c.turningComb,c.bracket,c.pivot,c.crossbar])ob.visible=i===0;
    }
    const frames=lastPoses.map(dancerFrame);tensionView.update(frames,frames.map(f=>f.base),yarn,t,{visible:explosion===0&&['all','formation','bobbin','track'].includes(focus),onlyFirst:focus==='bobbin'});
    strandView.update(t,focus==='bobbin'?{trace:false,pair:[0,0],onlyPair:true,coreCutaway}:{trace,pair,onlyPair,coreCutaway});threads.visible=showThreads&&explosion<.02&&['all','formation','bobbin'].includes(focus);
    for(const ob of reels)if(ob.userData.reelCentre){const [x,y,z]=ob.userData.reelCentre,a=yarn.feedPerRadian*t/75;ob.position.set(x+35*Math.cos(a),y,z+35*Math.sin(a));ob.rotation.y=-a;ob.position.addScaledVector(new THREE.Vector3(...ob.userData.explode),explosion);}
  }
  function dispose(){for(const g of geos.values())g.dispose();for(const m of mats.values())m.dispose();strandView.dispose();tensionView.dispose();}
  return {model,threads,objects,update,dispose,period:motion.period,count,ends,motion,yarn,crossings,strandView,tensionView,guideAt,height,getRotations:()=>({spool:carriers[0].spool.rotation.x,carrier:carriers[0].base.rotation.x})};
}
