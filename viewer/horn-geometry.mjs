import * as THREE from 'three';
const TAU=Math.PI*2;
export function spurGeometry(radius,teeth=40,depth=3){
 const m=radius*2/teeth,rb=radius*Math.cos(Math.PI/9),ra=radius+m,rf=radius-1.25*m;
 const inv=r=>Math.sqrt(Math.max(0,(r/rb)**2-1))-Math.acos(Math.min(1,rb/r));
 const half=Math.PI/(2*teeth)-.04/radius,ip=inv(radius),p=[];
 for(let k=0;k<teeth;k++){
  const radii=[rf,...Array.from({length:5},(_,i)=>Math.max(rb,rf)+(ra-Math.max(rb,rf))*i/4)];
  for(const r of radii){const a=TAU*k/teeth-half-ip+(r>=rb?inv(r):0);p.push(new THREE.Vector2(r*Math.cos(a),r*Math.sin(a)));}
  for(const r of [...radii].reverse()){const a=TAU*k/teeth+half+ip-(r>=rb?inv(r):0);p.push(new THREE.Vector2(r*Math.cos(a),r*Math.sin(a)));}
 }
 return new THREE.ExtrudeGeometry(new THREE.Shape(p),{depth,bevelEnabled:false});
}
export function hornGeometry(radius,depth=3){
 // Disk perimeter follows the union boundary of the circular disk minus four
 // circular carrier pockets, so the pockets are visibly open at the rim.
 const disk=radius*.985,notch=radius*.12,points=[];
 for(let k=0;k<512;k++){
  const a=TAU*k/512;let r=disk;
  for(let j=0;j<4;j++){
   const d=Math.atan2(Math.sin(a-j*Math.PI/2),Math.cos(a-j*Math.PI/2)),b=radius*Math.sin(d);
   if(Math.cos(d)>0&&Math.abs(b)<notch)r=Math.min(r,radius*Math.cos(d)-Math.sqrt(notch*notch-b*b));
  }
  points.push(new THREE.Vector2(r*Math.cos(a),r*Math.sin(a)));
 }
 const shape=new THREE.Shape(points),hole=new THREE.Path();hole.absarc(0,0,radius*.16,0,TAU,true);shape.holes.push(hole);
 return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});
}
export function headPlane(geometry){return geometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1));}
