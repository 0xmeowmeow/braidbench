#!/usr/bin/env python3
"""Compare the browser contact algorithm with the independent exported CAD solids."""
import sys,math,json
from pathlib import Path
sys.path.insert(0,'/usr/lib/freecad/lib')
import FreeCAD as App,Part
root=Path(__file__).resolve().parents[1];data=json.loads(Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/transfer-contact-poses.json').read_text());V=App.Vector
folder=root/'fabrication/experiments/transfer';solids={name:Part.read(str(folder/(name+'.step'))) for name in ['base','track','cover','boat-shoe','round-shoe']}
obstacles=[solids[name].translated(V(0,0,z)) for name,z in [('base',0),('track',6),('cover',12)]]
maximum_error=0.;mismatches=[]
for p in data['poses']:
 shape=solids[p['kind']+'-shoe'].copy();shape.rotate(V(),V(0,0,1),math.degrees(p['yaw']));shape.translate(V(p['x'],p['y'],6.3));volume=sum(shape.common(o).Volume for o in obstacles)
 expected=p['overlapArea']*5.4;maximum_error=max(maximum_error,abs(volume-expected))
 if (volume<1e-7)!=p['free']:mismatches.append({'pose':p,'intersection_mm3':volume})
assert not mismatches,mismatches
assert maximum_error<1e-5,maximum_error
report={'status':'Browser contact and exported solids agree','tested_poses':len(data['poses']),'maximum_volume_difference_mm3':maximum_error,'mismatches':mismatches,'straight_traverse_poses':data['straight_traverse_poses'],'boat_stop_degrees_at_centre':data['boat_stop_degrees'],'round_control_reaches_degrees_at_centre':data['round_reaches_degrees'],'scope':'Fixed-centre turn and sampled straight traverse of an isolated 60-degree crossing coupon. No full configuration-space separation proof, gear handoff, curved track, force model or physical qualification.'}
(root/'docs/transfer-contact-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
