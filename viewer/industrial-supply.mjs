import {tensionRoute,tensionExit} from './tension-motion.mjs';

// Shared by the renderer and numerical routing checks. The exit follows the
// actual carrier. A pivot about that exit self-aligns the parallel guide bank.
export function createIndustrialSupply(motion,{wireRadius=.08,height=225}={}){
 const r=motion.orbitRadius,guideOffset=r*.35,packageRadius=r*.20,loopRadius=r*.08;
 const guideAt=p=>({x:p.x+guideOffset*Math.cos(p.heading),y:p.y+guideOffset*Math.sin(p.heading)});
 function dancerFrame(p){const exit=tensionExit(guideAt(p),p.heading,loopRadius),heading=Math.atan2(exit.y,exit.x);return {exit,heading,base:{x:exit.x-loopRadius*Math.cos(heading),y:exit.y-loopRadius*Math.sin(heading)}};}
 const tangentOffset=-Math.asin((packageRadius+wireRadius)/guideOffset),rollCentres=[];
 // Choose a continuous branch for each carrier's ribbon orientation. A raw
 // atan2 would reverse a whole ribbon at its ±π branch cut.
 for(let k=0;k<=128;k++)motion.posesAt(k/128*Math.PI*2).forEach((p,c)=>{
  const f=dancerFrame(p),raw=f.heading-p.heading-Math.PI/2-tangentOffset,a=Math.atan2(Math.sin(raw),Math.cos(raw));
  if(!rollCentres[c])rollCentres[c]={last:a,value:a,min:a,max:a};
  else{const row=rollCentres[c];row.value+=Math.atan2(Math.sin(a-row.last),Math.cos(a-row.last));row.last=a;row.min=Math.min(row.min,row.value);row.max=Math.max(row.max,row.value);}
 });
 const rollMean=rollCentres.map(row=>{if(row.max-row.min>=Math.PI*2-.1)throw new Error('Guide ribbon requires an additional winding degree of freedom');const mean=(row.min+row.max)/2;return Math.atan2(Math.sin(mean),Math.cos(mean));});
 function extraFreeAt(p){const g=guideAt(p),f=dancerFrame(p);return Math.hypot(5,f.base.x-2*loopRadius*Math.cos(f.heading)-g.x,f.base.y-2*loopRadius*Math.sin(f.heading)-g.y)+45;}
 function pathAt(p,side,stored,carrier=0){
  const g=guideAt(p),f=dancerFrame(p),rr=packageRadius+wireRadius;
  const offset=side/Math.hypot(f.exit.x,f.exit.y),co=Math.cos(offset),si=Math.sin(offset),shift={x:f.exit.x*co-f.exit.y*si-f.exit.x,y:f.exit.x*si+f.exit.y*co-f.exit.y};
  const base={x:f.base.x+shift.x,y:f.base.y+shift.y};
  const b=p.heading+Math.acos(rr/guideOffset),a=p.heading+tangentOffset,ax=Math.cos(a),ay=Math.sin(a),bend=1.4;
  const path=[[-90+side,p.x+rr*Math.cos(b),height+p.y+rr*Math.sin(b)]];
  // Carry the ordered wire bank around a rounded elbow, then rotate that bank
  // smoothly along the straight approach. Independent sharp L bends crossed.
  for(let j=0;j<=12;j++){const angle=j/12*Math.PI/2,co=Math.cos(angle),si=Math.sin(angle);path.push([-90+bend*(1-co)+side*co,g.x-bend*ax+bend*si*ax-side*si*ax,height+g.y-bend*ay+bend*si*ay-side*si*ay]);}
  const raw=f.heading-p.heading-Math.PI/2-tangentOffset,principal=Math.atan2(Math.sin(raw),Math.cos(raw)),roll=principal+Math.round((rollMean[carrier]-principal)/(2*Math.PI))*2*Math.PI;
  const arcError={x:shift.x+side*Math.sin(f.heading),y:shift.y-side*Math.cos(f.heading)};
  for(let j=1;j<=12;j++){const u=j/12,eased=u*u*(3-2*u),angle=a+Math.PI+roll*eased;path.push([-90+bend+(25-bend)*u,g.x+side*Math.cos(angle)+arcError.x*eased,height+g.y+side*Math.sin(angle)+arcError.y*eased]);}
  const loop=tensionRoute(base,f.heading,stored,{radius:loopRadius,top:-15,bottom:-37}).map(([y,z,x])=>[x,y,height+z]);
  path.push([-60,loop[0][1],loop[0][2]],...loop);return path;
 }
 return {guideAt,dancerFrame,extraFreeAt,pathAt};
}
