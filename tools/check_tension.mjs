import assert from 'node:assert/strict';
import fs from 'node:fs';
import {forces,threadRoute,routeLength} from '../viewer/tension-mechanics.mjs';
const full=forces(40,2,11),empty=forces(40,2,5.2);assert(Math.abs(full.ideal-.196133)<1e-12);assert(full.brake<full.ideal&&empty.brake>empty.ideal);
let maxLengthError=0;
for(const radius of [5.2,8,11])for(let y=80;y<=120;y++){const difference=routeLength(threadRoute(y,radius))-routeLength(threadRoute(120,radius));maxLengthError=Math.max(maxLengthError,Math.abs(difference-2*(120-y)));}
assert(maxLengthError<1e-9);
fs.writeFileSync(new URL('../docs/tension-mechanics-validation.json',import.meta.url),JSON.stringify({status:'pass',mass_g:40,ideal_tension_N:full.ideal,brake_torque_Nmm:2,full_package_pull_N:full.brake,empty_package_pull_N:empty.brake,positions_checked:123,maximum_two_leg_storage_error_mm:maxLengthError,limits:'Ideal force balance and route-length accounting, not friction or dynamic validation.'},null,2)+'\n');
console.log('Tension force balance and two-leg storage checks pass');
