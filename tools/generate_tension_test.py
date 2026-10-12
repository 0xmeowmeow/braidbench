#!/usr/bin/env python3
"""Original, hand-operated bobbin/dancer calibration board. Not a braider cartridge."""
import sys,math,json,csv
from pathlib import Path
sys.path.insert(0,'/usr/lib/freecad/lib')
import FreeCAD as App,Part,Mesh
root=Path(__file__).resolve().parents[1];out=root/'fabrication/experiments/tension';out.mkdir(parents=True,exist_ok=True);V=App.Vector
parts={};instances=[];report=[]
def cyl(r,h,z=0):return Part.makeCylinder(r,h,V(0,0,z))
def box(x,y,z,dx,dy,dz):return Part.makeBox(dx,dy,dz,V(x,y,z))
def ring(ro,ri,h):return cyl(ro,h).cut(cyl(ri,h))
def register(name,shape,process,note):
 shape=shape.removeSplitter();assert shape.isValid() and shape.Volume>0,name
 vv,ff=shape.tessellate(.10);parts[name]={'vertices':[[v.x,v.y,v.z] for v in vv],'faces':ff,'process':process,'note':note,'shape':shape}
 shape.exportStep(str(out/(name+'.step')))
 if process=='printed':Mesh.Mesh([[vv[i] for i in f] for f in ff]).write(str(out/(name+'.stl')))
 report.append({'part':name,'valid':True,'solids':len(shape.Solids),'volume_mm3':shape.Volume})
def add(name,pos,group='fixed',rotate=None):instances.append({'part':name,'pos':pos,'group':group,'rotate':rotate})
mounts=[(x+dx,y) for x in [-28,28] for dx in [-6,6] for y in [35,170]]+[(-20.45,145),(-42,60),(10.225,165),(-50,170),(50,170)]
board=box(-60,0,0,120,180,6)
for x,y in mounts:board=board.cut(Part.makeCylinder(3.3 if (x,y)==(-42,60) else 1.7,6,V(x,y,0)))
register('board',board,'laser','6 mm plywood, 120 × 180 mm. Clamp upright; do not operate flat.')
paths=[];dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES']
for face in board.Faces:
 if abs(face.CenterOfMass.z)<1e-7:
  for wire in face.Wires:
   pts=[(p.x+60,p.y) for p in wire.discretize(Deflection=.02)];paths.append('<path d="M '+' L '.join(f'{x:.5f},{y:.5f}' for x,y in pts)+' Z"/>')
   for (x,y),(xx,yy) in zip(pts,pts[1:]+pts[:1]):
    if abs(x-xx)+abs(y-yy)<1e-8:continue
    dxf+=['0','LINE','8','CUT','10',str(x),'20',str(y),'11',str(xx),'21',str(yy)]
