// Computer-generated reference sounds. They stand in for real recordings until enough are
// collected. Engines are built from their real firing angles, and engine-driven faults run
// at the speed of the part that causes them, so they change with the engine underneath.

import { bankGaps, engineById, ENGINES, pulseBoost } from './data/engines.js';
import { biquad, SAMPLE_RATE } from './features.js';

const TAU = Math.PI * 2;

function makeRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (low, high) => low + (high - low) * next() };
}

function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length) || 1;
}

function noiseBand(n, r, type, hz, q, level) {
  const white = new Float32Array(n);
  for (let i = 0; i < n; i++) white[i] = r.next() * 2 - 1;
  const filtered = biquad(white, type, hz, q);
  const gain = level / rms(filtered);
  for (let i = 0; i < n; i++) filtered[i] *= gain;
  return filtered;
}

function mix(out, source, gain = 1) {
  for (let i = 0; i < out.length; i++) out[i] += source[i] * gain;
  return out;
}

function shape(samples, gainAt) {
  for (let i = 0; i < samples.length; i++) samples[i] *= gainAt(i / SAMPLE_RATE);
  return samples;
}

/**
 * What one exhaust pulse sounds like coming out of each bank's pipe. The vehicle's own variation
 * is shared by both banks, so they differ only as much as `bankSpread` says. Otherwise a
 * perfectly even inline 6 would gain a false beat from its two banks not matching.
 */
function pulseKernels(r, { resonances, rasp, bankSpread = 0 }) {
  const length = Math.floor(0.05 * SAMPLE_RATE);
  const shared = resonances.map((hz, index) => ({
    hz: hz * r.range(0.96, 1.04),
    decay: [0.018, 0.009, 0.004][index],
    level: [1, 0.55, 0.28][index],
  }));
  const grit = new Float32Array(length);
  for (let i = 0; i < length; i++) grit[i] = r.next() * 2 - 1;

  return [-bankSpread, bankSpread].map((detune) => {
    const kernel = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      let value = rasp * Math.exp(-t / 0.006) * grit[i];
      for (const part of shared) {
        value += part.level * Math.exp(-t / part.decay) * Math.sin(TAU * part.hz * (1 + detune) * t);
      }
      kernel[i] = value;
    }
    return kernel;
  });
}

/**
 * A running engine. Each cylinder sends a pulse down its own bank's pipe at its real crank
 * angle, so evenness, lope and warble all come from the firing pattern.
 * `misfire` leaves out one cylinder's pulses, the way a real misfire does.
 */
function engineRun(n, r, engine, { rpm, level = 1, misfire = false } = {}) {
  const { firing, tract } = engine;
  const out = new Float32Array(n);
  const kernels = pulseKernels(r, tract);
  const bankGain = [1 - (tract.bankSpread ?? 0), 1 + (tract.bankSpread ?? 0)];
  const cylinderGain = firing.map(() => 1 + (tract.mistune ?? 0) * (r.next() * 2 - 1));
  const missing = Math.floor(r.next() * firing.length);

  const gaps = bankGaps(firing);
  const wanderHz = r.range(0.2, 0.5);
  const wanderPhase = r.next() * TAU;
  const degreesPerSecond = rpm * 6;
  const duration = n / SAMPLE_RATE;
  const clatter = tract.clatter ?? 0;
  const clatterHz = r.range(1500, 2800);

  for (let cycle = 0, cycleStart = -r.next() * 0.1; cycleStart < duration; cycle++) {
    firing.forEach((cylinder, index) => {
      if (misfire && index === missing && r.next() < 0.85) return;
      const speed = degreesPerSecond * (1 + 0.012 * Math.sin(TAU * wanderHz * cycleStart + wanderPhase));
      // Real combustion varies from one firing to the next, in both timing and strength.
      const jitter = r.range(-3.5, 3.5);
      const time = cycleStart + (cylinder.at + (cylinder.delay ?? 0) + jitter) / speed;
      if (time < 0 || time >= duration) return;

      const at = Math.floor(time * SAMPLE_RATE);
      const kernel = kernels[cylinder.bank];
      const boost = pulseBoost(tract, gaps[index]);
      const gain = 0.5 * level * cylinderGain[index] * bankGain[cylinder.bank] * boost * r.range(0.78, 1.22);
      const length = Math.min(kernel.length, n - at);
      for (let i = 0; i < length; i++) out[at + i] += gain * kernel[i];

      if (clatter > 0) {
        addClick(out, at, { hz: clatterHz * r.range(0.9, 1.1), decay: 0.004, amp: clatter * level, noisy: 0.6 }, r);
      }
    });
    cycleStart += 720 / degreesPerSecond;
  }

  // Valves, fans, belts and pumps under everything, because no engine is only exhaust pulses.
  // These levels were set so that the result matches the overall balance of real phone
  // recordings of running engines, which are far noisier than the exhaust alone.
  mix(out, noiseBand(n, r, 'bandpass', r.range(350, 700), 0.45, 0.075 * level));
  mix(out, noiseBand(n, r, 'bandpass', r.range(1500, 2600), 0.5, 0.035 * level));
  mix(out, noiseBand(n, r, 'highpass', 3500, 0.7, 0.012 * level));
  return mix(out, noiseBand(n, r, 'lowpass', 300, 0.7, 0.05 * level));
}

