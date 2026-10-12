import {carrierPartPose} from './motion.mjs';
import {tensionRoute,tensionExit} from './tension-motion.mjs';

export function createTabletopSupply(guides,{wireRadius=.225}={}){
 const packageRadius=11+wireRadius;
 const baseAt=(pose,carrier)=>carrierPartPose(guides[carrier],pose);
 const exitAt=(pose,carrier)=>tensionExit(baseAt(pose,carrier),pose.heading);
 function pathAt(pose,carrier,stored){
  const g=baseAt(pose,carrier),a=Math.atan2(g.y-pose.y,g.x-pose.x)+Math.acos(packageRadius/17);
  const path=[[pose.x+packageRadius*Math.cos(a),pose.y+packageRadius*Math.sin(a),116],[g.x,g.y,147.5]];
  // Stay below the dancer before rising outside its left leg. A diagonal
  // directly from the eye to the upper wheel crossed the same thread's loop.
  const point=(x,z)=>[g.x+x*Math.cos(pose.heading),g.y+x*Math.sin(pose.heading),z];
  for(let j=0;j<=12;j++){const angle=j/12*Math.PI/2;path.push(point(-1+Math.cos(angle),148.5+Math.sin(angle)));}
  for(let j=0;j<=12;j++){const angle=j/12*Math.PI/2;path.push(point(-3-Math.sin(angle),150.5-Math.cos(angle)));}
  path.push(...tensionRoute(g,pose.heading,stored));return path;
 }
 return {packageRadius,baseAt,exitAt,pathAt};
}
