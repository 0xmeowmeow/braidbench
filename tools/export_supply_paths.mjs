import {readFile,open} from 'node:fs/promises';
import {createCarrierMotion} from '../viewer/motion.mjs';
import {createBraidProfile} from '../viewer/braid-profile.mjs';
import {createYarnMotion} from '../viewer/yarn-motion.mjs';
import {createIndustrialSupply} from '../viewer/industrial-supply.mjs';
import {createTabletopSupply} from '../viewer/tabletop-supply.mjs';

const input=process.argv[2],output=process.argv[3],samples=Number(process.argv[4])||256;
if(!input||!output)throw Error('Usage: node tools/export_supply_paths.mjs PROFILE.json OUTPUT.jsonl [SAMPLES=256] [ENDS]');
const profile=createBraidProfile(JSON.parse(await readFile(input))),n=profile.count,ends=Number(process.argv[5])||profile.ends,industrial=n>20;
const data=JSON.parse(await readFile(new URL(`../models/${industrial?'industrial-motion':'assembly'}-${n}.json`,import.meta.url))),motion=createCarrierMotion(data),guides=data.instances.filter(p=>p.part==='yarn-eye-post');
const supply=industrial?createIndustrialSupply(motion):createTabletopSupply(guides,{wireRadius:profile.wireDiameter/2});
const yarn=createYarnMotion(motion,{profile,spanHeight:industrial?125:205,supplyRadius:industrial?motion.orbitRadius*.2+.08:supply.packageRadius,guideAt:industrial?p=>supply.dancerFrame(p).exit:supply.exitAt,extraFreeAt:supply.extraFreeAt});
const file=await open(output,'w');
try{
 await file.write(JSON.stringify({count:n,ends,frames:samples,wireDiameter:profile.wireDiameter,period:profile.cellPeriod,scope:'One complete geometric cell, including every carrier; coordinates match the viewer.'})+'\n');
 for(let k=0;k<samples;k++){
  const t=k/samples*profile.cellPeriod,poses=motion.posesAt(t),paths=poses.flatMap((p,c)=>Array.from({length:ends},(_,e)=>industrial?supply.pathAt(p,(e-(ends-1)/2)*profile.wirePitch,yarn.stateAt(c,t).stored,c):supply.pathAt(p,c,yarn.stateAt(c,t).stored)));
  await file.write(JSON.stringify({phase:t,paths})+'\n');
 }
}finally{await file.close();}
console.log(`Exported ${samples} supply poses for ${n*ends} wires`);