/**
 * What a phone hears. Phone microphones cut deep bass and lift the speech range, so a recording
 * of a V8 has far less low end than the V8 itself. Reference sounds pass through this so
 * they can be compared fairly with what a phone actually records.
 */
function phoneMicrophone(samples, r) {
  const cutoff = r.range(120, 200);
  const thin = biquad(biquad(samples, 'highpass', cutoff, 0.7), 'highpass', cutoff, 0.7);
  const presence = biquad(thin, 'bandpass', r.range(2000, 3500), 0.6);
  return mix(thin, presence, r.range(0.3, 0.8));
}

/** A sustained pitch with optional overtones and a little natural wobble. */
function tone(n, r, { hz, partials = [1], wobbleHz = 0, wobble = 0, sweep = 0 }) {
  const out = new Float32Array(n);
  let phase = r.next() * TAU;
  for (let i = 0; i < n; i++) {
    const progress = i / n;
    const current = hz * (1 + sweep * progress) * (1 + wobble * Math.sin((TAU * wobbleHz * i) / SAMPLE_RATE));
    phase += (TAU * current) / SAMPLE_RATE;
    let value = 0;
    for (let p = 0; p < partials.length; p++) value += partials[p] * Math.sin(phase * (p + 1));
    out[i] = value;
  }
  return out;
}

function addClick(out, at, { hz, decay, amp, noisy = 0 }, r) {
  const length = Math.min(Math.ceil(decay * SAMPLE_RATE * 7), out.length - at);
  for (let i = 0; i < length; i++) {
    const time = i / SAMPLE_RATE;
    const envelope = amp * Math.exp(-time / decay);
    const body = Math.sin(TAU * hz * time);
    out[at + i] += envelope * ((1 - noisy) * body + noisy * (r.next() * 2 - 1));
  }
}

/** Calls back at a steady rate, nudged by jitter (a fraction of the gap between hits). */
function everyBeat(n, r, rate, jitter, hit) {
  let time = r.next() / rate;
  const duration = n / SAMPLE_RATE;
  for (let index = 0; time < duration; index++) {
    hit(Math.floor(time * SAMPLE_RATE), index);
    time += (1 / rate) * (1 + jitter * (r.next() * 2 - 1));
  }
}

function clickTrain(out, r, rate, jitter, click) {
  everyBeat(out.length, r, rate, jitter, (at) => addClick(out, at, click, r));
  return out;
}

/** Gain that jumps up at each beat and then dies away. */
function burstEnvelope(n, r, rate, jitter, decay) {
  const envelope = new Float32Array(n);
  everyBeat(n, r, rate, jitter, (at) => {
    const length = Math.min(Math.ceil(decay * SAMPLE_RATE * 6), n - at);
    for (let i = 0; i < length; i++) {
      envelope[at + i] = Math.max(envelope[at + i], Math.exp(-i / SAMPLE_RATE / decay));
    }
  });
  return envelope;
}

const smoothGate = (time, rate, duty) => {
  const position = (time * rate) % 1;
  if (position > duty) return 0;
  return Math.sin((Math.PI * position) / duty) ** 0.5;
};

const roadNoise = (n, r, level) => noiseBand(n, r, 'lowpass', 350, 0.7, level);

