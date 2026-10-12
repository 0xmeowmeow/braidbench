"""Independent numerical geometry checks shared by the braid validators."""
import numpy as np
from scipy.spatial import cKDTree
import json
from pathlib import Path


def segment_distances(a0, a1, b0, b1, parameters=False):
    u, v, w = a1-a0, b1-b0, a0-b0
    aa=np.sum(u*u,axis=-1); bb=np.sum(u*v,axis=-1); cc=np.sum(v*v,axis=-1)
    dd=np.sum(u*w,axis=-1); ee=np.sum(v*w,axis=-1); denominator=aa*cc-bb*bb
    s=np.clip(np.divide(bb*ee-cc*dd,denominator,out=np.zeros_like(aa),where=denominator>1e-15),0,1)
    safe_aa=np.maximum(aa,1e-30);safe_cc=np.maximum(cc,1e-30)
    t=(bb*s+ee)/safe_cc
    s=np.where(t<0,np.clip(-dd/safe_aa,0,1),s); s=np.where(t>1,np.clip((bb-dd)/safe_aa,0,1),s); t=np.clip(t,0,1)
    s=np.where(cc<1e-25,np.clip(-dd/safe_aa,0,1),s);t=np.where(aa<1e-25,np.clip(ee/safe_cc,0,1),t)
    separation=w+s[...,None]*u-t[...,None]*v
    distance=np.linalg.norm(separation,axis=-1)
    return (distance,s,t,separation) if parameters else distance


def profile_points(profile, phases, ends=None):
    points=np.asarray(profile['points']); perm=np.asarray(profile['perm'])
    n,steps,_=points.shape; period=profile['cellPeriod']; phases=np.atleast_1d(phases)
    cell=np.floor(phases/period).astype(int); local=(phases/period-cell)*steps
    index=np.minimum(steps-1,local.astype(int)); fraction=local-index
    maps=[np.arange(n)]; cycles=round(profile['period']/period)
    for _ in range(1,cycles):maps.append(perm[maps[-1]])
    carrier=np.asarray(maps)[cell%cycles].T
    a=points[carrier,index]; b=points[np.where(index==steps-1,perm[carrier],carrier),(index+1)%steps]
    xy=a*(1-fraction[None,:,None])+b*fraction[None,:,None]
    if ends is None:return xy
    side=(np.arange(ends)-(ends-1)/2)*profile['wirePitch']
    radius=np.linalg.norm(xy,axis=-1); phi=side[None,:,None]/radius[:,None,:]
    co,si=np.cos(phi),np.sin(phi); x,y=xy[:,None,:,0],xy[:,None,:,1]
    return np.stack([co*x-si*y,si*x+co*y],axis=-1).reshape(n*ends,len(phases),2)


def crossing_lists(xy, period):
    count,steps,_=xy.shape
    angle=np.unwrap(np.arctan2(xy[:,:,1],xy[:,:,0]),axis=1)
    winding=np.round((angle[:,-1]-angle[:,0])/(2*np.pi))
    angle=np.column_stack([angle,angle[:,0]+2*np.pi*winding])
    radius=np.linalg.norm(xy,axis=2); radius=np.column_stack([radius,radius[:,0]])
    events=[[] for _ in range(count)]
    for a in range(count):
        for b in range(a+1,count):
            d=angle[a]-angle[b]
            indices=np.flatnonzero(np.floor(d[1:]/(2*np.pi))!=np.floor(d[:-1]/(2*np.pi)))+1
            for k in indices:
                target=(np.ceil(d[k-1]/(2*np.pi)) if d[k]>d[k-1] else np.floor(d[k-1]/(2*np.pi)))*2*np.pi
                f=(target-d[k-1])/(d[k]-d[k-1])
                if f < -1e-9 or f > 1+1e-9:continue
                r=lambda c:radius[c,k-1]*(1-f)+radius[c,k]*f
                phase=(k-1+f)/steps*period; outside=a if r(a)>r(b) else b
                events[a].append((phase,b,outside==a)); events[b].append((phase,a,outside==b))
    for row in events:row.sort()
    return events,winding


def cyclic_equal(a,b):
    return len(a)==len(b) and (not a or any(a==b[k:]+b[:k] for k in range(len(b))))


