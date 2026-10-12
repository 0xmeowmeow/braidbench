#!/usr/bin/env python3
"""Compare every individual end with its actual moving guide's braid word."""
import argparse,json,time
import numpy as np
from braid_geometry import profile_points,cyclic_equal,CarrierGuides

p=argparse.ArgumentParser(description=__doc__);p.add_argument('profile');p.add_argument('--ends',type=int);p.add_argument('--report');args=p.parse_args()
profile=json.load(open(args.profile));n=profile['count'];ends=args.ends or profile['ends'];steps=round(profile['period']/profile['cellPeriod'])*profile['steps']*4;phases=np.arange(steps)/steps*profile['period'];guides=CarrierGuides(n);started=time.monotonic()
q=np.array([guides.at(t) for t in phases]).transpose(1,0,2);r=np.linalg.norm(q,axis=2);side=(np.arange(ends)-(ends-1)/2)*profile['wirePitch'];phi=side[None,:,None]/r[:,None,:];co,si=np.cos(phi),np.sin(phi);x,y=q[:,None,:,0],q[:,None,:,1]
source=np.stack([co*x-si*y,si*x+co*y],axis=-1).reshape(n*ends,steps,2);output=profile_points(profile,phases,ends)

def crossing(xy):
    angle=np.unwrap(np.arctan2(xy[:,:,1],xy[:,:,0]),axis=1);winding=np.round((angle[:,-1]-angle[:,0])/(2*np.pi));angle=np.column_stack([angle,angle[:,0]+winding*2*np.pi]);radius=np.linalg.norm(xy,axis=2);radius=np.column_stack([radius,radius[:,0]]);events=[[] for _ in xy]
    for a in range(len(xy)):
        for b in range(a+1,len(xy)):
            d=angle[a]-angle[b];indices=np.flatnonzero(np.floor(d[1:]/(2*np.pi))!=np.floor(d[:-1]/(2*np.pi)))+1
            for k in indices:
                target=(np.ceil(d[k-1]/(2*np.pi)) if d[k]>d[k-1] else np.floor(d[k-1]/(2*np.pi)))*2*np.pi;f=(target-d[k-1])/(d[k]-d[k-1]);ra=radius[a,k-1]*(1-f)+radius[a,k]*f;rb=radius[b,k-1]*(1-f)+radius[b,k]*f
                phase=k-1+f;events[a].append((phase,b,ra>rb));events[b].append((phase,a,rb>ra))
    result=[]
    for row in events:row.sort();result.append([(b,over) for _,b,over in row])
    return result,winding

before,source_winding=crossing(source);after,output_winding=crossing(output);assert np.array_equal(source_winding,output_winding),'Wire winding directions changed'
rows=[]
for c,(a,b) in enumerate(zip(before,after)):
    row={'wire':c+1,'guide_crossings':len(a),'output_crossings':len(b),'same_cyclic_partner_and_over_under_sequence':cyclic_equal(a,b)};rows.append(row)
    assert row['same_cyclic_partner_and_over_under_sequence'],row
result={'carriers':n,'ends_per_carrier':ends,'wires_checked':n*ends,'samples_per_circuit':steps,'all_sequences_match':True,'results':rows,'seconds':round(time.monotonic()-started,2),'scope':'Every wire is compared directly with its actual guide path, including its radial-bank offset. Crossing partner identity and outside/inside order must match cyclically. No force, torsion or hardware claim.'}
if args.report:open(args.report,'w').write(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='results'}),flush=True)
