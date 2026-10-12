#!/usr/bin/env python3
"""Bound inter-wire clearance continuously between formation keyframes.

For each moving segment pair, distance is Lipschitz in the four relative
endpoint motions. The bound includes the analytic chord error of each wire's
radial bank offset and the exact circular guide motion. Intervals are split at
every carrier handoff and output-profile knot before recursive certification.
This proves geometric separation for this interpolation model, not mechanics.
"""
import argparse,json,time
import numpy as np
from braid_geometry import CarrierGuides,profile_points,segment_distances

p=argparse.ArgumentParser(description=__doc__);p.add_argument('profile');p.add_argument('formation',nargs='?');p.add_argument('--ends',type=int);p.add_argument('--report');p.add_argument('--max-depth',type=int,default=14);args=p.parse_args()
profile=json.load(open(args.profile));formation=json.load(open(args.formation)) if args.formation else profile['formation'];n=profile['count'];ends=args.ends or profile['ends'];D=profile['wireDiameter'];reserve=.0003;core=profile['core'];cell=profile['cellPeriod'];guides=CarrierGuides(n)
frames=formation['frames'];assert len(formation['points'])==frames,'Formation table must be complete'
grid=np.asarray(formation.get('phases',np.arange(frames)/frames));sym=formation['symmetry'];rot=np.asarray(sym['rotations']);classes=np.asarray(sym['classes']);prototypes=np.asarray(sym['prototypes']);perm=np.asarray(profile['perm'])
assert np.array_equal(prototypes,np.arange(4)),'Pair reduction requires the first four carriers as prototypes'
assert np.allclose(rot@rot.transpose(0,2,1),np.eye(2),atol=1e-12) and np.allclose(np.linalg.det(rot),1,atol=1e-12),'Symmetry must preserve distances and orientation'
q=np.asarray(profile['points']);repeated=np.einsum('nij,nkj->nki',rot,q[prototypes[classes]])
symmetry_error=float(np.max(np.linalg.norm(q-repeated,axis=2)))
for left,right in zip([0,*guides.knots],[*guides.knots,cell]):
    for t in np.linspace(left,right,5)[1:-1]:
        q=guides.at(t);repeated=np.einsum('nij,nj->ni',rot,q[prototypes[classes]])
        symmetry_error=max(symmetry_error,float(np.max(np.linalg.norm(q-repeated,axis=1))))
assert symmetry_error<1e-8,'Guide or output geometry does not have the claimed rotational symmetry'
expanded=np.einsum('nij,fnkj->fnki',rot,np.asarray(formation['points'])[:,classes]);side=(np.arange(ends)-(ends-1)/2)*profile['wirePitch'];F=len(formation['z']);central=(prototypes[:,None]*ends+np.arange(ends)).ravel()
knots=sorted([0.,cell,*list(grid*cell),*guides.knots,*list(np.arange(profile['steps']+1)/profile['steps']*cell)])
cuts=[]
for t in knots:
    if not cuts or t-cuts[-1]>1e-10:cuts.append(t)
primitive_tests=0;subdivisions=0;deepest=0;certified_clearance=np.inf;observed=np.inf;failures=[];core_clearance=np.inf;started=time.monotonic()

def centres(t):
    phase=t/cell;k=min(frames-1,max(0,int(np.searchsorted(grid,phase,side='right')-1)));f=(phase-grid[k])/((grid[k+1] if k+1<frames else 1)-grid[k])
    q=expanded[k]*(1-f)+(expanded[k+1] if k+1<frames else expanded[0,perm])*f
    q[:,0]=guides.at(t);q[:,-1]=profile_points(profile,[t])[:,0];return q

