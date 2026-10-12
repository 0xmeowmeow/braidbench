#!/usr/bin/env python3
"""Re-export ordered track contours from the saved CAD. Never join unoriented edges."""
import sys
from pathlib import Path
sys.path.insert(0,'/usr/lib/freecad/lib')
import FreeCAD as A,Part
root=Path(__file__).resolve().parents[1]
for n in [8,12,16]:
 d=A.openDocument(str(root/f'cad/braidbench-{n}.FCStd'));track=next(o.Shape for o in d.Objects if 'Track plate' in o.Label)
 svg=[];dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES']
 for face in track.Faces:
  if abs(face.CenterOfMass.z-76)<1e-5:
   for wire in face.Wires:
    pts=wire.discretize(Deflection=.025)
    coords=[(p.x+170,p.y+170) for p in pts]
    svg.append('<path d="M '+' L '.join(f'{x:.5f},{y:.5f}' for x,y in coords)+' Z"/>')
    for (x,y),(xx,yy) in zip(coords,coords[1:]+coords[:1]):
     if abs(x-xx)+abs(y-yy)<1e-8:continue
     dxf+=['0','LINE','8','EXPERIMENTAL_CUT','10',str(x),'20',str(y),'11',str(xx),'21',str(yy)]
 key=f'track-study-{n}'
 (root/f'fabrication/laser/{key}.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="340mm" height="340mm" viewBox="0 0 340 340"><title>EXPERIMENTAL track: handoff guidance unresolved</title><g fill="none" stroke="#ff0000" stroke-width="0.05">'+''.join(svg)+'</g></svg>')
 (root/f'fabrication/laser/{key}.dxf').write_text('\n'.join(dxf+['0','ENDSEC','0','EOF'])+'\n')
 A.closeDocument(d.Name)
 print(key,'contours refreshed')
