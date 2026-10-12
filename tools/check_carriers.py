#!/usr/bin/env python3
"""Validate exported loading on ideal circular paths, assuming successful transfers."""
from pathlib import Path
import json, math
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
reports=[]
for n in (8,12,16):
    a=json.loads((ROOT/f'models/assembly-{n}.json').read_text())
    g=a['gears']; R=a['centerRadius']; t0=a['initialPhase']; loading=a['loading']
    th=np.arange(g)*2*math.pi/g;centers=R*np.column_stack([np.cos(th),np.sin(th)])
    phases=[]
    for i in range(g):
        inst=next(x for x in a['instances'] if x.get('slot',-1)//4==i)
        phases.append(inst['carrierAngle']-(-1)**i*t0-(inst['slot']%4)*math.pi/2)
    s=np.array([(-1)**i for i in range(g)]); angles=np.array(phases)[:,None]+np.arange(4)*math.pi/2
    events=[]
    for i in range(g):
        k=(i+1)%g;beta=th[i]+math.pi/2+math.pi/g
        for j in range(4):
            for turn in range(-20,21):
                t=(beta-angles[i,j]+turn*2*math.pi)/s[i]
                if t0<t<=t0+16*math.pi:
                    jj=int(round(((beta+math.pi-s[k]*t-phases[k])%(2*math.pi))/(math.pi/2)))%4
                    events.append((t,i*4+j,k*4+jj))
    events.sort();labels=np.arange(g*4);idx=0;minsep=float('inf');handoffs=0;doubleoccupied=0
    firstdir={};minmoment=0
    for t in np.linspace(t0,t0+16*math.pi,16001):
        while idx<len(events) and events[idx][0]<=t:
            _,aa,bb=events[idx];ta,tb=int(labels[aa]),int(labels[bb]);occA=ta in loading;occB=tb in loading
            doubleoccupied+=bool(occA and occB);handoffs+=occA+occB
            if occA:firstdir.setdefault(ta,'CCW' if (bb//4-aa//4)%g==1 else 'CW')
            if occB:firstdir.setdefault(tb,'CCW' if (aa//4-bb//4)%g==1 else 'CW')
            labels[aa],labels[bb]=labels[bb],labels[aa];idx+=1
        angle=angles+s[:,None]*t
        xy=(centers[:,None,:]+40*np.stack([np.cos(angle),np.sin(angle)],axis=2)).reshape((-1,2))
        occupied=xy[np.isin(labels,loading)]
        dist=np.linalg.norm(occupied[:,None]-occupied[None,:],axis=2);np.fill_diagonal(dist,np.inf)
        sep=float(dist.min())
        if sep<minsep:minsep=sep;minmoment=float(t-t0)
    sampling_bound=80*(16*math.pi/16000)/2
    report=dict(strands=n,rotors=g,loading_zero_based_slots=loading,rotor_revolutions=8,samples=16001,step_degrees=.18,
        smallest_sampled_center_separation_mm=round(minsep,5),conservative_between_sample_lower_bound_mm=round(minsep-sampling_bound,5),
        bobbin_diameter_mm=26,clearance_threshold_mm=27,simultaneously_occupied_transfers=doubleoccupied,imposed_handoffs=handoffs,
        first_transfer_direction_counts={d:list(firstdir.values()).count(d) for d in ['CW','CCW']},minimum_at_rotor_phase_radians=minmoment,
        limits='Prescribed circular paths and instantaneous successful handoffs. No guide contact, tooth contact, yarn, post, retention or real tension simulation.')
    assert doubleoccupied==0,report
    assert report['first_transfer_direction_counts']=={'CW':g,'CCW':g},report
    assert minsep-sampling_bound>=27,report
    reports.append(report)
    print(f'{n} strands: sampled minimum {minsep:.3f} mm; bounded minimum {minsep-sampling_bound:.3f} mm; {handoffs} ideal handoffs',flush=True)
(ROOT/'docs/motion-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
