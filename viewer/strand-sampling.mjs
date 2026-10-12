import {wrapPhase} from './motion.mjs';

// Bake one circuit of the computed deposition path. Error is measured in mm,
// rather than giving a 72-carrier braid the same point budget as an 8-carrier one.
// Reuse material points as take-up moves them downstream, without sliding bends.
export function createStrandSampler(yarn,{length=140,tolerance=.004}={}){
  const period=yarn.period;
  const point=(c,t)=>{const p=yarn.pointAt(c,t);return [p.radius*Math.cos(p.angle),p.radius*Math.sin(p.angle)];};
  const circuits=Array.from({length:yarn.count},(_,c)=>{
    if(yarn.profile)return null;
    const source=Array.from({length:yarn.samples+1},(_,k)=>point(c,k*yarn.step));
    let curvatureBound=0;
    for(let k=1;k<=yarn.samples;k++){
      const da=yarn.raw.angle[c][k]-yarn.raw.angle[c][k-1],dr=yarn.raw.radius[c][k]-yarn.raw.radius[c][k-1];
      const r=Math.max(yarn.raw.radius[c][k],yarn.raw.radius[c][k-1]);
      curvatureBound=Math.max(curvatureBound,(r*da*da+2*Math.abs(dr*da))/8);
    }
    if(curvatureBound>=tolerance)throw new Error('Yarn history resolution is too low for the strand tolerance');
    const knots=[{phase:0,xy:source[0]}],budget=tolerance-curvatureBound;
    // Check every raw knot. Midpoint-only subdivision can miss a sharp handoff
    // near an interval edge. Between raw knots, the polar curvature bound above
    // bounds the extra chord error by max(|p″|) Δt² / 8.
    function simplify(a,b){
      const pa=source[a],pb=source[b];let error=0,split=a;
      for(let k=a+1;k<b;k++){const f=(k-a)/(b-a),p=source[k],e=Math.hypot(p[0]-pa[0]-(pb[0]-pa[0])*f,p[1]-pa[1]-(pb[1]-pa[1])*f);if(e>error){error=e;split=k;}}
      if(error>budget){simplify(a,split);simplify(split,b);}
      else knots.push({phase:b*yarn.step,xy:pb});
    }
    simplify(0,yarn.samples);
    knots.pop();
    return knots;
  });
  if(yarn.profile){const total=yarn.profile.steps*Math.round(period/yarn.profile.cellPeriod);for(let c=0;c<yarn.count;c++){let cached;Object.defineProperty(circuits,c,{enumerable:true,get(){return cached??=Array.from({length:total},(_,k)=>({phase:k*period/total,xy:point(c,k*period/total)}));}});}}
  function pathAt(c,t){
    const knots=circuits[c],phase=wrapPhase(t,period),first=point(c,t),path=[[...first,0]];
    let lo=0,hi=knots.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(knots[mid].phase<phase-1e-10)lo=mid+1;else hi=mid;}
    let index=lo-1,cycle=Math.round((t-phase)/period);
    while(true){
      if(index<0){index=knots.length-1;cycle--;}
      const knot=knots[index],z=(t-cycle*period-knot.phase)*yarn.feedPerRadian;
      if(z>=length-1e-9)break;
      if(z>1e-9)path.push([...knot.xy,z]);
      index--;
    }
    path.push([...point(c,t-length/yarn.feedPerRadian),length]);
    return path;
  }
  const maxPoints=(yarn.profile?yarn.profile.steps*Math.round(period/yarn.profile.cellPeriod):Math.max(...circuits.map(p=>p.length)))*(Math.ceil(length/(period*yarn.feedPerRadian))+1)+2;
  const cellPeriod=yarn.profile?.cellPeriod??period;
  const cellCircuits=yarn.profile?Array.from({length:yarn.count},(_,c)=>Array.from({length:yarn.profile.steps+1},(_,k)=>({phase:k*cellPeriod/yarn.profile.steps,xy:point(c,k*cellPeriod/yarn.profile.steps)}))):circuits.map((knots,c)=>[...knots.filter(p=>p.phase<cellPeriod-1e-10),{phase:cellPeriod,xy:point(c,cellPeriod)}]);
  return {pathAt,circuits,cellCircuits,cellPeriod,maxPoints,tolerance:yarn.profile?0:tolerance,length};
}
