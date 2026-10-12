#!/usr/bin/env python3
"""Bundle a self-contained viewer. Supply esbuild on PATH or as first argument."""
import json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
esbuild=sys.argv[1] if len(sys.argv)>1 else 'esbuild'
subprocess.run([esbuild,str(ROOT/'viewer/app.js'),'--bundle','--format=iife','--minify',
    '--alias:three='+str(ROOT/'viewer/vendor/three.module.js'),
    '--alias:three/addons/controls/OrbitControls.js='+str(ROOT/'viewer/vendor/OrbitControls.js'),
    '--outfile='+str(ROOT/'viewer/bundle.js')],check=True)
data={'profiles':{n:json.loads((ROOT/f'models/braid-profile-{n}.json').read_text()) for n in (8,12,16,48,72)},'industrial':{n:json.loads((ROOT/f'models/industrial-motion-{n}.json').read_text()) for n in (48,72)},'parts':json.loads((ROOT/'models/parts.json').read_text()),'assemblies':{n:json.loads((ROOT/f'models/assembly-{n}.json').read_text()) for n in (8,12,16)}}
html=(ROOT/'index.html').read_text();css=(ROOT/'viewer/style.css').read_text();js=(ROOT/'viewer/bundle.js').read_text()
html=html.replace('<link rel="stylesheet" href="viewer/style.css">','<style>'+css+'</style>')
start=html.index('<script type="importmap">');end=html.index('</script>',start)+len('</script>');html=html[:start]+html[end:]
html=html.replace('<script type="module" src="viewer/app.js"></script>','<script>window.BRAID_DATA='+json.dumps(data,separators=(',',':')).replace('</','<\\/')+';</script><script>'+js.replace('</','<\\/')+'</script>')
(ROOT/'OPEN-MODEL.html').write_text(html)
print(f'Offline viewer: {len(html.encode())/1024/1024:.2f} MiB')

# Bench experiments also have standalone, network-free review entry points.
for kind in ('transfer','tension'):
    lab=ROOT/f'docs/{kind}-lab.html'
    if not lab.exists():continue
    subprocess.run([esbuild,str(ROOT/f'viewer/{kind}-lab.mjs'),'--bundle','--format=esm','--minify','--alias:three='+str(ROOT/'viewer/vendor/three.module.js'),'--alias:three/addons/controls/OrbitControls.js='+str(ROOT/'viewer/vendor/OrbitControls.js'),'--outfile='+str(ROOT/f'viewer/{kind}-bundle.js')],check=True)
    text=lab.read_text();start=text.index('<script type="importmap">');end=text.index('</script>',start)+len('</script>');text=text[:start]+text[end:]
    # Resolve document-relative links before moving the document to the root.
    import re
    text=re.sub(r'href="([^"#:]+)"',lambda m:'href="'+(m[1][3:] if m[1].startswith('../') else 'docs/'+m[1])+'"' if not m[1].startswith(('http:','https:','data:')) else m[0],text)
    data=(ROOT/f'models/{kind}-test.json').read_text();js=(ROOT/f'viewer/{kind}-bundle.js').read_text()
    text=text.replace(f'<script type="module" src="../viewer/{kind}-lab.mjs"></script>','<script>window.'+kind.upper()+'_DATA='+data.replace('</','<\\/')+';</script><script type="module">'+js.replace('</','<\\/')+'</script>')
    (ROOT/f'OPEN-{kind.upper()}-TEST.html').write_text(text)
    print(f'Offline {kind} experiment built.')
