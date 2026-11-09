// Generates public/data/sound-database.json. Run with `npm run build:database`.
//
// It holds a picture of each reference sound, plus sound prints of any real recordings you have
// the rights to use. Put those in recordings/<fault-id>/*.wav. Only their measurements
// are stored, never the audio itself.
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ENGINES } from '../public/js/data/engines.js';
import { faultById, FAULTS } from '../public/js/data/faults.js';
import { analyze } from '../public/js/features.js';
import { synthesize } from '../public/js/synth.js';
import { readWav } from './wav.mjs';

const SECONDS = 4;
const RECORDINGS = fileURLToPath(new URL('../recordings/', import.meta.url));

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Packs two pixels into each byte at 16 shades. Smoothing on screen hides the difference. */
function packShades(data) {
  const packed = new Uint8Array(Math.ceil(data.length / 2));
  for (let i = 0; i < data.length; i++) {
    const shade = Math.round(data[i] / 17);
    packed[i >> 1] |= i % 2 === 0 ? shade << 4 : shade;
  }
  return packed;
}

const encodeImage = ({ image, seconds }) => ({
  columns: image.columns,
  rows: image.rows,
  seconds,
  shades: toBase64(packShades(image.data)),
  levels: toBase64(image.levels),
});
const list = (values, places) => Array.from(values, (value) => Number(value.toFixed(places)));

const faultImages = {};
FAULTS.forEach((fault, index) => {
  const engine = fault.onlyDiesel ? 'diesel4' : 'i4';
  faultImages[fault.id] = encodeImage(analyze(synthesize(fault.id, { seed: 1000 + index, duration: SECONDS, engine })));
});

const engineImages = {};
ENGINES.forEach((engine, index) => {
  const samples = synthesize('healthy-engine', { seed: 500 + index, duration: SECONDS, engine: engine.id, throughPhone: false });
  engineImages[engine.id] = encodeImage(analyze(samples));
});

const real = {};
let realCount = 0;
if (existsSync(RECORDINGS)) {
  for (const id of readdirSync(RECORDINGS)) {
    if (!faultById(id)) {
      if (!id.startsWith('.') && !id.endsWith('.md')) console.warn(`Skipping recordings/${id}: no fault has that id`);
      continue;
    }
    real[id] = readdirSync(`${RECORDINGS}${id}`).filter((name) => name.endsWith('.wav')).map((name) => {
      const print = analyze(readWav(`${RECORDINGS}${id}/${name}`));
      realCount++;
      return {
        shape: list(print.shape, 1),
        modLow: list(print.modLow, 3),
        modHigh: list(print.modHigh, 3),
        flatness: Number(print.flatness.toFixed(3)),
        toneHz: Math.round(print.toneHz),
        toneStrength: Number(print.toneStrength.toFixed(3)),
        beatHz: Number(print.beatHz.toFixed(2)),
        beatStrength: Number(print.beatStrength.toFixed(3)),
        firingHz: Number(print.firingHz.toFixed(2)),
        firingStrength: Number(print.firingStrength.toFixed(3)),
        seconds: print.seconds,
      };
    });
  }
}

const target = new URL('../public/data/sound-database.json', import.meta.url);
await mkdir(new URL('.', target), { recursive: true });
const json = JSON.stringify({ faultImages, engineImages, real });
await writeFile(target, json);
console.log(`Wrote pictures for ${FAULTS.length} faults and ${ENGINES.length} engines, ${realCount} real recordings, ${(json.length / 1024).toFixed(0)} KB`);
