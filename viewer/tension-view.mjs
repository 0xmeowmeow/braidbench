import * as THREE from 'three';
// A visible ideal tension module. It demonstrates storage and payout; spring
// sizing, brake linkage and attachment details are deliberately not asserted.
export function createTensionView(count,{radius=2,top=178,bottom=172,industrial=false,wireRadius=.13,wirePitch=.2,ends=1,returnRadius=radius*.5}={}){
 const group=new THREE.Group(),modules=[],geos=[],mats=[],pickables=[];
 const metal=new THREE.MeshStandardMaterial({color:0x88a7b5,roughness:.55}),accent=new THREE.MeshStandardMaterial({color:0xd9cf90,roughness:.5});mats.push(metal,accent);
 const add=(g,m,parent)=>{geos.push(g);const ob=new THREE.Mesh(g,m);ob.raycast=()=>{};parent.add(ob);return ob;};
 const basis=new THREE.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1),baseRotation=new THREE.Quaternion().setFromRotationMatrix(basis);
 for(let c=0;c<count;c++){
  const root=new THREE.Group(),rails=[];group.add(root);
  for(const side of [-1,1]){
   const rail=add(new THREE.CylinderGeometry(radius*.16,radius*.16,1,6),metal,root);rail.rotation.x=Math.PI/2;rail.position.set(side*(radius+1),-radius,((top+bottom)/2));rails.push(rail);
   const eye=add(new THREE.TorusGeometry(radius*.34,radius*.12,6,12),accent,root);eye.position.set(side*radius,0,top);eye.scale.y=Math.max(1,((ends-1)*wirePitch/2+wireRadius*2)/(radius*.22));
  }
  const crossbar=add(new THREE.BoxGeometry(radius*2+3,radius*.5,1),metal,root);crossbar.position.set(0,-radius,top+5);
  const pulleyRadius=radius*Math.cos(Math.PI/32)-wireRadius-.005;
  const pulley=add(new THREE.CylinderGeometry(pulleyRadius,pulleyRadius,Math.max(radius*.34,(ends-1)*wirePitch+wireRadius*3),32),accent,root);
  const returnPulleyRadius=returnRadius*Math.cos(Math.PI/32)-wireRadius-.005;
  const fixed=add(new THREE.CylinderGeometry(returnPulleyRadius,returnPulleyRadius,Math.max(radius*.34,(ends-1)*wirePitch+wireRadius*3),32),accent,root);fixed.position.set(-radius-returnRadius,0,top);
  for(const [ob,part,name,description] of [[fixed,'ideal-return-pulley','Upper return pulley','The supply rises over this wheel and then descends to the dancer. Its axle stays fixed to the carrier; the yarn has a visible finite-radius return bend.'],[pulley,'ideal-dancer-pulley','Moving dancer pulley','This lower pulley moves to store surplus thread in two legs. Each millimetre of travel stores two millimetres of thread. The spring and brake are idealised; this module is not released fabrication CAD.']]){ob.userData={part,name:`Carrier ${c+1} / ${name}`,description,category:'illustration'};ob.raycast=THREE.Mesh.prototype.raycast;pickables.push(ob);}
  const axleLength=radius+Math.max(radius*.34,(ends-1)*wirePitch+wireRadius*3)+.6;
  const axle=add(new THREE.CylinderGeometry(radius*.10,radius*.10,axleLength,8),metal,root);axle.position.set(-radius-returnRadius,-radius/2,top);
  const movingAxle=add(new THREE.CylinderGeometry(radius*.10,radius*.10,axleLength,8),metal,root);
  if(!industrial){
   for(const [x,z,name] of [[-1,148.5,'Eye exit pulley'],[-3,150.5,'Outer feed pulley']]){
    const wheel=add(new THREE.CylinderGeometry(Math.cos(Math.PI/48)-wireRadius-.005,Math.cos(Math.PI/48)-wireRadius-.005,radius*.34,24),accent,root);wheel.position.set(x,0,z);
    wheel.userData={part:'ideal-inlet-pulley',name:`Carrier ${c+1} / ${name}`,description:'Routes the incoming thread above the ceramic eye and below the moving loop, then up its outside. The two visible turns prevent the thread crossing its own slack loop. Ideal guide hardware; not exported fabrication CAD.',category:'illustration'};wheel.raycast=THREE.Mesh.prototype.raycast;pickables.push(wheel);
    const shaft=add(new THREE.CylinderGeometry(radius*.10,radius*.10,axleLength,8),metal,root);shaft.position.set(x,-radius/2,z);
   }
   const inletBracket=add(new THREE.BoxGeometry(2.5,.5,.5),metal,root);inletBracket.position.set(-2,-radius,148.5);
  }
  const support=add(new THREE.CylinderGeometry(radius*.12,radius*.12,5,8),metal,root);support.rotation.x=Math.PI/2;support.position.set(-radius-returnRadius,-radius,top+2.5);
  const slider=add(new THREE.BoxGeometry(radius*2+2,radius*.6,1),metal,root);
  const springGeo=new THREE.BufferGeometry();springGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(81*3),3));geos.push(springGeo);
  const springMat=new THREE.LineBasicMaterial({color:0x8096a3});mats.push(springMat);const spring=new THREE.Line(springGeo,springMat);spring.frustumCulled=false;root.add(spring);
  modules.push({root,pulley,slider,movingAxle,rails,springGeo});
 }
 function update(poses,bases,yarn,t,{visible=true,onlyFirst=false}={}){
  group.visible=visible;
  modules.forEach((m,c)=>{
   const p=poses[c],g=bases[c],depth=bottom-yarn.stateAt(c,t).stored/2;m.root.visible=!onlyFirst||c===0;
   if(industrial){m.root.position.set(0,g.x,225+g.y);m.root.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),p.heading)).multiply(baseRotation);}
   else{m.root.position.set(g.x,g.y,0);m.root.rotation.z=p.heading;}
   const lower=bottom-Math.ceil(yarn.maxStored[c]/2)-3,upper=top+6;
   for(const rail of m.rails){const foot=!industrial&&rail.position.x<0?Math.min(lower,147.5):lower;rail.scale.y=upper-foot;rail.position.z=(upper+foot)/2;}
   m.pulley.position.set(0,0,depth);m.slider.position.set(0,-radius,depth);m.movingAxle.position.set(0,-radius/2,depth);
   const v=m.springGeo.attributes.position.array;for(let j=0;j<=80;j++){const a=j/80*Math.PI*12;v.set([Math.cos(a)*radius*.3,-radius+Math.sin(a)*radius*.3,depth+(top+5-depth)*j/80],j*3);}m.springGeo.attributes.position.needsUpdate=true;
  });
 }
 function dispose(){for(const g of geos)g.dispose();for(const m of mats)m.dispose();}
 return {group,update,dispose,getPickables:()=>group.visible?pickables.filter(o=>o.parent.visible):[]};
}
