#!/usr/bin/env python3
"""Check the actual rendered supply polylines exported by export_supply_paths.mjs."""
import argparse, json, time
import numpy as np
from scipy.spatial import cKDTree
from braid_geometry import segment_distances

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('source');p.add_argument('--report');args=p.parse_args()
minimum=np.inf;worst=None;tests=0;started=time.monotonic()
with open(args.source) as source:
    header=json.loads(next(source));diameter=header['wireDiameter'];count=header['count'];ends=header['ends']
    for frame,line in enumerate(source):
        row=json.loads(line);a=[];b=[];owner=[];arc_start=[];arc_end=[]
        for wire,path in enumerate(row['paths']):
            distance_from_start=0.
            for x,y in zip(np.asarray(path)[:-1],np.asarray(path)[1:]):
                pieces=max(1,int(np.ceil(np.linalg.norm(y-x)/.75)))
                q=np.linspace(x,y,pieces+1);a.extend(q[:-1]);b.extend(q[1:]);owner.extend([wire]*pieces)
                length=float(np.linalg.norm(y-x));arc=np.linspace(distance_from_start,distance_from_start+length,pieces+1);arc_start.extend(arc[:-1]);arc_end.extend(arc[1:]);distance_from_start+=length
        a=np.asarray(a);b=np.asarray(b);owner=np.asarray(owner);arc_start=np.asarray(arc_start);arc_end=np.asarray(arc_end);length=np.linalg.norm(b-a,axis=1);centre=(a+b)/2
        # Every carrier is tested here; no rotational symmetry assumption.
        near=cKDTree(centre).query_pairs(diameter+.1+length.max(),output_type='ndarray')
        i,j=near.T;nonlocal_self=np.maximum(arc_start[i]-arc_end[j],arc_start[j]-arc_end[i])>2*diameter;valid=(owner[i]!=owner[j])|nonlocal_self;i,j=i[valid],j[valid]
        if len(i):
            distances=segment_distances(a[i],b[i],a[j],b[j]);tests+=len(i);k=int(distances.argmin())
            if distances[k]<minimum:
                minimum=float(distances[k]);worst={'phase':row['phase'],'wire_a':int(owner[i[k]]),'wire_b':int(owner[j[k]]),'same_wire':bool(owner[i[k]]==owner[j[k]])}
        if frame%32==0:print(json.dumps({'frame':frame,'minimum_mm':minimum if np.isfinite(minimum) else None,'seconds':round(time.monotonic()-started,1)}),flush=True)
assert frame+1==header['frames'],'Incomplete source export'
result={'carriers':count,'ends':ends,'phases_checked':frame+1,'every_carrier_checked':True,'nonlocal_self_exclusion_arclength_mm':2*diameter,'primitive_distance_tests':tests,'minimum_segment_distance_mm':minimum if minimum<diameter+.1 else None,'minimum_surface_clearance_mm':minimum-diameter if minimum<diameter+.1 else None,'sampled_surface_clearance_lower_bound_mm':min(.1,minimum-diameter),'worst':worst,'limits':'Exact segment distances at sampled phases, including self-segments separated by more than two diameters along the path. A null minimum means all tested pairs clear the 0.1 mm surface-clearance search band. Excludes local self-contact, hardware and forces; not a continuous-time certificate.'}
print(json.dumps(result,indent=2))
if args.report:open(args.report,'w').write(json.dumps(result,indent=2)+'\n')
assert minimum>diameter+.0003,'Supply wires overlap or lack the numerical clearance reserve'
