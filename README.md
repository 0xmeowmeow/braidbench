# Braidbench

[GitHub repository](https://github.com/0xmeowmeow/braidbench) · [Sharing videos and captions](social/README.md) · [Development status](docs/development.md)

**Mechanism study; not a qualified build.** The close-ups now show compact, solid strands and an exposed formation zone. Every wire retains its moving guide’s crossing partners and over/under order; finite-wire separation is checked in the output and continuously through formation. Payout, return pulleys and moving dancers remain visible. [The audit](docs/mechanism-audit.html) explains the evidence and the unresolved physical mechanism. Deployment is waiting for review.

Original braiding-machine engineering study: 8, 12 and 16 moving strands; laser-cut frame, printed rotors and carriers, ESP32 control.

**Open [OPEN-MODEL.html](OPEN-MODEL.html) in a browser** for the offline interactive model. Or run `./start.sh` and open http://localhost:8765. The viewer supports rotation, explosion, system isolation, part selection and ideal carrier motion with a live 0.25×–4× playback speed slider. The phase slider covers a full carrier circuit, with continuous handoffs and loop playback.

The **Industrial cable** axial maypole study uses phased spur gears and horn disks, and adds 48 / 72 carriers and 1 / 4 / 8 parallel wires per bobbin, with core supply, forming guide, haul-off and collection reel. Read [where the thread comes from](docs/industrial-braiding.html). This is explanatory viewer geometry, not an industrial fabrication design.

Read [the illustrated build guide](docs/build-guide.html) before fabrication. **The carrier's positive guidance at gear handoffs is unresolved.** These are prototype development files, not a qualified working-machine release. No physical build or ESP32 bench test has been performed.

- `cad/`: named FreeCAD solids and STEP assemblies for all three counts.
- `models/`: GLB scenes and viewer geometry.
- `fabrication/laser/`: nominal millimetre SVG/DXF parts, including a fit coupon. No kerf compensation; no sheet nesting.
- `fabrication/printed/`: candidate STL/STEP parts. Rotor station identity matters.
- `firmware/braidbench/`: conservative starter firmware; motion qualification flag defaults false.
- `tools/generate_cad.py`: parametric source. Requires FreeCAD Python modules.
- `docs/`: assembly, wiring, evidence limits and validation reports.
- `previews/`: assembled and exploded screenshots.

Assumptions: 600 × 400 mm laser bed, 220 × 220 mm printer, 0.45 mm tabletop strands and 0.16 mm industrial wires in the geometric model; actual material and hardware still require qualification. Flat 3/5/7-strand braids are described as a different-cartridge expansion; they have no fabrication CAD here.

Two separate bench experiments now make those questions testable:

- Open [OPEN-TRANSFER-TEST.html](OPEN-TRANSFER-TEST.html): compare a round foot with a pointed shoe at a 60° crossing. Real outline contact stops the requested rotation. Laser/print files, CAD and hand-test instructions are included.
- Open [OPEN-TENSION-TEST.html](OPEN-TENSION-TEST.html): vary package radius, brake torque, moving mass and dancer travel. Includes a printable/laser-cut calibration board and a blank measurement worksheet.

These are original development coupons, not replacement parts for the complete braider. The next integration step is a coupled curved-track/shoe/horn design and two-rotor hand test. The main animation still prescribes transfers.

Three.js is distributed under its included MIT license. Mechanism precedents and electronics sources are linked in the build guide; no third-party braider CAD is redistributed.

The guide post interference was corrected and all tabletop CAD formats regenerated. The ideal inlet-pulley, return-pulley, dancer, industrial turning-comb and swivel modules are viewer geometry, not exported fabrication parts. The 1 / 4 / 8 industrial end choices share the checked carrier-centre profile and line pitch. Tests: `node tools/check_animation.mjs`, `node tools/check_yarn.mjs`, `node tools/check_guide_clearance.mjs`, and (with FreeCAD) `python3 tools/check_guide_solids.py`.

The [geometry report](docs/geometry-validation.json) links all configuration checks and identifies the exact profile assets. [Reproduction notes](docs/validation-method.html) cover the topology comparison, continuous clearance bounds, supply routing, surface checks and offline build. Python geometry tools require NumPy and SciPy. No physical-force calibration, complete carrier-shoe design, full assembly interference qualification or real ESP32 bench test is claimed.

For development, install Node 20+ and Python 3, run `npm install`, then `npx playwright install chromium` for browser checks. `npm start` serves the viewer, `npm run build` refreshes the offline copy, and `npm test` checks carrier motion and material accounting. Geometry checks also need NumPy and SciPy; see the reproduction notes above.

`npm run test:experiments` checks the bench models' contact and length/force calculations. `npm run test:experiments:browser` checks their controls, mobile layouts and offline files. With FreeCAD installed, `python3 tools/check_transfer_solids.py` compares browser contact with the CAD, and `python3 tools/check_tension_solids.py` checks the represented tension-board solids across the used stroke. Run `node tools/check_transfer.mjs` first to produce its temporary CAD comparison poses.
