// Turns audio samples into a "sound print": a small description of the sound's tone colour,
// rhythm and pitch that can be compared with other sound prints.
// No browser APIs in here, so the same code runs in the page, the build script and the tests.

export const SAMPLE_RATE = 22050;
export const BAND_COUNT = 32;
export const FREQ_MIN = 40;
export const FREQ_MAX = 10000;

/** Plain names for parts of the frequency range, from lowest to highest. */
export const RANGES = [
  { name: 'Rumble', below: 150 },
  { name: 'Hum', below: 800 },
  { name: 'Squeal', below: 6000 },
  { name: 'Hiss', below: Infinity },
];

const FRAME = 1024;
const HOP = 256;
const BINS = FRAME / 2 + 1;
const BIN_HZ = SAMPLE_RATE / FRAME;
const SCALE_BREAK_HZ = 100; // Stretches the low end, where engine sounds live.
const FLOOR_DB = 70; // Anything this far below the loudest band counts as silence.
const SPLIT_HZ = 800; // Separates low thuds from high ticks when measuring rhythm.
const ENVELOPE_BLOCK = 32;
const ENVELOPE_RATE = SAMPLE_RATE / ENVELOPE_BLOCK;
const MOD_BANDS = 16;
const MOD_MIN_HZ = 1;
const MOD_MAX_HZ = 200; // High enough to see the firing rate of any engine at idle.
const BEAT_RANGE = [1, 20]; // Slow enough to hear as separate beats.
const FIRING_RANGE = [20, 130]; // Fast enough to blur into an engine's note.
const IMAGE_COLUMNS = 160;
const IMAGE_ROWS = 48; // Finer than the analysis bands, because people look at this.
const IMAGE_RANGE_DB = 60;
const LEVEL_RANGE_DB = 45;

/** Standard second-order audio filter. */
export function biquad(input, type, hz, q, rate = SAMPLE_RATE) {
  const w = (2 * Math.PI * hz) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const coefficients = {
    lowpass: [(1 - cos) / 2, 1 - cos, (1 - cos) / 2],
    highpass: [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2],
    bandpass: [alpha, 0, -alpha],
  }[type];
  const a0 = 1 + alpha;
  const [b0, b1, b2] = coefficients.map((value) => value / a0);
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;

  const output = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return output;
}

/** Converts audio from any sample rate to SAMPLE_RATE. */
export function resample(samples, fromRate) {
  if (fromRate === SAMPLE_RATE) return Float32Array.from(samples);
  let source = samples;
  if (fromRate > SAMPLE_RATE) {
    // Remove anything too high to survive the conversion, or it folds back as false tones.
    const cutoff = 0.45 * SAMPLE_RATE;
    source = biquad(biquad(samples, 'lowpass', cutoff, 0.54, fromRate), 'lowpass', cutoff, 1.31, fromRate);
  }
  const length = Math.floor((samples.length * SAMPLE_RATE) / fromRate);
  const output = new Float32Array(length);
  const step = fromRate / SAMPLE_RATE;
  for (let i = 0; i < length; i++) {
    const position = i * step;
    const index = Math.floor(position);
    const fraction = position - index;
    output[i] = source[index] * (1 - fraction) + (source[index + 1] ?? source[index]) * fraction;
  }
  return output;
}

const toScale = (hz) => Math.log1p(hz / SCALE_BREAK_HZ);
const fromScale = (value) => SCALE_BREAK_HZ * Math.expm1(value);
const SCALE_MIN = toScale(FREQ_MIN);
const SCALE_MAX = toScale(FREQ_MAX);

/** Where a frequency sits on a sound print's vertical axis: 0 is the bottom, 1 the top. */
export const freqToPosition = (hz) => (toScale(hz) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
export const positionToFreq = (position) => fromScale(SCALE_MIN + position * (SCALE_MAX - SCALE_MIN));

const HANN = Float64Array.from(
  { length: FRAME },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)),
);

