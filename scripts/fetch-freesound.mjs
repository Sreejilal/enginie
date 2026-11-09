// Finds real recordings of faults on Freesound that anyone may reuse, so they can be checked by
// ear before they go anywhere near the database.
//
//   FREESOUND_TOKEN=<your API key> node scripts/fetch-freesound.mjs [fault-id ...]
//
// Get a free key at https://freesound.org/apiv2/apply. Only CC0 and CC BY sounds are kept, since
// those allow reuse with at most a credit. Candidates go to recordings-review/<fault-id>/, each
// folder with a SOURCES.md of credits, and recordings-review/index.html lets you listen to them.
// Move the ones that are right into recordings/<fault-id>/, with their credit lines, then run
// `npm run build:database`.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { faultById } from '../public/js/data/faults.js';

const TOKEN = process.env.FREESOUND_TOKEN;
const OUT = fileURLToPath(new URL('../recordings-review/', import.meta.url));
const API = 'https://freesound.org/apiv2';
const PER_FAULT = 15;
const PAUSE_MS = 1100; // Freesound allows 60 requests a minute.

// What to search for, and words a sound's title, tags or description must have to count.
// Faults that are normal at some level, such as turbo spool, are left out on purpose.
const SEARCHES = {
  'worn-brake-pads': { queries: ['brake squeal car', 'squeaky brakes car', 'brakes squeaking'], must: [/brake/, /squeal|squeak|screech/] },
  'brake-grinding': { queries: ['brake grinding', 'grinding brakes car'], must: [/brake/, /grind/] },
  'wheel-bearing': { queries: ['wheel bearing noise', 'bad wheel bearing'], must: [/bearing/] },
  'cv-joint': { queries: ['cv joint clicking', 'cv axle noise'], must: [/\bcv\b|constant velocity/] },
  'suspension-clunk': { queries: ['suspension clunk car', 'sway bar link clunk'], must: [/suspension|sway bar|stabili[sz]er|strut/, /clunk|knock|rattle/] },
  'slipping-belt': { queries: ['belt squeal car', 'serpentine belt squeal', 'fan belt squeal'], must: [/belt/, /squeal|squeak|chirp|screech/] },
  'alternator-whine': { queries: ['alternator whine', 'alternator bearing noise'], must: [/alternator/] },
  'power-steering-whine': { queries: ['power steering whine', 'power steering pump noise'], must: [/power steering/] },
  'lifter-tick': { queries: ['lifter tick', 'tappet noise', 'engine valve tick'], must: [/lifter|tappet|valve|tick/] },
  'rod-knock': { queries: ['rod knock', 'engine knocking', 'connecting rod knock'], must: [/knock/] },
  'engine-misfire': { queries: ['engine misfire', 'misfiring engine'], must: [/misfir/] },
  'timing-chain-rattle': { queries: ['timing chain rattle'], must: [/timing chain/] },
  'vacuum-leak': { queries: ['vacuum leak engine'], must: [/vacuum leak/] },
  'exhaust-leak': { queries: ['exhaust leak'], must: [/exhaust/, /leak/] },
  'heat-shield-rattle': { queries: ['heat shield rattle'], must: [/heat shield/] },
  'starter-clicking': { queries: ['car wont start clicking', 'starter clicking', 'dead battery car click'], must: [/start|crank|ignition|battery/, /click/] },
  'starter-grind': { queries: ['starter grinding'], must: [/starter/, /grind/] },
  'blower-motor': { queries: ['blower motor noise car', 'car heater fan noise'], must: [/blower|heater|fan/] },
  'fan-after-shutoff': { queries: ['car radiator fan running', 'car cooling fan engine off'], must: [/fan/, /radiator|cooling/] },
  'hot-exhaust-ticking': { queries: ['car engine cooling ticking', 'exhaust cooling down ticking', 'hot engine ticking'], must: [/cool/, /tick|click|ping|crackl/] },
};

// It has to be a road vehicle, and a recording of the real thing rather than a designed effect.
// Names of parts only cars have, and common makes, count as well as the word "car".
const VEHICLE = /\b(cars?|vehicle|truck|engine|auto|automobile|van|suv|jeep|pickup|sedan|hatchback|motor|lifter|tappet|serpentine|alternator|misfir\w*|exhaust|muffler|radiator|ignition|power steering|timing chain|heat shield|cv joint|cv axle|wheel bearing|toyota|honda|ford|chevy|chevrolet|nissan|vw|volkswagen|bmw|audi|mercedes|hyundai|kia|mazda|subaru|peugeot|renault|fiat|opel|vauxhall|skoda|volvo|dodge|gmc|lexus|mitsubishi|suzuki|citroen|saab|corolla|civic|camry|golf|jazz)\b/;
// Whole words only, so "toy" doesn't reject a Toyota, or "train" a drivetrain.
const REJECT = new RegExp(`\\b(${[
  'foley', 'sound ?design', 'designed', 'synth\\w*', 'video ?game', 'cartoon', 'toy', 'rc', 'scale model', 'model car',
  'lawn ?mower', 'motorbike', 'motorcycle', 'scooter', 'moped', 'bicycle', 'bike', 'boat', 'ship', 'train', 'tram',
  'subway', 'bus', 'plane', 'airplane', 'aeroplane', 'aircraft', 'helicopter', 'jet', 'drone', 'chainsaw', 'music',
  'remix', 'horror', 'creepy', 'whoosh', 'sci-?fi', 'door knock', 'knock(ing)? on (a |the )?(door|wood|table|window)',
].join('|')})\\b`);

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function licenseName(url) {
  if (/publicdomain\/zero/.test(url)) return 'CC0';
  const by = url.match(/licenses\/by\/(\d\.\d)/);
  return by ? `CC BY ${by[1]}` : null; // NC, sampling+ and the rest don't allow free reuse.
}

