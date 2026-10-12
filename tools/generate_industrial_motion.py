#!/usr/bin/env python3
"""Solve balanced ideal carrier loadings; not a complete industrial clearance design.
Requires NumPy and SciPy. Validates bobbin envelopes only, not guides/tensioners.
"""
import numpy as np, math,json
from scipy.optimize import milp,Bounds,LinearConstraint
from scipy.sparse import lil_matrix
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
T=2*math.pi
for n in [48,72]:
 g=n//2;rad=146*math.sin(math.pi/g);R=146;t0=.031;s=(-1.)**np.arange(g);theta=T*np.arange(g)/g;phase=[0.]
 for i in range(1,g):phase.append((2*(theta[i-1]+math.pi/2+math.pi/g)+math.pi-phase[-1])%(math.pi/2))
 angles=np.array(phase)[:,None]+np.arange(4)*math.pi/2;centers=R*np.stack([np.cos(theta),np.sin(theta)],axis=1)
 events=[]
 for i in range(g):
  q=(i+1)%g;b=theta[i]+math.pi/2+math.pi/g
  for j in range(4):
   for turn in range(-g,g+1):
    t=(b-angles[i,j]+T*turn)/s[i]
    if t0<t<=t0+g*math.pi:
     jj=int(round(((b+math.pi-s[q]*t-phase[q])%T)/(math.pi/2)))%4;events.append((t,i*4+j,q*4+jj))
 events.sort();ids=np.arange(g*4);eventidx=0;bad=np.zeros((g*4,g*4),dtype=bool);directions={};minimum=2*rad*.27+.1;steps=4000
 for t in np.linspace(t0,t0+g*math.pi,steps+1):
  while eventidx<len(events) and events[eventidx][0]<=t:
   _,a,b=events[eventidx];directions.setdefault(int(ids[a]),1 if (b//4-a//4)%g==1 else -1);directions.setdefault(int(ids[b]),1 if (a//4-b//4)%g==1 else -1)
   bad[ids[a],ids[b]]=True;bad[ids[b],ids[a]]=True;ids[a],ids[b]=ids[b],ids[a];eventidx+=1
  a=angles+s[:,None]*t;xy=(centers[:,None,:]+rad*np.stack([np.cos(a),np.sin(a)],axis=2)).reshape(-1,2);dist=np.linalg.norm(xy[:,None,:]-xy[None,:,:],axis=2);row,col=np.where((dist<minimum+rad*g*math.pi/steps)&(dist>1e-7));bad[ids[row],ids[col]]=True
 edges=np.argwhere(np.triu(bad,1));a=lil_matrix((len(edges)+2,g*4));lb=np.full(len(edges)+2,-np.inf);ub=np.ones(len(edges)+2)
 for i,(u,v) in enumerate(edges):a[i,u]=a[i,v]=1
 for i in range(g*4):a[-2,i]=1;a[-1,i]=directions[i]
 lb[-2:]=[n,0];ub[-2:]=[n,0]
 result=milp(c=np.linspace(0,.01,g*4),integrality=np.ones(g*4),bounds=Bounds(0,1),constraints=LinearConstraint(a.tocsc(),lb,ub),options={'time_limit':30})
 if not result.success:print(n,result.message);continue
 slots=np.flatnonzero(result.x>.5).tolist();print(n,'loading',slots,'radius',rad)
 inst=[]
 for k,slot in enumerate(slots):
  i,j=divmod(slot,4);ang=phase[i]+s[i]*t0+j*math.pi/2;x,y=centers[i]+rad*np.array([math.cos(ang),math.sin(ang)])
  inst.append(dict(slot=slot,carrier=k,carrierAngle=ang,carrierDirection='CCW' if directions[slot]>0 else 'CW',carrierOrigin=[x,y],pos=[x,y,0],rot=[0,0,0]))
 data=dict(strands=n,gears=g,centerRadius=R,orbitRadius=rad,initialPhase=t0,rotorPhases=phase,loading=slots,instances=inst)
 (ROOT/f'models/industrial-motion-{n}.json').write_text(json.dumps(data,separators=(',',':')))
