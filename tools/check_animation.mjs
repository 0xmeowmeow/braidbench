import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createCarrierMotion, carrierPartPose, wrapPhase} from '../viewer/motion.mjs';

const reports = [];
const epsilon = 1e-7;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

for (const strands of [8, 12, 16, 48, 72]) {
  const assembly = JSON.parse(await readFile(new URL(`../models/${strands<20?"assembly":"industrial-motion"}-${strands}.json`, import.meta.url)));
  const motion = createCarrierMotion(assembly);
  const movingParts = assembly.instances.filter(part => part.carrier !== undefined);
  let maxJump = 0, maxYawJump = 0;

  // Check the actual offset guide posts as well as bobbin centres, including
  // both sides of every handoff and loop reset. Centre-only checks miss flips.
  const boundaries = [...new Set(motion.events.map(event => event[0])), 0, motion.period, 2 * motion.period];
  for (const boundary of boundaries) {
    const before = motion.posesAt(boundary - epsilon);
    const after = motion.posesAt(boundary + epsilon);
    for (const part of movingParts) {
      const left = carrierPartPose(part, before[part.carrier]);
      const right = carrierPartPose(part, after[part.carrier]);
      const jump = distance(left, right), yawJump = angleDistance(left.yaw, right.yaw);
      maxJump = Math.max(maxJump, jump);
      maxYawJump = Math.max(maxYawJump, yawJump);
      assert(jump < 0.0001, `${strands}: ${part.name} jumps ${jump} mm at ${boundary}`);
      assert(yawJump < 0.000001, `${strands}: ${part.name} flips ${yawJump} rad at ${boundary}`);
    }
  }

  const rest = motion.posesAt(0);
  for (const part of movingParts) {
    const pose = carrierPartPose(part, rest[part.carrier]);
    assert(Math.hypot(pose.x - part.pos[0], pose.y - part.pos[1]) < 1e-9, 'Rest pose must match CAD');
    assert(angleDistance(pose.yaw, part.rot[2] * Math.PI / 180) < 1e-9);
  }

  // Vary step size / playback speed across two full circuits. Same physical
  // progress must give the same pose, even when a frame crosses the loop seam.
  const frames = 2000;
  for (const speed of [0.25, 0.5, 1, 2, 4]) {
    const dt = (motion.period * 2 + 0.37) / (frames * 0.25 * speed);
    let phase = 0;
    for (let frame = 0; frame < frames; frame++) phase = wrapPhase(phase + dt * 0.25 * speed, motion.period);
    const actual = motion.posesAt(phase), expected = motion.posesAt(0.37);
    actual.forEach((pose, i) => assert(distance(pose, expected[i]) < 1e-7));
  }
  reports.push({strands, circuit_rotor_degrees: motion.period * 180 / Math.PI,
    transfer_events: motion.events.length, maximum_boundary_displacement_mm: maxJump,
    maximum_boundary_yaw_change_radians: maxYawJump, tested_speeds: [0.25, 0.5, 1, 2, 4]});
  console.log(`${strands} strands: all ${motion.events.length} transfers and loop seams continuous; full circuit ${motion.period / Math.PI}π`);
}
await writeFile(new URL('../docs/animation-validation.json', import.meta.url), JSON.stringify({
  scope: 'Viewer animation continuity, including off-centre guide posts; not physical transfer validation',
  results: reports,
}, null, 2) + '\n');
