#!/usr/bin/env python3
"""Independent finite-wire checks through the exposed forming cone and its join."""
import argparse,json,time
import numpy as np
from braid_geometry import profile_points,segment_distances,CarrierGuides

p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');p.add_argument('profile');p.add_argument('formation',nargs='?');p.add_argument('--refinement',type=int,default=4);p.add_argument('--report');p.add_argument('--allow-partial',action='store_true');args=p.parse_args()
source=json.load(open(args.source));profile=json.load(open(args.profile));formation=json.load(open(args.formation)) if args.formation else profile['formation']
guides=CarrierGuides(profile['count'])
n,ends,frames=profile['count'],profile['ends'],formation['frames'];D=profile['wireDiameter'];pitch=profile['wirePitch'];cell=profile['cellPeriod'];perm=np.asarray(profile['perm'])
data=np.asarray(formation['points']);sym=formation['symmetry'];rot=np.asarray(sym['rotations']);classes=np.asarray(sym['classes']);prototypes=np.asarray(sym['prototypes'])
expanded=np.einsum('nij,fnkj->fnki',rot,data[:,classes]);side=(np.arange(ends)-(ends-1)/2)*pitch
phase_grid=np.asarray(formation.get('phases',np.arange(frames)/frames))
complete=len(data)==frames
assert complete or args.allow_partial,'Formation table is incomplete'
central=(prototypes[:,None]*ends+np.arange(ends)).ravel();minimum=np.inf;minimum_core=np.inf;worst=None;checked=0;started=time.monotonic();maximum_bend=0;minimum_bend_radius=np.inf;unsafe=[]

def paths(t):
    phase=t/cell;k=min(len(phase_grid)-1,max(0,int(np.searchsorted(phase_grid,phase,side='right')-1)));next_phase=phase_grid[k+1] if k+1<len(phase_grid) else 1.;f=(phase-phase_grid[k])/(next_phase-phase_grid[k])
    a=expanded[k];b=expanded[k+1] if k+1<len(data) else expanded[0,perm]
    q=a*(1-f)+b*f;q[:,0]=guides.at(t);q[:,-1]=profile_points(profile,[t])[:,0]
    # Include exact downstream profile vertices: the join moves relative to them.
    step=cell/profile['steps'];first=int(np.floor(t/step));context=int(np.ceil(D*2/(step*profile['feed'])))+2;phases=np.arange(first,first-context,-1)*step
    zs=(t-phases)*profile['feed'];keep=(zs>1e-10)&(zs<D*2+cell*profile['feed']/profile['steps']);zs=zs[keep];phases=phases[keep]
    q=np.concatenate([q,profile_points(profile,phases)],axis=1);z=np.r_[formation['z'],zs]
    radius=np.linalg.norm(q,axis=-1);angle=side[None,:,None]/radius[:,None,:];co,si=np.cos(angle),np.sin(angle)
    x,y=q[:,None,:,0],q[:,None,:,1];xy=np.stack([co*x-si*y,si*x+co*y],axis=-1).reshape(n*ends,len(z),2)
    return np.concatenate([xy,np.broadcast_to(z,(n*ends,len(z)))[:,:,None]],axis=2),z

steps=frames*args.refinement if complete else (len(data)-1)*args.refinement
for frame in range(steps):
    interval=frame//args.refinement;phase=phase_grid[interval]+(frame%args.refinement)/args.refinement*((phase_grid[interval+1] if interval+1<len(phase_grid) else 1)-phase_grid[interval]);t=phase*cell;nodes,z=paths(t);start=nodes[:,:-1];end=nodes[:,1:];lo=np.minimum(start,end);hi=np.maximum(start,end);frame_minimum=np.inf
    fell=len(formation['z'])-1
    for j in range(fell):
        for k in range(j,len(z)-1):
            if z[k]-z[j+1]>D*1.1:break
            a=np.repeat(central,n*ends);b=np.tile(np.arange(n*ends),len(central));valid=a!=b
            # A self-strand's non-adjacent, nonlocal segments must also clear.
            if k>j+1:valid|=(a==b)&(z[k]-z[j+1]>D)
            valid&=np.all((lo[a,j,:2]<=hi[b,k,:2]+D*1.1)&(lo[b,k,:2]<=hi[a,j,:2]+D*1.1),axis=1)
            a,b=a[valid],b[valid]
            if not len(a):continue
            distance=segment_distances(start[a,j],end[a,j],start[b,k],end[b,k]);checked+=len(a)
            best=int(distance.argmin())
            frame_minimum=min(frame_minimum,float(distance[best]))
            if distance[best]<minimum:minimum=float(distance[best]);worst={'phase':float(t),'wire_a':int(a[best]),'wire_b':int(b[best]),'segment_a':j,'segment_b':k}
    u=end[:,:,:2]-start[:,:,:2];f=np.clip(-np.sum(start[:,:,:2]*u,axis=2)/np.maximum(np.sum(u*u,axis=2),1e-20),0,1)
    radial=np.linalg.norm(start[:,:,:2]+f[:,:,None]*u,axis=2);minimum_core=min(minimum_core,float(radial.min()-D/2))
    deltas=end-start;a=deltas[:,:-1];b=deltas[:,1:];cross=np.linalg.norm(np.cross(a,b),axis=2);bend_r=np.linalg.norm(a,axis=2)*np.linalg.norm(b,axis=2)*np.linalg.norm(a+b,axis=2)/np.maximum(2*cross,1e-20);minimum_bend_radius=min(minimum_bend_radius,float(bend_r.min()));unit=deltas/np.linalg.norm(deltas,axis=2)[:,:,None];angles=np.arccos(np.clip(np.sum(unit[:,1:]*unit[:,:-1],axis=2),-1,1));maximum_bend=max(maximum_bend,float(angles.max()))
    if frame_minimum<D+.0006:unsafe.append({'interval':interval,'fraction':float(phase),'minimum':frame_minimum})
    if frame%64==0:print(json.dumps({'frame':frame,'minimum':minimum,'seconds':round(time.monotonic()-started,1)}),flush=True)
result={'carriers':n,'ends':ends,'phases_checked':steps,'candidate_pairs_checked':checked,'minimum_segment_distance_mm':minimum,'minimum_surface_clearance_mm':minimum-D,'minimum_surface_radius_mm':minimum_core,'maximum_polyline_turn_degrees':maximum_bend*180/np.pi,'minimum_discrete_bend_radius_mm':minimum_bend_radius,'worst':worst,'complete':complete,'unsafe_intervals':unsafe,'limits':'Finite sampled phases and exact segment tests; not a proof of a continuum mechanical solution or hardware readiness.'}
print(json.dumps(result,indent=2));
if args.report:open(args.report,'w').write(json.dumps(result,indent=2)+'\n')
assert minimum>D+.0002,'Formation wires intersect or lack clearance'
assert minimum_core>=profile['core']-1e-8,'Formation wire enters core'
