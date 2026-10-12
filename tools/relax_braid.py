#!/usr/bin/env python3
"""Geometric form-finding of a periodic braid, not a calibrated material solver.

Minimise polyline length plus a weak inward load, subject to penalised wire/core
and segment/segment clearance. Carrier-derived initial paths provide topology;
a separate validator must accept crossing identity/order and actual clearances.
"""
import argparse
import json
import time
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
from scipy.spatial import cKDTree


from braid_geometry import rotational_basis

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('input', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--ends', type=int, default=1)
parser.add_argument('--iterations', type=int, default=1800)
parser.add_argument('--start', type=Path, help='Warm start from a previous profile with the same dimensions')
parser.add_argument('--check-gradient', action='store_true')
parser.add_argument('--bending', type=float)
args = parser.parse_args()
source = json.loads(args.input.read_text())
n, steps, ends = source['count'], source['steps'], args.ends
q0 = np.asarray(source['points'], dtype=float)
if args.start:q0=np.asarray(json.loads(args.start.read_text())['points'],dtype=float)
prototypes,classes,rotations,symmetry_order=rotational_basis(source)
def expand(q):return np.einsum('nij,nkj->nki',rotations,q[classes])
def reduce_gradient(g):
    rotated=np.einsum('nji,nkj->nki',rotations,g);out=np.zeros((len(prototypes),steps,2));np.add.at(out,classes,rotated);return out
q0=reduce_gradient(q0)/symmetry_order
perm = np.asarray(source['perm']); inverse = np.argsort(perm)
feed, core = source['feed'], source['core']
cell_length = source['cellPeriod'] * feed
ds = cell_length / steps
wire_diameter = .45 if n < 20 else .16
wire_pitch = .20
clearance = wire_diameter * 1.05
pressure, penalty = .06, 6000.
bending = args.bending if args.bending is not None else (.03 if n < 20 else .002)
# Arrays are ordered carrier, end, phase. Across the cell seam a strand continues
# on its carrier's measured permutation, not back onto an unrelated endpoint.
node_ids = np.arange(n * ends * steps).reshape(n, ends, steps)
next_ids = np.roll(node_ids, -1, axis=2)
next_ids[:, :, -1] = node_ids[perm, :, 0]
next_ids = next_ids.ravel(); total = node_ids.size
previous_ids = np.argsort(next_ids)
z = np.tile(np.arange(steps) * ds, n * ends)
side = (np.arange(ends) - (ends - 1) / 2) * wire_pitch
owners = np.repeat(np.arange(n * ends), steps)
owner_before = np.repeat((perm[:, None] * ends + np.arange(ends)).ravel(), steps)
owner_after = np.repeat((inverse[:, None] * ends + np.arange(ends)).ravel(), steps)
clone_owner = np.concatenate([owner_before, owners, owner_after])
shifts = np.repeat([-cell_length, 0, cell_length], total)
central=node_ids[prototypes].ravel()+total
is_central=np.zeros(total*3,dtype=bool);is_central[central]=True
started = time.monotonic(); evaluations = 0


def wires(q):
    radius = np.linalg.norm(q, axis=2)
    phi = side[None, :, None] / radius[:, None, :]
    co, si = np.cos(phi), np.sin(phi)
    x, y = q[:, None, :, 0], q[:, None, :, 1]
    return np.stack([co*x-si*y, si*x+co*y], axis=-1), radius, co, si


def accumulate(values, indices):
    return np.column_stack([np.bincount(indices, weights=values[:, d], minlength=total) for d in range(2)])


def energy(flat):
    global evaluations
    q = expand(flat.reshape(len(prototypes), steps, 2))
    wire_xy, radius, co, si = wires(q)
    starts = np.column_stack([wire_xy.reshape(-1, 2), z])
    finish = np.column_stack([wire_xy.reshape(-1, 2)[next_ids], z+ds])
    delta = finish-starts
    lengths = np.linalg.norm(delta, axis=1)
    value = lengths.sum()
    forces = delta[:, :2] / lengths[:, None]
    gradient = -forces + accumulate(forces, next_ids)
    wire_flat=wire_xy.reshape(-1,2)
    second=wire_flat[next_ids]+wire_flat[previous_ids]-2*wire_flat
    value += .5*bending/ds**3*np.sum(second**2)
    gradient += bending/ds**3*(accumulate(second,next_ids)+accumulate(second,previous_ids)-2*second)
    value/=symmetry_order;gradient/=symmetry_order

    centers = np.tile((starts+finish)/2, (3, 1)); centers[:, 2] += shifts
    neighbours=cKDTree(centers).query_ball_point(centers[central],clearance+lengths.max())
    a=np.repeat(central,[len(row) for row in neighbours]);b=np.concatenate(neighbours).astype(int)
    keep=(clone_owner[a]!=clone_owner[b])&(~is_central[b]|(a<b))
    a,b=a[keep],b[keep];weights=np.where(is_central[b],1.,.5);ia,ib=a%total,b%total
    u, v = delta[ia], delta[ib]
    w = starts[ia]-starts[ib]; w[:, 2] += shifts[a]-shifts[b]
    aa=(u*u).sum(1); bb=(u*v).sum(1); cc=(v*v).sum(1); dd=(u*w).sum(1); ee=(v*w).sum(1)
    denominator=aa*cc-bb*bb
    s=np.clip(np.divide(bb*ee-cc*dd, denominator, out=np.zeros_like(aa), where=denominator>1e-15), 0, 1)
    t=(bb*s+ee)/cc
    s=np.where(t<0,np.clip(-dd/aa,0,1),s); s=np.where(t>1,np.clip((bb-dd)/aa,0,1),s); t=np.clip(t,0,1)
    separation=w+s[:,None]*u-t[:,None]*v
    distance=np.linalg.norm(separation,axis=1)
    active=distance<clearance
    gap=distance[active]-clearance
    value += penalty*ds*np.dot(weights[active]*gap,gap)
    f=2*penalty*ds*(weights[active]*gap)[:,None]*separation[active,:2]/np.maximum(distance[active,None],1e-12)
    ia, ib, s, t=ia[active], ib[active], s[active], t[active]
    gradient += accumulate((1-s[:,None])*f,ia)+accumulate(s[:,None]*f,next_ids[ia])
    gradient -= accumulate((1-t[:,None])*f,ib)+accumulate(t[:,None]*f,next_ids[ib])

    gradient=gradient.reshape(n,ends,steps,2)
    # Chain rule for a wire offset through angle side/radius about its bundle.
    gx,gy=gradient[:,:,:,0],gradient[:,:,:,1]
    radial_term=(-gx*wire_xy[:,:,:,1]+gy*wire_xy[:,:,:,0])*(-side[None,:,None]/radius[:,None,:]**3)
    base_gradient=np.stack([co*gx+si*gy,-si*gx+co*gy],axis=-1).sum(axis=1)
    base_gradient += radial_term.sum(axis=1)[:,:,None]*q
    value += pressure*ds*ends*radius.sum()/symmetry_order
    base_gradient += pressure*ds*ends*q/radius[:,:,None]/symmetry_order
    penetration=np.minimum(0,radius-(core+clearance/2))
    value += penalty*ds*ends*np.sum(penetration**2)/symmetry_order
    base_gradient += 2*penalty*ds*ends*penetration[:,:,None]*q/radius[:,:,None]/symmetry_order
    evaluations += 1
    if evaluations % 100 == 0:
        print(json.dumps({'evaluations':evaluations,'energy':round(value,6),'minimum_wire_gap':round(float(distance.min()),6) if len(distance) else None,'radius_range':[round(float(radius.min()),5),round(float(radius.max()),5)],'seconds':round(time.monotonic()-started,1)}),flush=True)
    return value, reduce_gradient(base_gradient).ravel()


if args.check_gradient:
    base=q0.ravel().copy();value,gradient=energy(base);rng=np.random.default_rng(419)
    for index in rng.choice(len(base),12,replace=False):
        delta=np.zeros_like(base);delta[index]=1e-6
        numeric=(energy(base+delta)[0]-energy(base-delta)[0])/2e-6
        assert abs(numeric-gradient[index])<2e-4*max(1,abs(numeric)),(index,numeric,gradient[index])
    print('Finite-difference gradient check passed',flush=True)
    raise SystemExit
result = minimize(energy,q0.ravel(),jac=True,method='L-BFGS-B',options={'maxiter':args.iterations,'maxcor':8,'ftol':1e-10,'gtol':1e-5,'maxls':30})
report={**{k:source[k] for k in ['count','steps','period','cellPeriod','perm','feed','core']},'ends':ends,'wireDiameter':wire_diameter,'wirePitch':wire_pitch,'points':expand(result.x.reshape(len(prototypes),steps,2)).tolist(),'method':'periodic geometric form-finding; polyline length, bending regularisation, inward load and segment-contact penalties','physicalStatus':'Not a calibrated friction, stiffness, torsion or tension simulation. Requires independent geometry/topology validation before use.','optimizer':{'success':bool(result.success),'message':str(result.message),'iterations':int(result.nit),'evaluations':evaluations,'energy':float(result.fun),'seconds':round(time.monotonic()-started,2)},'parameters':{'pressure':pressure,'penalty':penalty,'bending':bending,'contactDiameter':clearance},'symmetry':{'order':symmetry_order,'prototypes':prototypes.tolist(),'classes':classes.tolist(),'rotations':rotations.tolist()}}
args.output.write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps(report['optimizer']),flush=True)
