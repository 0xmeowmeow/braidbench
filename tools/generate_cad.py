#!/usr/bin/env python3
"""Original parametric engineering study. Units mm. Run with FreeCAD's Python modules.
Creates BREP/STEP, printable STL candidates, nominal laser SVG/DXF and viewer meshes.
Carrier guidance and loading are experimental: read docs/build-guide.html.
"""
import sys, math, json, struct, csv
from pathlib import Path
sys.path.insert(0, '/usr/lib/freecad/lib')
import FreeCAD as App, Part, Mesh

ROOT = Path(__file__).resolve().parents[1]
V = App.Vector
TAU = 2*math.pi
M, TEETH, PITCH, TRACK_W = 2., 40, 40., 5.6
LOADINGS = {8:[0,4,6,7,10,12,13,14],12:[1,4,5,6,10,13,14,15,19,20,21,23],16:[0,2,3,7,8,10,11,12,16,17,19,21,24,25,26,30]}
INITIAL_PHASE = .031
PAL = {'laser':'#bc9562','printed':'#42bec5','hardware':'#b4c2d0','electronics':'#5784c4','yarn':'#f6bb68','experimental':'#ec9064'}
lib, instances, rows, checks = {}, [], [], []

def cyl(r,h,x=0,y=0,z=0): return Part.makeCylinder(r,h,V(x,y,z))
def box(x,y,z,dx,dy,dz): return Part.makeBox(dx,dy,dz,V(x,y,z))
def ring(ro,ri,h): return cyl(ro,h).cut(cyl(ri,h))
def holes(s, pts, r, z=-1,h=200):
    for x,y in pts: s=s.cut(cyl(r,h,x,y,z))
    return s
def polygon(points,h):
    p=[V(x,y,0) for x,y in points]; return Part.Face(Part.makePolygon(p+[p[0]])).extrude(V(0,0,h))
def gear(z=40,m=2,thick=8,bore=11.1,backlash=.18):
    rp=z*m/2; rb=rp*math.cos(math.radians(20)); ra=rp+m; rf=rp-1.25*m
    inv=lambda r: math.sqrt(max(0,(r/rb)**2-1))-math.acos(min(1,rb/r))
    half=math.pi/(2*z)-backlash/(2*rp); ip=inv(rp); pts=[]
    for k in range(z):
        a=TAU*k/z
        radii=[rf]+[max(rb,rf)+(ra-max(rb,rf))*j/5 for j in range(6)]
        for r in radii:
            t=a-half-ip+(inv(r) if r>=rb else 0); pts.append((r*math.cos(t),r*math.sin(t)))
        for r in reversed(radii):
            t=a+half+ip-(inv(r) if r>=rb else 0); pts.append((r*math.cos(t),r*math.sin(t)))
    return polygon(pts,thick).cut(cyl(bore,thick))
def register(key,shape,category,description,printable=False):
    if key in lib: return key
    shape=shape.removeSplitter()
    if not shape.isValid() or shape.Volume<=0: raise ValueError('Invalid solid '+key)
    vertices,faces=shape.tessellate(.35)
    bb=shape.BoundBox
    lib[key]={'shape':shape,'category':category,'description':description,
              'vertices':[[round(p.x,4),round(p.y,4),round(p.z,4)] for p in vertices], 'faces':[list(f) for f in faces]}
    checks.append({'part':key,'valid':True,'solids':len(shape.Solids),'volume_mm3':round(shape.Volume,2),'bounds_mm':[round(bb.XLength,2),round(bb.YLength,2),round(bb.ZLength,2)]})
    if printable:
        # Shift underside to Z=0; all print orientations remain native Z up.
        sp=shape.copy(); sp.translate(V(0,0,-bb.ZMin))
        vv,ff=sp.tessellate(.12)
        Mesh.Mesh([[vv[i] for i in f] for f in ff]).write(str(ROOT/'fabrication/printed'/f'{key}.stl'))
        sp.exportStep(str(ROOT/'fabrication/printed'/f'{key}.step'))
    return key
def add(key,name,pos=(0,0,0),group='frame',explode=(0,0,0),rot=(0,0,0),color=None):
    instances.append(dict(part=key,name=name,pos=list(pos),rot=list(rot),group=group,explode=list(explode),color=color or PAL[lib[key]['category']]))
