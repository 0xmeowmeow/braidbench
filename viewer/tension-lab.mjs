import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {forces,threadRoute,routeLength,wireRadius} from './tension-mechanics.mjs';
const $=id=>document.getElementById(id),stage=$('viewport'),data=window.TENSION_DATA||await(await fetch('../models/tension-test.json')).json();
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,2000);camera.position.set(140,125,360);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,91,20);orbit.minDistance=80;orbit.maxDistance=800;orbit.update();
scene.add(new THREE.HemisphereLight(0xe2f1ff,0x5b4b3e,2.6));const light=new THREE.DirectionalLight(0xffecd8,3);light.position.set(-100,220,250);scene.add(light);
const pulleyMaterials=[];
const moving=new THREE.Group();scene.add(moving);const geometries={};
for(const [name,part] of Object.entries(data.parts)){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.flat(),3));g.setIndex(part.faces.flat());g.computeVertexNormals();geometries[name]=g;
}
for(const item of data.instances){
 const part=data.parts[item.part],color=item.part==='guide-eye'?0xf2ece3:part.process==='laser'?0x927d5a:part.process==='printed'?0x65c6c5:item.part==='felt-brake'?0x442f24:0xb2c0c7;
 const mesh=new THREE.Mesh(geometries[item.part],new THREE.MeshStandardMaterial({color,flatShading:true,roughness:part.process==='hardware'?.32:.66,metalness:part.process==='hardware'?.55:.03}));mesh.position.fromArray(item.pos);if(item.rotate)mesh.rotation.set(...item.rotate.map(a=>a*Math.PI/180));(item.group==='moving'?moving:scene).add(mesh);
 if(['pulley','pulley-retainer'].includes(item.part)){mesh.material.transparent=true;mesh.material.depthWrite=false;pulleyMaterials.push(mesh.material);}
}
// The threaded studs, bearing and spring use the same reference envelopes as CAD.
const thread=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xffd487}));scene.add(thread);
const packageMesh=new THREE.Mesh(new THREE.CylinderGeometry(1,1,35,64),new THREE.MeshStandardMaterial({color:0xd89843,roughness:.95}));packageMesh.rotation.x=Math.PI/2;packageMesh.position.set(-42,60,31.5);scene.add(packageMesh);
// Travel witness marks: a reference scale, not another mechanical constraint.
for(let y=80;y<=120;y+=5){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(38,y,6.2),new THREE.Vector3(y%10?41:44,y,6.2)]);scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0xd8e2e7})));}
let dirty=true,state;
function update(){
 const y=+$('position').value,mass=+$('mass').value,radius=+$('radius').value,torque=+$('torque').value,f=forces(mass,torque,radius),points=threadRoute(y,radius);
 for(const m of pulleyMaterials)m.opacity=$('seeThread').checked?.24:1;
 moving.position.y=y-100;packageMesh.scale.set(radius,1,radius);
 const p=points.map(p=>new THREE.Vector3(...p)),curve=new THREE.CurvePath();for(let i=1;i<p.length;i++)curve.add(new THREE.LineCurve3(p[i-1],p[i]));
 // Arc-length sampling preserves the straight legs and densely resolves the bends.
 thread.geometry.dispose();thread.geometry=new THREE.TubeGeometry(curve,1200,wireRadius,8,false);
 $('positionValue').textContent=y.toFixed(0)+' mm';$('massValue').textContent=mass.toFixed(0)+' g';$('radiusValue').textContent=radius.toFixed(1)+' mm';$('torqueValue').textContent=torque.toFixed(1)+' N·mm';
 $('ideal').textContent=f.ideal.toFixed(3)+' N';$('brake').textContent=f.brake.toFixed(3)+' N';$('storage').textContent=(2*(120-y)).toFixed(0)+' / 80 mm';
 const balance=f.brake-f.ideal;
 $('state').textContent=Math.abs(balance)<.005?'Nearly balanced at this radius':balance>0?'Dancer tends to rise':'Dancer tends to descend';
 $('result').textContent=Math.abs(balance)<.005?'A smaller package radius still raises the pull required by the same brake torque.':balance>0?'The brake demands more pull than the weight supplies. Pulling the output first consumes the stored loop.':'The weight can pull material off the bobbin. The loop grows until the lower stop is reached.';
 $('status').textContent='Ideal, quasistatic comparison · position is set by you';state={y,mass,radius,torque,...f,routeLength:routeLength(points),stored:2*(120-y)};dirty=true;
}
$('seeThread').onchange=update;
for(const name of ['position','mass','radius','torque'])$(name).oninput=update;
function view(front){const d=camera.position.distanceTo(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(front?0:.37,.10,1).normalize().multiplyScalar(d));orbit.update();dirty=true;}
$('front').onclick=()=>view(true);$('perspective').onclick=()=>view(false);
new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();const distance=110/Math.sin(camera.fov*Math.PI/360)/Math.min(camera.aspect*1.5,1)*1.18;camera.position.sub(orbit.target).normalize().multiplyScalar(distance).add(orbit.target);orbit.update();dirty=true;}).observe(stage);
orbit.addEventListener('change',()=>{dirty=true;});function frame(){requestAnimationFrame(frame);if(dirty){renderer.render(scene,camera);dirty=false;}}update();frame();
window.tensionLab={getState:()=>({...state}),set:(values)=>{for(const [k,v] of Object.entries(values))$(k).value=v;update();}};
