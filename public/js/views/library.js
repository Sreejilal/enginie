// The fault database: search every fault, hear it, and read about it.

import { moneyRange, shopCost } from '../cost.js';
import { AREAS, faultById, FAULTS } from '../data/faults.js';
import { CONTEXTS } from '../data/symptoms.js';
import { SAMPLE_RATE } from '../features.js';
import { watchReveals } from '../motion.js';
import { showSound, viewFor, voiceNoteHtml } from '../soundview.js';
import {
  $, $$, databaseReady, deleteRecording, escapeHtml, state, stopAllPlayback, togglePlayback,
} from '../shared.js';
import { simulatedTake } from '../synth.js';
import { stampHtml, ticketHtml, wireTicket } from './ticket.js';

export function renderLibrary(main) {
  main.innerHTML = `
    <div class="page-head">
      <h1>Sound database</h1>
      <p>${FAULTS.length} faults, with what each one means, what it should cost and what to ask. The example sounds are computer-generated, so use them to get a feel for each noise, not as proof of a fault.</p>
    </div>
    <div class="filters">
      <label class="field-stack">
        <span>Search</span>
        <input id="search" type="search" placeholder="Squeal, knock, brakes" autocomplete="off">
      </label>
      <label class="field-stack">
        <span>Part of the vehicle</span>
        <select id="area">
          <option value="">All parts</option>
          ${AREAS.map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('')}
        </select>
      </label>
      <p class="filter-count" id="count" role="status"></p>
    </div>
    <ul class="fault-list" id="list"></ul>
    <p class="empty" id="empty" hidden></p>
  `;

  const list = $('#list', main);
  const search = $('#search', main);
  const area = $('#area', main);
  const count = $('#count', main);
  const empty = $('#empty', main);

  function row(fault) {
    const shop = shopCost(fault);
    const codes = state.mechanicMode && fault.pro.codes.length
      ? `<span class="fault-codes">${escapeHtml(fault.pro.codes.join('; '))}</span>`
      : '';
    return `
      <li class="fault-row">
        <button class="vn-play fault-play" type="button" data-play="${fault.id}" data-icon data-label="Play the ${escapeHtml(fault.name.toLowerCase())} example" aria-label="Play the ${escapeHtml(fault.name.toLowerCase())} example" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span></button>
        <a class="fault-link" href="#/fault/${fault.id}">
          <span class="sound-frame fault-thumb"><canvas data-id="${fault.id}" aria-hidden="true"></canvas></span>
          <span class="fault-text">
            <span class="fault-name">${escapeHtml(fault.name)}</span>
            <span class="fault-sound">${escapeHtml(fault.sound)}</span>
            ${codes}
          </span>
          <span class="fault-price">${shop ? moneyRange(shop) : 'No repair'}</span>
          ${stampHtml(fault, { mini: true, tag: 'span' })}
        </a>
      </li>`;
  }

  function render() {
    stopAllPlayback();
    const query = search.value.trim().toLowerCase();
    const matches = FAULTS.filter((fault) => {
      if (area.value && fault.area !== area.value) return false;
      const contexts = fault.contexts.map((id) => CONTEXTS[id]).join(' ');
      return `${fault.name} ${fault.area} ${fault.sound} ${fault.plain} ${contexts}`.toLowerCase().includes(query);
    });
    count.textContent = `${matches.length} of ${FAULTS.length} faults`;
    empty.hidden = matches.length > 0;
    list.hidden = matches.length === 0;
    empty.textContent = query
      ? `No faults mention “${search.value.trim()}”. Try a word like squeal, knock or rattle.`
      : 'No faults in this part of the vehicle.';
    list.innerHTML = matches.map(row).join('');
    if (state.db) {
      $$('canvas[data-id]', list).forEach((canvas) => {
        const image = state.db.faultImages.get(canvas.dataset.id);
        if (image) showSound(canvas, image, { compact: true, seconds: image.seconds });
      });
    }
  }

  search.addEventListener('input', render);
  area.addEventListener('change', render);
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-play]');
    if (button) playRow(button);
  });

  // The dot runs along the row's bars while its example plays.
  async function playRow(button) {
    const samples = simulatedTake(button.dataset.play);
    const view = viewFor($(`canvas[data-id="${button.dataset.play}"]`, list));
    const started = await togglePlayback(button, () => samples, () => view?.stopPlayhead());
    if (started) view?.playhead(samples.length / SAMPLE_RATE);
  }

  render();
  databaseReady.then(() => { if (main.contains(list)) render(); }).catch(() => {});
  return () => stopAllPlayback();
}