def laser(key,outline,holespec,thickness,description):
    # outline is a polygon; holes are circles or polygons. No kerf compensation.
    sh=polygon(outline,thickness)
    for item in holespec:
        if len(item)==3 and isinstance(item[0],(int,float)):
            x,y,r=item; sh=sh.cut(cyl(r,thickness,x,y))
        else: sh=sh.cut(polygon(item,thickness))
    register(key,sh,'laser',description)
    xs=[p[0] for p in outline]; ys=[p[1] for p in outline]
    xmin,xmax,ymin,ymax=min(xs),max(xs),min(ys),max(ys)
    paths=[]
    def ppoly(p): return '<path d="M '+' L '.join(f'{x-xmin:.5f},{y-ymin:.5f}' for x,y in p)+' Z"/>'
    paths.append(ppoly(outline))
    for item in holespec:
        if len(item)==3 and isinstance(item[0],(int,float)):
            x,y,r=item; paths.append(f'<circle cx="{x-xmin:.5f}" cy="{y-ymin:.5f}" r="{r:.5f}"/>')
        else: paths.append(ppoly(item))
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{xmax-xmin}mm" height="{ymax-ymin}mm" viewBox="0 0 {xmax-xmin} {ymax-ymin}"><title>{key}: {description}; nominal mm, no kerf compensation</title><g fill="none" stroke="#ff0000" stroke-width="0.05">'+''.join(paths)+'</g></svg>'
    (ROOT/'fabrication/laser'/f'{key}.svg').write_text(svg)
    dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES']
    def poly_dxf(p):
        for (x,y),(xx,yy) in zip(p,p[1:]+p[:1]): dxf.extend(['0','LINE','8','CUT','10',str(x-xmin),'20',str(y-ymin),'30','0','11',str(xx-xmin),'21',str(yy-ymin),'31','0'])
    poly_dxf(outline)
    for it in holespec:
        if len(it)==3 and isinstance(it[0],(int,float)):
            x,y,r=it; dxf.extend(['0','CIRCLE','8','CUT','10',str(x-xmin),'20',str(y-ymin),'30','0','40',str(r)])
        else: poly_dxf(it)
    dxf+=['0','ENDSEC','0','EOF']; (ROOT/'fabrication/laser'/f'{key}.dxf').write_text('\n'.join(dxf)+'\n')
    return sh

def rect(x,y,w,h): return [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]
def rotate_shape(shape,angle):
    s=shape.copy();s.rotate(V(),V(0,0,1),math.degrees(angle));return s
def relocated(shape,pos,rot):
    s=shape.copy()
    for axis,a in zip([V(1,0,0),V(0,1,0),V(0,0,1)],rot):
        if a:s.rotate(V(),axis,a)
    s.translate(V(*pos));return s

def glb_export(path,assembly):
    # Standard glTF 2.0, mm converted to metres; Z-up changed to Y-up at root.
    doc={'asset':{'version':'2.0','generator':'Braidbench parametric study'},'scene':0,'scenes':[{'nodes':[0]}],
         'nodes':[{'name':'Braidbench (metres)','rotation':[-math.sqrt(.5),0,0,math.sqrt(.5)],'children':[]}],
         'meshes':[],'materials':[],'accessors':[],'bufferViews':[],'buffers':[]}
    buf=bytearray(); meshids={}; mats={}
    def acc(data,fmt,count,kind,component,bounds=None):
        while len(buf)%4:buf.append(0)
        offset=len(buf); flat=[x for line in data for x in line] if isinstance(data[0],(list,tuple)) else data
        buf.extend(struct.pack('<'+fmt*len(flat),*flat)); bi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(buf)-offset})
        a={'bufferView':bi,'componentType':component,'count':count,'type':kind}
        if bounds:a.update(min=bounds[0],max=bounds[1])
        ai=len(doc['accessors']);doc['accessors'].append(a);return ai
    for inst in assembly:
        key,col=inst['part'],inst['color'];mk=(key,col)
        if col not in mats:
            rgb=[int(col[i:i+2],16)/255 for i in (1,3,5)];mats[col]=len(doc['materials']);doc['materials'].append({'name':col,'pbrMetallicRoughness':{'baseColorFactor':rgb+[1],'metallicFactor':.15,'roughnessFactor':.7},'doubleSided':True})
        if mk not in meshids:
            vv=[[c/1000 for c in p] for p in lib[key]['vertices']];ff=lib[key]['faces'];pos=acc(vv,'f',len(vv),'VEC3',5126,([min(p[i] for p in vv) for i in range(3)],[max(p[i] for p in vv) for i in range(3)]));ix=acc(ff,'I',len(ff)*3,'SCALAR',5125)
            meshids[mk]=len(doc['meshes']);doc['meshes'].append({'name':key,'primitives':[{'attributes':{'POSITION':pos},'indices':ix,'material':mats[col]}]})
        # FreeCAD Euler application order matches qz*qy*qx.
        rx,ry,rz=[math.radians(a)/2 for a in inst['rot']];cx,cy,cz=math.cos(rx),math.cos(ry),math.cos(rz);sx,sy,sz=math.sin(rx),math.sin(ry),math.sin(rz)
        quat=[sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz]
        idx=len(doc['nodes']);doc['nodes'][0]['children'].append(idx);doc['nodes'].append({'name':inst['name'],'mesh':meshids[mk],'translation':[a/1000 for a in inst['pos']],'rotation':quat})
    doc['buffers']=[{'byteLength':len(buf)}];js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);buf+=b'\0'*((-len(buf))%4)
    total=12+8+len(js)+8+len(buf)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(buf),b'BIN\0')+buf)

