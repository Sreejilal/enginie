import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { judgeQuote, shopCost } from '../public/js/cost.js';
import { ENGINES } from '../public/js/data/engines.js';
import { faultById, FAULTS } from '../public/js/data/faults.js';
import { CONTEXTS, FOLLOWS, LOCATIONS, SOUND_WORDS } from '../public/js/data/symptoms.js';
import { analyze, distance, resample, SAMPLE_RATE, similarity } from '../public/js/features.js';
import { checkRecording, hearSound, parseDatabase, rankFaults, STRONG_FIT, symptomScore } from '../public/js/match.js';
import { hasSound, synthesize } from '../public/js/synth.js';

const sine = (hz, seconds = 4, level = 0.5) => Float32Array.from(
  { length: seconds * SAMPLE_RATE },
  (_, i) => level * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE),
);

function noise(seconds, level, seed = 1) {
  let state = seed;
  return Float32Array.from({ length: seconds * SAMPLE_RATE }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return level * ((state / 4294967296) * 2 - 1);
  });
}

function clicks(perSecond, seconds = 6) {
  const samples = noise(seconds, 0.01, 7);
  const every = Math.round(SAMPLE_RATE / perSecond);
  for (let at = 0; at < samples.length; at += every) {
    for (let i = 0; i < 300 && at + i < samples.length; i++) {
      samples[at + i] += Math.exp(-i / 40) * (Math.sin(i * 1.3) + 0.5 * Math.sin(i * 2.9));
    }
  }
  return samples;
}

const engineSound = (engine, seed = 4, rpm = 700) => analyze(synthesize('healthy-engine', {
  seed, duration: 6, engine, rpm, throughPhone: false,
}));

let db;

before(() => {
  db = parseDatabase(JSON.parse(readFileSync(new URL('../public/data/sound-database.json', import.meta.url), 'utf8')));
});

test('every fault is complete and uses valid answers', () => {
  for (const fault of FAULTS) {
    const label = fault.id;
    assert.ok(hasSound(fault.id), `${label} has no sound`);
    assert.ok(db.faultImages.get(fault.id)?.data.length > 0, `${label} has no picture`);
    for (const key of ['name', 'area', 'sound', 'plain', 'driveNote', 'wait', 'ifBroke', 'tellMechanic', 'watchOut']) {
      assert.ok(fault[key], `${label} is missing ${key}`);
    }
    assert.ok(fault.firstChecks.length > 0, `${label} has no first checks`);
    assert.ok(fault.ask.length > 0, `${label} has no questions to ask`);
    assert.ok(fault.pro.signature && fault.pro.tests.length > 0, `${label} has no mechanic details`);
    assert.ok(['no', 'careful', 'yes'].includes(fault.drive), `${label} has an invalid drive value`);
    if (!fault.noRepair) assert.ok(fault.parts && fault.labor && fault.diy, `${label} has no cost data`);

    fault.words.forEach((word) => assert.ok(word in SOUND_WORDS, `${label}: unknown word ${word}`));
    fault.contexts.forEach((context) => assert.ok(context in CONTEXTS, `${label}: unknown context ${context}`));
    fault.where.forEach((place) => assert.ok(place in LOCATIONS, `${label}: unknown location ${place}`));
    assert.ok(fault.follows in FOLLOWS, `${label}: unknown follows ${fault.follows}`);
    fault.confusedWith.forEach(({ id }) => assert.ok(faultById(id), `${label}: unknown confusion ${id}`));
  }
  for (const engine of ENGINES) assert.ok(db.engineImages.get(engine.id), `${engine.id} has no picture`);
});

test('a fault that must stop the vehicle never says it is fine to drive', () => {
  for (const fault of FAULTS.filter((item) => item.urgency === 'stop')) assert.equal(fault.drive, 'no', fault.id);
});

test('the database file is up to date with the sounds and analysis', () => {
  // Must match build-database.mjs: the first fault, seed 1000, on an inline 4.
  const fresh = analyze(synthesize(FAULTS[0].id, { seed: 1000, duration: 4, engine: 'i4' }));
  const stored = db.faultImages.get(FAULTS[0].id);
  const same = fresh.image.data.every((value, i) => Math.abs(value - stored.data[i]) <= 1);
  assert.ok(same, 'The database is out of date. Run "npm run build:database".');
});

/* ---------- Engines ---------- */

test('engines fire at the rate physics says they should', () => {
  const rpm = 750;
  for (const id of ['i4', 'i5', 'i6', 'v8-flat']) {
    const engine = ENGINES.find((item) => item.id === id);
    const expected = (rpm / 60) * (engine.cylinders / 2);
    const { firingHz } = engineSound(id, 7, rpm);
    assert.ok(Math.abs(firingHz - expected) / expected < 0.06, `${id}: expected ${expected} Hz, heard ${firingHz}`);
  }
});

test('a V8 sounds different from an inline 6, and alike from take to take', () => {
  const same = similarity(distance(engineSound('v8', 1), engineSound('v8', 2)));
  const different = similarity(distance(engineSound('v8', 1), engineSound('i6', 1)));
  assert.ok(same > 85, `two V8 takes are only ${same.toFixed(0)}% alike`);
  assert.ok(different < 75, `a V8 and an inline 6 are ${different.toFixed(0)}% alike`);
});

