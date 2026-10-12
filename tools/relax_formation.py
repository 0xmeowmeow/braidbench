#!/usr/bin/env python3
"""Reconstruct the exposed approach with finite strand contact constraints.

This is geometric form-finding, not calibrated finite element mechanics. The
moving guide and already verified deposited braid are fixed boundary conditions.
"""
import argparse,json,time
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
from braid_geometry import profile_points,rotational_basis,segment_distances,CarrierGuides

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('source',type=Path);p.add_argument('profile',type=Path);p.add_argument('output',type=Path)
p.add_argument('--frames',type=int,default=128);p.add_argument('--iterations',type=int,default=1000)
p.add_argument('--phase',type=int);p.add_argument('--check-gradient',action='store_true');p.add_argument('--start',type=Path);p.add_argument('--margin',type=float)
p.add_argument('--phase-list',help='Comma-separated phase indices for adaptive refinement')
p.add_argument('--from-phase',type=int,default=0);p.add_argument('--to-phase',type=int)
p.add_argument('--bending',type=float)
p.add_argument('--drop-near',type=int,default=0,help='Omit this many short nodes immediately before the output to keep tube rings regular')
args=p.parse_args();source=json.loads(args.source.read_text());profile=json.loads(args.profile.read_text())
n,ends=profile['count'],profile['ends'];D=profile['wireDiameter'];pitch=profile['wirePitch'];core=profile['core']
prototypes,classes,rotations,order=rotational_basis(source);P=len(prototypes)
span=205 if n<20 else 125
negative=np.array([-64,-24,-8,-3,-1.5,-.75,-.375,-.1875]);negative=negative[:len(negative)-args.drop_near] if args.drop_near else negative
z=np.r_[-span,D*np.r_[negative,[0,.25,.5,1,2]]]
carrier_guides=CarrierGuides(n)
J=len(z);fell=int(np.flatnonzero(z==0)[0]);free=np.arange(1,fell)
dz=np.diff(z);side=(np.arange(ends)-(ends-1)/2)*pitch
target=D+(args.margin if args.margin is not None else (.001 if n<20 else .0048));penalty=50000.;bending=args.bending if args.bending is not None else (.015 if n<20 else .0008)
ids=np.arange(n*ends*J).reshape(n,ends,J);total=ids.size
central=(prototypes[:,None]*ends+np.arange(ends)).ravel();is_central=np.zeros(n*ends,dtype=bool);is_central[central]=True
owners=np.arange(n*ends)
bands=[]
for j in range(fell):
    for k in range(j,J-1):
        if z[k]-z[j+1]>target:break
        a=np.repeat(central,n*ends);b=np.tile(owners,len(central))
        valid=a!=b
        if j==k:valid&=(~is_central[b])|(a<b)
        a,b=a[valid],b[valid]
        weight=np.where(is_central[b],1.,.5) if j==k else np.ones(len(a))
        bands.append((j,k,a,b,weight))

def expand(q):return np.einsum('nij,nkj->nki',rotations,q[classes])
def reduce_gradient(g):
    rotated=np.einsum('nji,nkj->nki',rotations,g);out=np.zeros((P,J,2));np.add.at(out,classes,rotated);return out
def accumulate(v,i):return np.column_stack([np.bincount(i,weights=v[:,d],minlength=total) for d in range(2)])

def boundary(t):
    tip=profile_points(profile,[t])[:,0]
    guide=carrier_guides.at(t)
    q=guide[:,None,:]*(-z[None,:,None]/span)+tip[:,None,:]*(1+z[None,:,None]/span)
    q[:,fell:]=profile_points(profile,t-z[fell:]/profile['feed'])
    return q