def common_parts():
    register('608-bearing',ring(11,4,7),'hardware','608-2RS bearing, 8 × 22 × 7 mm; purchased.')
    for length in (10,12): register(f'bearing-inner-spacer-{length}',ring(6,4.1,length),'hardware',f'{length} mm metal inner-race spacer, 12 mm OD / 8.2 mm bore; keeps bearing inner races clamped while rotor spins.')
    register('guide-standoff',ring(3,1.7,70),'hardware','70 mm M3 guide-island standoff, 6 mm outside diameter; flush countersunk top fastener. Four support the central stationary island.')
    register('M8-mast',cyl(4,500),'hardware','M8 threaded rod, cut to 500 mm; nuts below and above each plate.')
    register('M8-axle',cyl(4,96),'hardware','Stationary 8 mm axle; use smooth bearing seats and end retention.')
    register('M8-nut',polygon([(7.5*math.cos(TAU*i/6),7.5*math.sin(TAU*i/6)) for i in range(6)],6).cut(cyl(4.1,6)),'hardware','M8 nut envelope; threads omitted.')
    register('M8-washer',ring(8,4.2,1.5),'hardware','M8 washer.')
    register('axle-spacer',ring(6,4.2,32),'printed','32 mm axle spacer below lower bearing; check axial stack.',True)
    register('foot',holes(box(-14,-14,0,28,28,20),[(0,0)],4.3),'printed','Foot for M8 mast; TPU or PETG with rubber pad.',True)
    register('carrier-body',cyl(11,4).fuse(cyl(2.4,7.5,0,0,-7.5)).fuse(cyl(6,3,0,0,-10.5)).fuse(cyl(4,8,0,0,-18.5)).cut(cyl(1.7,30,0,0,-1)), 'experimental','Provisional carrier: 4.8 mm track neck, 8 mm horn pin, 12 mm retaining disk. Single-pin geometry does not yet guarantee track selection.',True)
    spool=cyl(13,2).fuse(cyl(5,38,0,0,2)).fuse(cyl(13,2,0,0,40)).cut(cyl(3.2,44,0,0,-1))
    register('bobbin',spool,'printed','26 mm flange diameter; 42 mm height; 6.4 mm spindle bore. Print with support under upper flange or split and glue.',True)
    register('bobbin-spindle',cyl(3,58),'hardware','M6 smooth-shank spindle; carrier mounting requires M3-to-M6 stud adapter shown.')
    register('spindle-adapter',cyl(5,8).cut(cyl(1.7,4)).cut(cyl(3.1,4,0,0,4)),'printed','Bonded M3/M6 stud adapter prototype; check concentricity and retention.',True)
    # Offset post leaves an unobstructed approach to the ceramic eye. The old
    # central post at a 9 mm radius intersected both 13 mm bobbin flanges.
    eye=box(-3,-8,0,6,11,3).fuse(box(-1.5,-8,3,3,3,51)).fuse(box(-1.5,-8,54,3,8,4)).fuse(cyl(5,4,0,0,54)).cut(cyl(2,4,0,0,54))
    register('yarn-eye-post',eye,'experimental','Offset 58 mm post with open yarn approach, mounted 17 mm behind carrier tangent. Guide support and fasteners remain prototype details.',True)
    arm=box(0,-5,0,20,10,3).cut(cyl(5.2,3))
    register('yarn-guide-arm',arm,'experimental','3 mm cantilever for trailing guide post, resting on carrier body. Prototype joint needs positive fastener and stiffness qualification.',True)
    register('tension-washer',ring(7,3.2,1),'hardware','Felt friction washer; spring + nut set bobbin drag. No active tension regulation.')
    register('spring-envelope',ring(4.5,3.3,7),'hardware','Compression spring envelope (not a printable spring).')
    register('yarn-package',ring(11,5,35),'yarn','Illustrative yarn package; not a fabricated part.')
    motor=box(-21,-21,0,42,42,40).fuse(cyl(11,2,0,0,40)).fuse(cyl(2.5,22,0,0,42))
    register('NEMA17',motor,'hardware','Reference NEMA17: 42 mm body, 31 mm bolt pattern, 5 mm shaft. Check purchased motor drawing.')
    pin=gear(20,2,8,2.6).fuse(cyl(8,8,0,0,8).cut(cyl(2.6,8,0,0,8)))
    pin=pin.cut(Part.makeCylinder(1.3,10,V(0,0,12),V(1,0,0)))
    register('drive-pinion',pin,'printed','20-tooth module-2 pinion; 5.2 mm bore; drill/tap radial M3 grub screw.',True)
    cap=ring(20,2.6,20).fuse(ring(22,2.6,2)).fuse(ring(22,2.6,2).translated(V(0,0,18)))
    cap=cap.cut(Part.makeCylinder(1.3,24,V(0,0,10),V(1,0,0)))
    register('capstan',cap,'printed','40 mm nominal roller, add thin silicone sleeve and measure effective diameter; radial M3 grub screw.',True)
    register('idler',ring(18,11.1,20),'printed','36 mm idler with two 608 bearings. Adjustable nip via horizontal mounting slot.',True)
    register('esp32',box(-14,-26,0,28,52,3).fuse(box(-9,-24,3,18,22,3)),'electronics','ESP32-WROOM DevKit reference envelope, not a PCB design.')
    register('driver',box(-8,-10,0,16,20,2).fuse(box(-5,-5,2,10,10,8)),'electronics','DRV8825 carrier + heatsink envelope.')
    register('electronics-tray',box(-66,-39,0,132,78,3).fuse(box(-66,-39,3,3,78,20)).fuse(box(63,-39,3,3,78,20)).fuse(box(-66,36,3,132,3,20)).fuse(box(-66,-39,3,132,3,20)),'printed','Open electronics tray. Drill board-specific mounting and cable holes; add lid before operation.',True)
    laser('upper-frame',rect(-190,-190,380,380),[rect(-148,-148,296,296)]+[(x,y,4.3) for x in (-160,160) for y in(-160,160)]+[(x,y,2.2) for x in(-174,174) for y in(-25,25)],6,'Upper frame, 6 mm plywood.')
    laser('takeup-bridge',rect(-190,-35,380,70),[(x,y,2.2) for x in(-174,174) for y in(-25,25)]+[(0,0,7)]+[(x,y,2.2) for x in(-44,44) for y in(13,31)],6,'Take-up bridge, 6 mm plywood; central yarn clearance.')
    laser('motor-riser',rect(-33,-33,66,66),[(0,0,11.2)]+[(x,y,1.7) for x in(-15.5,15.5) for y in(-15.5,15.5)]+[(x,y,2.2) for x in(-26,26) for y in(-26,26)],6,'Drive motor mounting plate; four 34 mm M4 standoffs from base top.')
    laser('takeup-face',rect(-56,0,112,80),[(20,43,11.2)]+[(20+x,43+y,1.7) for x in(-15.5,15.5) for y in(-15.5,15.5)]+[rect(-26,38.8,16,8.4)]+[(x,8,2.2) for x in(-44,44)],6,'Vertical take-up face: 31 mm NEMA17 pattern; adjustable 8 mm idler axle slot. Requires two angle brackets.')
    # T-shaped guide supported by two rear mast rods.
    outline=[(-178,148),(-12,148),(-12,-18),(12,-18),(12,148),(178,148),(178,172),(-178,172)]
    laser('forming-guide',outline,[(0,0,6),(-160,160,4.3),(160,160,4.3)],6,'Forming guide support; insert a smooth ceramic eye or PTFE bush. 12 mm clearance hole.')
    # Tolerance coupon: hole sizes, track-neck slots, bearing holes.
    laser('fit-coupon',rect(0,0,130,65),[(15+25*i,18,r) for i,r in enumerate([4.0,4.1,4.2,4.3])]+[(20,46,11.0),(49,46,11.1),(78,46,11.2)]+[rect(104,8,5.2,18),rect(116,8,5.6,18)],6,'Cut this first. Nominal axle, bearing and track fits; compensate measured laser kerf in CAM.')

