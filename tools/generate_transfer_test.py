#!/usr/bin/env python3
"""Original hand-operated crossing coupon; separate from the full braider CAD."""
import sys,math,json,csv
from pathlib import Path
sys.path.insert(0,'/usr/lib/freecad/lib')
import FreeCAD as App,Part,Mesh
root=Path(__file__).resolve().parents[1];out=root/'fabrication/experiments/transfer';out.mkdir(parents=True,exist_ok=True)
V=App.Vector
angle=math.pi/3;width=8.6;neck_width=5.6;thickness=6.;foot_width=8.;foot_height=5.4
outline=[(-14,0),(-8,-4),(8,-4),(14,0),(8,4),(-8,4)]
mounts=[(x,y) for x in [-50,50] for y in [-35,35]]
def box(x,y,z,a,b,c):return Part.makeBox(a,b,c,V(x,y,z))
def cyl(r,h,z=0):return Part.makeCylinder(r,h,V(0,0,z))
def polygon(points,h):return Part.Face(Part.makePolygon([V(x,y,0) for x,y in points+[points[0]]])).extrude(V(0,0,h))
def cross(w,h):
 a=box(-130,-w/2,-1,260,w,h+2);b=a.copy();b.rotate(V(),V(0,0,1),60);return a.fuse(b)
def plate(t,slot=0):
 s=box(-60,-50,0,120,100,t)
 if slot:s=s.cut(cross(slot,t))
 for x,y in mounts:s=s.cut(Part.makeCylinder(1.7,t,V(x,y,0)))
 return s.removeSplitter()
def foot(round=False):
 s=(cyl(4,foot_height) if round else polygon(outline,foot_height)).fuse(cyl(2.4,9.5))
 return s.cut(cyl(1.6,10)).cut(cyl(3.1,2.4)).removeSplitter()
hexagon=[(5.7/math.sqrt(3)*math.cos(i*math.pi/3),5.7/math.sqrt(3)*math.sin(i*math.pi/3)) for i in range(6)]
knob=cyl(8,4).cut(cyl(1.6,4)).cut(polygon(hexagon,3).translated(V(0,0,1))).removeSplitter()
parts={'base':(plate(6),'laser',0),'track':(plate(6,width),'laser',6),'cover':(plate(3,neck_width),'laser',12),'boat-shoe':(foot(),'printed',6.3),'round-shoe':(foot(True),'printed',6.3),'handle':(knob,'printed',15.8)}
report=[];meshes={};doc=App.newDocument('TransferCoupon')
for name,(shape,process,z) in parts.items():
 assert shape.isValid() and shape.Volume>0,name
 shape.exportStep(str(out/(name+'.step')))
 vv,ff=shape.tessellate(.06);meshes[name]={'vertices':[[v.x,v.y,v.z] for v in vv],'faces':ff,'z':z,'process':process}
 if process=='printed':Mesh.Mesh([[vv[i] for i in f] for f in ff]).write(str(out/(name+'.stl')))
 else:
  paths=[];dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES']
  for face in shape.Faces:
   if abs(face.CenterOfMass.z)<1e-7:
    for wire in face.Wires:
     pts=[(v.x+60,v.y+50) for v in wire.discretize(Deflection=.02)]
     paths.append('<path d="M '+' L '.join(f'{x:.5f},{y:.5f}' for x,y in pts)+' Z"/>')
     for (x,y),(xx,yy) in zip(pts,pts[1:]+pts[:1]):
      if abs(x-xx)+abs(y-yy)<1e-8:continue
      dxf+=['0','LINE','8','CUT','10',str(x),'20',str(y),'11',str(xx),'21',str(yy)]
  (out/(name+'.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="100mm" viewBox="0 0 120 100"><title>Hand crossing coupon — {name}, {3 if name=="cover" else 6} mm stock, nominal dimensions</title><g fill="none" stroke="#ff0000" stroke-width="0.05">'+''.join(paths)+'</g></svg>')
  (out/(name+'.dxf')).write_text('\n'.join(dxf+['0','ENDSEC','0','EOF'])+'\n')
 report.append({'part':name,'valid':True,'solids':len(shape.Solids),'volume_mm3':shape.Volume})
 if name!='round-shoe':
  ob=doc.addObject('Part::Feature',name.replace('-','_'));ob.Label=name;ob.Shape=shape.translated(V(0,0,z))
doc.recompute();doc.saveAs(str(out/'transfer-coupon.FCStd'));Part.export(doc.Objects,str(out/'transfer-coupon.step'));App.closeDocument(doc.Name)
# Nominal geometric checks: floor/roof gap and an unobstructed full straight traverse.
shoe=parts['boat-shoe'][0]
maximum=0.
for x in range(-35,36):
 moving=shoe.translated(V(x,0,6.3))
 for name in ['base','track','cover']:
  obstacle=parts[name][0].translated(V(0,0,parts[name][2]));maximum=max(maximum,moving.common(obstacle).Volume)
assert maximum<1e-8,maximum
result={'status':'Nominal solids and straight traverse pass','parts':report,'straight_traverse_poses':71,'maximum_interference_mm3':maximum,'floor_clearance_mm':.3,'roof_clearance_mm':.3,'side_clearance_mm':.3,'scope':'Hand-operated 60-degree crossing coupon. No horn drive, curved track, loads, kerf or physical build qualification.'}
(root/'docs/transfer-cad-validation.json').write_text(json.dumps(result,indent=2)+'\n')
(root/'models/transfer-test.json').write_text(json.dumps({'angleDegrees':60,'trackWidth':width,'neckWidth':neck_width,'outline':outline,'parts':meshes},separators=(',',':')))
with (out/'parts.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['item','quantity','notes']);w.writerows([['base',1,'6 mm plywood; 120 × 100 mm'],['track',1,'6 mm plywood; retain all four islands'],['cover',1,'3 mm clear acrylic or plywood; retain all four islands'],['boat-shoe',1,'PETG or nylon; flat underside on bed; clean sliding surfaces'],['round-shoe',1,'Comparison control; print like boat shoe'],['handle',1,'Printed; M3 nut trap opens at top'],['M3 × 20 bolt, nut and two washers',4,'Clamps each track/cover island to the base'],['M3 × 12 button-head screw',1,'Recessed from underside of shoe'],['M3 nut',1,'Captured inside handle']])
print(json.dumps(result,indent=2))
