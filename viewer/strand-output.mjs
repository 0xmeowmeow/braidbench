import * as THREE from 'three';
import {wrapPhase} from './motion.mjs';

// One material cell, repeated by take-up. The measured carrier permutation
// identifies every wire in each copy; this is not an unrelated braid texture.
// Near the camera the same centrelines are solid tubes. Distant cells use lines.
export function createStrandOutput(yarn,sampler,{ends,colors,wirePitch,toWorld,thickness}){
 const group=new THREE.Group(),cellPeriod=sampler.cellPeriod,pitch=cellPeriod*yarn.feedPerRadian,length=sampler.length;
 const count=yarn.count,cycles=Math.round(yarn.period/cellPeriod),tileCount=Math.ceil(length/pitch)+1;
 const radius=(yarn.profile?.wireDiameter??(2*thickness))/2,solidEnabled=!!yarn.profile,sides=8;
 const identity=Array.from({length:count},(_,i)=>i),maps=[identity];
 const sectorEnabled=solidEnabled&&count>20&&!!yarn.profile.symmetry,prototypes=sectorEnabled?yarn.profile.symmetry.prototypes:identity;
 const sectors=[];
 if(sectorEnabled){const groups=new Map(),sym=yarn.profile.symmetry;for(let c=0;c<count;c++){const r=sym.rotations[c],angle=Math.atan2(r[1][0],r[0][0]),key=Math.round(angle*1e8);if(!groups.has(key)){const sector={angle,co:r[0][0],si:r[1][0],ids:[0,0,0,0]};groups.set(key,sector);sectors.push(sector);}groups.get(key).ids[sym.classes[c]]=c;}}
 else sectors.push({angle:0,co:1,si:0,ids:[0,1,2,3]});
 const instanceCapacity=tileCount*sectors.length;
 for(let k=1;k<cycles;k++)maps.push(maps[k-1].map(i=>yarn.profile.perm[i]));
 const mapping=new Float32Array(count*cycles*4);maps.forEach((row,k)=>row.forEach((c,i)=>mapping[(k*count+i)*4]=c));
 const mapTexture=new THREE.DataTexture(mapping,count,cycles,THREE.RGBAFormat,THREE.FloatType);mapTexture.needsUpdate=true;
 const totalEdges=prototypes.reduce((s,c)=>s+sampler.cellCircuits[c].length-1,0)*ends;
 const totalRings=prototypes.reduce((s,c)=>s+sampler.cellCircuits[c].length,0)*ends;
 const linePositions=new Float32Array(totalEdges*2*3),lineOther=new Float32Array(totalEdges*2),lineWire=new Float32Array(totalEdges*2);
 const tubePositions=solidEnabled?new Float32Array(totalRings*sides*3):null,tubeNormals=solidEnabled?new Float32Array(totalRings*sides*3):null;
 const tubeNeighbours=solidEnabled?new Float32Array(totalRings*sides*2):null,tubeWire=solidEnabled?new Float32Array(totalRings*sides):null;
 const ringAngles=solidEnabled?new Float32Array(totalRings*sides*2):null;
 const tubeIndices=solidEnabled?new Uint32Array(totalEdges*sides*6):null;
 let lineCursor=0,ringCursor=0,indexCursor=0,maxRadius=0;const xyPoints=[];
 const shifted=(xy,side)=>{const a=side/Math.hypot(...xy),co=Math.cos(a),si=Math.sin(a);return [xy[0]*co-xy[1]*si,xy[0]*si+xy[1]*co];};
 const at=(c,t,side)=>{const p=yarn.pointAt(c,t);return [p.radius*Math.cos(p.angle+side/p.radius),p.radius*Math.sin(p.angle+side/p.radius),-t*yarn.feedPerRadian];};
 const tangent=new THREE.Vector3(),normal=new THREE.Vector3(),binormal=new THREE.Vector3();
 function ringFrame(c,phase,side){const epsilon=yarn.step/4,a=at(c,phase-epsilon,side),b=at(c,phase+epsilon,side),p=at(c,phase,side);tangent.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();normal.set(p[0],p[1],0).normalize();normal.addScaledVector(tangent,-normal.dot(tangent)).normalize();binormal.crossVectors(tangent,normal).normalize();}
 for(const c of prototypes)for(let end=0;end<ends;end++){
  const geometricCarrier=prototypes.indexOf(c),knots=sampler.cellCircuits[c],side=(end-(ends-1)/2)*wirePitch,startRing=ringCursor;
  const path=knots.map(k=>[...shifted(k.xy,side),-k.phase*yarn.feedPerRadian]);
  for(let j=0;j<path.length;j++){
   maxRadius=Math.max(maxRadius,Math.hypot(path[j][0],path[j][1]));xyPoints.push([path[j][0],path[j][1]]);
   if(j)for(const [p,q] of [[path[j-1],path[j]],[path[j],path[j-1]]]){
    linePositions.set(p,lineCursor*3);lineOther[lineCursor]=q[2];lineWire[lineCursor]=geometricCarrier*ends+end;lineCursor++;
   }
   if(!solidEnabled)continue;
   ringFrame(c,knots[j].phase,side);
   for(let s=0;s<sides;s++){
    const angle=s/sides*Math.PI*2,k=ringCursor*sides+s;
    tubePositions.set(path[j],k*3);tubeNormals.set([normal.x*Math.cos(angle)+binormal.x*Math.sin(angle),normal.y*Math.cos(angle)+binormal.y*Math.sin(angle),normal.z*Math.cos(angle)+binormal.z*Math.sin(angle)],k*3);
    tubeNeighbours.set([path[Math.max(0,j-1)][2],path[Math.min(path.length-1,j+1)][2]],k*2);tubeWire[k]=geometricCarrier*ends+end;
    ringAngles.set([Math.cos(angle),Math.sin(angle)],k*2);
   }
   if(j)for(let s=0;s<sides;s++){
    const a=(startRing+j-1)*sides+s,b=(startRing+j-1)*sides+(s+1)%sides,c=a+sides,d=b+sides;
    tubeIndices.set([a,b,c,b,d,c],indexCursor);indexCursor+=6;
   }
   ringCursor++;
  }
 }
 const headData=new Float32Array(count*ends*2*4),headTexture=new THREE.DataTexture(headData,count*ends,2,THREE.RGBAFormat,THREE.FloatType);headTexture.needsUpdate=true;
 const frames=Array.from({length:count*ends},()=>({normal:[0,0,1],binormal:[0,1,0]}));
 const uniforms={shift:{value:0},timeCell:{value:0},outputLength:{value:length},carrierMap:{value:mapTexture},headFrames:{value:headTexture},headPoints:{value:identity.map(()=>new THREE.Vector2())},tailPoints:{value:identity.map(()=>new THREE.Vector2())},strandColors:{value:colors.map(c=>new THREE.Color(c))},selectedPair:{value:new THREE.Vector2(0,1)},highlightPair:{value:0},isolatePair:{value:0}};
 function material(solid){
  const m=solid?new THREE.MeshStandardMaterial({roughness:.43,metalness:.18}):new THREE.LineBasicMaterial();
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,uniforms);
   shader.vertexShader=`attribute float wire;attribute float axialOffset;attribute float cellIndex;attribute vec2 sectorRotation;attribute vec4 prototypeMap;${solid?'attribute vec2 neighbours;attribute vec2 ringAngle;':'attribute float otherZ;'}
   uniform float shift;uniform float timeCell;uniform float outputLength;uniform sampler2D carrierMap;uniform sampler2D headFrames;uniform vec2 headPoints[${count}];uniform vec2 tailPoints[${count}];uniform vec3 strandColors[${count}];uniform vec2 selectedPair;uniform float highlightPair;uniform float isolatePair;
   varying float outputZ;varying float shown;varying vec3 strandColor;
   int physicalCarrier(){int geometricCarrier=${sectorEnabled?'int(prototypeMap[int(wire/'+ends+'.0)]+0.5)':'int(wire/'+ends+'.0)'};float cell=mod(mod(cellIndex-timeCell,${cycles}.0)+${cycles}.0,${cycles}.0);return int(texture2D(carrierMap,vec2((float(geometricCarrier)+0.5)/${count}.0,(cell+0.5)/${cycles}.0)).r+0.5);}\n`+shader.vertexShader;
   if(solid)shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
   objectNormal.xy=mat2(sectorRotation.x,sectorRotation.y,-sectorRotation.y,sectorRotation.x)*objectNormal.xy;
   if(position.z+axialOffset+shift<0.0&&neighbours.x+axialOffset+shift>=0.0){float frameWire=float(physicalCarrier())*${ends}.0+mod(wire,${ends}.0);vec3 headNormal=texture2D(headFrames,vec2((frameWire+0.5)/${count*ends}.0,0.25)).xyz;vec3 headBinormal=texture2D(headFrames,vec2((frameWire+0.5)/${count*ends}.0,0.75)).xyz;objectNormal=headNormal*ringAngle.x+headBinormal*ringAngle.y;}`);
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=position;transformed.xy=mat2(sectorRotation.x,sectorRotation.y,-sectorRotation.y,sectorRotation.x)*transformed.xy;transformed.z+=axialOffset+shift;
   int geometricCarrier=int(wire/${ends}.0);float end=wire-float(geometricCarrier)*${ends}.0;
   int c=physicalCarrier();
   float side=(end-${((ends-1)/2).toFixed(1)})*${wirePitch};
   float beforeZ=${solid?'neighbours.x':'otherZ'}+axialOffset+shift,afterZ=${solid?'neighbours.y':'otherZ'}+axialOffset+shift;
   if(transformed.z<0.0&&beforeZ>=0.0){float a=side/length(headPoints[c]);transformed.xy=mat2(cos(a),sin(a),-sin(a),cos(a))*headPoints[c];transformed.z=0.0;}
   if(transformed.z>outputLength&&afterZ<=outputLength){float a=side/length(tailPoints[c]);transformed.xy=mat2(cos(a),sin(a),-sin(a),cos(a))*tailPoints[c];transformed.z=outputLength;}
   outputZ=transformed.z;${solid?`transformed+=objectNormal*${radius};`:''}
   float selected=(abs(float(c)-selectedPair.x)<0.1||abs(float(c)-selectedPair.y)<0.1)?1.0:0.0;
   shown=1.0-isolatePair*(1.0-selected);strandColor=strandColors[c]*mix(1.0,mix(0.5,1.0,selected),highlightPair);`);
   shader.fragmentShader='uniform float outputLength;varying float outputZ;varying float shown;varying vec3 strandColor;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(outputZ<0.0||outputZ>outputLength||shown<0.5)discard;diffuseColor.rgb*=strandColor;');
  };
  return m;
 }
 function geometry(positions,wire){const g=new THREE.InstancedBufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('wire',new THREE.BufferAttribute(wire,1));g.setAttribute('axialOffset',new THREE.InstancedBufferAttribute(new Float32Array(instanceCapacity),1).setUsage(THREE.DynamicDrawUsage));g.setAttribute('cellIndex',new THREE.InstancedBufferAttribute(new Float32Array(instanceCapacity),1).setUsage(THREE.DynamicDrawUsage));g.setAttribute('sectorRotation',new THREE.InstancedBufferAttribute(new Float32Array(instanceCapacity*2),2).setUsage(THREE.DynamicDrawUsage));g.setAttribute('prototypeMap',new THREE.InstancedBufferAttribute(new Float32Array(instanceCapacity*4),4).setUsage(THREE.DynamicDrawUsage));g.instanceCount=0;return g;}
 const lineGeometry=geometry(linePositions,lineWire);lineGeometry.setAttribute('otherZ',new THREE.BufferAttribute(lineOther,1));
 const lineMaterial=material(false),lines=new THREE.LineSegments(lineGeometry,lineMaterial);lines.frustumCulled=false;group.add(lines);
 let tubeGeometry,tubeMaterial,tubes;
 if(solidEnabled){tubeGeometry=geometry(tubePositions,tubeWire);tubeGeometry.setAttribute('normal',new THREE.BufferAttribute(tubeNormals,3));tubeGeometry.setAttribute('ringAngle',new THREE.BufferAttribute(ringAngles,2));tubeGeometry.setAttribute('neighbours',new THREE.BufferAttribute(tubeNeighbours,2));tubeGeometry.setIndex(new THREE.BufferAttribute(tubeIndices,1));tubeMaterial=material(true);tubes=new THREE.Mesh(tubeGeometry,tubeMaterial);tubes.frustumCulled=false;group.add(tubes);}
 const origin=new THREE.Vector3(...toWorld(0,0,0)),axes=[[1,0,0],[0,1,0],[0,0,1]].map(p=>new THREE.Vector3(...toWorld(...p)).sub(origin));
 group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...axes));group.position.copy(origin);
 // Keep identity integral. floor(Float32(k*pitch)/Float32(pitch)) can be k-1.
 function assignTiles(g,tiles){if(!g)return;g.instanceCount=tiles.length;tiles.forEach(({k,sector},i)=>{g.attributes.axialOffset.array[i]=k*pitch;g.attributes.cellIndex.array[i]=k;g.attributes.sectorRotation.array.set([sector.co,sector.si],i*2);g.attributes.prototypeMap.array.set(sector.ids,i*4);});for(const key of ['axialOffset','cellIndex','sectorRotation','prototypeMap'])g.attributes[key].needsUpdate=true;}
 assignTiles(lineGeometry,Array.from({length:tileCount},(_,k)=>sectors.map(sector=>({k,sector}))).flat());
 let coreVisible=true;
 function update(t,{trace=false,pair=[0,1],onlyPair=false,coreCutaway=false}={}){
  coreVisible=!coreCutaway;
  const wrapped=wrapPhase(t,yarn.period);uniforms.shift.value=wrapPhase(wrapped,cellPeriod)*yarn.feedPerRadian;uniforms.timeCell.value=Math.floor(wrapped/cellPeriod);uniforms.selectedPair.value.set(...pair);uniforms.highlightPair.value=+trace;uniforms.isolatePair.value=+onlyPair;
  for(let c=0;c<count;c++){const a=yarn.depositedPoint(c,t,0),b=yarn.depositedPoint(c,t,length);uniforms.headPoints.value[c].set(a.x,a.y);uniforms.tailPoints.value[c].set(b.x,b.y);}
  if(solidEnabled){const step=cellPeriod/yarn.profile.steps,lo=Math.floor(t/step)*step,f=(t-lo)/step;for(let c=0;c<count;c++)for(let end=0;end<ends;end++){
   const side=(end-(ends-1)/2)*wirePitch,wire=c*ends+end;
   ringFrame(c,lo,side);const na=normal.clone(),ba=binormal.clone();ringFrame(c,lo+step,side);normal.lerpVectors(na,normal,f);binormal.lerpVectors(ba,binormal,f);
   // The clipping ring must interpolate the existing mesh's frames. Using a
   // fresh tangent here twists a vanishingly short first segment at a knot.
   headData.set(normal.toArray(),wire*4);headData.set(binormal.toArray(),(count*ends+wire)*4);
   const world=v=>axes[0].clone().multiplyScalar(v.x).addScaledVector(axes[1],v.y).addScaledVector(axes[2],v.z).toArray();frames[wire].normal=world(normal);frames[wire].binormal=world(binormal.clone().negate());
  }headTexture.needsUpdate=true;}
 }
 const frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),sphere=new THREE.Sphere(),centre=new THREE.Vector3();
 const xmin=xyPoints.reduce((v,p)=>Math.min(v,p[0]),Infinity),xmax=xyPoints.reduce((v,p)=>Math.max(v,p[0]),-Infinity),ymin=xyPoints.reduce((v,p)=>Math.min(v,p[1]),Infinity),ymax=xyPoints.reduce((v,p)=>Math.max(v,p[1]),-Infinity);
 const xyCentre=[(xmin+xmax)/2,(ymin+ymax)/2],xyRadius=xyPoints.reduce((v,p)=>Math.max(v,Math.hypot(p[0]-xyCentre[0],p[1]-xyCentre[1])),0)+radius;
 const midAngle=Math.atan2(xyCentre[1],xyCentre[0]),angularRadius=sectorEnabled?Math.max(...xyPoints.map(p=>Math.abs(Math.atan2(Math.sin(Math.atan2(p[1],p[0])-midAngle),Math.cos(Math.atan2(p[1],p[0])-midAngle)))))+Math.asin(radius/maxRadius):Math.PI;
 function updateCamera(camera,pixelHeight){
  if(!solidEnabled)return;
  camera.updateMatrixWorld();group.updateWorldMatrix(true,false);frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const localCamera=group.worldToLocal(camera.position.clone()),cameraRadius=Math.hypot(localCamera.x,localCamera.y),cameraAngle=Math.atan2(localCamera.y,localCamera.x),core=yarn.profile.core,occlude=sectorEnabled&&coreVisible&&core>0&&cameraRadius>maxRadius+radius&&localCamera.z>=-600&&localCamera.z<=length;
  const horizon=occlude?Math.acos(core/(maxRadius+radius))+Math.acos(core/cameraRadius):Math.PI;
  const near=[],far=[],pixelsPerUnit=pixelHeight/(2*Math.tan(camera.fov*Math.PI/360));
  for(let k=0;k<tileCount;k++){
   const z=(k-.5)*pitch+uniforms.shift.value;if(z+pitch/2<0||z-pitch/2>length)continue;
   for(const sector of sectors){
    const angle=midAngle+sector.angle,delta=Math.abs(Math.atan2(Math.sin(angle-cameraAngle),Math.cos(angle-cameraAngle)));
    if(occlude&&delta>horizon+angularRadius)continue;
    centre.set(xyCentre[0]*sector.co-xyCentre[1]*sector.si,xyCentre[0]*sector.si+xyCentre[1]*sector.co,z).applyMatrix4(group.matrixWorld);sphere.center.copy(centre);sphere.radius=Math.hypot(xyRadius,pitch/2+radius);
    if(!frustum.intersectsSphere(sphere))continue;
    const projectedDiameter=2*radius*pixelsPerUnit/Math.max(1,camera.position.distanceTo(centre));
    (projectedDiameter>.8?near:far).push({k,sector});
   }
  }
  assignTiles(lineGeometry,far);assignTiles(tubeGeometry,near);
 }
 function dispose(){lineGeometry.dispose();lineMaterial.dispose();tubeGeometry?.dispose();tubeMaterial?.dispose();mapTexture.dispose();headTexture.dispose();}
 return {group,update,updateCamera,dispose,headFrame:(c,end)=>frames[c*ends+end],getStats:()=>({solidInstances:tubeGeometry?.instanceCount,lineInstances:lineGeometry.instanceCount,trianglesPerInstance:tubeIndices?.length/3})};
}