(out/'board.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="180mm" viewBox="0 0 120 180"><title>Hand tension calibration board, 6 mm stock, nominal mm</title><g fill="none" stroke="#ff0000" stroke-width="0.05">'+''.join(paths)+'</g></svg>');(out/'board.dxf').write_text('\n'.join(dxf+['0','ENDSEC','0','EOF'])+'\n')
clamp=box(-10,-6,0,20,12,16).cut(Part.makeCylinder(2.1,12,V(0,-6,12),V(0,1,0)))
for x in [-6,6]:clamp=clamp.cut(Part.makeCylinder(1.7,16,V(x,0,0)))
clamp=clamp.cut(Part.makeCylinder(1.3,6,V(0,0,16),V(0,0,-1)))
register('rod-clamp',clamp,'printed','4.2 mm rod bore; two M3 mount holes; tap central top hole M3 for a rod-retaining screw.')
slider=box(-32,-7,0,64,14,10)
for x in [-28,28]:slider=slider.cut(Part.makeCylinder(2.15,14,V(x,-7,6),V(0,1,0)))
for y in [0,-4]:slider=slider.cut(Part.makeCylinder(1.6,10,V(0,y,0)))
register('dancer-slider',slider,'printed','Two 4.3 mm rod bores. Central M3 pulley axle and lower M3 attachment for a hanging mass; measure total moving mass.')
register('guide-rod',cyl(2,147),'hardware','4 mm smooth rod × 147 mm; two required; deburr ends.')
pulley=cyl(11,1).fuse(Part.makeCone(11,10,1,V(0,0,1))).fuse(cyl(10,2,2)).fuse(Part.makeCone(10,11,1,V(0,0,4))).fuse(cyl(11,1,5));pulley=pulley.cut(cyl(4.2,6)).cut(cyl(5.075,4.15))
register('pulley',pulley,'printed','20 mm groove diameter; 10.15 mm × 4.15 mm seat for a 623 bearing. Check actual bearing and printed fit.')
register('pulley-retainer',ring(11,4.2,1),'printed','Bond only the outer annulus to pulley back after fitting bearing; do not bond bearing races or seal.')
register('623-bearing',ring(5,1.5,4),'hardware','623 bearing envelope: 3 × 10 × 4 mm; SKF catalogue reference in the guide.')
register('fixed-axle-post',ring(3,1.6,22.8),'printed','Spacers for fixed return pulley and output eye, from board front to bearing inner-race spacer.')
register('moving-axle-post',ring(3,1.6,6.8),'printed','Spacer from slider front to bearing inner-race spacer.')
register('inner-race-shim',ring(2.1,1.6,.25),'hardware','0.25 mm inner-race shim, 4.2 mm OD; use measured metal stock.')
register('axle-washer',ring(2.5,1.6,.5),'hardware','Small washer contacting only the bearing inner race; 5 mm OD.')
register('guide-eye',ring(4,1.5,2),'hardware','Smooth ceramic guide eye envelope; procure to measured bore and mounting size.')
# Cup supports a ceramic eye whose hole faces the thread, along Y.
hexpoints=[V(5.7/math.sqrt(3)*math.cos(i*math.pi/3),5.7/math.sqrt(3)*math.sin(i*math.pi/3),0) for i in range(6)]
trap=Part.Face(Part.makePolygon(hexpoints+[hexpoints[0]])).extrude(V(0,0,2.6))
holder=ring(5,1.6,22).fuse(box(-5,-2,21,10,4,5)).cut(Part.makeCylinder(4.075,4,V(0,-2,26),V(0,1,0))).cut(trap)
register('eye-holder',holder,'printed','Ceramic eye cup, axis along Y. Bond ceramic in 8.15 mm seat; captured M3 nut at the board-facing base. Fit a rear M3 × 10 bolt.')

spool=cyl(13,2).fuse(cyl(5,35,2)).fuse(cyl(13,2,37)).cut(cyl(3.2,39))
register('bench-bobbin',spool,'printed','26 mm flanges, 39 mm total height, 6.4 mm spindle bore; print in two pieces or support the upper flange.')
register('bobbin-base',ring(5,3.3,5),'printed','M6 axle stand-off from board to the felt washer.')
register('felt-brake',ring(7,3.2,1),'hardware','1 mm felt washer; friction is to be measured, not assumed.')
register('brake-spring',ring(4.5,3.3,7),'hardware','Compression spring envelope only; measure preload and resulting torque.')
register('M6-spindle',cyl(3,70),'hardware','M6 smooth-shank bolt/spindle; 70 mm reference length, retain at board and adjust brake preload.')
register('M6-nut',ring(5,3.1,5),'hardware','M6 adjustment nut envelope; threads and flats not represented.')
register('M3-fixed-axle',cyl(1.5,40),'hardware','M3 × 40 fixed pulley axle, with locknut and inner-race washers.')
register('M3-moving-axle',cyl(1.5,25),'hardware','M3 × 25 moving pulley axle, with locknut and inner-race washers.')
add('board',[0,0,0])
for x in [-28,28]:
 add('guide-rod',[x,29,18],rotate=[-90,0,0])
 for y in [35,170]:add('rod-clamp',[x,y,6])
