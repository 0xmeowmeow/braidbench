#!/usr/bin/env python3
"""Check a proposed reconstruction before including it in the viewer."""
import argparse,json
import numpy as np
from braid_geometry import profile_points,crossing_lists,cyclic_equal,output_clearance

p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');p.add_argument('profile');p.add_argument('--report');p.add_argument('--ends',type=int);p.add_argument('--refinement',type=int,default=4);args=p.parse_args()
source=json.load(open(args.source));profile=json.load(open(args.profile));count=profile['count']
if args.ends:profile['ends']=args.ends
steps=max(4096,round(profile['period']/profile['cellPeriod'])*profile['steps']*4)
phases=np.arange(steps)/steps*profile['period']
original,wind=crossing_lists(profile_points(source,phases),profile['period'])
formed,formed_wind=crossing_lists(profile_points(profile,phases),profile['period'])
assert np.array_equal(wind,formed_wind),'Winding directions changed'
for c in range(count):
    before=[(v[1],v[2]) for v in original[c]];after=[(v[1],v[2]) for v in formed[c]]
    assert cyclic_equal(before,after),f'Crossing partners/order changed for carrier {c+1}'
clearance=output_clearance(profile,args.refinement)
result={'carriers':count,'ends_per_carrier':profile['ends'],'topology':'Every carrier retains the original cyclic crossing partners and outside/inside order','clearance':clearance,'limits':'Geometric checks on reconstructed output; not calibrated forces, torsion, friction or hardware validation. Formation approaches require their own check.'}
print(json.dumps(result,indent=2),flush=True)
if args.report:open(args.report,'w').write(json.dumps(result,indent=2)+'\n')
assert clearance['minimum_surface_clearance_mm']>.001,'Output wires intersect or lack rendering clearance'
assert clearance['minimum_surface_radius_mm']>=profile['core'],'Output wire enters core'