test('a cross-plane V8 lopes, while an inline 6 is smooth', () => {
  const v8 = engineSound('v8');
  const i6 = engineSound('i6');
  assert.ok(v8.beatStrength > 0.5 && v8.beatHz < 10, `V8 beat: ${v8.beatHz.toFixed(1)} Hz at ${v8.beatStrength.toFixed(2)}`);
  assert.ok(i6.firingStrength > v8.firingStrength, 'the inline 6 should have the cleaner, steadier firing note');
});

/* ---------- Measuring sound ---------- */

test('resampling keeps pitch and removes frequencies too high to represent', () => {
  const at48k = (hz) => Float32Array.from({ length: 4 * 48000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / 48000));
  assert.ok(Math.abs(analyze(resample(at48k(1000), 48000)).toneHz - 1000) < 30);
  const rms = (samples) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  assert.ok(rms(resample(at48k(18000), 48000)) < 0.02, 'an 18 kHz tone should not survive');
  assert.ok(rms(resample(at48k(1000), 48000)) > 0.3, 'a 1 kHz tone should survive');
});

test('hears a squeal as a tone, a tick as a tap, and noise as steady', () => {
  const hiss = noise(6, 0.05);
  const squeal = sine(2800, 6, 0.3).map((value, i) => value + hiss[i]);
  assert.equal(hearSound(analyze(squeal)).kind, 'tone');
  assert.equal(hearSound(analyze(clicks(6))).kind, 'tap');
  assert.equal(hearSound(analyze(noise(6, 0.3))).kind, 'steady');
});

test('measures a quiet microphone the same as a loud one', () => {
  const loud = clicks(6);
  const faint = loud.map((value) => value * 0.0005);
  assert.equal(hearSound(analyze(faint)).kind, hearSound(analyze(loud)).kind);
});

test('only rejects recordings that are too short or truly silent', () => {
  assert.equal(checkRecording(sine(500, 1)).problem, 'too-short');
  assert.equal(checkRecording(new Float32Array(4 * SAMPLE_RATE)).problem, 'silent');
  assert.equal(checkRecording(sine(500)).ok, true);
  assert.equal(checkRecording(sine(500, 4, 0.001)).ok, true, 'a quiet mic should still work');
  assert.equal(checkRecording(sine(500, 4, 3).map((v) => Math.max(-1, Math.min(1, v)))).overloaded, true);
});

/* ---------- Ranking ---------- */

test('answers alone point to the right fault, with no recording at all', () => {
  const top3 = (answers) => rankFaults({ answers }).slice(0, 3).map((entry) => entry.fault.id);
  assert.ok(top3({ words: ['squeal'], contexts: ['braking'], where: 'wheel', follows: 'road' }).includes('worn-brake-pads'));
  assert.ok(top3({ words: ['grind'], contexts: ['braking'], where: 'wheel', follows: 'road' }).includes('brake-grinding'));
  assert.ok(top3({ words: ['click'], contexts: ['turning'], where: 'wheel', follows: 'road' }).includes('cv-joint'));
  assert.ok(top3({ words: ['click'], contexts: ['starting'], where: 'engine', follows: 'neither' }).includes('starter-clicking'));
  assert.ok(top3({ words: ['hum'], contexts: ['cruising'], where: 'wheel', follows: 'road' }).includes('wheel-bearing'));
  assert.ok(top3({ words: ['hiss'], contexts: ['idling'], where: 'engine', follows: 'neither' }).includes('vacuum-leak'));
});

test('answers that contradict a fault lower its score', () => {
  const brakes = faultById('worn-brake-pads');
  assert.equal(symptomScore(brakes, {}), null);
  assert.equal(symptomScore(brakes, { words: ['squeal'], contexts: ['braking'] }), 100);
  assert.equal(symptomScore(brakes, { words: ['knock'], contexts: ['idling'] }), 0);
});

test('sound alone is never reported as a strong fit', () => {
  for (const samples of [clicks(6), sine(2800, 6), noise(6, 0.3)]) {
    const [top] = rankFaults({ print: analyze(samples) });
    assert.ok(top.fit < STRONG_FIT, `${top.fault.id} scored ${top.fit.toFixed(0)} from sound alone`);
  }
});

test('a close match with a real recording goes to the top', () => {
  const real = analyze(clicks(6));
  const saved = new Map([['lifter-tick', [{ print: real, origin: 'saved' }]]]);
  const again = analyze(clicks(6.1));
  const [top] = rankFaults({ print: again, saved });
  assert.equal(top.fault.id, 'lifter-tick');
  assert.ok(top.realMatch.score > 80);
});

test('choosing a petrol engine rules out diesel-only faults', () => {
  const ids = (engine) => rankFaults({ answers: { engine, words: ['knock'] } }).map((entry) => entry.fault.id);
  assert.ok(!ids('v8').includes('diesel-injector-knock'));
  assert.ok(ids('diesel6').includes('diesel-injector-knock'));
  assert.ok(ids(undefined).includes('diesel-injector-knock'));
});

/* ---------- Costs ---------- */

test('costs are sensible, and the quote checker flags outliers', () => {
  const pads = shopCost(faultById('worn-brake-pads'));
  assert.ok(pads.low >= 100 && pads.high <= 500, `pads: ${pads.low} to ${pads.high}`);
  assert.ok(shopCost(faultById('rod-knock')).high > 5000);
  assert.equal(shopCost(faultById('healthy-engine')), null);
  assert.equal(judgeQuote(faultById('worn-brake-pads'), 250).verdict, 'typical');
  assert.equal(judgeQuote(faultById('worn-brake-pads'), 1200).verdict, 'high');
  assert.equal(judgeQuote(faultById('worn-brake-pads'), 40).verdict, 'low');
});
