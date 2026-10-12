const TAU = Math.PI * 2;

export function wrapPhase(phase, period) {
  const remainder=phase%period;
  if(remainder>=0)return remainder;
  const wrapped=remainder+period;return wrapped>=period?0:wrapped;
}

export function createCarrierMotion(assembly) {
  const {gears, centerRadius, initialPhase, loading, instances} = assembly;
  // A carrier visits every rotor, alternating inner and outer arcs. Each pair
  // totals 2π: the whole arrangement repeats after gears / 2 rotor revolutions.
  const period = gears * Math.PI;
  const orbitRadius = assembly.orbitRadius ?? 40;
  const phases = assembly.rotorPhases ?? Array.from({length: gears}, (_, i) => {
    const carrier = instances.find(part => Math.floor(part.slot / 4) === i);
    return carrier.carrierAngle - (-1) ** i * initialPhase - (carrier.slot % 4) * Math.PI / 2;
  });
  const events = [];
  const turns = Math.ceil((initialPhase + period) / TAU) + 2;
  for (let i = 0; i < gears; i++) {
    const next = (i + 1) % gears;
    const tangent = TAU * i / gears + Math.PI / 2 + Math.PI / gears;
    for (let pocket = 0; pocket < 4; pocket++) {
      for (let turn = -turns; turn <= turns; turn++) {
        const absolutePhase = (tangent - phases[i] - pocket * Math.PI / 2 + turn * TAU) / (-1) ** i;
        const phase = absolutePhase - initialPhase;
        if (phase <= 1e-8 || phase > period + 1e-8) continue;
        const nextPocket = Math.round(wrapPhase(tangent + Math.PI - (-1) ** next * absolutePhase - phases[next], TAU) / (Math.PI / 2)) % 4;
        events.push([phase, i * 4 + pocket, next * 4 + nextPocket]);
      }
    }
  }
  events.sort((a, b) => a[0] - b[0]);

  function posesAt(phase) {
    const t = wrapPhase(phase, period);
    const tokens = Array.from({length: gears * 4}, (_, i) => i);
    for (const [eventPhase, a, b] of events) {
      if (eventPhase > t) break;
      [tokens[a], tokens[b]] = [tokens[b], tokens[a]];
    }
    const slots = [];
    tokens.forEach((token, slot) => { slots[token] = slot; });
    return loading.map(token => {
      const slot = slots[token], rotor = Math.floor(slot / 4), pocket = slot % 4;
      const direction = (-1) ** rotor;
      const radialAngle = phases[rotor] + direction * (t + initialPhase) + pocket * Math.PI / 2;
      const theta = rotor * TAU / gears;
      return {
        x: centerRadius * Math.cos(theta) + orbitRadius * Math.cos(radialAngle),
        y: centerRadius * Math.sin(theta) + orbitRadius * Math.sin(radialAngle),
        // The rotor-relative radius flips at a transfer; the path tangent does
        // not, because the receiving rotor turns in the opposite direction.
        heading: radialAngle + direction * Math.PI / 2,
      };
    });
  }
  return {period, events, posesAt, orbitRadius, centerRadius};
}

export function carrierPartPose(instance, pose) {
  const initialRotor = Math.floor(instance.slot / 4);
  const initialHeading = instance.carrierAngle + (-1) ** initialRotor * Math.PI / 2;
  const yaw = pose.heading - initialHeading;
  const ox = instance.pos[0] - instance.carrierOrigin[0];
  const oy = instance.pos[1] - instance.carrierOrigin[1];
  return {
    x: pose.x + ox * Math.cos(yaw) - oy * Math.sin(yaw),
    y: pose.y + ox * Math.sin(yaw) + oy * Math.cos(yaw),
    yaw: instance.rot[2] * Math.PI / 180 + yaw,
  };
}
