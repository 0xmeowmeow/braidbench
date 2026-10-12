// Exact convex-polygon clipping against the four solid quadrants outside two slots.
export const shoeOutline=[[-14,0],[-8,-4],[8,-4],[14,0],[8,4],[-8,4]];
const angle=Math.PI/3,sin=Math.sin(angle),cos=Math.cos(angle);
function clip(poly,a,b,c){
 const result=[];
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dp=a*p[0]+b*p[1]-c,dq=a*q[0]+b*q[1]-c;
  if(dp>=0)result.push(p);
  if((dp>=0)!==(dq>=0)){const u=dp/(dp-dq);result.push([p[0]+u*(q[0]-p[0]),p[1]+u*(q[1]-p[1])]);}
 }
 return result;
}
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
export function obstructionArea(points,width=8.6){
 let sum=0;
 for(const a of [-1,1])for(const b of [-1,1])sum+=area(clip(clip(points,0,a,width/2),-b*sin,b*cos,width/2));
 return sum;
}
export function contactAt(x,y,yaw,kind='boat'){
 const outline=kind==='round'?Array.from({length:128},(_,i)=>[4*Math.cos(i*Math.PI/64),4*Math.sin(i*Math.PI/64)]):shoeOutline;
 const co=Math.cos(yaw),si=Math.sin(yaw),points=outline.map(([a,b])=>[x+a*co-b*si,y+a*si+b*co]);
 // This lab keeps the neck centre on y=0, inside the straight retaining slot.
 // The foot-wall test alone does not validate arbitrary off-axis neck motion.
 const overlap=obstructionArea(points);
 return {overlapArea:overlap,free:overlap<1e-8,points};
}
export function constrainedMove(from,to,kind='boat'){
 const length=Math.hypot(to.x-from.x,to.y-from.y),turn=Math.abs(to.yaw-from.yaw);
 const steps=Math.max(1,Math.ceil(length/.1),Math.ceil(turn/(Math.PI/720)));
 const pose=u=>({x:from.x+(to.x-from.x)*u,y:from.y+(to.y-from.y)*u,yaw:from.yaw+(to.yaw-from.yaw)*u});
 let previous=0;
 for(let i=1;i<=steps;i++){
  const u=i/steps,p=pose(u);
  if(!contactAt(p.x,p.y,p.yaw,kind).free){let lo=previous,hi=u;for(let j=0;j<24;j++){const mid=(lo+hi)/2,q=pose(mid);if(contactAt(q.x,q.y,q.yaw,kind).free)lo=mid;else hi=mid;}return {...pose(lo),blocked:true};}
  previous=u;
 }
 return {...to,blocked:false};
}
