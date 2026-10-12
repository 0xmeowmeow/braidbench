// Ideal two-leg accumulator. Both straight legs grow by stored/2, while the
// semicircular contact arc has constant length. No disappearing excess yarn.
export function tensionRoute(base,heading,stored,{radius=2,top=178,bottom=172,returnRadius=radius*.5}={}){
 const u={x:Math.cos(heading),y:Math.sin(heading)},depth=bottom-stored/2;
 const point=(across,height)=>[base.x+u.x*across,base.y+u.y*across,height];
 const path=[];
 // The supply rises around a fixed return pulley before descending to the
 // moving dancer. Reversing at a single eye would make a zero-radius cusp.
 for(let j=0;j<=16;j++){const a=Math.PI-j*Math.PI/16;path.push(point(-radius-returnRadius+returnRadius*Math.cos(a),top+returnRadius*Math.sin(a)));}
 for(let j=0;j<=16;j++){const a=Math.PI+j*Math.PI/16;path.push(point(radius*Math.cos(a),depth+radius*Math.sin(a)));}
 path.push(point(radius,top));return path;
}
export function tensionExit(base,heading,radius=2){return {x:base.x+radius*Math.cos(heading),y:base.y+radius*Math.sin(heading)};}
