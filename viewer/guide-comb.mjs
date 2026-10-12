import * as THREE from 'three';

// Open curved channels support the in-plane wire bank through its quarter turn.
// The wires have different turn radii, so a single cylindrical pulley would not
// support this route. This is visible guide geometry, not released tooling CAD.
export function createTurningComb({ends,wirePitch=.2,wireRadius=.08,bend=1.4,orbitRadius,guideOffset,packageRadius}){
 const pieces=[];
 function sector(inner,outer,back,depth){
  const shape=new THREE.Shape();
  for(let j=0;j<=12;j++){const a=j/12*Math.PI/2,x=-outer*Math.cos(a),y=outer*Math.sin(a);if(j)shape.lineTo(x,y);else shape.moveTo(x,y);}
  for(let j=12;j>=0;j--){const a=j/12*Math.PI/2;shape.lineTo(-inner*Math.cos(a),inner*Math.sin(a));}
  shape.closePath();pieces.push(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false}).translate(0,0,back));
 }
 const half=(ends-1)/2*wirePitch,front=-wireRadius-.006,back=front-.24;
 sector(bend-half-wireRadius-.04,bend+half+wireRadius+.04,back,.24);
 for(let e=0;e<ends;e++){const radius=bend-(e-(ends-1)/2)*wirePitch,wall=radius*Math.cos(Math.PI/48)-wireRadius-.005;sector(wall-.015,wall,front,wireRadius-front);}
 function rod(a,b){a=new THREE.Vector3(...a);b=new THREE.Vector3(...b);const d=b.clone().sub(a),g=new THREE.CylinderGeometry(.15,.15,d.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray());pieces.push(g);}
 const anchor=[-bend/Math.SQRT2,bend/Math.SQRT2,back],brace=[anchor[0],anchor[1],-1.2],angle=-Math.asin((packageRadius+wireRadius)/guideOffset);
 rod(anchor,brace);rod(brace,[25-bend,bend-orbitRadius*.1*Math.cos(angle),orbitRadius*.1*Math.sin(angle)]);
 const arrays=pieces.map(g=>{const flat=g.index?g.toNonIndexed():g;return {original:g,flat};}),size=arrays.reduce((n,{flat})=>n+flat.attributes.position.array.length,0),position=new Float32Array(size),normal=new Float32Array(size);let offset=0;
 for(const {original,flat} of arrays){position.set(flat.attributes.position.array,offset);normal.set(flat.attributes.normal.array,offset);offset+=flat.attributes.position.array.length;if(flat!==original)flat.dispose();original.dispose();}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3));return geometry;
}