const twiddleCache = new Map();

function twiddles(size) {
  let table = twiddleCache.get(size);
  if (!table) {
    table = {
      cos: Float64Array.from({ length: size / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / size)),
      sin: Float64Array.from({ length: size / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / size)),
    };
    twiddleCache.set(size, table);
  }
  return table;
}

/** In-place radix-2 FFT. The array length must be a power of two. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const swapRe = re[i];
      re[i] = re[j];
      re[j] = swapRe;
      const swapIm = im[i];
      im[i] = im[j];
      im[j] = swapIm;
    }
  }
  const { cos, sin } = twiddles(n);
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

function buildFilters(count) {
  const edges = Array.from(
    { length: count + 2 },
    (_, i) => fromScale(SCALE_MIN + (i / (count + 1)) * (SCALE_MAX - SCALE_MIN)),
  );
  return Array.from({ length: count }, (_, band) => {
    const [low, mid, high] = [edges[band], edges[band + 1], edges[band + 2]];
    const weights = [];
    for (let bin = 1; bin < BINS; bin++) {
      const hz = bin * BIN_HZ;
      const weight = hz <= mid ? (hz - low) / (mid - low) : (high - hz) / (high - mid);
      if (weight > 0) weights.push([bin, weight]);
    }
    if (weights.length === 0) weights.push([Math.max(1, Math.round(mid / BIN_HZ)), 1]);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    return {
      bins: Int32Array.from(weights, ([bin]) => bin),
      weights: Float64Array.from(weights, ([, weight]) => weight / total),
    };
  });
}

const BAND_FILTERS = buildFilters(BAND_COUNT);
const IMAGE_FILTERS = buildFilters(IMAGE_ROWS);

function bandEnergy(band, power, filters = BAND_FILTERS) {
  const { bins, weights } = filters[band];
  let energy = 0;
  for (let i = 0; i < bins.length; i++) energy += power[bins[i]] * weights[i];
  return energy;
}

const MOD_EDGES = Array.from(
  { length: MOD_BANDS + 1 },
  (_, i) => MOD_MIN_HZ * (MOD_MAX_HZ / MOD_MIN_HZ) ** (i / MOD_BANDS),
);

const nextPowerOfTwo = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

function average(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

/** Follows how loud a signal is over time, at ENVELOPE_RATE. */
function loudnessEnvelope(signal) {
  const length = Math.max(1, Math.floor(signal.length / ENVELOPE_BLOCK));
  const envelope = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    const from = i * ENVELOPE_BLOCK;
    for (let k = from; k < from + ENVELOPE_BLOCK && k < signal.length; k++) sum += Math.abs(signal[k]);
    envelope[i] = Math.sqrt(sum / ENVELOPE_BLOCK);
  }
  return envelope;
}

/** How strongly a loudness envelope pulses at each rate, from 1 to 200 times a second. */
function modulationSpectrum(envelope) {
  const mean = average(envelope);
  const result = new Float32Array(MOD_BANDS);
  if (mean <= 0 || envelope.length < 8) return result;

  const size = nextPowerOfTwo(envelope.length * 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let windowSum = 0;
  for (let i = 0; i < envelope.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (envelope.length - 1));
    re[i] = (envelope[i] - mean) * w;
    windowSum += w;
  }
  fft(re, im);

  const raw = new Float64Array(MOD_BANDS);
  const binHz = ENVELOPE_RATE / size;
  for (let band = 0; band < MOD_BANDS; band++) {
    const from = Math.max(1, Math.floor(MOD_EDGES[band] / binHz));
    const to = Math.min(size / 2 - 1, Math.ceil(MOD_EDGES[band + 1] / binHz));
    let peak = 0;
    for (let k = from; k <= to; k++) {
      const magnitude = (2 * Math.hypot(re[k], im[k])) / (windowSum * mean);
      if (magnitude > peak) peak = magnitude;
    }
    raw[band] = Math.sqrt(Math.min(peak, 1));
  }

  // Blend neighbours so a rate near a band edge doesn't jump between bands.
  for (let band = 0; band < MOD_BANDS; band++) {
    const before = raw[Math.max(0, band - 1)];
    const after = raw[Math.min(MOD_BANDS - 1, band + 1)];
    result[band] = 0.25 * before + 0.5 * raw[band] + 0.25 * after;
  }
  return result;
}