async function search(query) {
  const params = new URLSearchParams({
    query,
    filter: 'duration:[2 TO 120]',
    fields: 'id,name,description,tags,license,username,duration,previews,url',
    page_size: '40',
    token: TOKEN,
  });
  const response = await fetch(`${API}/search/text/?${params}`);
  if (response.status === 401) throw new Error('Freesound refused the key. Check FREESOUND_TOKEN.');
  if (!response.ok) throw new Error(`Freesound search failed (${response.status}) for "${query}"`);
  return (await response.json()).results ?? [];
}

function fits(sound, { must }) {
  const text = `${sound.name} ${sound.tags.join(' ')} ${sound.description}`.toLowerCase();
  return VEHICLE.test(text) && !REJECT.test(text) && must.every((pattern) => pattern.test(text));
}

if (!TOKEN) {
  console.error('Set FREESOUND_TOKEN to your Freesound API key. Get one free at https://freesound.org/apiv2/apply');
  process.exit(1);
}
const wanted = process.argv.slice(2);
for (const id of wanted) if (!SEARCHES[id]) throw new Error(`No Freesound search is set up for "${id}"`);

const report = [];
const used = new Set(); // A sound found for two faults is ambiguous, so it only counts once.
for (const [id, plan] of Object.entries(SEARCHES)) {
  if (wanted.length > 0 && !wanted.includes(id)) continue;
  const found = new Map();
  for (const query of plan.queries) {
    for (const sound of await search(query)) {
      if (found.size >= PER_FAULT) break;
      const license = licenseName(sound.license);
      if (license && !used.has(sound.id) && fits(sound, plan)) found.set(sound.id, { ...sound, license });
    }
    await pause();
  }

  await mkdir(`${OUT}${id}`, { recursive: true });
  const credits = [];
  for (const sound of found.values()) {
    const file = `fs${sound.id}.mp3`;
    const audio = await fetch(sound.previews['preview-hq-mp3']);
    if (!audio.ok) continue;
    await writeFile(`${OUT}${id}/${file}`, Buffer.from(await audio.arrayBuffer()));
    used.add(sound.id);
    credits.push(`- ${file}: "${sound.name}" by ${sound.username}, ${sound.license}, https://freesound.org/s/${sound.id}/`);
    report.push({ id, file, sound });
  }
  await writeFile(`${OUT}${id}/SOURCES.md`, `# ${faultById(id).name}\n\nFrom Freesound, checked by ear before use.\n\n${credits.join('\n')}\n`);
  console.log(`${id}: ${credits.length} candidates`);
}

// A page to listen to every candidate, grouped by fault, with what its uploader said about it.
const sections = Object.keys(SEARCHES).filter((id) => report.some((item) => item.id === id)).map((id) => {
  const rows = report.filter((item) => item.id === id).map(({ file, sound }) => `
    <li>
      <audio controls preload="none" src="${id}/${file}"></audio>
      <div><a href="https://freesound.org/s/${sound.id}/">${escapeHtml(sound.name)}</a> by ${escapeHtml(sound.username)}, ${sound.license}, ${sound.duration.toFixed(0)} s
      <p>${escapeHtml(sound.description).slice(0, 400)}</p><small>${escapeHtml(sound.tags.join(', '))}</small></div>
    </li>`).join('');
  return `<section><h2>${escapeHtml(faultById(id).name)} <code>${id}</code></h2><ol>${rows}</ol></section>`;
}).join('');

await writeFile(`${OUT}index.html`, `<!doctype html><meta charset="utf-8"><title>Recordings to check</title>
<style>body{font:15px/1.5 system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}li{display:flex;gap:1rem;margin:1rem 0}p{margin:.2rem 0;color:#444}small{color:#777}audio{flex:none}</style>
<h1>Recordings to check</h1><p>Listen to each one. Only keep a clip if you can clearly hear that fault in it.</p>${sections}`);
console.log(`\nListen to them in ${OUT}index.html`);
