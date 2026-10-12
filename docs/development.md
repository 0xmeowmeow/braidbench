# Development record · 12 October 2026

The braid geometry is inspectable and checked at the stated scopes. The complete physical braider remains a development project. The next work separates carrier routing from supply tension so each can be measured before integration.

## Completed in this update

- Created and pushed `0xmeowmeow/braidbench` on GitHub, private by default.
- Exported two 18-second, 1080 × 1920 captioned MP4s from deterministic frames of the actual viewer: tabletop and 576-wire industrial. Both decode cleanly. SRT captions, posters, source hashes and the exporter are included in `social/`.
- Added an original 60° carrier-guidance coupon: laser-cut base/track/cover, pointed and round printed feet, handle, STEP and editable FreeCAD assembly.
- Added an interactive contact experiment. The centre-turn stops the pointed shoe at 2.1698°; the round control reaches 60°. Browser polygon intersections and actual CAD agree at 126 sampled poses. A straight traverse is checked separately. This does not qualify a curved horn-disk handoff.
- Added a bobbin/dancer calibration board: laser-cut board, printed mounts, slider, pulleys, bobbin and eye holder, specified bearings/rods/axles, STEP and editable FreeCAD assembly.
- Checked all 30 represented calibration-board solids across 41 dancer heights: 2,379 BREP pair checks, zero overlap. Fastener detail, mass, package fit and real tolerances remain outside that result.
- Added ideal tension and storage controls: changing package radius exposes the torque/tension mismatch; 40 mm dancer travel stores 80 mm of material. Added an unfilled measurement worksheet.
- Added standalone offline files for both experiments, mobile layouts, browser checks, and links from the main model and build guide.

## Next actions and acceptance evidence

| Next action | Depends on | Evidence needed before completion |
|---|---|---|
| Make the straight-crossing coupon and record fit | Laser kerf and printed dimensions | Free straight travel in both directions; recorded turn/lift/snags for both feet. The virtual result is a comparison, not a substitute for this test. |
| Design a coupled curved track, shoe and horn drive for two neighbouring rotors | Carrier geometry and a manufacturable clearance choice | The outgoing branch must follow contact constraints, including retention and transfer timing, rather than a prescribed animation. Check unintended branches and adjacent-carrier interference. |
| Make and calibrate the upright tension board | Measured bearing/rod fits, chosen spring and force gauge | Starting/running pull versus package radius; upward/downward dancer force; measured total moving mass and hysteresis. Enter data in `fabrication/experiments/tension/measurements.csv`. |
| Design automatic brake release or regulation | Measured brake and dancer behaviour | Repeated payout stays within the dancer travel without slack or stop contact. A fixed felt brake alone does not establish this. |
| Integrate detailed supply hardware on a moving carrier | Qualified transfer and measured supply hardware | STEP/STL/BOM/viewer agree, full assembly contact/clearance and fastener retention are checked, hand-driven cycle passes. |
| Bench-test ESP32 and drive electronics | Qualified hand mechanism, actual drivers/motors | Verify enable polarity, stop chain, pulse timing, homing and conservative speed settings on the bench. The existing starter firmware remains disabled for unqualified motion. |
| Braid physical samples and compare | Working hand mechanism and measured tension | Record material, pitch, force, defects and torsion; compare with the model and retain mismatches. |
| Publish the website | User review and deployment instruction | Review the current model and its evidence limits; GitHub publication does not deploy the site. |

The two bench assemblies are independent development instruments. Their parts are deliberately stored in `fabrication/experiments/`; they do not silently replace the main machine's unfinished carrier hardware.

## Reproduce the new checks

Run `npm run build`, `npm run test:experiments`, and `npm run test:experiments:browser` with the local server running. `CHROMIUM_PATH` can point to an installed Chromium executable.

With FreeCAD's Python modules available, run `python3 tools/check_transfer_solids.py` after the contact check, and `python3 tools/check_tension_solids.py`. The generators are `tools/generate_transfer_test.py` and `tools/generate_tension_test.py`; they currently use the Linux FreeCAD module path `/usr/lib/freecad/lib`.

Reports: `docs/transfer-{cad,contact,browser}-validation.json` and `docs/tension-{cad,assembly,mechanics,browser}-validation.json`. These are nominal geometric and software checks. Physical results remain unmeasured.
