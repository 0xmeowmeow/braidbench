import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createCarrierMotion,carrierPartPose} from '../viewer/motion.mjs';
import {createYarnMotion,crossingEvents} from '../viewer/yarn-motion.mjs';
import {createBraidProfile} from '../viewer/braid-profile.mjs';
import {createIndustrialSupply} from '../viewer/industrial-supply.mjs';
import {createTabletopSupply} from '../viewer/tabletop-supply.mjs';
import {tensionExit,tensionRoute} from '../viewer/tension-motion.mjs';
const reports=[];
for(const count of [8,12,16,48,72]){
 const a=JSON.parse(await readFile(new URL(`../models/${count<20?'assembly':'industrial-motion'}-${count}.json`,import.meta.url)));
 const motion=createCarrierMotion(a),guides=a.instances.filter(v=>v.part==='yarn-eye-post');
 const profile=createBraidProfile(JSON.parse(await readFile(new URL(`../models/braid-profile-${count}.json`,import.meta.url)))),industrial=count>20;
 const supply=industrial?createIndustrialSupply(motion):createTabletopSupply(guides,{wireRadius:profile.wireDiameter/2});
 const guideAt=industrial?p=>supply.dancerFrame(p).exit:supply.exitAt;
 const yarn=createYarnMotion(motion,{profile,guideAt,spanHeight:industrial?125:205,supplyRadius:industrial?motion.orbitRadius*.2+.08:supply.packageRadius,extraFreeAt:supply.extraFreeAt});
 const length=path=>path.slice(1).reduce((s,p,i)=>s+Math.hypot(...p.map((v,j)=>v-path[i][j])),0);
 const empty=tensionRoute({x:10,y:30},.4,0);const full=tensionRoute({x:10,y:30},.4,12.3);assert(Math.abs(length(full)-length(empty)-12.3)<1e-10,'Visible loop must hold exactly the stored surplus');
 let minSeparation=Infinity,maxConservationError=0,maxSpoolBoundaryJump=0,maxSourceBoundaryJump=0,maxIndependentFreeError=0,maxSourceLengthError=0;
 const windings=yarn.raw.angle.map(v=>(v[yarn.samples]-v[0])/(2*Math.PI));
 assert.equal(windings.filter(v=>v>.99).length,count/2);assert.equal(windings.filter(v=>v<-.99).length,count/2);
 for(let c=0;c<count;c++){
  const crossings=crossingEvents(yarn,c),sequence=crossings.map(e=>e.outer===c?'O':'U').join('');
  assert.equal(crossings.length,count,`${count}: each carrier must cross each opposite carrier twice`);
  assert.ok(['OOUU','OUUO','UUOO','UOOU'].some(s=>s.repeat(count/4)===sequence),`${count}/${c}: ${sequence}`);
  for(const e of crossings){assert(windings[e.a]*windings[e.b]<0,'Crossing must join opposite travelling families');const p=yarn.pointAt(e.a,e.phase),q=yarn.pointAt(e.b,e.phase);assert(Math.abs(Math.sin(p.angle-q.angle))<1e-9);assert.equal(p.radius>q.radius?e.a:e.b,e.outer);}
  let previous=-Infinity;
  for(let k=0;k<=yarn.samples;k++){
   const t=k*yarn.step,s=yarn.stateAt(c,t),g=guideAt(motion.posesAt(t)[c],c),p=yarn.pointAt(c,t);
   const q=profile.pointAt(c,t);assert(Math.hypot(p.radius*Math.cos(p.angle)-q.x,p.radius*Math.sin(p.angle)-q.y)<1e-9,'Deposition must use the checked profile');
   assert(s.paid>=previous-1e-8,'Bobbin cannot rewind to absorb slack');previous=s.paid;
   const error=Math.abs(s.paid-s.deposited-(s.free-yarn.raw.free[c][0])-(s.stored-yarn.initialStored[c]));maxConservationError=Math.max(error,maxConservationError);assert(error<1e-8);
   assert(s.stored>=-1e-10);assert(Number.isFinite(s.spoolAngle));
  }
  // Independently rebuild the complete neutral-centreline length at knots.
  // This checks the rotational cache and the actual drawn dancer against the
  // payout account, rather than merely checking its algebraic identity.
  let baseline;
  for(let k=0;k<=64;k++){
   const index=Math.round(k/64*yarn.samples),t=index*yarn.step,pose=motion.posesAt(t)[c],g=guideAt(pose,c),approach=profile.approachAt(c,t),s=yarn.stateAt(c,t);
   approach[0]=[g.x,g.y,-yarn.spanHeight];const free=length(approach)+(supply.extraFreeAt?.(pose,c,t)??0),error=Math.abs(free-s.free);maxIndependentFreeError=Math.max(maxIndependentFreeError,error);assert(error<1e-7,'Cached free length must match the actual carrier and approach');
   const source=industrial?supply.pathAt(pose,0,s.stored,c):supply.pathAt(pose,c,s.stored),total=length(source)+length(approach)-s.stored-s.free;
   if(baseline===undefined)baseline=total;const sourceError=Math.abs(total-baseline);maxSourceLengthError=Math.max(maxSourceLengthError,sourceError);assert(sourceError<1e-7,'Visible source route must account for all changing neutral-centreline length');
  }
  for(const b of [...new Set(motion.events.map(v=>v[0])),0,motion.period]){
   const jump=Math.abs(yarn.stateAt(c,b+1e-7).spoolAngle-yarn.stateAt(c,b-1e-7).spoolAngle);maxSpoolBoundaryJump=Math.max(jump,maxSpoolBoundaryJump);assert(jump<1e-4);
   for(const side of industrial?[-.7,0,.7]:[0]){
    const path=t=>{const pose=motion.posesAt(t)[c],stored=yarn.stateAt(c,t).stored;return industrial?supply.pathAt(pose,side,stored,c):supply.pathAt(pose,c,stored);},left=path(b-1e-7),right=path(b+1e-7);
    for(let j=0;j<left.length;j++){const jump=Math.hypot(...left[j].map((v,d)=>v-right[j][d]));maxSourceBoundaryJump=Math.max(maxSourceBoundaryJump,jump);assert(jump<.0001,'Supply ribbon must not flip at a handoff or circuit seam');}
   }
  }
  for(const t of [-1e-17,0,1e-17,-motion.period,motion.period]){const s=yarn.stateAt(c,t);assert(Math.abs(s.paid-t/motion.period*yarn.cycleLengths[c])<1e-7,'Payout must stay continuous even immediately below zero');}
  const t=.31*motion.period,z=35,dt=.37;
  const old=yarn.depositedPoint(c,t,z),advected=yarn.depositedPoint(c,t+dt,z+dt*yarn.feedPerRadian);
  assert(Math.hypot(old.x-advected.x,old.y-advected.y)<1e-10,'Take-up must advect existing material, not redraw it with a new phase');
 }
 for(let k=0;k<=512;k++){
  const p=Array.from({length:count},(_,c)=>yarn.depositedPoint(c,k*motion.period/512,0));
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)minSeparation=Math.min(minSeparation,Math.hypot(p[i].x-p[j].x,p[i].y-p[j].y));
 }
 reports.push({carriers:count,pattern:'2 over / 2 under carrier bundles, measured from every carrier',crossings_per_carrier_per_circuit:count,winding_families:[count/2,count/2],maximum_length_balance_error_mm:maxConservationError,maximum_independent_free_length_error_mm:maxIndependentFreeError,maximum_source_route_length_error_mm:maxSourceLengthError,maximum_spool_boundary_jump_radians:maxSpoolBoundaryJump,maximum_supply_boundary_jump_mm:maxSourceBoundaryJump,sampled_minimum_same_plane_centerline_spacing_mm:minSeparation,required_maximum_two_leg_dancer_travel_mm:Math.max(...yarn.maxStored)/2});
 console.log(JSON.stringify(reports.at(-1)));
}
await writeFile(new URL('../docs/yarn-validation.json',import.meta.url),JSON.stringify({scope:'Guide-derived crossing topology, material advection, independent neutral-centreline length accounting, non-reversing payout and continuous supply routing. Finite-diameter clearance is checked separately. Individual industrial ends share the neutral-centreline payout model; their differential elasticity, slip and torsion are not modelled. No carrier-shoe contact or physical build validation.',results:reports},null,2)+'\n');