export function renderFault(main, id) {
  const fault = faultById(id);
  if (!fault) {
    main.innerHTML = `
      <div class="page-head">
        <h1>Fault not found</h1>
        <p>That link doesn’t match anything in the database. <a href="#/faults">Browse all the faults</a>.</p>
      </div>`;
    return () => {};
  }
  document.title = `${fault.name}: Enginie`;

  const extra = `
    <section class="ticket-row compare" aria-label="Example sound">
      <div class="field">
        <p class="field-label">Computer-generated example</p>
        ${voiceNoteHtml({ canvasId: 'fault-print', play: 'data-play="example"', label: 'Play the example', seconds: state.db?.faultImages.get(fault.id)?.seconds ?? 4 })}
      </div>
      <div class="field" id="saved-recordings"></div>
    </section>`;

  main.innerHTML = `
    <p class="crumb"><a href="#/faults">All faults</a></p>
    ${ticketHtml(fault, { label: fault.area, extra })}
    <p class="page-note">This is general guidance, not a diagnosis of your vehicle. <a href="#/">Check your own noise</a>.</p>
  `;

  const disconnect = wireTicket(main, fault);

  function renderSaved() {
    const host = $('#saved-recordings', main);
    if (!host) return;
    const recordings = state.saved.filter((recording) => recording.problemId === fault.id);
    const rows = recordings.map((recording) => {
      const date = new Date(recording.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <li>
          <span class="saved-date">${escapeHtml(date)}</span>
          <button class="btn" type="button" data-play-saved="${recording.id}" data-label="Play" data-ink>Play</button>
          <button class="btn" type="button" data-delete-saved="${recording.id}" aria-label="Delete the recording from ${escapeHtml(date)}">Delete</button>
        </li>`;
    }).join('');
    host.innerHTML = `
      <p class="field-label">Your recordings of this fault</p>
      ${recordings.length
        ? `<ul class="saved-list">${rows}</ul>`
        : '<p>None yet. After a mechanic confirms this fault, save your recording from your results. Real recordings make future matches far more reliable.</p>'}`;
  }
  renderSaved();

  const onClick = async (event) => {
    const example = event.target.closest('[data-play]');
    if (example) {
      const samples = simulatedTake(fault.id);
      const view = viewFor($('#fault-print', main));
      const started = await togglePlayback(example, () => samples, () => view?.stopPlayhead());
      if (started) view?.playhead(samples.length / SAMPLE_RATE);
      return;
    }
    const savedPlay = event.target.closest('[data-play-saved]');
    if (savedPlay) {
      const recording = state.saved.find((item) => item.id === Number(savedPlay.dataset.playSaved));
      if (recording) togglePlayback(savedPlay, () => recording.samples);
      return;
    }
    const remove = event.target.closest('[data-delete-saved]');
    if (remove && confirm('Delete this recording? This can’t be undone.')) {
      try {
        stopAllPlayback();
        await deleteRecording(Number(remove.dataset.deleteSaved));
        renderSaved();
      } catch {
        remove.textContent = 'Couldn’t delete';
      }
    }
  };
  main.addEventListener('click', onClick);

  databaseReady.then(() => {
    const canvas = $('#fault-print', main);
    const image = state.db.faultImages.get(fault.id);
    if (canvas && image) showSound(canvas, image, { compact: true, seconds: image.seconds });
    renderSaved();
  }).catch(() => {});

  const stopReveals = watchReveals(main);
  return () => {
    stopAllPlayback();
    disconnect();
    main.removeEventListener('click', onClick);
    stopReveals();
  };
}
