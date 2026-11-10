// Ranks faults from what we actually have good evidence for.
//
// We tested this on real phone recordings. Comparing a recording with computer-generated sounds
// did no better than guessing, so generated sounds play no part in the ranking. What did hold up:
//   - simple measurements (is there a clear tone? a slow regular tap?)
//   - real reference recordings of the same faults, which were right about 90% of the time
//   - when and where the noise happens, which published research also found to matter as much
//     as the sound itself

import { FAULTS } from './data/faults.js';
import { DIESEL_ENGINES } from './data/engines.js';
import { distance, SAMPLE_RATE, similarity } from './features.js';

export { RANGES } from './features.js';

export const MIN_SECONDS = 2;
export const STRONG_FIT = 75;
export const PARTIAL_FIT = 45;

const SILENT_DB = -85;

// These thresholds were set on real recordings and checked on separate ones they hadn't seen.
const TONE_STRENGTH = 0.35;
const TAP_STRENGTH = 0.4;
const TAP_MAX_HZ = 10;
const UNEVEN_STRENGTH = 0.5;

// What each measured character of sound usually gets called, and so which faults it can fit.
const HEARD_KINDS = {
  tone: {
    words: ['squeal', 'whine'],
    label: 'A clear, steady pitch',
    meaning: 'Things that spin or slip, such as belts, pumps and bearings, often sound like this.',
  },
  tap: {
    words: ['tick', 'click', 'knock', 'puff', 'clunk'],
    label: 'A slow, regular tap',
    meaning: 'Something is striking once per turn of a part. Valves, lifters and joints often sound like this.',
  },
  uneven: {
    words: ['knock', 'puff', 'rattle', 'tick', 'clunk'],
    label: 'An uneven, stumbling beat',
    meaning: 'The rhythm isn’t steady. Misfires and looser parts often sound like this.',
  },
  steady: {
    words: ['hum', 'roar', 'hiss', 'grind', 'rattle'],
    label: 'A steady sound, with no clear pitch or beat',
    meaning: 'Nothing stands out. This is how a healthy engine usually sounds, though hisses and roars are steady too.',
  },
};

const HEARD_WEIGHT = 1;
const ANSWERS_WEIGHT = 3;
const HEARD_MISFIT = 15;
const HEARD_ALONE_LIMIT = 0.6;
const COMMON_BONUS = 6;
// A real recording only counts if it's at least this similar, and then adds at most REAL_BONUS.
// Letting a close real match override everything made results worse on a mixed set of real
// recordings: a clip of one fault would often sit closest to a recording of another.
const REAL_FLOOR = 65;
const REAL_BONUS = 60;

// How much each answer tells us. The sound word and what it follows are the most telling.
const WEIGHTS = { words: 3, contexts: 2, follows: 2, where: 1 };

// A gentle tie-break towards what's seen most in real workshops, most common first.
const COMMON_FIRST = [
  'worn-brake-pads', 'starter-clicking', 'slipping-belt', 'engine-misfire', 'healthy-engine',
  'wheel-bearing', 'suspension-clunk', 'exhaust-leak', 'lifter-tick', 'tire-cupping',
  'cv-joint', 'heat-shield-rattle', 'brake-grinding', 'vacuum-leak', 'power-steering-whine',
];

const commonness = (id) => {
  const position = COMMON_FIRST.indexOf(id);
  return position === -1 ? 0 : 1 - position / COMMON_FIRST.length;
};

/** Reads the database file: a picture for each sound, plus any real reference recordings. */
export function parseDatabase(file) {
  const bytes = (text) => {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  };
  // Pictures are stored two pixels to a byte, at 16 shades each.
  const decode = ({ shades, levels, ...image }) => {
    const packed = bytes(shades);
    const data = new Uint8Array(image.columns * image.rows);
    for (let i = 0; i < data.length; i++) {
      data[i] = 17 * (i % 2 === 0 ? packed[i >> 1] >> 4 : packed[i >> 1] & 15);
    }
    return { ...image, data, levels: bytes(levels) };
  };
  const realPrints = new Map();
  for (const [id, takes] of Object.entries(file.real ?? {})) {
    realPrints.set(id, takes.map((print) => ({
      print: {
        ...print,
        shape: Float32Array.from(print.shape),
        modLow: Float32Array.from(print.modLow),
        modHigh: Float32Array.from(print.modHigh),
      },
      origin: 'real',
    })));
  }
  return {
    faultImages: new Map(Object.entries(file.faultImages ?? {}).map(([id, image]) => [id, decode(image)])),
    engineImages: new Map(Object.entries(file.engineImages ?? {}).map(([id, image]) => [id, decode(image)])),
    realPrints,
  };
}

