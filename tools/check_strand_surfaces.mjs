import * as THREE from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {createCarrierMotion,carrierPartPose} from '../viewer/motion.mjs';
import {createBraidProfile} from '../viewer/braid-profile.mjs';
import {createYarnMotion} from '../viewer/yarn-motion.mjs';
import {createIndustrialSupply} from '../viewer/industrial-supply.mjs';
import {createTabletopSupply} from '../viewer/tabletop-supply.mjs';
import {createStrandSampler} from '../viewer/strand-sampling.mjs';
import {createStrandOutput} from '../viewer/strand-output.mjs';
import {updateStrandTube} from '../viewer/strand-tube.mjs';
const pf=process.argv[2],reportPath=process.argv[3],requestedEnds=Number(process.argv[4]),phaseCount=Number(process.argv[5])||512;
if(!pf||!reportPath)throw Error('Usage: check_strand_surfaces.mjs PROFILE.json REPORT.json [ENDS] [PHASES=512] (bundle with the vendored Three.js first)');
const profile=createBraidProfile(JSON.parse(await readFile(pf))),n=profile.count,isInd=n>20,ends=requestedEnds||profile.ends;
const data=JSON.parse(await readFile(`${process.cwd()}/models/${isInd?'industrial-motion':'assembly'}-${n}.json`));
const motion=createCarrierMotion(data),guides=data.instances.filter(p=>p.part==='yarn-eye-post'),supply=isInd?createIndustrialSupply(motion):createTabletopSupply(guides,{wireRadius:profile.wireDiameter/2});
const guideAt=isInd?p=>supply.dancerFrame(p).exit:supply.exitAt;
const yarn=createYarnMotion(motion,{profile,spanHeight:isInd?125:205,guideAt,supplyRadius:isInd?motion.orbitRadius*.2+.08:supply.packageRadius,extraFreeAt:supply.extraFreeAt});
const sampler=createStrandSampler(yarn,{length:20}),output=createStrandOutput(yarn,sampler,{ends,colors:Array(n).fill('#00ffff'),wirePitch:.2,toWorld:(...p)=>p,thickness:profile.wireDiameter/2}),geo=new THREE.BufferGeometry();
let worst=Infinity,problem=null,inverted=0,triangles=0;
for(let k=0;k<phaseCount;k++){
 const t=k/phaseCount*profile.cellPeriod;output.update(t);
 for(let c=0;c<4;c++)for(let e=0;e<ends;e++){
  const side=(e-(ends-1)/2)*.2,path=profile.approachAt(c,t);const guide=guideAt(motion.posesAt(t)[c],c);path[0][0]=guide.x;path[0][1]=guide.y;
  let points=path.map(([x,y,z])=>{const a=side/Math.hypot(x,y);return[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a),z]});
  {
   const pose=motion.posesAt(t)[c];let before;
   if(isInd)before=supply.pathAt(pose,side,yarn.stateAt(c,t).stored,c).map(([x,y,z])=>[y,z-225,x-110]);
   else before=supply.pathAt(pose,c,yarn.stateAt(c,t).stored).map(([x,y,z])=>[x,y,z-383]);
   points=[...before,...points.slice(1)];
  }
  updateStrandTube(geo,points,profile.wireDiameter/2,8,output.headFrame(c,e));
  const p=geo.attributes.position.array,normal=geo.attributes.normal.array,ids=geo.index.array;
  for(let j=0;j<geo.drawRange.count;j+=3){const a=ids[j]*3,b=ids[j+1]*3,d=ids[j+2]*3,u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[d]-p[a],p[d+1]-p[a+1],p[d+2]-p[a+2]],cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],dot=cross.reduce((s,x,i)=>s+x*(normal[a+i]+normal[b+i]+normal[d+i]),0);triangles++;if(dot < -1e-10)inverted++;if(dot<worst){worst=dot;problem={phase:t,carrier:c,end:e,segment:Math.floor(j/48),triangle:j/3}};}
 }
}
const staticMesh=output.group.children.find(o=>o.isMesh),staticGeometry=staticMesh.geometry,sp=staticGeometry.attributes.position.array,sn=staticGeometry.attributes.normal.array,si=staticGeometry.index.array;
let staticInverted=0,staticMinimum=Infinity;
for(let j=0;j<si.length;j+=3){
 const vertices=[si[j],si[j+1],si[j+2]].map(k=>[0,1,2].map(d=>Math.fround(sp[k*3+d]+profile.wireDiameter/2*sn[k*3+d]))),[a,b,c]=vertices,u=b.map((v,d)=>v-a[d]),v=c.map((w,d)=>w-a[d]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],dot=cross.reduce((sum,x,d)=>sum+x*(sn[si[j]*3+d]+sn[si[j+1]*3+d]+sn[si[j+2]*3+d]),0);
 if(dot < -1e-10)staticInverted++;staticMinimum=Math.min(staticMinimum,dot);
}
const report={count:n,ends,phases:phaseCount,prototypeCarriers:profile.symmetry.prototypes,triangles,inverted,staticOutputTriangles:si.length/3,staticOutputInverted:staticInverted,staticOutputMinimumOrientation:staticMinimum,minimumOutwardOrientation:worst,worstTriangle:problem,scope:'Actual source, formation and shared output-head rings. Every triangle must face its outward vertex normals. Four rotational prototypes, all wire ends; no hardware or mechanical claim.'};
console.log(report);await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');output.dispose();geo.dispose();
if(inverted||staticInverted)throw Error('Inverted tube surface triangles');