add('dancer-slider',[0,100,12],'moving');add('moving-axle-post',[0,100,22],'moving');add('M3-moving-axle',[0,100,10],'moving')
for x,y,group in [(-20.45,145,'fixed'),(0,100,'moving')]:
 add('pulley',[x,y,29],group);add('pulley-retainer',[x,y,28],group);add('623-bearing',[x,y,29.05],group);add('inner-race-shim',[x,y,28.8],group);add('axle-washer',[x,y,33.05],group)
add('fixed-axle-post',[-20.45,145,6]);add('M3-fixed-axle',[-20.45,145,0]);add('eye-holder',[10.225,165,6]);add('guide-eye',[10.225,164,32],rotate=[-90,0,0])
for name,z in [('M6-spindle',0),('bobbin-base',6),('felt-brake',11),('bench-bobbin',12),('brake-spring',51),('M6-nut',58)]:add(name,[-42,60,z])
# The bearing inner race and its spacers meet; the printed pulley must clear them.
checks={};pulley_s=parts['pulley']['shape'].translated(V(0,0,29));retainer=parts['pulley-retainer']['shape'].translated(V(0,0,28))
for name,z in [('fixed-axle-post',6),('inner-race-shim',28.8),('axle-washer',33.05)]:checks[name]=pulley_s.common(parts[name]['shape'].translated(V(0,0,z))).Volume+retainer.common(parts[name]['shape'].translated(V(0,0,z))).Volume
assert max(checks.values())<1e-8,checks
maximum=0.
for y in range(80,121):
 moving=parts['dancer-slider']['shape'].translated(V(0,y,12))
 for x in [-28,28]:
  rod=parts['guide-rod']['shape'].copy();rod.rotate(V(),V(1,0,0),-90);rod.translate(V(x,29,18));maximum=max(maximum,moving.common(rod).Volume)
assert maximum<1e-8,maximum
doc=App.newDocument('TensionCalibrationBoard')
for i,inst in enumerate(instances):
 shape=parts[inst['part']]['shape'].copy()
 if inst['rotate']:shape.rotate(V(),V(1,0,0),inst['rotate'][0])
 shape.translate(V(*inst['pos']));ob=doc.addObject('Part::Feature',f'Part{i:03}');ob.Label=inst['part'];ob.Shape=shape
doc.recompute();doc.saveAs(str(out/'tension-board.FCStd'));Part.export(doc.Objects,str(out/'tension-board.step'));App.closeDocument(doc.Name)
(root/'models/tension-test.json').write_text(json.dumps({'parts':{k:{a:b for a,b in v.items() if a!='shape'} for k,v in parts.items()},'instances':instances},separators=(',',':')))
result={'status':'Nominal component solids and selected clearance checks pass','parts':report,'dancer_travel_mm':40,'stored_length_range_mm':80,'slider_poses':41,'maximum_rod_slider_intersection_mm3':maximum,'pulley_to_stationary_spacer_intersections_mm3':checks,'limits':'Calibration board, not an integrated carrier. Mounting fasteners, threads and bearing internals are represented by envelopes or specified hardware. No full assembly, friction, wear, strength, brake regulation or physical validation.'};(root/'docs/tension-cad-validation.json').write_text(json.dumps(result,indent=2)+'\n')
counts={}
for inst in instances:counts[inst['part']]=counts.get(inst['part'],0)+1
with (out/'parts.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['part','quantity','process','notes']);w.writerows([[name,count,parts[name]['process'],parts[name]['note']] for name,count in counts.items()]);w.writerows([['M3 × 30 clamp mounting bolt, washer and nut',8,'hardware','Two per rod clamp, through board'],['M3 × 6 rod retaining screw',4,'hardware','Tap the printed clamp hole M3'],['M3 eye bolt and nut',1,'hardware','Mass hanger at lower slider hole'],['Measured hanging masses',1,'hardware','Include slider, moving pulley and fittings in total moving mass'],['Clamps or backboard mounting screws',2,'hardware','Secure board vertically'],['M6 washer and retaining nut',2,'hardware','Spindle retention and brake adjustment'],['M3 × 10 bolt and M3 nut',1,'hardware','Ceramic eye holder to board'],['M3 locknuts',2,'hardware','Pulley axle retention; do not clamp rotating races']])
print(json.dumps(result,indent=2))