/** Finds a repeating period in a loudness envelope, within a range of rates, using autocorrelation. */
function detectPeriod(envelope, [minHz, maxHz]) {
  const mean = average(envelope);
  const centred = envelope.map((value) => value - mean);
  let energy = 0;
  for (let i = 0; i < centred.length; i++) energy += centred[i] * centred[i];
  if (energy <= 0) return { hz: 0, strength: 0 };

  const minLag = Math.max(2, Math.floor(ENVELOPE_RATE / maxHz));
  const maxLag = Math.min(Math.ceil(ENVELOPE_RATE / minHz), Math.floor(centred.length / 2));
  if (maxLag <= minLag + 1) return { hz: 0, strength: 0 };

  const correlation = new Float64Array(maxLag + 2);
  for (let lag = Math.max(1, minLag - 1); lag <= maxLag + 1; lag++) {
    let sum = 0;
    const limit = centred.length - lag;
    for (let i = 0; i < limit; i++) sum += centred[i] * centred[i + lag];
    correlation[lag] = (sum / energy) * (centred.length / limit);
  }

  let best = 0;
  const peaks = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (correlation[lag] > correlation[lag - 1] && correlation[lag] >= correlation[lag + 1]) {
      peaks.push(lag);
      if (correlation[lag] > best) best = correlation[lag];
    }
  }
  if (peaks.length === 0 || best <= 0) return { hz: 0, strength: 0 };

  // The shortest lag close to the best peak is the period itself, not a multiple of it.
  const lag = peaks.find((candidate) => correlation[candidate] >= best * 0.85);
  return { hz: ENVELOPE_RATE / lag, strength: Math.min(1, correlation[lag]) };
}

/** Looks for one frequency standing out from its neighbours, such as a squeal or whine. */
function detectTone(meanPower) {
  const db = Float64Array.from(meanPower, (power) => 10 * Math.log10(power + 1e-12));
  const from = Math.round(200 / BIN_HZ);
  const to = Math.min(BINS - 1, Math.round(FREQ_MAX / BIN_HZ));
  const reach = 30;
  const gap = 3;
  let bestProminence = 0;
  let bestBin = from;

  for (let bin = from; bin <= to; bin++) {
    if (db[bin] < db[bin - 1] || db[bin] < (db[bin + 1] ?? -Infinity)) continue;
    let sum = 0;
    let count = 0;
    for (let k = Math.max(1, bin - reach); k <= Math.min(BINS - 1, bin + reach); k++) {
      if (Math.abs(k - bin) <= gap) continue;
      sum += db[k];
      count++;
    }
    const prominence = db[bin] - sum / count;
    if (prominence > bestProminence) {
      bestProminence = prominence;
      bestBin = bin;
    }
  }
  return { hz: bestBin * BIN_HZ, strength: Math.min(1, bestProminence / 35) };
}

/** Compares the spectrum's geometric and arithmetic means: 1 is pure noise, 0 is a pure tone. */
function spectralFlatness(meanPower) {
  const from = Math.round(200 / BIN_HZ);
  const to = Math.min(BINS - 1, Math.round(FREQ_MAX / BIN_HZ));
  let logSum = 0;
  let sum = 0;
  for (let bin = from; bin <= to; bin++) {
    logSum += Math.log(meanPower[bin] + 1e-12);
    sum += meanPower[bin];
  }
  const count = to - from + 1;
  return sum > 0 ? Math.exp(logSum / count) / (sum / count) : 0;
}

