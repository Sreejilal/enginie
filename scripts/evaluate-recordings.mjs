// The reality check. Measures how Enginie does on real recordings of known faults.
//
//   node scripts/evaluate-recordings.mjs <folder> [--half-as-references]
//
// Name files after the fault, such as lifter-tick_004.wav. To map other names, edit ALIASES.
// With --half-as-references, every other clip becomes a real reference and the rest are tested.
// Use this before trusting any change to the analysis. Generated sounds can't tell you this.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { faultById } from '../public/js/data/faults.js';
import { analyze } from '../public/js/features.js';
import { checkRecording, hearSound, rankFaults } from '../public/js/match.js';
import { readWav } from './wav.mjs';

const ALIASES = [
  [/belt/i, 'slipping-belt'],
  [/misfire/i, 'engine-misfire'],
  [/tappet/i, 'lifter-tick'],
  [/healthy|normal/i, 'healthy-engine'],
];

const folder = process.argv[2];
const halfAsReferences = process.argv.includes('--half-as-references');
if (!folder) {
  console.error('Usage: node scripts/evaluate-recordings.mjs <folder> [--half-as-references]');
  process.exit(1);
}

function faultFor(name) {
  const alias = ALIASES.find(([pattern]) => pattern.test(name));
  if (alias) return alias[1];
  const id = name.replace(/[_-]?\d*\.wav$/i, '');
  return faultById(id) ? id : null;
}

const clips = [];
let skipped = 0;
for (const name of readdirSync(folder).filter((file) => /\.wav$/i.test(file)).sort()) {
  const fault = faultFor(name);
  try {
    const samples = readWav(join(folder, name));
    if (!fault || !checkRecording(samples).ok) {
      skipped++;
      continue;
    }
    clips.push({ fault, print: analyze(samples) });
  } catch {
    skipped++;
  }
}

const saved = new Map();
const tested = halfAsReferences ? clips.filter((_, index) => index % 2 === 1) : clips;
if (halfAsReferences) {
  clips.filter((_, index) => index % 2 === 0).forEach((clip) => {
    if (!saved.has(clip.fault)) saved.set(clip.fault, []);
    saved.get(clip.fault).push({ print: clip.print, origin: 'saved' });
  });
}

const groups = [...new Set(tested.map((clip) => clip.fault))];
const kinds = ['tone', 'tap', 'uneven', 'steady'];

console.log(`\nWhat the recording measured as (${tested.length} clips, ${skipped} skipped)\n`);
console.log('fault'.padEnd(22), kinds.map((kind) => kind.padStart(8)).join(''));
for (const fault of groups) {
  const group = tested.filter((clip) => clip.fault === fault);
  const cells = kinds.map((kind) => {
    const share = group.filter((clip) => hearSound(clip.print).kind === kind).length / group.length;
    return `${Math.round(share * 100)}%`.padStart(8);
  });
  console.log(fault.padEnd(22), cells.join(''));
}

function score(label, answers) {
  let top1 = 0;
  let top3 = 0;
  for (const clip of tested) {
    const position = rankFaults({ print: clip.print, saved, answers }).findIndex((entry) => entry.fault.id === clip.fault);
    if (position === 0) top1++;
    if (position < 3) top3++;
  }
  const percent = (value) => `${Math.round((100 * value) / tested.length)}%`;
  console.log(`${label}`);
  console.log(`  Right at the top: ${percent(top1)}.  In the top three: ${percent(top3)}.\n`);
}

console.log(halfAsReferences ? '\nWith real references, among all faults:' : '\nAmong all faults:');
score('  Sound alone', {});
// Answers anyone could give about these clips, recorded parked with the engine running.
// They don't describe the sound itself, so they don't give the answer away.
score('  Sound plus basic answers (engine bay, follows the revs, idling)', {
  where: 'engine',
  follows: 'engine',
  contexts: ['idling'],
});