/** A rate tied to the engine: 1 is once per crank turn, 0.5 is once per camshaft turn. */
const order = (rpm, multiple) => (rpm / 60) * multiple;

// Each recipe gets the sample count, a random source, the engine and its speed.
const RECIPES = {
  // Engine

  'healthy-engine': (n, r, engine, rpm) => engineRun(n, r, engine, { rpm }),

  'rod-knock': (n, r, engine, rpm) => clickTrain(
    engineRun(n, r, engine, { rpm, level: 0.45 }),
    r,
    order(rpm, 1),
    0.01,
    { hz: r.range(250, 450), decay: 0.018, amp: 1, noisy: 0.25 },
  ),

  'piston-slap': (n, r, engine, rpm) => clickTrain(
    engineRun(n, r, engine, { rpm, level: 0.6 }),
    r,
    order(rpm, 1),
    0.02,
    { hz: r.range(800, 1400), decay: 0.009, amp: 0.45, noisy: 0.5 },
  ),

  'lifter-tick': (n, r, engine, rpm) => clickTrain(
    engineRun(n, r, engine, { rpm, level: 0.65 }),
    r,
    order(rpm, 0.5),
    0.01,
    { hz: r.range(3000, 6000), decay: 0.005, amp: 0.5, noisy: 0.3 },
  ),

  'engine-misfire': (n, r, engine, rpm) => engineRun(n, r, engine, { rpm, misfire: true }),

  'spark-knock': (n, r, engine) => {
    const rpm = r.range(1800, 2600);
    const out = engineRun(n, r, engine, { rpm, level: 0.7 });
    const pingHz = r.range(5500, 7800);
    const firesPerSecond = order(rpm, engine.cylinders / 2);
    everyBeat(n, r, firesPerSecond, 0.02, (at) => {
      if (r.next() < 0.35) addClick(out, at, { hz: pingHz, decay: 0.003, amp: 0.4, noisy: 0.25 }, r);
    });
    return out;
  },

  'timing-chain-rattle': (n, r, engine, rpm) => clickTrain(
    engineRun(n, r, engine, { rpm, level: 0.6 }),
    r,
    order(rpm, r.range(2.5, 3.8)),
    0.5,
    { hz: r.range(1200, 2600), decay: 0.004, amp: 0.55, noisy: 0.5 },
  ),

  'vacuum-leak': (n, r, engine, rpm) => mix(
    engineRun(n, r, engine, { rpm, level: 0.75 }),
    noiseBand(n, r, 'highpass', r.range(2500, 4000), 0.7, 0.1),
  ),

  'diesel-injector-knock': (n, r, engine, rpm) => clickTrain(
    engineRun(n, r, engine, { rpm, level: 0.7 }),
    r,
    order(rpm, 0.5),
    0.01,
    { hz: r.range(1500, 3000), decay: 0.009, amp: 0.9, noisy: 0.45 },
  ),

  // Exhaust

  'exhaust-leak': (n, r, engine, rpm) => {
    const puffs = noiseBand(n, r, 'bandpass', r.range(900, 1800), 0.8, 0.5);
    const envelope = burstEnvelope(n, r, order(rpm, 0.5), 0.02, 0.025);
    for (let i = 0; i < n; i++) puffs[i] *= envelope[i];
    return mix(engineRun(n, r, engine, { rpm, level: 0.7 }), puffs);
  },

  'muffler-hole': (n, r, engine, rpm) => {
    const firingHz = order(rpm, engine.cylinders / 2);
    const roar = noiseBand(n, r, 'bandpass', r.range(160, 360), 0.45, 0.32);
    shape(roar, (t) => 0.7 + 0.3 * Math.sin(TAU * firingHz * t));
    return mix(engineRun(n, r, engine, { rpm, level: 1.1 }), roar);
  },

  'heat-shield-rattle': (n, r, engine, rpm) => {
    const buzzHz = order(rpm, engine.cylinders / 2) * r.range(1.6, 2.2);
    const burstHz = r.range(1, 2.5);
    const tin = noiseBand(n, r, 'bandpass', r.range(2500, 4500), 1.5, 0.28);
    shape(tin, (t) => (Math.sin(TAU * buzzHz * t) > 0.2 ? 1 : 0.05) * smoothGate(t, burstHz, 0.6));
    return mix(engineRun(n, r, engine, { rpm, level: 0.7 }), tin);
  },

  'catalytic-rattle': (n, r, engine, rpm) => {
    const rattle = new Float32Array(n);
    clickTrain(rattle, r, r.range(45, 85), 0.6, { hz: r.range(2500, 5000), decay: 0.0025, amp: 0.5, noisy: 0.75 });
    const burstHz = r.range(0.6, 1.4);
    shape(rattle, (t) => smoothGate(t, burstHz, 0.7));
    return mix(engineRun(n, r, engine, { rpm, level: 0.65 }), rattle);
  },

  // Belts and accessories

  'slipping-belt': (n, r, engine, rpm) => {
    const chirpHz = r.range(3, 6);
    const squeal = tone(n, r, {
      hz: r.range(1700, 2900),
      partials: [1, 0.5, 0.25],
      wobbleHz: r.range(5, 11),
      wobble: 0.006,
    });
    shape(squeal, (t) => smoothGate(t, chirpHz, 0.55));
    return mix(engineRun(n, r, engine, { rpm, level: 0.6 }), squeal, 0.4);
  },

  'pulley-bearing': (n, r, engine, rpm) => {
    const pulleyHz = order(rpm, r.range(2.4, 3.6));
    const dry = noiseBand(n, r, 'bandpass', r.range(1200, 2600), 1.2, 0.2);
    shape(dry, (t) => 0.55 + 0.45 * Math.sin(TAU * pulleyHz * t));
    const squeak = tone(n, r, { hz: r.range(3200, 4600), wobbleHz: pulleyHz, wobble: 0.01 });
    shape(squeak, (t) => 0.5 + 0.5 * Math.sin(TAU * pulleyHz * t));
    return mix(mix(engineRun(n, r, engine, { rpm, level: 0.7 }), dry), squeak, 0.05);
  },

  'alternator-whine': (n, r, engine, rpm) => {
    const whine = tone(n, r, {
      hz: order(rpm, r.range(2.5, 3)) * 36,
      partials: [1, 0.45, 0.3, 0.15],
      wobbleHz: 0.4,
      wobble: 0.006,
    });
    const rumble = noiseBand(n, r, 'bandpass', r.range(500, 900), 0.9, 0.04);
    return mix(mix(engineRun(n, r, engine, { rpm, level: 0.7 }), whine, 0.14), rumble);
  },

  'water-pump': (n, r, engine, rpm) => {
    const pumpHz = order(rpm, r.range(1, 1.4));
    const grind = noiseBand(n, r, 'bandpass', r.range(700, 1500), 0.9, 0.2);
    const rough = noiseBand(n, r, 'lowpass', 60, 0.7, 0.35);
    for (let i = 0; i < n; i++) {
      grind[i] *= Math.max(0.15, 0.65 + rough[i]) * (0.75 + 0.25 * Math.sin((TAU * pumpHz * i) / SAMPLE_RATE));
    }
    return mix(engineRun(n, r, engine, { rpm, level: 0.75 }), grind);
  },

  'power-steering-whine': (n, r, engine, rpm) => {
    const whine = tone(n, r, {
      hz: r.range(500, 1100),
      partials: [1, 0.4, 0.15],
      wobbleHz: r.range(0.5, 1.5),
      wobble: 0.003,
    });
    return mix(engineRun(n, r, engine, { rpm, level: 0.7 }), whine, 0.22);
  },

  'ac-compressor': (n, r, engine, rpm) => {
    const clatter = new Float32Array(n);
    clickTrain(clatter, r, order(rpm, r.range(0.8, 1.2)), 0.2, { hz: r.range(800, 1900), decay: 0.012, amp: 0.45, noisy: 0.55 });
    const cycleHz = r.range(0.3, 0.7);
    shape(clatter, (t) => (smoothGate(t, cycleHz, 0.75) > 0 ? 1 : 0.1));
    return mix(engineRun(n, r, engine, { rpm, level: 0.75 }), clatter);
  },

  'turbo-whine': (n, r, engine) => {
    const rpm = r.range(1800, 2800);
    const siren = tone(n, r, { hz: r.range(5500, 8200), partials: [1, 0.12], wobbleHz: r.range(0.6, 1.4), wobble: 0.03, sweep: 0.08 });
    return mix(engineRun(n, r, engine, { rpm, level: 0.75 }), siren, 0.16);
  },

  'fuel-pump-whine': (n, r) => {
    const whine = tone(n, r, { hz: r.range(1500, 3000), partials: [1, 0.3], wobbleHz: r.range(3, 7), wobble: 0.004 });
    return mix(noiseBand(n, r, 'lowpass', 1800, 0.7, 0.012), whine, 0.35);
  },

  // Starting system

  'starter-clicking': (n, r) => {
    const out = noiseBand(n, r, 'lowpass', 2000, 0.7, 0.004);
    const click = { hz: r.range(1000, 3500), decay: 0.006, amp: 1, noisy: 0.5 };
    const thunk = { hz: r.range(120, 220), decay: 0.012, amp: 0.6, noisy: 0 };
    everyBeat(n, r, r.range(8, 14), 0.03, (at) => {
      addClick(out, at, click, r);
      addClick(out, at, thunk, r);
    });
    return out;
  },

  'starter-grind': (n, r) => {
    const grind = noiseBand(n, r, 'bandpass', r.range(1400, 3200), 0.7, 0.3);
    const rough = noiseBand(n, r, 'lowpass', r.range(50, 110), 0.7, 0.45);
    for (let i = 0; i < n; i++) grind[i] *= Math.max(0.1, 0.65 + rough[i]);
    const motor = tone(n, r, { hz: r.range(160, 320), partials: [1, 0.6, 0.4, 0.2], wobbleHz: 9, wobble: 0.02 });
    return mix(grind, motor, 0.12);
  },

  // Brakes

  'worn-brake-pads': (n, r, engine) => {
    const wheelHz = r.range(2, 4);
    const squeal = tone(n, r, { hz: r.range(3200, 5200), partials: [1, 0.2], wobbleHz: r.range(4, 8), wobble: 0.004 });
    shape(squeal, (t) => 0.35 + 0.65 * Math.sin(Math.PI * wheelHz * t) ** 2);
    return mix(mix(roadNoise(n, r, 0.05), engineRun(n, r, engine, { rpm: 900, level: 0.08 })), squeal, 0.7);
  },

  'brake-grinding': (n, r, engine) => {
    const out = noiseBand(n, r, 'bandpass', r.range(1400, 2400), 0.5, 0.3);
    const rough = noiseBand(n, r, 'lowpass', r.range(30, 80), 0.7, 0.5);
    const wheelHz = r.range(2, 4);
    for (let i = 0; i < n; i++) {
      const wheel = 0.6 + 0.4 * Math.sin((TAU * wheelHz * i) / SAMPLE_RATE);
      out[i] *= Math.max(0.1, 0.6 + rough[i]) * wheel;
    }
    return mix(mix(out, roadNoise(n, r, 0.05)), engineRun(n, r, engine, { rpm: 900, level: 0.08 }));
  },

  // Wheels and suspension

  'wheel-bearing': (n, r) => {
    const beatHz = r.range(0.8, 2.2);
    const drone = tone(n, r, { hz: r.range(110, 260), partials: [1, 0.6, 0.3], wobbleHz: r.range(0.3, 0.8), wobble: 0.01 });
    shape(drone, (t) => 0.55 + 0.45 * Math.sin(TAU * beatHz * t));
    return mix(roadNoise(n, r, 0.12), drone, 0.35);
  },

  'tire-cupping': (n, r) => {
    const wheelHz = r.range(4, 9);
    const road = noiseBand(n, r, 'bandpass', r.range(350, 700), 0.5, 0.3);
    shape(road, (t) => 0.5 + 0.5 * Math.sin(TAU * wheelHz * t));
    return mix(roadNoise(n, r, 0.1), road);
  },

  'cv-joint': (n, r, engine) => clickTrain(
    mix(roadNoise(n, r, 0.05), engineRun(n, r, engine, { rpm: 1100, level: 0.12 })),
    r,
    r.range(2, 4),
    0.03,
    { hz: r.range(1500, 3000), decay: 0.008, amp: 1, noisy: 0.4 },
  ),

  'suspension-clunk': (n, r) => {
    const out = roadNoise(n, r, 0.06);
    const clunk = { hz: r.range(110, 300), decay: 0.028, amp: 1, noisy: 0.2 };
    everyBeat(n, r, r.range(0.7, 1.6), 0.45, (at) => addClick(out, at, clunk, r));
    return out;
  },

  'loose-wheel': (n, r) => {
    const out = roadNoise(n, r, 0.08);
    const metallic = { hz: r.range(900, 2000), decay: 0.014, amp: 0.8, noisy: 0.3 };
    const thud = { hz: r.range(90, 170), decay: 0.02, amp: 0.5, noisy: 0.1 };
    everyBeat(n, r, r.range(2.5, 5), 0.06, (at) => {
      addClick(out, at, metallic, r);
      addClick(out, at, thud, r);
    });
    return out;
  },

  // Transmission and axle

  'transmission-whine': (n, r, engine) => {
    const whine = tone(n, r, { hz: r.range(450, 1200), partials: [1, 0.35, 0.2], wobbleHz: 0.5, wobble: 0.002, sweep: r.range(0.25, 0.5) });
    return mix(mix(roadNoise(n, r, 0.08), engineRun(n, r, engine, { rpm: 1800, level: 0.25 })), whine, 0.3);
  },

  'differential-howl': (n, r) => {
    const beatHz = r.range(0.4, 1);
    const howl = tone(n, r, { hz: r.range(260, 700), partials: [1, 0.3], wobbleHz: r.range(0.4, 0.9), wobble: 0.006 });
    shape(howl, (t) => 0.7 + 0.3 * Math.sin(TAU * beatHz * t));
    return mix(roadNoise(n, r, 0.12), howl, 0.3);
  },
};

