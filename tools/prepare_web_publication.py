#!/usr/bin/env python3
"""Stage only public runtime, documentation and fabrication downloads."""
from pathlib import Path
import shutil,sys,json,hashlib,re
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/braidbench-webroot')
assert out.resolve()!=root
out.mkdir(parents=True,exist_ok=True)
files=[root/name for name in ['.htaccess','index.html','OPEN-MODEL.html','OPEN-TRANSFER-TEST.html','OPEN-TENSION-TEST.html','braidbench-design-package.zip']]
for folder in ['viewer','models','cad','fabrication','docs','social','share']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file() and not any(x.startswith('.') or x=='__pycache__' for x in p.relative_to(root).parts) and not p.name.endswith(('.FCBak','.pyc')))
# Include the illustrations actually used by the public documents.
for page in (root/'docs').glob('*.html'):
    for relative in re.findall(r'(?:src|href)="(\.\./previews/[^"?#]+)"',page.read_text()):files.append((page.parent/relative).resolve())
for source in sorted(set(files)):
    assert source.is_file(),source
    dest=out/source.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
record={'target':'https://meow-meow.io/braidbench/','files':[{ 'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(set(files))]}
(root/'publishing/web-files.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'files':len(record['files']),'bytes':sum(p['bytes'] for p in record['files']),'staged_at':str(out)}))
