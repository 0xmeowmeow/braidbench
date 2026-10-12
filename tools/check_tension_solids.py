#!/usr/bin/env python3
"""Sample all represented calibration-board solids; exclude no component pairs."""
import sys,json
from pathlib import Path
sys.path.insert(0,'/usr/lib/freecad/lib')
import FreeCAD as App,Part
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'models/tension-test.json').read_text())
original=[]
for item in data['instances']:
    shape=Part.read(str(root/'fabrication/experiments/tension'/(item['part']+'.step')))
    if item['rotate']:shape.rotate(App.Vector(),App.Vector(1,0,0),item['rotate'][0])
    shape.translate(App.Vector(*item['pos']))
    original.append((item,shape))
maximum=0.;checks=0;failures=[]
for y in range(80,121):
    solids=[]
    for item,shape in original:
        s=shape.copy()
        if item['group']=='moving':s.translate(App.Vector(0,y-100,0))
        solids.append((item['part'],s))
    for i,(name,s) in enumerate(solids):
        for j,(other,t) in enumerate(solids[:i]):
            if not s.BoundBox.intersect(t.BoundBox):continue
            volume=s.common(t).Volume;checks+=1;maximum=max(maximum,volume)
            if volume>1e-7:failures.append({'slider_y_mm':y,'a':[i,name],'b':[j,other],'volume_mm3':volume})
result={'status':'pass' if not failures else 'fail','poses':41,'represented_solids':len(original),'brep_pairs_checked':checks,'maximum_overlap_mm3':maximum,'failures':failures,'limits':'Sampled nominal BREP intersections. Fastener heads/nuts/threads, hanging mass, yarn package, tolerances, friction and strength are not qualified. Bearing and spring internals use envelopes.'}
(root/'docs/tension-assembly-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2));assert not failures
