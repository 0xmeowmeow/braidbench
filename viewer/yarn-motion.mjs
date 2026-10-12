import {wrapPhase} from './motion.mjs';
const TAU=Math.PI*2;
const deltaAngle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

// Advect a checked geometric reconstruction and account for its neutral-line
// length. The profile preserves each guide's crossing history. Its compact
// geometry is solved offline; this is not a calibrated yarn-force simulation.
export function createYarnMotion(motion,{braidRadius=3,relief=.45,feedPerRadian=8,spanHeight=239,supplyRadius=11,samples=4096,guideAt=(p)=>p,extraFreeAt=()=>0,profile=null}={}){
  if(profile)feedPerRadian=profile.feed;
  if(profile){const block=Math.max(profile.steps,profile.formation?.resolution??profile.formation?.frames??0)*Math.round(motion.period/profile.cellPeriod);samples=Math.ceil(samples/block)*block;}
  const period=motion.period,step=period/samples,poses=motion.posesAt(0),count=poses.length;
  const radius=[],angle=[],free=[],deposited=[],demand=[],payout=[],stored=[];
  const active=profile?.symmetry?.prototypes??Array.from({length:count},(_,i)=>i);
  for(let c=0;c<count;c++){
    radius[c]=new Float64Array(samples+1);angle[c]=new Float64Array(samples+1);free[c]=new Float64Array(samples+1);deposited[c]=new Float64Array(samples+1);
  }
  for(let k=0;k<=samples;k++){
    const points=motion.posesAt(k*step);
    for(const c of active){
      const p=guideAt(points[c],c),r=Math.hypot(p.x,p.y),q=profile?.pointAt(c,k*step),a=Math.atan2(q?.y??p.y,q?.x??p.x);
      radius[c][k]=q?Math.hypot(q.x,q.y):braidRadius+relief*(r-motion.centerRadius)/motion.orbitRadius;
      angle[c][k]=k?angle[c][k-1]+deltaAngle(a,angle[c][k-1]):a;
      free[c][k]=q?Math.hypot(p.x-q.x,p.y-q.y,spanHeight):Math.hypot(r-radius[c][k],spanHeight);
      const approach=profile?.approachAt(c,k*step);
      if(approach){approach[0]=[p.x,p.y,-spanHeight];free[c][k]=0;for(let j=1;j<approach.length;j++)free[c][k]+=Math.hypot(...approach[j].map((v,d)=>v-approach[j-1][d]));}
      free[c][k]+=extraFreeAt(points[c],c,k*step);
      if(k){
        const previousRadius=radius[c][k-1],previousAngle=angle[c][k-1],dr=radius[c][k]-previousRadius,da=angle[c][k]-previousAngle,rr=(radius[c][k]+previousRadius)/2;
        deposited[c][k]=deposited[c][k-1]+(q?Math.hypot(feedPerRadian*step,q.x-previousRadius*Math.cos(previousAngle),q.y-previousRadius*Math.sin(previousAngle)):Math.hypot(feedPerRadian*step,dr,rr*da));
      }
    }
  }
  if(profile?.symmetry){const {classes,rotations,prototypes}=profile.symmetry;for(let c=0;c<count;c++)if(!active.includes(c)){const base=prototypes[classes[c]],r=rotations[c],rotation=Math.atan2(r[1][0],r[0][0]);radius[c]=radius[base];free[c]=free[base];deposited[c]=deposited[base];angle[c]=Float64Array.from(angle[base],a=>a+rotation);}}
  for(const c of active){
    demand[c]=Float64Array.from(deposited[c],(v,k)=>v+free[c][k]-free[c][0]);
    const advance=deposited[c][samples];
    // Running maximum gives a non-reversing supply. The surplus is held by a
    // two-leg dancer. Include the preceding cycle for a periodic steady state.
    let peak=-Infinity;for(let k=0;k<=samples;k++)peak=Math.max(peak,demand[c][k]-advance);
    payout[c]=new Float64Array(samples+1);stored[c]=new Float64Array(samples+1);
    for(let k=0;k<=samples;k++){peak=Math.max(peak,demand[c][k]);payout[c][k]=peak;stored[c][k]=peak-demand[c][k];}
  }
  if(profile?.symmetry){const {classes,prototypes}=profile.symmetry;for(let c=0;c<count;c++)if(!active.includes(c)){const base=prototypes[classes[c]];demand[c]=demand[base];payout[c]=payout[base];stored[c]=stored[base];}}
  function at(table,c,t,increment=0){const wrapped=wrapPhase(t,period),cycle=Math.round((t-wrapped)/period),fraction=wrapped/step,k=Math.min(samples-1,Math.floor(fraction)),f=fraction-k;return table[c][k]*(1-f)+table[c][k+1]*f+cycle*increment;}
  function pointAt(c,t){const a=at(angle,c,t,angle[c][samples]-angle[c][0]);if(profile){const p=profile.pointAt(c,t);return {radius:Math.hypot(p.x,p.y),angle:a+deltaAngle(Math.atan2(p.y,p.x),a)};}return {radius:at(radius,c,t),angle:a};}
  function stateAt(c,t){const advance=deposited[c][samples],paid=at(payout,c,t,advance)-payout[c][0];return {paid,stored:at(stored,c,t),deposited:at(deposited,c,t,advance),free:at(free,c,t),spoolAngle:-paid/supplyRadius};}
  function depositedPoint(c,t,distance){const p=pointAt(c,t-distance/feedPerRadian);return {x:p.radius*Math.cos(p.angle),y:p.radius*Math.sin(p.angle),distance};}
  return {period,step,samples,count,feedPerRadian,braidRadius,relief,spanHeight,profile,pointAt,stateAt,depositedPoint,cycleLengths:deposited.map(a=>a[samples]),maxStored:stored.map(a=>Math.max(...a)),initialStored:stored.map(a=>a[0]),raw:{radius,angle,free,deposited,demand,payout,stored}};
}

// Measure crossings in the reconstructed profile, whose complete partner and
// over/under history is independently checked against the actual guides.
export function crossingEvents(yarn, carrier=0){
  const events=[],{angle,radius}=yarn.raw;
  for(let other=0;other<yarn.count;other++){
    if(other===carrier)continue;
    for(let k=1;k<=yarn.samples;k++){
      const a=angle[carrier][k-1]-angle[other][k-1],b=angle[carrier][k]-angle[other][k];
      if(Math.floor(a/TAU)===Math.floor(b/TAU))continue;
      const target=(b>a?Math.ceil(a/TAU):Math.floor(a/TAU))*TAU,f=(target-a)/(b-a);
      if(f<0||f>1)continue;
      let phase=(k-1+f)*yarn.step;
      if(yarn.profile){let lo=(k-1)*yarn.step,hi=k*yarn.step;for(let j=0;j<36;j++){const mid=(lo+hi)/2,d=yarn.pointAt(carrier,mid).angle-yarn.pointAt(other,mid).angle;if((d<target)===(b>a))lo=mid;else hi=mid;}phase=(lo+hi)/2;}
      const p=yarn.pointAt(carrier,phase),q=yarn.pointAt(other,phase);
      events.push({phase,a:carrier,b:other,outer:p.radius>q.radius?carrier:other,angle:p.angle});
    }
  }
  return events.sort((a,b)=>a.phase-b.phase);
}