def build(n):
    global instances
    instances=[];g=n//2;R=PITCH/math.sin(math.pi/g);centers=[(R*math.cos(TAU*i/g),R*math.sin(TAU*i/g)) for i in range(g)];driveX=R+60
    support_radius=math.sqrt(2)*8 if n==8 else R-50
    guide_supports=[(support_radius*math.cos(math.pi/4+i*math.pi/2),support_radius*math.sin(math.pi/4+i*math.pi/2)) for i in range(4)]
    baseholes=[(0,0,6 if n==8 else 12)]+[(x,y,1.7) for x,y in guide_supports]+[(x,y,4.3) for x in(-160,160) for y in(-160,160)]+[(x,y,4.2) for x,y in centers]+[rect(driveX-22,-22,44,44)]+[(driveX+x,y,2.2) for x in(-26,26) for y in(-26,26)]
    laser(f'base-{n}',rect(-210,-190,420,380),baseholes,6,f'{n}-strand base; 6 mm birch plywood; 420 × 380 mm.')
    add(f'base-{n}','01 / Foundation',group='frame')
    # Track plate and islands generated from exact circular-slot booleans.
    track=box(-170,-170,0,340,340,6)
    for x,y in centers:track=track.cut(ring(PITCH+TRACK_W/2,PITCH-TRACK_W/2,6).translated(V(x,y,0)))
    track=holes(track,[(-160,-160),(-160,160),(160,-160),(160,160)],4.3)
    track=holes(track,centers,4.2)
    track=track.cut(cyl(max(6,R-PITCH-16),6))
    track=holes(track,guide_supports,1.7)
    for x,y in guide_supports: track=track.cut(Part.makeCone(1.7,3.3,1.6,V(x,y,4.4)))
    tk=f'track-study-{n}'
    register(tk,track,'experimental','Nominal circular-slot study with separate axle-supported islands. Carrier branch selection at handoffs is unresolved; not released for powered use.')
    for x,y in guide_supports: add('guide-standoff','Central guide support',(x,y,6),'hardware',(0,0,30))
    add(tk,'04 / Track plate + supported islands',pos=(0,0,76),group='track',explode=(0,0,95))
    # Export each connected planar solid as a closed laser outline; no overlapping cuts.
    svg=[]; dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES']
    for face in track.Faces:
        if abs(face.CenterOfMass.z)<1e-5:
            for wire in face.Wires:
                pts=wire.discretize(Deflection=.025)
                coords=[(p.x+170,p.y+170) for p in pts]
                svg.append('<path d="M '+' L '.join(f'{x:.5f},{y:.5f}' for x,y in coords)+' Z"/>')
                for (x,y),(xx,yy) in zip(coords,coords[1:]+coords[:1]):
                    if abs(x-xx)+abs(y-yy)<1e-8:continue
                    dxf+=['0','LINE','8','EXPERIMENTAL_CUT','10',str(x),'20',str(y),'11',str(xx),'21',str(yy)]
    (ROOT/'fabrication/laser'/f'{tk}.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="340mm" height="340mm" viewBox="0 0 340 340"><title>EXPERIMENTAL track: handoff guidance unresolved</title><g fill="none" stroke="#ff0000" stroke-width="0.05">'+''.join(svg)+'</g></svg>')
    (ROOT/'fabrication/laser'/f'{tk}.dxf').write_text('\n'.join(dxf+['0','ENDSEC','0','EOF'])+'\n')
    gearphase=hornphase=0
    for i,(x,y) in enumerate(centers):
        if i:
            beta=TAU*(i-1)/g+math.pi/2+math.pi/g
            gearphase=(2*beta-math.pi+math.pi/TEETH-gearphase)%(TAU/TEETH)
            hornphase=(2*beta+math.pi-hornphase)%(math.pi/2)
        gr=rotate_shape(gear(),gearphase+(-1)**i*INITIAL_PHASE).translated(V(0,0,8))
        hub=ring(19,11.1,24)
        horn=cyl(39.5,6,z=24).cut(cyl(7,6,z=24))
        for j in range(4):
            a=hornphase+(-1)**i*INITIAL_PHASE+j*math.pi/2;horn=horn.cut(cyl(4.3,6,PITCH*math.cos(a),PITCH*math.sin(a),24))
        rotor=gr.fuse(hub).fuse(horn)
        rk=f'rotor-{n}-{i+1:02}'
        register(rk,rotor,'experimental',f'Module 2 / 40 teeth rotor {i+1}; integral four-horn disk and two 608 seats. Individual gear/horn phasing for {n}-strand study; loading not validated.',True)
        add(rk,f'03 / Rotor {i+1}',(x,y,40),'drive',(x*.2,y*.2,48))
        add('M8-axle',f'Axle {i+1}',(x,y,-2),'hardware',(x*.1,y*.1,0))
        add('axle-spacer',f'Axle spacer {i+1}',(x,y,8),'hardware',(0,0,12))
        for zz in (40,57):add('608-bearing',f'Rotor bearing {i+1}',(x,y,zz),'hardware',(x*.2,y*.2,40))
        add('bearing-inner-spacer-10',f'Inner-race spacer {i+1}',(x,y,47),'hardware',(x*.2,y*.2,40))
        add('bearing-inner-spacer-12',f'Upper inner-race spacer {i+1}',(x,y,64),'hardware',(x*.2,y*.2,70))
        add('M8-nut',f'Island retainer {i+1}',(x,y,82),'hardware',(x*.2,y*.2,98))
        # Ideal circular-path loading checked over eight rotor revolutions.
        for j in range(4):
            slot=i*4+j
            if slot not in LOADINGS[n]:continue
            a=hornphase+(-1)**i*INITIAL_PHASE+j*math.pi/2;cx=x+40*math.cos(a);cy=y+40*math.sin(a)
            k=LOADINGS[n].index(slot)
            beta_next=TAU*i/g+math.pi/2+math.pi/g;beta_prev=TAU*i/g-math.pi/2-math.pi/g
            direction='CCW' if ((beta_next-a)*(-1)**i)%TAU < ((beta_prev-a)*(-1)**i)%TAU else 'CW'
            col='#51d5d3' if direction=='CCW' else '#f0b467';ex=(cx*.48,cy*.48,156)
            start=len(instances)
            add('carrier-body',f'05 / Carrier {k+1}',(cx,cy,82.5),'carriers',ex)
            add('spindle-adapter',f'Spindle adapter {k+1}',(cx,cy,86.5),'carriers',ex)
            add('bobbin-spindle',f'Bobbin spindle {k+1}',(cx,cy,90.5),'carriers',ex)
            add('bobbin',f'06 / Bobbin {k+1}',(cx,cy,95),'bobbins',(ex[0],ex[1],210),color=col)
            add('yarn-package',f'Yarn {k+1}',(cx,cy,98),'yarn',(ex[0],ex[1],210),color=col)
            add('tension-washer',f'Felt brake {k+1}',(cx,cy,94),'bobbins',(ex[0],ex[1],200))
            add('spring-envelope',f'Tension spring {k+1}',(cx,cy,137),'bobbins',(ex[0],ex[1],225))
            guide_angle=a+(-1)**i*math.pi/2+math.pi
            add('yarn-guide-arm',f'Guide arm {k+1}',(cx,cy,86.5),'carriers',ex,rot=(0,0,math.degrees(guide_angle)))
            add('yarn-eye-post',f'Guide post {k+1}',(cx+17*math.cos(guide_angle),cy+17*math.sin(guide_angle),89.5),'carriers',ex,rot=(0,0,math.degrees(guide_angle)))
            for inst in instances[start:]: inst.update(carrier=k,slot=slot,carrierOrigin=[cx,cy],carrierAngle=a,carrierDirection=direction)
    for x in(-160,160):
        for y in(-160,160):
            add('M8-mast','02 / Threaded mast',(x,y,-4),'frame',(x*.22,y*.22,0))
            add('foot','Foot',(x,y,-24),'frame',(x*.22,y*.22,-20))
            for zz in(-6,6,68.5,82,462.5,476):add('M8-nut','Mast nut',(x,y,zz),'hardware',(x*.22,y*.22,0 if zz<100 else 290))
    add('NEMA17','Drive motor',(driveX,0,0),'drive',(75,0,0))
    add('motor-riser','Drive motor riser',(driveX,0,40),'drive',(75,0,25))
    add('drive-pinion','20T drive pinion',(driveX,0,48),'drive',(75,0,45),rot=(0,0,math.degrees(-math.pi/20-2*INITIAL_PHASE)))
    add('forming-guide','07 / Forming eye support',(0,0,380),'takeup',(0,0,250))
    add('upper-frame','08 / Upper frame',(0,0,470),'takeup',(0,0,290))
    add('takeup-bridge','09 / Take-up bridge',(0,0,476),'takeup',(0,0,310))
    # Plate local XY mapped into XZ, thickness toward negative Y.
    add('takeup-face','10 / Motor and idler face',(0,26,482),'takeup',(0,0,335),rot=(90,0,0))
    add('NEMA17','Take-up motor',(20,66,525),'takeup',(0,0,345),rot=(90,0,0))
    add('capstan','11 / Driven capstan',(20,-10,525),'takeup',(15,-35,345),rot=(-90,0,0))
    add('idler','12 / Adjustable idler',(-19,-10,525),'takeup',(-15,-35,345),rot=(-90,0,0))
    for yy in(-10,3):add('608-bearing','Idler bearing',(-19,yy,525),'takeup',(-15,-35,345),rot=(-90,0,0))
    add('electronics-tray','13 / Control tray',(75,-137,6),'electronics',(90,-80,0))
    add('esp32','ESP32 controller',(35,-137,12),'electronics',(90,-80,18))
    for xx in(85,115):add('driver','DRV8825 stepper driver',(xx,-137,12),'electronics',(90,-80,18))
    assembly=list(instances)
    doc=App.newDocument(f'Braidbench{n}')
    for i,inst in enumerate(assembly):
        ob=doc.addObject('Part::Feature',f'Component{i:03}');ob.Label=inst['name'];ob.Shape=relocated(lib[inst['part']]['shape'],inst['pos'],inst['rot'])
        ob.addProperty('App::PropertyString','Fabrication');ob.Fabrication=lib[inst['part']]['category']
        ob.addProperty('App::PropertyString','Notes');ob.Notes=lib[inst['part']]['description']
    doc.recompute();doc.saveAs(str(ROOT/'cad'/f'braidbench-{n}.FCStd'));Part.export(doc.Objects,str(ROOT/'cad'/f'braidbench-{n}.step'));App.closeDocument(doc.Name)
    glb_export(ROOT/'models'/f'braidbench-{n}.glb',assembly)
    (ROOT/'models'/f'assembly-{n}.json').write_text(json.dumps({'strands':n,'gears':g,'centerRadius':R,'initialPhase':INITIAL_PHASE,'loading':LOADINGS[n],'instances':assembly},separators=(',',':')))
    counts={}
    for a in assembly:counts[a['part']]=counts.get(a['part'],0)+1
    for key,qty in counts.items():rows.append([n,key,qty,lib[key]['category'],lib[key]['description']])
    print(f'Built {n} strand study: {len(assembly)} components',flush=True)

if __name__=='__main__':
    common_parts()
    for n in (8,12,16):build(n)
    (ROOT/'models/parts.json').write_text(json.dumps({key:{k:v for k,v in info.items() if k!='shape'} for key,info in lib.items()},separators=(',',':')))
    with (ROOT/'fabrication/model-parts.csv').open('w') as f:
        w=csv.writer(f);w.writerow(['configuration','part','model_quantity','process','notes']);w.writerows(rows)
    (ROOT/'docs/cad-validation.json').write_text(json.dumps(checks,indent=2))
    print(f'{len(lib)} valid CAD shapes exported. BREP validity is not physical validation.')
