#!/usr/bin/env python3
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
archive=root/'braidbench-design-package.zip'
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[]
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if k in ['href','src'] and v:self.links.append(v)
missing=[]
for html in [root/'index.html',*sorted(root.glob('OPEN-*.html')),*sorted((root/'docs').glob('*.html')),*sorted((root/'social').glob('*.html'))]:
 p=Links();p.feed(html.read_text())
 for link in p.links:
  u=urlparse(link)
  if u.scheme or link.startswith('#'):continue
  dest=(html.parent/unquote(u.path)).resolve()
  if dest==archive:continue
  if not dest.exists():missing.append(str(dest))
assert not missing,missing
for p in (root/'cad').glob('*.FCBak'):p.unlink()
files=[p for p in root.rglob('*') if p.is_file() and not any(s.startswith('.') or s in ['__pycache__','node_modules','publishing'] for s in p.relative_to(root).parts) and p!=archive and p.name not in ['manifest.json','package-validation.json'] and not p.name.startswith('publication-')]
manifest=[dict(path=str(p.relative_to(root)),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(files)]
(root/'manifest.json').write_text(json.dumps({'design_status':'geometrically checked braid reconstruction; finite-wire formation and visible payout/slack routes; physical carrier contact and tension hardware unresolved; public geometric study; physical qualification outstanding; see docs/mechanism-audit.html','units':'CAD/STL/SVG/DXF mm; GLB metres','files':manifest},indent=2)+'\n')
files.append(root/'manifest.json')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(files):z.write(p,str(p.relative_to(root)))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
report={'local_document_links':'pass','archive_crc':'pass','files':len(files),'archive_bytes':archive.stat().st_size}
(root/'docs/package-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
