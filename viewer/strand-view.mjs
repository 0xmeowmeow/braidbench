import * as THREE from 'three';
import {createStrandSampler} from './strand-sampling.mjs';
import {updateStrandTube,createSupplyTubes} from './strand-tube.mjs';
import {createStrandOutput} from './strand-output.mjs';
// One continuous polyline per end: supply → guide → fell → deposited history.
// Thick inspection strands use exactly those same centreline coordinates.
export function createStrandView(yarn,{count,ends=1,length=140,segments=128,colors,toWorld,supplyAt,wirePitch=.2,thickness=.15}){
 const sampler=createStrandSampler(yarn,{length});
 const group=new THREE.Group(),steps=96,points=Array.from({length:count},()=>[]),supplyPaths=Array.from({length:count},()=>[]);
 const output=createStrandOutput(yarn,sampler,{ends,colors,wirePitch,toWorld,thickness});group.add(output.group);
 const positions=new Float32Array(count*ends*steps*2*3),rgb=new Float32Array(positions.length);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(rgb,3));
 const material=new THREE.LineBasicMaterial({vertexColors:true});const lines=new THREE.LineSegments(geometry,material);lines.frustumCulled=false;group.add(lines);
 const supplyTubes=yarn.profile?createSupplyTubes(thickness):null;if(supplyTubes)group.add(supplyTubes.mesh);
 let supplySolid=!!supplyTubes,lastEntries=[],supplyVersion=0,lastCameraKey='';
 const traced=[];for(let i=0;i<2;i++){const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:i===0?0xffc477:0x72ffff,roughness:.42,emissive:i===0?0x39280d:0x083636}));mesh.frustumCulled=false;mesh.raycast=()=>{};group.add(mesh);traced.push(mesh);}
 function update(t,{trace=false,pair=[0,1],onlyPair=false,coreCutaway=false}={}){
  output.update(t,{trace,pair,onlyPair,coreCutaway});
  let cursor=0;const entries=[];
  for(let c=0;c<count;c++){
   const col=new THREE.Color(colors[c]);if(trace&&!pair.includes(c))col.multiplyScalar(.5);
   const color=col.toArray(),record=c===0||(trace&&pair.includes(c));
   const formed=record?sampler.pathAt(c,t):null,tip=yarn.depositedPoint(c,t,0),approach=yarn.profile?.approachAt(c,t);
   for(let end=0;end<ends;end++){
    const side=(end-(ends-1)/2)*wirePitch,offset=side/Math.hypot(tip.x,tip.y),co=Math.cos(offset),si=Math.sin(offset),start=supplyAt(c,t,side,end);
    const offsetPoint=([x,y,z])=>{const a=side/Math.hypot(x,y);return toWorld(x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a),z);};
    const path=[...start,...(approach?approach.slice(1).map(offsetPoint):[toWorld(tip.x*co-tip.y*si,tip.x*si+tip.y*co,0)])];
    supplyPaths[c][end]=path;
    if(record&&end===Math.floor(ends/2))points[c]=[...path.slice(0,-1),...formed.map(offsetPoint)];
    if(onlyPair&&!pair.includes(c))continue;
    if(supplyTubes)entries.push({path,color,frame:output.headFrame(c,end)});
    for(let j=1;j<path.length;j++)for(const p of [path[j-1],path[j]]){positions.set(p,cursor);rgb.set(color,cursor);cursor+=3;}
   }
  }
  geometry.setDrawRange(0,cursor/3);geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
  lastEntries=entries;supplyVersion++;
  traced.forEach((mesh,i)=>{
   mesh.visible=trace&&!supplyTubes;
   if(!mesh.visible)return;
   mesh.material.color.set(colors[pair[i]]);mesh.material.emissive.copy(mesh.material.color).multiplyScalar(.1);
   updateStrandTube(mesh.geometry,yarn.profile?supplyPaths[pair[i]][Math.floor(ends/2)]:points[pair[i]],thickness);
  });
 }
 const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
 function updateCamera(camera,pixelHeight){
  output.updateCamera(camera,pixelHeight);if(!supplyTubes)return;
  let nearestSquared=Infinity;
  for(const entry of lastEntries)for(const p of entry.path)nearestSquared=Math.min(nearestSquared,(p[0]-camera.position.x)**2+(p[1]-camera.position.y)**2+(p[2]-camera.position.z)**2);
  const pixels=2*thickness*pixelHeight/(2*Math.tan(camera.fov*Math.PI/360)*Math.max(1,Math.sqrt(nearestSquared))),next=pixels>.8;
  const key=[supplyVersion,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join(',');
  if(next&&key!==lastCameraKey){
   frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const entries=[];
   for(const entry of lastEntries){let first=Infinity,last=-1;const path=entry.path;
    for(let j=1;j<path.length;j++){const a=path[j-1],b=path[j];let visible=true;for(const plane of frustum.planes){const n=plane.normal,da=n.x*a[0]+n.y*a[1]+n.z*a[2]+plane.constant,db=n.x*b[0]+n.y*b[1]+n.z*b[2]+plane.constant;if(Math.max(da,db)<-thickness){visible=false;break;}}if(visible){first=Math.min(first,j-1);last=j;}}
    if(last>=0){first=Math.max(0,first-1);last=Math.min(path.length-1,last+1);entries.push({...entry,path:path.slice(first,last+1),frame:last===path.length-1?entry.frame:null});}
   }
   supplyTubes.update(entries);lastCameraKey=key;
  }
  supplySolid=next;supplyTubes.mesh.visible=next;lines.visible=!next;
 }
 function dispose(){geometry.dispose();material.dispose();output.dispose();supplyTubes?.dispose();for(const o of traced){o.geometry.dispose();o.material.dispose();}}
 return {group,update,dispose,points,supplyPaths,sampler,updateCamera,getStats:()=>({...output.getStats(),supplyTriangles:supplyTubes?.mesh.visible?supplyTubes.mesh.geometry.drawRange.count/3:0})};
}
