import {readFile,writeFile} from 'node:fs/promises';
import {createCarrierMotion} from '../viewer/motion.mjs';
import {createBraidProfile} from '../viewer/braid-profile.mjs';
import {createYarnMotion} from '../viewer/yarn-motion.mjs';
import {createTabletopSupply} from '../viewer/tabletop-supply.mjs';
const output=process.argv[2];if(!output)throw Error('Usage: node tools/export_supply_solids.mjs OUTPUT.json');
const rows=[];
for(const count of [8,12,16]){
 const data=JSON.parse(await readFile(`models/assembly-${count}.json`)),profile=createBraidProfile(JSON.parse(await readFile(`models/braid-profile-${count}.json`))),motion=createCarrierMotion(data),guides=data.instances.filter(p=>p.part==='yarn-eye-post'),supply=createTabletopSupply(guides,{wireRadius:profile.wireDiameter/2});
 const yarn=createYarnMotion(motion,{profile,guideAt:supply.exitAt,spanHeight:205,supplyRadius:supply.packageRadius}),stored=Math.max(...yarn.maxStored);
 rows.push({count,wireRadius:profile.wireDiameter/2,maximumStored:stored,path:supply.pathAt(motion.posesAt(0)[0],0,stored)});
}
await writeFile(output,JSON.stringify(rows));
