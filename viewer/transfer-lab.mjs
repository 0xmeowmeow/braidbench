import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {contactAt,constrainedMove} from './transfer-contact.mjs';
const $=id=>document.getElementById(id),stage=$('viewport'),data=window.TRANSFER_DATA||await(await fetch('../models/transfer-test.json')).json();
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,2000);camera.up.set(0,0,1);camera.position.set(140,-170,170);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;stage.append(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,0,8);orbit.minDistance=40;orbit.maxDistance=600;orbit.update();
scene.add(new THREE.HemisphereLight(0xcdeaff,0x546576,2.5));const light=new THREE.DirectionalLight(0xffedd8,3);light.position.set(40,-80,180);scene.add(light);
const moving=new THREE.Group(),ghost=new THREE.Group();scene.add(moving,ghost);
const meshes={};
for(const [name,part] of Object.entries(data.parts)){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.flat(),3));g.setIndex(part.faces.flat());g.computeVertexNormals();
 const m=new THREE.MeshStandardMaterial({flatShading:true,color:part.process==='laser'?0xb9976b:0x52d5d0,roughness:.62,metalness:.06,transparent:name==='cover',opacity:name==='cover'?.28:1,depthWrite:name!=='cover',side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(g,m);mesh.position.z=part.z;meshes[name]=mesh;
 if(name.endsWith('shoe')||name==='handle')moving.add(mesh);else scene.add(mesh);
 if(name.endsWith('shoe')){const copy=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xff8c76,transparent:true,opacity:.26,depthWrite:false,depthTest:false}));copy.position.z=part.z;copy.name=name;copy.renderOrder=10;ghost.add(copy);}
}
// Mount screws and the handle indicator are reference envelopes, with matching holes.
for(const x of [-50,50])for(const y of [-35,35]){const shaft=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,20,12),new THREE.MeshStandardMaterial({color:0x9cabb3,metalness:.7,roughness:.3}));shaft.rotation.x=Math.PI/2;shaft.position.set(x,y,8);scene.add(shaft);const head=new THREE.Mesh(new THREE.CylinderGeometry(3,3,2,6),shaft.material);head.rotation.x=Math.PI/2;head.position.set(x,y,16);scene.add(head);}
const mark=new THREE.Mesh(new THREE.BoxGeometry(10,1.2,.2),new THREE.MeshBasicMaterial({color:0x142e38}));mark.position.z=19.9;moving.add(mark);
let kind='boat',pose={x:0,y:0,yaw:0},requested={...pose},blocked=false,dirty=true;
function update(){
 for(const name of ['boat','round']){meshes[name+'-shoe'].visible=name===kind;ghost.children.find(m=>m.name===name+'-shoe').visible=name===kind;}
 moving.position.set(pose.x,pose.y,0);moving.rotation.z=pose.yaw;ghost.position.set(requested.x,requested.y,0);ghost.rotation.z=requested.yaw;ghost.visible=blocked;
 meshes.cover.visible=$('cover').checked;
 $('actual').textContent=(pose.yaw*180/Math.PI).toFixed(2)+'°';$('distance').textContent=pose.x.toFixed(1)+' mm';
 $('state').textContent=blocked?'Stopped by the track':'Fits the track';$('state').classList.toggle('blocked',blocked);
 $('result').textContent=blocked?'The requested pose is shown in red. The solid shoe stops at the first detected wall contact.':kind==='boat'?'Slide through the crossing, then try turning toward the other branch.':'The round control can turn freely at the crossing. Its shape does not select a branch.';
 dirty=true;
}
function request(next){requested=next;const result=constrainedMove(pose,requested,kind);pose={x:result.x,y:result.y,yaw:result.yaw};blocked=result.blocked;update();}
function reset(){pose={x:0,y:0,yaw:0};requested={...pose};blocked=false;$('travel').value=0;$('yaw').value=0;update();}
$('shoe').onchange=()=>{kind=$('shoe').value;reset();};$('travel').oninput=e=>request({...pose,x:+e.target.value});$('yaw').oninput=e=>request({...pose,yaw:+e.target.value*Math.PI/180});$('turn').onclick=()=>{$('yaw').value=60;request({...pose,yaw:Math.PI/3});};$('reset').onclick=reset;$('cover').onchange=update;
$('top').onclick=()=>{camera.position.set(0,-.01,240);orbit.target.set(0,0,8);orbit.update();dirty=true;};$('perspective').onclick=()=>{camera.position.set(140,-170,170);orbit.target.set(0,0,8);orbit.update();dirty=true;};
new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();const distance=80/Math.sin(camera.fov*Math.PI/360)/Math.min(camera.aspect,1)*1.1;camera.position.sub(orbit.target).normalize().multiplyScalar(distance).add(orbit.target);orbit.update();dirty=true;}).observe(stage);orbit.addEventListener('change',()=>{dirty=true;});
function animate(){requestAnimationFrame(animate);if(dirty){renderer.render(scene,camera);dirty=false;}}update();animate();
window.transferLab={getState:()=>({kind,pose,requested,blocked,free:contactAt(pose.x,pose.y,pose.yaw,kind).free}),request,reset};
