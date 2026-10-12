import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createCarrierMotion,carrierPartPose} from '../viewer/motion.mjs';
const results=[];
for(const n of [8,12,16]){
 const a=JSON.parse(await readFile(new URL(`../models/assembly-${n}.json`,import.meta.url))),m=createCarrierMotion(a),guides=a.instances.filter(v=>v.part==='yarn-eye-post');
 let toBobbin=Infinity,betweenGuides=Infinity;
 const samples=8000;
 for(let k=0;k<=samples;k++){
  const p=m.posesAt(k*m.period/samples),g=guides.map(v=>carrierPartPose(v,p[v.carrier]));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j){toBobbin=Math.min(toBobbin,Math.hypot(g[i].x-p[j].x,g[i].y-p[j].y)-13-8.55);betweenGuides=Math.min(betweenGuides,Math.hypot(g[i].x-g[j].x,g[i].y-g[j].y)-17.1);}
 }
 // Each centre speed <= 57 mm/radian, so relative separation can decrease
 // by at most 114*step/2 from a sample to its closest intervening minimum.
 const betweenSampleBound=57*m.period/samples;
 assert(toBobbin>betweenSampleBound);assert(betweenGuides>betweenSampleBound);
 results.push({strands:n,samples,guide_to_other_bobbin_envelope_clearance_mm:toBobbin,guide_to_guide_envelope_clearance_mm:betweenGuides,between_sample_bound_mm:betweenSampleBound});
}
await writeFile(new URL('../docs/guide-clearance.json',import.meta.url),JSON.stringify({scope:'Conservative planar envelopes (guide radius 8.55 mm, bobbin 13 mm) along ideal prescribed motion. Excludes carrier-foot contacts, fasteners, yarn forces and unmodelled dancer. Own-bobbin clearance checked separately with FreeCAD solids.',results},null,2)+'\n');console.log(JSON.stringify(results));