def output_clearance(profile, refinement=4):
    n,ends,steps=profile['count'],profile['ends'],profile['steps']*refinement
    period=profile['cellPeriod']; length=period*profile['feed']; dz=length/steps
    xy=profile_points(profile,np.arange(steps+1)/steps*period,ends)
    z=np.broadcast_to(np.arange(steps+1)*dz,(n*ends,steps+1))
    nodes=np.concatenate([xy,z[:,:,None]],axis=2)
    starts=nodes[:,:-1].reshape(-1,3);finish=nodes[:,1:].reshape(-1,3);size=len(starts)
    perm=np.asarray(profile['perm']); inverse=np.argsort(perm)
    owners=np.repeat(np.arange(n*ends),steps)
    previous=np.repeat((perm[:,None]*ends+np.arange(ends)).ravel(),steps)
    following=np.repeat((inverse[:,None]*ends+np.arange(ends)).ravel(),steps)
    owner=np.concatenate([previous,owners,following]);shift=np.repeat([-length,0,length],size)
    centers=np.tile((starts+finish)/2,(3,1)); centers[:,2]+=shift
    seglength=np.linalg.norm(finish-starts,axis=1)
    threshold=profile['wireDiameter']*1.6
    pairs=cKDTree(centers).query_pairs(threshold+seglength.max(),output_type='ndarray')
    a,b=pairs[:,0],pairs[:,1];valid=(a>=size)&(a<2*size)&(owner[a]!=owner[b]);a,b=a[valid],b[valid]
    p0=starts[a%size].copy();p1=finish[a%size].copy();q0=starts[b%size].copy();q1=finish[b%size].copy()
    p0[:,2]+=shift[a];p1[:,2]+=shift[a];q0[:,2]+=shift[b];q1[:,2]+=shift[b]
    distances=segment_distances(p0,p1,q0,q1)
    # Closest radial approach along the segments, including chord interiors.
    u=finish[:,:2]-starts[:,:2];f=np.clip(-np.sum(starts[:,:2]*u,axis=1)/np.maximum(np.sum(u*u,axis=1),1e-20),0,1)
    radial=np.linalg.norm(starts[:,:2]+f[:,None]*u,axis=1)
    return {'minimum_segment_distance_mm':float(distances.min()),'minimum_surface_clearance_mm':float(distances.min()-profile['wireDiameter']),'minimum_surface_radius_mm':float(radial.min()-profile['wireDiameter']/2),'segments_per_cell':int(size),'candidate_pairs_checked':int(len(distances))}


def rotational_basis(source):
    """Discover symmetry from complete guide histories, not from carrier labels."""
    guides=np.asarray(source['guides']);count=len(guides);order=count//4
    classes=np.full(count,-1,dtype=int);rotations=np.zeros((count,2,2));prototypes=[]
    for carrier in range(count):
        if classes[carrier]>=0:continue
        prototype=len(prototypes);prototypes.append(carrier)
        for k in range(order):
            a=k*2*np.pi/order;rotation=np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]])
            target=guides[carrier]@rotation.T
            errors=np.max(np.linalg.norm(guides-target,axis=2),axis=1);other=int(errors.argmin())
            if errors[other]<1e-6:classes[other]=prototype;rotations[other]=rotation
    assert len(prototypes)==4 and np.all(classes>=0),'Guide histories do not have the expected rotational symmetry'
    return np.asarray(prototypes),classes,rotations,order


class CarrierGuides:
    """Independent evaluation of actual circular guide paths and handoffs."""
    def __init__(self,count):
        root=Path(__file__).resolve().parents[1]
        a=json.loads((root/f'models/{"assembly" if count<20 else "industrial-motion"}-{count}.json').read_text())
        self.a=a;self.count=count;self.gears=g=a['gears'];self.period=g*np.pi;self.r=a.get('orbitRadius',40);self.initial=a['initialPhase'];self.loading=np.asarray(a['loading'])
        phases=a.get('rotorPhases')
        if phases is None:
            phases=[]
            for rotor in range(g):
                part=next(p for p in a['instances'] if p.get('slot',-1)//4==rotor)
                phases.append(part['carrierAngle']-(-1)**rotor*self.initial-(part['slot']%4)*np.pi/2)
        self.phases=np.asarray(phases);events=[];turns=int(np.ceil((self.initial+self.period)/(2*np.pi)))+2
        for rotor in range(g):
            other=(rotor+1)%g;tangent=2*np.pi*rotor/g+np.pi/2+np.pi/g
            for pocket in range(4):
                for turn in range(-turns,turns+1):
                    absolute=(tangent-phases[rotor]-pocket*np.pi/2+turn*2*np.pi)/(-1)**rotor;t=absolute-self.initial
                    if t<=1e-8 or t>self.period+1e-8:continue
                    next_pocket=int(np.floor(((tangent+np.pi-(-1)**other*absolute-phases[other])%(2*np.pi))/(np.pi/2)+.5))%4
                    events.append((t,rotor*4+pocket,other*4+next_pocket))
        self.events=sorted(events);self.knots=sorted(set(e[0] for e in events if 0<e[0]<2*np.pi))
        if count<20:
            guides=[p for p in a['instances'] if p['part']=='yarn-eye-post'];self.offset=np.array([np.array(p['pos'][:2])-p['carrierOrigin'][:2] for p in guides]);self.initial_heading=np.array([p['carrierAngle']+(-1)**(p['slot']//4)*np.pi/2 for p in guides]);self.curvature_bound=self.r+np.linalg.norm(self.offset,axis=1).max()+2
        else:self.curvature_bound=self.r*1.43

    def at(self,t):
        t=t%self.period;tokens=np.arange(self.gears*4)
        for phase,a,b in self.events:
            if phase>t:break
            tokens[a],tokens[b]=tokens[b],tokens[a]
        slot=np.argsort(tokens)[self.loading];rotor=slot//4;pocket=slot%4;sign=(-1.)**rotor
        radial=self.phases[rotor]+sign*(t+self.initial)+pocket*np.pi/2;heading=radial+sign*np.pi/2;theta=rotor*2*np.pi/self.gears
        q=self.a['centerRadius']*np.column_stack([np.cos(theta),np.sin(theta)])+self.r*np.column_stack([np.cos(radial),np.sin(radial)])
        if self.count<20:
            yaw=heading-self.initial_heading;co,si=np.cos(yaw),np.sin(yaw);x,y=self.offset.T
            q+=np.column_stack([co*x-si*y,si*x+co*y])+2*np.column_stack([np.cos(heading),np.sin(heading)])
        else:q+=self.r*.43*np.column_stack([np.cos(heading),np.sin(heading)])
        return q
