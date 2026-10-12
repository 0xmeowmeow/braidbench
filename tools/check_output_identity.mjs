import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createCarrierMotion} from '../viewer/motion.mjs';
import {createBraidProfile} from '../viewer/braid-profile.mjs';
import {createYarnMotion} from '../viewer/yarn-motion.mjs';
import {createStrandSampler} from '../viewer/strand-sampling.mjs';
import {createStrandOutput} from '../viewer/strand-output.mjs';

// Compare the actual instanced vertex attributes and shader identity texture
// with each identified wire's independent material-history coordinates.
const results=[];
for(const count of [8,12,16,48,72]){
 const industrial=count>20,profile=createBraidProfile(JSON.parse(await readFile(`models/braid-profile-${count}.json`))),motion=createCarrierMotion(JSON.parse(await readFile(`models/${industrial?'industrial-motion':'assembly'}-${count}.json`)));
 const yarn=createYarnMotion(motion,{profile}),length=industrial?490:140,sampler=createStrandSampler(yarn,{length}),cycles=Math.round(profile.period/profile.cellPeriod);
 for(const ends of industrial?[1,4,8]:[1]){
  const output=createStrandOutput(yarn,sampler,{ends,colors:Array(count).fill('#ffffff'),wirePitch:profile.wirePitch,toWorld:(...p)=>p,thickness:profile.wireDiameter/2}),lines=output.group.children[0],g=lines.geometry;
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};lines.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/cellIndex-timeCell/,'Use an explicit integer cell index; dividing a Float32 axial position by pitch can select the previous carrier cell');
  const maps=shader.uniforms.carrierMap.value.image.data,position=g.attributes.position.array,wire=g.attributes.wire.array;
  let checked=0,maximumError=0;
  for(const cycle of [...new Set([0,1,Math.floor(cycles/2),cycles-1])]){
   const t=(cycle+.37)*profile.cellPeriod;output.update(t);const shift=shader.uniforms.shift.value,timeCell=shader.uniforms.timeCell.value;
   for(let instance=0;instance<g.instanceCount;instance++){
    const cell=g.attributes.cellIndex.array[instance],axial=g.attributes.axialOffset.array[instance],co=g.attributes.sectorRotation.array[instance*2],si=g.attributes.sectorRotation.array[instance*2+1];assert(Number.isInteger(cell));
    const mapCell=((cell-timeCell)%cycles+cycles)%cycles;
    for(let block=0;block<position.length/3/(profile.steps*2);block++)for(const local of [0,1,34,62,128,192,255]){
     const vertex=block*profile.steps*2+local,geometric=Math.floor(wire[vertex]/ends),end=wire[vertex]%ends;
     const mapped=industrial?g.attributes.prototypeMap.array[instance*4+geometric]:geometric,physical=maps[(mapCell*count+mapped)*4];
     const z=position[vertex*3+2]+axial+shift;if(z<0||z>length)continue;
     const x=position[vertex*3],y=position[vertex*3+1],rendered=[x*co-y*si,x*si+y*co],q=yarn.depositedPoint(physical,t,z),a=(end-(ends-1)/2)*profile.wirePitch/Math.hypot(q.x,q.y),expected=[q.x*Math.cos(a)-q.y*Math.sin(a),q.x*Math.sin(a)+q.y*Math.cos(a)];
     const error=Math.hypot(rendered[0]-expected[0],rendered[1]-expected[1]);maximumError=Math.max(maximumError,error);checked++;
     assert(error<.00015,`Wrong material identity at ${count} carriers, end ${end}, tile ${cell}: ${error} mm`);
    }
   }
  }
  results.push({carriers:count,ends,vertices_compared:checked,maximum_float32_position_error_mm:maximumError});output.dispose();
 }
}
const report={results,scope:'Actual instanced cell/sector attributes and carrier texture compared with the identified wire’s material-history path. Includes every output tile and all wire ends. Browser compilation, seams and camera culling are checked separately.'};
await writeFile('docs/output-identity-validation.json',JSON.stringify(report,null,2)+'\n');console.log(report);