export const hasSound = (id) => id in RECIPES;

// Faults that sound the same whatever engine is fitted, so they only need a few takes.
const ENGINE_INDEPENDENT = new Set([
  'fuel-pump-whine', 'starter-clicking', 'starter-grind', 'wheel-bearing', 'tire-cupping',
  'suspension-clunk', 'loose-wheel', 'differential-howl',
]);
export const dependsOnEngine = (id) => !ENGINE_INDEPENDENT.has(id);

function normalize(samples, peakTarget = 0.8) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] *= peakTarget / peak;
  return samples;
}

/**
 * Generates one take of a fault's sound at SAMPLE_RATE, on a chosen engine or a random one.
 * By default it's heard through a phone, to compare with recordings. Pass `throughPhone: false`
 * for the full sound, with its bass intact, when it's for people to listen to.
 */
export function synthesize(id, { seed = 1, duration = 4, engine: engineId = null, rpm = null, throughPhone = true } = {}) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`No sound recipe for "${id}"`);
  const n = Math.floor(duration * SAMPLE_RATE);
  const r = makeRandom(seed);
  const engine = engineById(engineId) ?? ENGINES[Math.floor(r.next() * ENGINES.length)];
  const speed = rpm ?? r.range(...engine.idle);
  const sound = recipe(n, r, engine, speed);
  return normalize(throughPhone ? phoneMicrophone(sound, r) : sound);
}

