import {wrapPhase} from './motion.mjs';

// A short cell continues onto the carrier permutation measured after one horn
// revolution. Following that permutation preserves each complete strand's ID.
export function createBraidProfile(data){
 const {points,perm,steps,cellPeriod,period}=data,cycles=Math.round(period/cellPeriod);
 const maps=[Array.from({length:points.length},(_,i)=>i)];
 for(let k=1;k<cycles;k++)maps.push(maps[k-1].map(i=>perm[i]));
 function pointAt(carrier,t){
  const wrapped=wrapPhase(t,period),cycle=Math.min(cycles-1,Math.floor(wrapped/cellPeriod)),phase=Math.max(0,Math.min(steps,(wrapped-cycle*cellPeriod)/cellPeriod*steps));
  const k=Math.min(steps-1,Math.floor(phase)),f=phase-k,c=maps[cycle][carrier],a=points[c][k],b=k+1<steps?points[c][k+1]:points[perm[c]][0];
  return {x:a[0]*(1-f)+b[0]*f,y:a[1]*(1-f)+b[1]*f};
 }
 function approachAt(carrier,t){
  const formation=data.formation;if(!formation)return null;
  const wrapped=wrapPhase(t,period),cycle=Math.min(cycles-1,Math.floor(wrapped/cellPeriod)),phase=Math.max(0,Math.min(formation.frames,(wrapped-cycle*cellPeriod)/cellPeriod*formation.frames));
  let k=Math.min(formation.frames-1,Math.floor(phase)),f=phase-k;
  if(formation.phases){const local=phase/formation.frames,phases=formation.phases;let lo=0,hi=phases.length;while(lo<hi){const mid=(lo+hi)>>1;if(phases[mid]<=local)lo=mid+1;else hi=mid;}k=Math.max(0,lo-1);f=(local-phases[k])/((phases[k+1]??1)-phases[k]);}
  const c=maps[cycle][carrier],next=k+1<formation.frames?c:perm[c];
  const {classes,rotations}=formation.symmetry;
  const a=formation.points[k][classes[c]],b=formation.points[(k+1)%formation.frames][classes[next]],ra=rotations[c],rb=rotations[next];
  const result=a.map((p,j)=>{const q=b[j];return [(ra[0][0]*p[0]+ra[0][1]*p[1])*(1-f)+(rb[0][0]*q[0]+rb[0][1]*q[1])*f,(ra[1][0]*p[0]+ra[1][1]*p[1])*(1-f)+(rb[1][0]*q[0]+rb[1][1]*q[1])*f,formation.z[j]];});
  const tip=pointAt(carrier,t);result[result.length-1]=[tip.x,tip.y,0];return result;
 }
 return {...data,pointAt,approachAt};
}
