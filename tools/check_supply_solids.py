#!/usr/bin/env python3
"""Conservative capsules against the three exported tabletop guide/bobbin parts."""
import sys,json,math
from pathlib import Path
sys.path.append('/usr/lib/freecad/lib')
import FreeCAD as App,Part
root=Path(__file__).resolve().parents[1];rows=json.load(open(sys.argv[1]));results=[]
for row in rows:
    n=row['count'];assembly=json.loads((root/f'models/assembly-{n}.json').read_text());capsules=[];radius=row['wireRadius']
    for a,b in zip(row['path'][:-1],row['path'][1:]):
        a,b=App.Vector(*a),App.Vector(*b);delta=b-a
        if delta.Length>1e-10:capsules.append(Part.makeCylinder(radius,delta.Length,a,delta))
        capsules.append(Part.makeSphere(radius,a))
    capsules.append(Part.makeSphere(radius,App.Vector(*row['path'][-1])))
    intersections={}
    for name in ['yarn-eye-post','yarn-guide-arm','bobbin']:
        inst=next(p for p in assembly['instances'] if p['part']==name and p.get('carrier')==0);shape=Part.Shape();shape.read(str(root/f'fabrication/printed/{name}.step'));shape.rotate(App.Vector(),App.Vector(0,0,1),inst['rot'][2]);shape.translate(App.Vector(*inst['pos']))
        volume=sum(c.common(shape).Volume for c in capsules if c.BoundBox.intersect(shape.BoundBox));intersections[name]=volume
        assert volume<1e-6,(n,name,volume)
    results.append({'carriers':n,'diameter_mm':2*radius,'maximum_stored_slack_mm':row['maximumStored'],'overlap_mm3':intersections})
report={'results':results,'scope':'Actual complete source route, represented by conservative segment cylinders and endpoint spheres, against the exported guide post, arm and bobbin at the lowest dancer position. The moving loop remains above these three parts throughout its stroke. Other carriers, new viewer-only guide hardware and the full machine are excluded.'}
(root/'docs/supply-solid-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