/** A listening example of a fault, on the person's engine if we know it. */
export function simulatedTake(id, engine = null) {
  const onlyDiesel = id === 'diesel-injector-knock';
  const chosen = onlyDiesel && !engineById(engine)?.diesel ? 'diesel4' : engine ?? 'i4';
  return synthesize(id, { seed: 11, duration: 4, engine: chosen, throughPhone: false });
}

/** Roughens a clean sound the way a phone microphone would: other noise, uneven tone, lower level. */
export function simulateRecording(samples, seed, { noiseDb = -24 } = {}) {
  const r = makeRandom(seed);
  const n = samples.length;
  const level = rms(samples) * 10 ** (noiseDb / 20);
  const out = Float32Array.from(samples);
  mix(out, noiseBand(n, r, 'lowpass', 800, 0.7, level * 0.8));
  mix(out, noiseBand(n, r, 'highpass', 1000, 0.7, level * 0.3));

  const toned = biquad(out, 'highpass', r.range(50, 160), 0.7);
  const brightness = r.range(-0.3, 0.3);
  const smooth = biquad(toned, 'lowpass', 3000, 0.7);
  const gain = r.range(0.2, 0.9);
  for (let i = 0; i < n; i++) {
    out[i] = gain * (toned[i] + brightness * (toned[i] - smooth[i]));
  }
  return normalize(out, gain);
}
