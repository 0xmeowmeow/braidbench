import {readFile,writeFile} from 'node:fs/promises';
import {createCarrierMotion,carrierPartPose} from '../viewer/motion.mjs';
import {tensionExit} from '../viewer/tension-motion.mjs';

const n=Number(process.argv[2]),destination=process.argv[3],steps=Number(process.argv[4])||128;
if(![8,12,16,48,72].includes(n)||!destination)throw Error('Usage: node tools/export_braid_source.mjs COUNT OUTPUT.json [SAMPLES=128]');
const a=JSON.parse(await readFile(new URL(`../models/${n<20?'assembly':'industrial-motion'}-${n}.json`,import.meta.url)));
const motion=createCarrierMotion(a),guides=a.instances.filter(v=>v.part==='yarn-eye-post');
const base=n<20?(p,c)=>carrierPartPose(guides[c],p):p=>({x:p.x+motion.orbitRadius*.35*Math.cos(p.heading),y:p.y+motion.orbitRadius*.35*Math.sin(p.heading)});
const guideAt=(p,c)=>tensionExit(base(p,c),p.heading,n<20?2:motion.orbitRadius*.08);
const samples=Array.from({length:steps+1},(_,k)=>motion.posesAt(k*2*Math.PI/steps).map(guideAt));
const perm=Array.from({length:n},(_,c)=>{const p=samples[steps][c],dist=samples[0].map(q=>Math.hypot(p.x-q.x,p.y-q.y)),j=dist.indexOf(Math.min(...dist));if(dist[j]>1e-7)throw Error('Guide arrangement does not repeat');return j;});
const g=Array.from({length:n},(_,c)=>samples.slice(0,-1).map(row=>[row[c].x,row[c].y]));
const points=g.map(row=>row.map(([x,y])=>{const r=Math.hypot(x,y),radius=(n<20?3:15.5)+(n<20?.45:.8)*(r-motion.centerRadius)/motion.orbitRadius;return [radius*x/r,radius*y/r];}));
await writeFile(destination,JSON.stringify({count:n,steps,period:motion.period,cellPeriod:2*Math.PI,perm,points,guides:g,feed:n===8?.45:n<20?.3:2/a.gears/.027,core:n<20?0:14,method:'Actual final-guide trajectories; annular projection is only the initial topology-preserving seed.'})+'\n');
console.log(`Exported ${n} actual guide routes and their cell permutation`);