/** How loud each frequency seems to a person: the standard A-weighting curve, as power. */
const HEARING_WEIGHT = Float64Array.from({ length: BINS }, (_, bin) => {
  const f2 = (bin * BIN_HZ) ** 2;
  const a = (12194 ** 2 * f2 ** 2)
    / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return a * a;
});

/** Names the range of the sound that a person would notice most. */
function loudestRange(meanPower) {
  const totals = RANGES.map(() => 0);
  for (let bin = 1; bin < BINS; bin++) {
    const hz = bin * BIN_HZ;
    totals[RANGES.findIndex((range) => hz < range.below)] += meanPower[bin] * HEARING_WEIGHT[bin];
  }
  return RANGES[totals.indexOf(Math.max(...totals))].name;
}

/**
 * Softens the spectrum so that the same fault still matches when its exact pitch differs
 * a little, which it will from one vehicle to the next.
 */
function blurBands(values) {
  let previous = values[0];
  for (let band = 0; band < values.length; band++) {
    const current = values[band];
    const next = values[Math.min(values.length - 1, band + 1)];
    values[band] = 0.25 * previous + 0.5 * current + 0.25 * next;
    previous = current;
  }
}

/** Builds the sound print for mono samples recorded at SAMPLE_RATE. */
export function analyze(samples) {
  const frames = Math.max(1, Math.floor((samples.length - FRAME) / HOP) + 1);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const meanPower = new Float64Array(BINS);
  const imageDb = new Float32Array(frames * IMAGE_ROWS);
  const frameDb = new Float32Array(frames);

  for (let t = 0; t < frames; t++) {
    const offset = t * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = (samples[offset + i] ?? 0) * HANN[i];
      im[i] = 0;
    }
    fft(re, im);
    let total = 0;
    for (let bin = 0; bin < BINS; bin++) {
      const power = re[bin] * re[bin] + im[bin] * im[bin];
      im[bin] = power; // Reuse the array to hold this frame's power spectrum.
      meanPower[bin] += power;
      total += power;
    }
    frameDb[t] = 10 * Math.log10(total + 1e-12);
    for (let row = 0; row < IMAGE_ROWS; row++) {
      imageDb[t * IMAGE_ROWS + row] = 10 * Math.log10(bandEnergy(row, im, IMAGE_FILTERS) + 1e-12);
    }
  }
  for (let bin = 0; bin < BINS; bin++) meanPower[bin] /= frames;

  // Tone colour: the average spectrum with overall loudness removed.
  const shape = new Float32Array(BAND_COUNT);
  for (let band = 0; band < BAND_COUNT; band++) {
    shape[band] = 10 * Math.log10(bandEnergy(band, meanPower) + 1e-12);
  }
  const loudest = Math.max(...shape);
  for (let band = 0; band < BAND_COUNT; band++) shape[band] = Math.max(shape[band], loudest - FLOOR_DB);
  blurBands(shape);
  blurBands(shape);
  const shapeMean = average(shape);
  for (let band = 0; band < BAND_COUNT; band++) shape[band] -= shapeMean;

  // Rhythm: separate low thuds from high ticks, because they point to different faults.
  const envelopeLow = loudnessEnvelope(biquad(samples, 'lowpass', SPLIT_HZ, 0.7));
  const envelopeHigh = loudnessEnvelope(biquad(samples, 'highpass', SPLIT_HZ, 0.7));
  const beatLow = detectPeriod(envelopeLow, BEAT_RANGE);
  const beatHigh = detectPeriod(envelopeHigh, BEAT_RANGE);
  const beat = beatHigh.strength > beatLow.strength ? beatHigh : beatLow;
  const firing = detectPeriod(envelopeLow, FIRING_RANGE);
  const tone = detectTone(meanPower);

  return {
    shape,
    modLow: modulationSpectrum(envelopeLow),
    modHigh: modulationSpectrum(envelopeHigh),
    flatness: spectralFlatness(meanPower),
    toneHz: tone.hz,
    toneStrength: tone.strength,
    beatHz: beat.hz,
    beatStrength: beat.strength,
    firingHz: firing.hz,
    firingStrength: firing.strength,
    loudest: loudestRange(meanPower),
    seconds: samples.length / SAMPLE_RATE,
    image: buildImage(imageDb, frameDb, frames),
  };
}