/** Describes what the recording measurably sounds like. */
export function hearSound(print) {
  let kind = 'steady';
  if (print.toneStrength > TONE_STRENGTH) kind = 'tone';
  else if (print.beatStrength > TAP_STRENGTH && print.beatHz < TAP_MAX_HZ) kind = 'tap';
  else if (print.beatStrength > UNEVEN_STRENGTH) kind = 'uneven';
  return {
    kind,
    ...HEARD_KINDS[kind],
    pitch: kind === 'tone' ? formatHz(print.toneHz) : null,
    beatsPerSecond: kind === 'tap' || kind === 'uneven' ? print.beatHz : null,
  };
}

/** How well a fault fits the answers: 0 to 100, or null if nothing has been answered. */
export function symptomScore(fault, answers = {}) {
  let earned = 0;
  let possible = 0;
  const check = (key, fits, answered) => {
    if (!answered) return;
    possible += WEIGHTS[key];
    if (fits) earned += WEIGHTS[key];
  };
  const words = answers.words ?? [];
  const contexts = answers.contexts ?? [];
  check('words', words.some((word) => fault.words.includes(word)), words.length > 0);
  check('contexts', contexts.some((context) => fault.contexts.includes(context)), contexts.length > 0);
  check('where', fault.where.includes(answers.where), Boolean(answers.where));
  check('follows', fault.follows === answers.follows, Boolean(answers.follows));
  return possible === 0 ? null : (100 * earned) / possible;
}

function bestRealMatch(print, references) {
  let best = null;
  for (const reference of references) {
    const score = similarity(distance(print, reference.print));
    if (best === null || score > best.score) best = { score, origin: reference.origin };
  }
  return best;
}

/**
 * Ranks every fault. `saved` maps fault ids to prints from real recordings. Only the fault whose
 * real recording sounds closest gets a boost, and only as far as the answers agree with it, so
 * a lopsided set of recordings (all healthy engines, say) can't bury what the answers point to.
 */
export function rankFaults({ print = null, answers = {}, saved = new Map() } = {}) {
  const engine = answers.engine ?? null;
  const heard = print ? hearSound(print) : null;
  const ruledOut = (fault) => fault.onlyDiesel && engine && !DIESEL_ENGINES.includes(engine);
  const eligible = FAULTS.filter((fault) => !ruledOut(fault));

  const realMatches = new Map();
  let closest = null;
  if (print) {
    for (const fault of eligible) {
      if (!saved.has(fault.id)) continue;
      const match = bestRealMatch(print, saved.get(fault.id));
      if (!match) continue;
      realMatches.set(fault.id, match);
      if (match.score >= REAL_FLOOR && (closest === null || match.score > realMatches.get(closest).score)) closest = fault.id;
    }
  }

  const ranking = eligible.map((fault) => {
    const symptoms = symptomScore(fault, answers);
    const heardFit = heard
      ? (fault.words.some((word) => heard.words.includes(word)) ? 100 : HEARD_MISFIT)
      : null;

    // The measured sound narrows down the kind of problem but can't name one, so on its own
    // it never counts as a strong result.
    let fit = 0;
    if (symptoms !== null) {
      fit = heardFit === null
        ? symptoms
        : (symptoms * ANSWERS_WEIGHT + heardFit * HEARD_WEIGHT) / (ANSWERS_WEIGHT + HEARD_WEIGHT);
    } else if (heardFit !== null) {
      fit = heardFit * HEARD_ALONE_LIMIT;
    }

    // The closest real recording adds to the evidence, scaled by how well the answers fit. It
    // can't overrule the words someone chose for the sound, so a saved healthy engine can't
    // outrank the knock they described.
    const match = realMatches.get(fault.id) ?? null;
    const words = answers.words ?? [];
    const saidOtherwise = words.length > 0 && !fault.words.some((word) => words.includes(word));
    const counted = fault.id === closest && !saidOtherwise;
    const boost = counted ? REAL_BONUS * (symptoms === null ? 1 : symptoms / 100) : 0;

    return {
      fault,
      fit: Math.min(100, fit + boost),
      symptomScore: symptoms,
      heardFit,
      realMatch: match && { ...match, counted },
      sortScore: fit + boost + commonness(fault.id) * COMMON_BONUS,
    };
  });
  return ranking.sort((a, b) => b.sortScore - a.sortScore);
}

export function fitLabel(fit) {
  if (fit >= STRONG_FIT) return 'Strong fit';
  if (fit >= PARTIAL_FIT) return 'Partial fit';
  return 'Weak fit';
}

/** Catches recordings too short or silent to use. Quiet is fine: the analysis ignores volume. */
export function checkRecording(samples) {
  const seconds = samples.length / SAMPLE_RATE;
  if (seconds < MIN_SECONDS) return { ok: false, problem: 'too-short' };

  let sum = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const size = Math.abs(samples[i]);
    sum += size * size;
    if (size >= 0.99) clipped++;
  }
  const db = 10 * Math.log10(sum / samples.length + 1e-12);
  if (db < SILENT_DB) return { ok: false, problem: 'silent' };
  return { ok: true, overloaded: clipped / samples.length > 0.005, db };
}

export const formatHz = (hz) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz / 10) * 10} Hz`);
