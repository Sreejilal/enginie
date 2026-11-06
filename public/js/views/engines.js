// Why a V8 and an inline 6 don't sound alike, shown from their real firing patterns.

import { engineById, ENGINES } from '../data/engines.js';
import { SAMPLE_RATE } from '../features.js';
import { watchReveals } from '../motion.js';
import { $, $$, engineOptions, escapeHtml, stopAllPlayback, togglePlayback } from '../shared.js';
import { synthesize } from '../synth.js';

const COMPARE_RPM = 720;
const SHOWN_SECONDS = 0.5;

const engineSound = (id, seconds = 5) => synthesize('healthy-engine', {
  seed: 321,
  duration: seconds,
  engine: id,
  rpm: COMPARE_RPM,
  throughPhone: false,
});

/** One full engine cycle, with a mark for each firing on the exhaust bank it goes down. */
function firingDiagram(engine) {
  const banks = Math.max(...engine.firing.map((cylinder) => cylinder.bank)) + 1;
  const rowHeight = 22;
  const height = banks * rowHeight + 18;
  const marks = engine.firing.map((cylinder) => {
    const x = ((cylinder.at + (cylinder.delay ?? 0)) / 720) * 97;
    return `<rect x="${x.toFixed(2)}%" y="${cylinder.bank * rowHeight + 4}" width="6" height="${rowHeight - 8}" rx="2"></rect>`;
  }).join('');
  const lines = Array.from({ length: banks }, (_, bank) => {
    const y = bank * rowHeight + rowHeight / 2;
    return `<line x1="0" x2="100%" y1="${y}" y2="${y}"></line>`;
  }).join('');
  const description = banks > 1
    ? `${engine.cylinders} firings over two turns of the crank, split between two exhaust banks.`
    : `${engine.cylinders} firings over two turns of the crank, through one exhaust.`;
  return `
    <svg class="firing" role="img" aria-label="${escapeHtml(description)}" width="100%" height="${height}">
      ${lines}${marks}
      <text x="0" y="${height - 3}">0°</text>
      <text x="100%" y="${height - 3}" text-anchor="end">720°, two crank turns</text>
    </svg>`;
}

/** The first half second of the sound as a shape, at the same engine speed for every engine. */
function drawWaveform(canvas, id) {
  const samples = engineSound(id, SHOWN_SECONDS + 0.1);
  const box = canvas.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);

  const count = Math.floor(SHOWN_SECONDS * SAMPLE_RATE);
  let peak = 0;
  for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const middle = canvas.height / 2;
  const scale = (canvas.height * 0.48) / (peak || 1);
  context.fillStyle = '#1a1f8f';
  for (let x = 0; x < canvas.width; x++) {
    const from = Math.floor((x / canvas.width) * count);
    const to = Math.max(from + 1, Math.floor(((x + 1) / canvas.width) * count));
    let low = 0;
    let high = 0;
    for (let i = from; i < to; i++) {
      low = Math.min(low, samples[i]);
      high = Math.max(high, samples[i]);
    }
    context.fillRect(x, middle - high * scale, 1, Math.max(1, (high - low) * scale));
  }
}

function sideHtml(side, chosen) {
  return `
    <div class="versus-side" data-side="${side}">
      <label class="field-stack">
        <span>Engine</span>
        <select data-pick="${side}">${engineOptions(chosen)}</select>
      </label>
      <div class="versus-detail"></div>
    </div>`;
}

function detailHtml(engine) {
  return `
    <p class="versus-character">${escapeHtml(engine.character)}</p>
    <p class="field-label">Half a second of its sound, at ${COMPARE_RPM} rpm</p>
    <canvas class="waveform" aria-hidden="true"></canvas>
    <button class="btn" type="button" data-hear="${engine.id}" data-label="Hear it" data-ink>Hear it</button>
    <p class="field-label">When each cylinder fires</p>
    ${firingDiagram(engine)}
    <p>${escapeHtml(engine.why)}</p>
    <p class="fine">Found in: ${escapeHtml(engine.examples)}.</p>`;
}

export function renderEngines(main) {
  main.innerHTML = `
    <div class="page-head">
      <h1>Why engines sound different</h1>
      <p>An engine’s note comes from when its exhaust pulses leave and which pipe they go down. Pick two to compare. Each sound is computer-generated from that engine’s real firing order, so it shows the character, not a particular vehicle.</p>
    </div>
    <div class="versus" data-reveal>
      ${sideHtml('a', 'v8')}
      ${sideHtml('b', 'i6')}
    </div>
    <section class="engine-all" data-reveal aria-labelledby="all-engines">
      <h2 id="all-engines">Every engine, side by side</h2>
      <ul>
        ${ENGINES.map((engine) => `
          <li class="engine-row">
            <button class="btn" type="button" data-hear="${engine.id}" data-label="Play" aria-label="Play ${escapeHtml(engine.name)}" data-ink>Play</button>
            <div>
              <p class="engine-name">${escapeHtml(engine.name)}</p>
              <p>${escapeHtml(engine.character)}</p>
            </div>
            <div class="engine-firing">${firingDiagram(engine)}</div>
          </li>`).join('')}
      </ul>
    </section>
  `;

  function showSide(side, id) {
    const host = $(`[data-side="${side}"] .versus-detail`, main);
    host.innerHTML = detailHtml(engineById(id));
    drawWaveform($('canvas', host), id);
  }

  showSide('a', 'v8');
  showSide('b', 'i6');

  const onChange = (event) => {
    const picker = event.target.closest('[data-pick]');
    if (!picker) return;
    stopAllPlayback();
    showSide(picker.dataset.pick, picker.value);
  };
  const onClick = (event) => {
    const button = event.target.closest('[data-hear]');
    if (button) togglePlayback(button, () => engineSound(button.dataset.hear));
  };
  main.addEventListener('change', onChange);
  main.addEventListener('click', onClick);

  let resizeTimer = null;
  const redraw = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      $$('[data-pick]', main).forEach((picker) => {
        const canvas = $(`[data-side="${picker.dataset.pick}"] canvas`, main);
        if (canvas) drawWaveform(canvas, picker.value);
      });
    }, 150);
  };
  addEventListener('resize', redraw);
  const stopReveals = watchReveals(main);

  return () => {
    stopAllPlayback();
    clearTimeout(resizeTimer);
    removeEventListener('resize', redraw);
    main.removeEventListener('change', onChange);
    main.removeEventListener('click', onClick);
    stopReveals();
  };
}