for interval,(ta,tb) in enumerate(zip(cuts[:-1],cuts[1:])):
    step=cell/profile['steps'];first=int(np.floor((ta+1e-10)/step));context=int(np.ceil(D*2/(step*profile['feed'])))+2;phases=np.arange(first,first-context,-1)*step
    fixed_xy=profile_points(profile,phases);J=F+len(phases);cache={}
    def state(t):
        if t in cache:return cache[t]
        q=np.concatenate([centres(t),fixed_xy],axis=1);z=np.r_[formation['z'],(t-phases)*profile['feed']]
        radius=np.linalg.norm(q,axis=2);angle=side[None,:,None]/radius[:,None,:];co,si=np.cos(angle),np.sin(angle);x,y=q[:,None,:,0],q[:,None,:,1]
        xy=np.stack([co*x-si*y,si*x+co*y],axis=-1);nodes=np.concatenate([xy,np.broadcast_to(z,(n,ends,J))[:,:,:,None]],axis=3).reshape(-1,3)
        cache[t]={'q':q,'nodes':nodes};return cache[t]
    def error(a,b,dt):
        q=a['q'];v=b['q']-q;vv=np.sum(v*v,axis=2);f=np.clip(-np.sum(q*v,axis=2)/np.maximum(vv,1e-30),0,1);r=np.linalg.norm(q+f[:,:,None]*v,axis=2)
        # q is linear except for the actual rotating guide. The interval has
        # already been split at every handoff, so its acceleration is bounded.
        guide_error=guides.curvature_bound*dt*dt/8;r[:,0]=np.maximum(1e-8,r[:,0]-guide_error);vv[:,0]=(guides.curvature_bound*dt)**2
        s=np.abs(side)[None,:,None];rr=np.maximum(r[:,None,:],1e-8)
        epsilon=(4*s/rr**2+s*s/rr**3)*vv[:,None,:]/8
        epsilon[:,:,0]+=(1+np.abs(side)[None,:]/r[:,0,None])*guide_error
        return epsilon.reshape(-1)
    def certify_pairs(a,b,left,right,depth=0):
        global primitive_tests,subdivisions,deepest,certified_clearance,observed
        if not len(a):return
        deepest=max(deepest,depth);mid=(left+right)/2;s0,s1,sm=state(left),state(right),state(mid);nodes=sm['nodes'];eps=error(s0,s1,right-left)
        distance=segment_distances(nodes[a],nodes[a+1],nodes[b],nodes[b+1]);primitive_tests+=len(a);observed=min(observed,float(distance.min()))
        movement=s1['nodes']-s0['nodes'];bound=np.maximum.reduce([np.linalg.norm(movement[a+i]-movement[b+j],axis=1) for i in [0,1] for j in [0,1]])/2
        bound+=2*(np.maximum(eps[a],eps[a+1])+np.maximum(eps[b],eps[b+1]));lower=distance-bound-D
        accepted=lower>reserve
        if accepted.any():certified_clearance=min(certified_clearance,float(lower[accepted].min()))
        a,b,distance=a[~accepted],b[~accepted],distance[~accepted]
        if not len(a):return
        if depth>=args.max_depth or np.any(distance<D+reserve):
            k=int(distance.argmin());failures.append({'phase':mid,'wire_a':int(a[k]//J),'wire_b':int(b[k]//J),'segment_a':int(a[k]%J),'segment_b':int(b[k]%J),'distance':float(distance[k]),'depth':depth});return
        subdivisions+=1;certify_pairs(a,b,left,mid,depth+1);certify_pairs(a,b,mid,right,depth+1)
    def certify_core(indices,left,right,depth=0):
        global subdivisions,deepest,core_clearance
        if not core or not len(indices):return
        deepest=max(deepest,depth);mid=(left+right)/2;s0,s1,sm=state(left),state(right),state(mid);nodes=sm['nodes'];a=nodes[indices,:2];u=nodes[indices+1,:2]-a;f=np.clip(-np.sum(a*u,axis=1)/np.maximum(np.sum(u*u,axis=1),1e-30),0,1);distance=np.linalg.norm(a+f[:,None]*u,axis=1)
        eps=error(s0,s1,right-left);movement=s1['nodes'][:,:2]-s0['nodes'][:,:2];bound=np.maximum(np.linalg.norm(movement[indices],axis=1),np.linalg.norm(movement[indices+1],axis=1))/2+2*np.maximum(eps[indices],eps[indices+1]);lower=distance-bound-core-D/2;accepted=lower>reserve
        if accepted.any():core_clearance=min(core_clearance,float(lower[accepted].min()))
        indices,distance=indices[~accepted],distance[~accepted]
        if not len(indices):return
        if depth>=args.max_depth or np.any(distance<core+D/2+reserve):failures.append({'phase':mid,'core_distance':float(distance.min()),'depth':depth});return
        subdivisions+=1;certify_core(indices,left,mid,depth+1);certify_core(indices,mid,right,depth+1)
    s0,s1=state(ta),state(tb);eps=error(s0,s1,tb-ta).reshape(n*ends,J);a=s0['nodes'].reshape(n*ends,J,3);b=s1['nodes'].reshape(n*ends,J,3)
    lower=np.minimum(a,b)-eps[:,:,None];upper=np.maximum(a,b)+eps[:,:,None];lo=np.minimum(lower[:,:-1],lower[:,1:]);hi=np.maximum(upper[:,:-1],upper[:,1:]);aa=[];bb=[]
    for j in range(F-1):
        for k in range(j,J-1):
            ia=np.repeat(central,n*ends);ib=np.tile(np.arange(n*ends),len(central));valid=ia!=ib
            if j==k:valid&=(ia<ib)|(ib>=4*ends)
            valid&=np.all((lo[ia,j]<=hi[ib,k]+D+reserve)&(lo[ib,k]<=hi[ia,j]+D+reserve),axis=1)
            if valid.any():aa.append(ia[valid]*J+j);bb.append(ib[valid]*J+k)
    if aa:certify_pairs(np.concatenate(aa),np.concatenate(bb),ta,tb)
    certify_core((central[:,None]*J+np.arange(J-1)).ravel(),ta,tb)
    if interval%32==0:print(json.dumps({'interval':interval,'of':len(cuts)-1,'subdivisions':subdivisions,'failures':len(failures),'seconds':round(time.monotonic()-started,1)}),flush=True)
result={'carriers':n,'ends':ends,'continuous_intervals':len(cuts)-1,'numerical_clearance_reserve_mm':reserve,'maximum_rotational_symmetry_error_mm':symmetry_error,'primitive_distance_tests':primitive_tests,'recursive_subdivisions':subdivisions,'maximum_depth':deepest,'minimum_certified_surface_clearance_mm':float(certified_clearance),'minimum_observed_surface_clearance_mm':float(observed-D),'minimum_certified_core_clearance_mm':float(core_clearance) if core else None,'failures':failures,'method':'Relative endpoint motion bounds plus analytic radial-offset and guide-curve chord bounds; split at all guide handoffs, profile vertices and formation frames. Verified rotational symmetry reduces equivalent pairs.','limits':'Certifies different-wire and core separation in the stated geometric interpolation model. Not a mechanical, self-contact, torsion, manufacturing or hardware certificate.'}
print(json.dumps(result,indent=2));
if args.report:open(args.report,'w').write(json.dumps(result,indent=2)+'\n')
assert not failures,'Continuous geometric clearance was not certified'
