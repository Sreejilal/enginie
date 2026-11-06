// State and small helpers used by every page.

import { play, stopPlayback } from './audio.js';
import { ENGINES } from './data/engines.js';
import { AREAS, FAULTS } from './data/faults.js';
import { parseDatabase } from './match.js';
import * as store from './store.js';

export const state = {
  db: null,
  saved: [], // Recordings saved in this browser
  storageFailed: false,
  mechanicMode: readPreference('enginie-mechanic') === 'on',
  playingButton: null,
};

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Every fault as dropdown options, grouped by part of the vehicle. */
export function faultOptions(selectedId = null, { repairableOnly = false } = {}) {
  return AREAS.map((area) => {
    const faults = FAULTS.filter((fault) => fault.area === area && !(repairableOnly && fault.noRepair));
    if (faults.length === 0) return '';
    const options = faults.map((fault) => `<option value="${fault.id}"${fault.id === selectedId ? ' selected' : ''}>${escapeHtml(fault.name)}</option>`);
    return `<optgroup label="${escapeHtml(area)}">${options.join('')}</optgroup>`;
  }).join('');
}

/** Every engine as dropdown options, each with a couple of vehicles that have one. */
export function engineOptions(selectedId = null) {
  return ENGINES.map((engine) => {
    const examples = engine.examples.split(', ').slice(0, 2).join(', ');
    return `<option value="${engine.id}" data-hint="${escapeHtml(examples)}"${engine.id === selectedId ? ' selected' : ''}>${escapeHtml(engine.name)}</option>`;
  }).join('');
}

export function listWithOr(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

export function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Some private windows block storage. It's only a convenience, so carry on without it.
  }
}

export const databaseReady = (async () => {
  const response = await fetch('data/sound-database.json');
  if (!response.ok) throw new Error(`The sound database returned status ${response.status}`);
  state.db = parseDatabase(await response.json());

  try {
    // Recordings saved by an older version are missing measurements, so they can't be compared.
    state.saved = (await store.listRecordings()).filter((recording) => recording.print?.beatHz !== undefined);
  } catch {
    state.storageFailed = true;
  }
})();

/** Every real recording we can compare with, from the database file and from this browser. */
export function realReferences() {
  const references = new Map();
  for (const [id, takes] of state.db?.realPrints ?? []) references.set(id, [...takes]);
  for (const recording of state.saved) {
    if (!references.has(recording.problemId)) references.set(recording.problemId, []);
    references.get(recording.problemId).push({ print: recording.print, origin: 'saved' });
  }
  return references;
}

export async function saveRecording(problemId, samples, print) {
  const recording = { problemId, samples, print, createdAt: Date.now() };
  recording.id = await store.addRecording(recording);
  state.saved.push(recording);
  return recording;
}

export async function deleteRecording(id) {
  await store.deleteRecording(id);
  state.saved = state.saved.filter((recording) => recording.id !== id);
}

/* ---------- Playback buttons ---------- */

function resetPlayButton(button) {
  button.textContent = button.dataset.label;
  button.dataset.playing = 'false';
  button.setAttribute('aria-pressed', 'false');
}

export function stopAllPlayback() {
  stopPlayback();
  if (state.playingButton) resetPlayButton(state.playingButton);
  state.playingButton = null;
}

/** Plays on the first press, stops on the second. `onFinished` runs whenever it stops. */
export async function togglePlayback(button, getSamples, onFinished = () => {}) {
  const wasPlaying = state.playingButton === button;
  stopAllPlayback();
  if (wasPlaying) {
    onFinished();
    return false;
  }

  state.playingButton = button;
  button.textContent = button.dataset.playingLabel ?? 'Stop';
  button.dataset.playing = 'true';
  button.setAttribute('aria-pressed', 'true');
  await play(getSamples(), () => {
    if (state.playingButton === button) {
      resetPlayButton(button);
      state.playingButton = null;
    }
    onFinished();
  });
  return true;
}
