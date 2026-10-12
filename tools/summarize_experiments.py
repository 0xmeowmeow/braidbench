#!/usr/bin/env python3
"""Identify the exact independently checked bench-experiment assets."""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1]
reports=['transfer-cad-validation.json','transfer-contact-validation.json','transfer-browser-validation.json','tension-cad-validation.json','tension-assembly-validation.json','tension-mechanics-validation.json','tension-browser-validation.json','experiment-offline-validation.json']
paths=[root/'docs'/name for name in reports]
for path in paths:
    data=json.loads(path.read_text())
    assert data.get('status')!='fail',path
    assert not data.get('page_errors') and not data.get('failures') and not data.get('mismatches'),path
paths.extend(p for p in (root/'fabrication/experiments').rglob('*') if p.is_file() and not p.name.endswith('.FCBak'))
paths.extend(root/p for p in ['viewer/transfer-contact.mjs','viewer/transfer-lab.mjs','viewer/tension-mechanics.mjs','viewer/tension-lab.mjs','models/transfer-test.json','models/tension-test.json'])
record={'status':'Nominal bench experiments checked; physical calibration outstanding','scope':'The independent transfer coupon and tension board only, not the full braider.','assets':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}}
(root/'docs/experiment-validation.json').write_text(json.dumps(record,indent=2)+'\n')
print(f'Identified {len(paths)} bench-experiment reports and assets.')
