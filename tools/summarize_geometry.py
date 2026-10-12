#!/usr/bin/env python3
"""Collect completed, passing reports and identify their model/source assets."""
import hashlib,json
from pathlib import Path

root=Path(__file__).resolve().parents[1];rows=[]
def read(name):return json.loads((root/'docs/validation'/name).read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
for count in [8,12,16,48,72]:
    profile=root/f'models/braid-profile-{count}.json';data=json.loads(profile.read_text())
    for ends in ([1] if count<20 else [1,4,8]):
        key=str(count) if count<20 else f'{count}-{ends}'
        names={kind:f'{kind}-{key}.json' for kind in ['topology','output','formation-continuous','supply','surfaces']}
        reports={kind:read(name) for kind,name in names.items()}
        topology=reports['topology'];output=reports['output']['clearance'];formation=reports['formation-continuous'];supply=reports['supply'];surface=reports['surfaces']
        assert topology['all_sequences_match'] and topology['wires_checked']==count*ends
        assert output['minimum_surface_clearance_mm']>.001
        assert not formation['failures'] and formation['minimum_certified_surface_clearance_mm']>formation['numerical_clearance_reserve_mm']
        supply_bound=supply.get('sampled_surface_clearance_lower_bound_mm',supply['minimum_surface_clearance_mm'])
        assert supply_bound>.0003 and supply['every_carrier_checked']
        assert supply['nonlocal_self_exclusion_arclength_mm']==2*data['wireDiameter']
        assert surface['inverted']==surface['staticOutputInverted']==0
        rows.append({'carriers':count,'ends_per_carrier':ends,'wires':count*ends,'wire_diameter_mm':data['wireDiameter'],'formation_keyframes':data['formation']['frames'],'profile':str(profile.relative_to(root)),'profile_sha256':digest(profile),'individual_crossing_sequences':'all match the actual guides','output_minimum_surface_clearance_mm':output['minimum_surface_clearance_mm'],'formation_continuous_lower_bound_mm':formation['minimum_certified_surface_clearance_mm'],'formation_observed_minimum_surface_clearance_mm':formation['minimum_observed_surface_clearance_mm'],'sampled_supply_clearance_lower_bound_mm':supply_bound,'inverted_surface_triangles':surface['inverted']+surface['staticOutputInverted'],'reports':{kind:{'path':'docs/validation/'+name,'sha256':digest(root/'docs/validation'/name)} for kind,name in names.items()}})
sources=[*root.glob('models/assembly-*.json'),*root.glob('models/industrial-motion-*.json'),*root.glob('viewer/*.mjs'),root/'viewer/app.js',*root.glob('tools/*.py'),*root.glob('tools/*.mjs'),*root.glob('tools/*.cjs')]
auxiliary=[root/'docs'/name for name in ['animation-validation.json','yarn-validation.json','output-identity-validation.json','supply-solid-validation.json','render-validation.json','software-validation.json','offline-validation.json']]
result={'status':'All nine displayed configurations pass the stated geometric checks','configurations':rows,'sources':{str(p.relative_to(root)):digest(p) for p in sorted(set(sources))},'additional_reports':{str(p.relative_to(root)):digest(p) for p in auxiliary},'method':'docs/validation-method.html','limits':['Geometric reconstruction and finite-wire separation, not calibrated material forces.','Continuous bounds cover different-wire and core separation through formation. Supply routing and surface orientation use sampled checks.','No complete self-contact, torsion, differential multi-end elasticity, winding-depletion or hardware-interference qualification.','Carrier shoe/transfer and physical brake/dancer details remain incomplete; no physical build or deployment is established by these reports.']}
(root/'docs/geometry-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'Collected {len(rows)} passing configurations; exact assets and report hashes recorded.')
