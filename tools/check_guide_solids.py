#!/usr/bin/env python3
"""Focused clearance regression for the corrected yarn guide (FreeCAD)."""
import sys,json,math
from pathlib import Path
sys.path.append('/usr/lib/freecad/lib')
import FreeCAD as App,Part
root=Path(__file__).resolve().parents[1]
results=[]
for n in (8,12,16):
 a=json.loads((root/f'models/assembly-{n}.json').read_text())
 def placed(part):
  i=next(v for v in a['instances'] if v['part']==part and v.get('carrier')==0)
  shape=Part.Shape();shape.read(str(root/f'fabrication/printed/{part}.step'))
  shape.rotate(App.Vector(0,0,0),App.Vector(0,0,1),i['rot'][2]);shape.translate(App.Vector(*i['pos']));return i,shape
 inst,post=placed('yarn-eye-post');_,spool=placed('bobbin');_,arm=placed('yarn-guide-arm')
 cx,cy=inst['carrierOrigin'];gx,gy,_=inst['pos'];angle=math.atan2(gy-cy,gx-cx)+math.acos(11/17)
 start=App.Vector(cx+11*math.cos(angle),cy+11*math.sin(angle),116);end=App.Vector(gx,gy,147.5);delta=end-start
 yarn=Part.makeCylinder(.15,delta.Length,start,delta)
 values=dict(strands=n,guide_bobbin_overlap_mm3=post.common(spool).Volume,arm_bobbin_overlap_mm3=arm.common(spool).Volume,yarn_guide_overlap_mm3=yarn.common(post).Volume,yarn_flange_overlap_mm3=yarn.common(spool).Volume)
 for key,value in values.items():
  if key.endswith('mm3'):assert value<1e-6,(key,value)
 results.append(values)
report=dict(scope='Rest-pose solid intersections for corrected trailing guide, arm, bobbin and 0.3 mm diameter tangent payout line; not a complete machine collision or tension qualification.',previous_guide_bobbin_intersection_mm3=144,results=results)
(root/'docs/guide-solid-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
