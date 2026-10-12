// Units: mm, grams, N mm. An ideal, quasistatic two-leg weighted dancer.
export const grooveRadius=10.225,wireRadius=.2;
export function forces(massG,torqueNmm,packageRadius){
 const ideal=massG/1000*9.80665/2,brake=torqueNmm/packageRadius;
 return {ideal,brake,ratio:brake/ideal,storedRange:80};
}
export function threadRoute(y=100,radius=11){
 const source=[-42,60],fixed=[-2*grooveRadius,145],rs=radius+wireRadius,r=grooveRadius;
 const dx=fixed[0]-source[0],dy=fixed[1]-source[1],d=Math.hypot(dx,dy);
 const a=Math.atan2(dy,dx)-Math.acos((rs+r)/d),n=[Math.cos(a),Math.sin(a)];
 const points=[[source[0]+rs*n[0],source[1]+rs*n[1],32]],inlet=[fixed[0]-r*n[0],fixed[1]-r*n[1],32];
 points.push(inlet);let start=Math.atan2(-n[1],-n[0]);if(start<0)start+=2*Math.PI;
 for(let i=1;i<=96;i++){const a=start*(1-i/96);points.push([fixed[0]+r*Math.cos(a),fixed[1]+r*Math.sin(a),32]);}
 points.push([-r,y,32]);
 for(let i=1;i<=96;i++){const a=Math.PI+i*Math.PI/96;points.push([r*Math.cos(a),y+r*Math.sin(a),32]);}
 points.push([r,165,32],[r,176,32]);return points;
}
export function routeLength(points){let sum=0;for(let i=1;i<points.length;i++)sum+=Math.hypot(...points[i].map((x,j)=>x-points[i-1][j]));return sum;}
