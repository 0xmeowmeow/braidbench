import * as THREE from 'three';

// A ring at every centreline vertex. Resampling by arc length can skip small
// braid bends after a much longer supply span; this mesh never skips a vertex.
export function updateStrandTube(geometry,points,radius,sides=8,lastFrame=null){
  const size=points.length*sides*3;
  if(!geometry.attributes.position||geometry.attributes.position.array.length<size){
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(size),3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(size),3).setUsage(THREE.DynamicDrawUsage));
  }
  const p=geometry.attributes.position.array,n=geometry.attributes.normal.array;
  const tangent=new THREE.Vector3(),normal=new THREE.Vector3(),binormal=new THREE.Vector3(),previous=new THREE.Vector3();
  for(let step=0;step<points.length;step++){
    const i=lastFrame?points.length-1-step:step;
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    tangent.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
    if(step===0)normal.set(Math.abs(tangent.z)<.9?0:1,0,Math.abs(tangent.z)<.9?1:0);
    else normal.copy(previous);
    normal.addScaledVector(tangent,-normal.dot(tangent)).normalize();
    if(normal.lengthSq()<.1)normal.set(0,1,0).addScaledVector(tangent,-tangent.y).normalize();
    binormal.crossVectors(tangent,normal).normalize();
    if(i===points.length-1&&lastFrame){normal.fromArray(lastFrame.normal);binormal.fromArray(lastFrame.binormal);}
    previous.copy(normal);
    for(let j=0;j<sides;j++){
      const a=j/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a),k=(i*sides+j)*3;
      for(let d=0;d<3;d++){const component=normal.getComponent(d)*c+binormal.getComponent(d)*s;n[k+d]=component;p[k+d]=points[i][d]+radius*component;}
    }
  }
  const count=(points.length-1)*sides*6;
  if(!geometry.index||geometry.index.array.length<count){
    const indices=new Uint32Array(count);
    for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){
      const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;
      indices.set([a,b,c,b,d,c],(i*sides+j)*6);
    }
    geometry.setIndex(new THREE.BufferAttribute(indices,1));
  }
  geometry.setDrawRange(0,count);geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;
}

// One draw call for every visible supply. Each ring uses the same finite wire
// diameter as the deposited braid; a thin line never substitutes at the fell.
export function createSupplyTubes(radius){
 const geometry=new THREE.BufferGeometry(),scratch=new THREE.BufferGeometry(),sides=8;
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.43,metalness:.18});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.raycast=()=>{};let signature='';
 function update(entries){
  const vertices=entries.reduce((sum,e)=>sum+e.path.length*sides,0),indices=entries.reduce((sum,e)=>sum+(e.path.length-1)*sides*6,0);
  if(!geometry.attributes.position||geometry.attributes.position.count<vertices){for(const key of ['position','normal','color'])geometry.setAttribute(key,new THREE.BufferAttribute(new Float32Array(vertices*3),3).setUsage(THREE.DynamicDrawUsage));signature='';}
  const next=entries.map(e=>e.path.length).join(',');
  if(next!==signature){const index=new Uint32Array(indices);let vertex=0,cursor=0;for(const e of entries){for(let i=0;i<e.path.length-1;i++)for(let j=0;j<sides;j++){const a=vertex+i*sides+j,b=vertex+i*sides+(j+1)%sides,c=a+sides,d=b+sides;index.set([a,b,c,b,d,c],cursor);cursor+=6;}vertex+=e.path.length*sides;}geometry.setIndex(new THREE.BufferAttribute(index,1));signature=next;}
  let offset=0;
  for(const {path,color,frame} of entries){updateStrandTube(scratch,path,radius,sides,frame);const size=path.length*sides*3;geometry.attributes.position.array.set(scratch.attributes.position.array.subarray(0,size),offset);geometry.attributes.normal.array.set(scratch.attributes.normal.array.subarray(0,size),offset);for(let k=offset;k<offset+size;k+=3)geometry.attributes.color.array.set(color,k);offset+=size;}
  for(const key of ['position','normal','color'])geometry.attributes[key].needsUpdate=true;geometry.setDrawRange(0,indices);
 }
 function dispose(){geometry.dispose();scratch.dispose();material.dispose();}
 return {mesh,update,dispose};
}