fixed=None;evaluations=0;last_gap=0
def energy(flat):
    global evaluations,last_gap
    reduced=fixed[prototypes].copy();reduced[:,free]=flat.reshape(P,len(free),2);q=expand(reduced)
    radius=np.linalg.norm(q,axis=2);phi=side[None,:,None]/radius[:,None,:]
    co,si=np.cos(phi),np.sin(phi);x,y=q[:,None,:,0],q[:,None,:,1]
    xy=np.stack([co*x-si*y,si*x+co*y],axis=-1)
    nodes=np.concatenate([xy,np.broadcast_to(z,(n,ends,J))[:,:,:,None]],axis=3).reshape(n*ends,J,3)
    delta=np.diff(nodes,axis=1);length=np.linalg.norm(delta,axis=2)
    value=length.sum()/order;gradient=np.zeros((n*ends,J,2));f=delta[:,:,:2]/length[:,:,None]/order
    gradient[:,:-1]-=f;gradient[:,1:]+=f
    slope=delta[:,:,:2]/dz[None,:,None];bend=np.diff(slope,axis=1);bw=2*bending/(dz[1:]+dz[:-1])/order
    value+=.5*np.sum(bw[None,:,None]*bend**2)
    bf=bw[None,:,None]*bend
    sf=np.zeros_like(slope);sf[:,1:]+=bf;sf[:,:-1]-=bf;sf/=dz[None,:,None]
    gradient[:,:-1]-=sf;gradient[:,1:]+=sf;gradient=gradient.reshape(-1,2)
    a0=nodes[:,:-1];a1=nodes[:,1:];lo=np.minimum(a0,a1);hi=np.maximum(a0,a1)
    all_a=[];all_b=[];all_w=[]
    for j,k,a,b,w in bands:
        keep=np.all((lo[a,j,:2]<=hi[b,k,:2]+target)&(lo[b,k,:2]<=hi[a,j,:2]+target),axis=1)
        if keep.any():
            all_a.append(a[keep]*J+j);all_b.append(b[keep]*J+k);all_w.append(w[keep])
    if all_a:
        a=np.concatenate(all_a);b=np.concatenate(all_b);w=np.concatenate(all_w);flatnodes=nodes.reshape(-1,3)
        distance,s,t,separation=segment_distances(flatnodes[a],flatnodes[a+1],flatnodes[b],flatnodes[b+1],True)
        last_gap=float(distance.min());active=distance<target
        a,b,w,s,t,distance,separation=a[active],b[active],w[active],s[active],t[active],distance[active],separation[active]
        gap=distance-target;value+=penalty*np.sum(w*gap**2)
        cf=2*penalty*(w*gap)[:,None]*separation[:,:2]/np.maximum(distance[:,None],1e-12)
        gradient+=accumulate((1-s[:,None])*cf,a)+accumulate(s[:,None]*cf,a+1)
        gradient-=accumulate((1-t[:,None])*cf,b)+accumulate(t[:,None]*cf,b+1)
    # Check the closest point on every chord against the physical core.
    if core:
        u=delta[:,:,:2];v=nodes[:,:-1,:2];fraction=np.clip(-np.sum(v*u,axis=2)/np.maximum(np.sum(u*u,axis=2),1e-20),0,1)
        closest=v+fraction[:,:,None]*u;rr=np.linalg.norm(closest,axis=2);gap=np.minimum(0,rr-core-target/2)
        value+=penalty*np.sum(gap**2)/order
        cf=2*penalty/order*gap[:,:,None]*closest/rr[:,:,None];gradient=gradient.reshape(n*ends,J,2)
        gradient[:,:-1]+=(1-fraction[:,:,None])*cf;gradient[:,1:]+=fraction[:,:,None]*cf;gradient=gradient.reshape(-1,2)
    gradient=gradient.reshape(n,ends,J,2);gx,gy=gradient[:,:,:,0],gradient[:,:,:,1]
    radial=(-gx*xy[:,:,:,1]+gy*xy[:,:,:,0])*(-side[None,:,None]/radius[:,None,:]**3)
    g=np.stack([co*gx+si*gy,-si*gx+co*gy],axis=-1).sum(axis=1)+radial.sum(axis=1)[:,:,None]*q
    evaluations+=1
    return value,reduce_gradient(g)[:,free].ravel()

started=time.monotonic();frames=[];reports=[]
warm=json.loads(args.start.read_text()) if args.start else None
assert not warm or len(warm['points'])==warm['frames'],'A warm start must contain every pose in its declared grid'
indices=[int(v) for v in args.phase_list.split(',')] if args.phase_list else [args.phase] if args.phase is not None else range(args.from_phase,args.to_phase or args.frames)
for frame in indices:
    t=frame/args.frames*profile['cellPeriod'];fixed=boundary(t);start=fixed[prototypes][:,free].ravel()
    if args.check_gradient:
        value,gradient=energy(start);rng=np.random.default_rng(721)
        for index in rng.choice(len(start),min(24,len(start)),replace=False):
            d=np.zeros_like(start);d[index]=1e-6;numeric=(energy(start+d)[0]-energy(start-d)[0])/2e-6
            assert abs(numeric-gradient[index])<5e-4*max(1,abs(numeric)),(index,numeric,gradient[index])
        print('Formation gradient check passed');raise SystemExit
    if warm:
        grid=np.asarray(warm.get('phases',np.arange(warm['frames'])/warm['frames']));local=frame/args.frames
        old_k=min(len(warm['points'])-1,max(0,int(np.searchsorted(grid,local,side='right')-1)))
        a=np.asarray(warm['points'][old_k]);b=a
        if old_k+1<len(warm['points']):b=np.asarray(warm['points'][old_k+1])
        elif len(warm['points'])==warm['frames']:
            repeated=expand(np.asarray(warm['points'][0]));b=repeated[np.asarray(profile['perm'])[prototypes]]
        fraction=(local-grid[old_k])/((grid[old_k+1] if old_k+1<len(grid) else 1)-grid[old_k])
        start=(a*(1-fraction)+b*fraction)[:,free].ravel()
    before=evaluations
    result=minimize(energy,start,jac=True,method='L-BFGS-B',options={'maxiter':args.iterations,'maxcor':12,'ftol':1e-12,'gtol':1e-6,'maxls':30})
    q=fixed[prototypes].copy();q[:,free]=result.x.reshape(P,len(free),2);frames.append(q[:,:fell+1].tolist())
    report={'frame':frame,'success':bool(result.success),'iterations':int(result.nit),'evaluations':evaluations-before,'minimum_gap':last_gap,'seconds':round(time.monotonic()-started,2)}
    reports.append(report);print(json.dumps(report),flush=True)
    output={'count':n,'ends':ends,'frames':args.frames,'phaseIndices':list(indices),'cellPeriod':profile['cellPeriod'],'z':z[:fell+1].tolist(),'points':frames,'symmetry':{'prototypes':prototypes.tolist(),'classes':classes.tolist(),'rotations':rotations.tolist()},'reports':reports,'method':'Geometric approach reconstruction with fixed guides, fixed deposited output, bending regularisation and finite segment contact penalties; not calibrated mechanics.'}
    args.output.write_text(json.dumps(output,separators=(',',':'))+'\n')