/**
 * Shrinks the sound into a small picture: a grid of how loud each pitch is over time, plus a
 * loudness line across the whole sound. Both are scaled to the sound's own loudest moment,
 * so a quiet microphone draws as clearly as a loud one.
 */
function buildImage(imageDb, frameDb, frames) {
  const columns = Math.min(IMAGE_COLUMNS, frames);
  const data = new Uint8Array(columns * IMAGE_ROWS);
  const levels = new Uint8Array(columns);
  let top = -Infinity;
  for (let i = 0; i < imageDb.length; i++) if (imageDb[i] > top) top = imageDb[i];
  let loudest = -Infinity;
  for (let t = 0; t < frames; t++) if (frameDb[t] > loudest) loudest = frameDb[t];

  for (let column = 0; column < columns; column++) {
    const from = Math.floor((column / columns) * frames);
    const to = Math.max(from + 1, Math.floor(((column + 1) / columns) * frames));
    let columnPeak = -Infinity;
    for (let t = from; t < to; t++) if (frameDb[t] > columnPeak) columnPeak = frameDb[t];
    const level = (columnPeak - (loudest - LEVEL_RANGE_DB)) / LEVEL_RANGE_DB;
    levels[column] = Math.round(255 * Math.min(1, Math.max(0, level)));

    for (let row = 0; row < IMAGE_ROWS; row++) {
      let peak = -Infinity;
      for (let t = from; t < to; t++) {
        const value = imageDb[t * IMAGE_ROWS + row];
        if (value > peak) peak = value;
      }
      const shade = (peak - (top - IMAGE_RANGE_DB)) / IMAGE_RANGE_DB;
      data[column * IMAGE_ROWS + row] = Math.round(255 * Math.min(1, Math.max(0, shade)));
    }
  }
  return { columns, rows: IMAGE_ROWS, data, levels };
}

const rmsDifference = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
};

const TONAL = 0.4;
const PERIODIC = 0.3;

function periodDifference(hzA, strengthA, hzB, strengthB, scale) {
  if (strengthA > PERIODIC && strengthB > PERIODIC) return Math.abs(Math.log2(hzA / hzB)) / scale;
  return Math.abs(strengthA - strengthB) / 0.4;
}

/** How different two sound prints are. Zero means identical. */
export function distance(a, b) {
  const colour = rmsDifference(a.shape, b.shape) / 10;
  const rhythmLow = rmsDifference(a.modLow, b.modLow) / 0.2;
  const rhythmHigh = rmsDifference(a.modHigh, b.modHigh) / 0.2;
  const noisiness = Math.abs(a.flatness - b.flatness) / 0.25;
  const tonal = Math.abs(a.toneStrength - b.toneStrength) / 0.4;
  const pitch = a.toneStrength > TONAL && b.toneStrength > TONAL
    ? Math.abs(Math.log2(a.toneHz / b.toneHz))
    : 0;
  const beat = periodDifference(a.beatHz, a.beatStrength, b.beatHz, b.beatStrength, 0.6);
  const firing = periodDifference(a.firingHz, a.firingStrength, b.firingHz, b.firingStrength, 0.6);

  return (
    0.4 * colour
    + 0.2 * rhythmLow
    + 0.2 * rhythmHigh
    + 0.1 * noisiness
    + 0.1 * tonal
    + 0.2 * pitch
    + 0.15 * beat
    + 0.1 * firing
  );
}

/** Converts a distance to the 0 to 100 sound match shown to people. */
export const similarity = (d) => 100 * Math.exp(-(d * d) / 1.2);
