// The main page: hear the engines, record the noise, answer a few questions, see what it could be.

import { decodeFile, listMicrophones, MAX_FILE_SECONDS, startRecording } from '../audio.js';
import { engineById } from '../data/engines.js';
import { faultById } from '../data/faults.js';
import { CONTEXTS, FOLLOWS, LOCATIONS, RED_FLAGS, SOUND_WORDS } from '../data/symptoms.js';
import { analyze, freqToPosition } from '../features.js';
import { checkRecording, fitLabel, hearSound, MIN_SECONDS, PARTIAL_FIT, RANGES, rankFaults } from '../match.js';
import { magnetize, reducedMotion, splitLetters, startWave, watchReveals } from '../motion.js';
import { attachReadout, drawImage, hideReadout, startLiveTrace } from '../prints.js';
import {
  $, $$, databaseReady, engineOptions, escapeHtml, faultOptions, readPreference, realReferences,
  saveRecording, state, stopAllPlayback, togglePlayback, writePreference,
} from '../shared.js';
import { simulatedTake, synthesize } from '../synth.js';
import { focusTicket, stampHtml, ticketHtml, wireTicket } from './ticket.js';

const RECORD_SECONDS = 8;
const SILENCE_CHECK_SECONDS = 2.5;
const SILENT_DB = -85;
const WAVE_ENGINES = ['i4', 'i6', 'v8', 'i3', 'v8-flat', 'boxer4', 'diesel6', 'v6'];
const CYCLE_SECONDS = 6;
const EXAMPLE_FAULT = 'rod-knock';
const REAL_MATCH = 80;

// Kept while moving between pages, so nobody loses their answers.
const session = {
  answers: { words: [], contexts: [], where: null, follows: null, engine: null, redFlags: [], afterRepair: false },
  recording: null,
  showResults: false,
  selectedId: null,
};

function micHelp(error, deviceLabel) {
  const system = /system/i.test(error?.message ?? '');
  const help = {
    NotAllowedError: system ? {
      title: 'Your computer is blocking the microphone',
      steps: [
        'On Windows: open Settings, then Privacy & security, then Microphone. Turn on access for desktop apps.',
        'On a Mac: open System Settings, then Privacy & Security, then Microphone, and allow your browser.',
        'Restart your browser, then try again.',
      ],
    } : {
      title: 'The microphone is blocked for this site',
      steps: [
        'Click the icon just left of the web address, and set Microphone to Allow.',
        'Reload the page if it asks you to, then try again.',
      ],
    },
    NotFoundError: {
      title: 'No microphone was found',
      steps: [
        'Connect a microphone or headset, then try again.',
        'If a Bluetooth headset is your default microphone, turn it on, or choose a different default in your computer’s sound settings.',
      ],
    },
    NotReadableError: {
      title: 'The microphone couldn’t be opened',
      steps: [
        'Close other apps that might be using it, such as Zoom, Teams or a voice recorder.',
        'If it still fails, restart your browser.',
      ],
    },
    InsecureContext: {
      title: 'The microphone only works on secure pages',
      steps: ['Browsers only allow it on https addresses or on localhost. Check that the address begins with https.'],
    },
    AudioBlocked: {
      title: 'The browser didn’t start its audio system',
      steps: ['Press Start recording again. If nothing changes, reload the page.'],
    },
    Silent: {
      title: 'No sound is reaching the site',
      steps: [
        `It’s listening with ${deviceLabel || 'your default microphone'}, but hearing silence. It may be muted or disconnected.`,
        'Choose a different microphone from the list below, if there is one.',
        'Check that your microphone isn’t muted in your computer’s sound settings, or by a switch on your headset.',
      ],
    },
  }[error?.name];
  return help ?? {
    title: 'The microphone didn’t start',
    steps: [`Your browser reported: ${error?.message || 'an unknown error'}. Reload the page and try again.`],
  };
}

function chipGroup(name, options, type = 'checkbox') {
  return Object.entries(options).map(([value, label]) => `
    <label class="chip">
      <input type="${type}" name="${name}" value="${value}">
      <span>${escapeHtml(label[0].toUpperCase() + label.slice(1))}</span>
    </label>`).join('');
}

function template() {
  return `
    <section class="hero">
      <h1 class="hero-title">What’s that noise?</h1>
      <div class="hero-foot">
        <p class="hero-lede">Find out what it could be, whether it’s safe to keep driving, what a fair price looks like and what to ask the mechanic. It’s free, and there’s nothing to sign up for.</p>
        <div class="hero-actions">
          <button class="cta cta-primary" type="button" data-go="recorder" data-ink data-magnet><span class="cta-dot" aria-hidden="true"></span>Record the noise</button>
          <button class="cta" type="button" data-go="questions" data-ink data-magnet>Describe it instead</button>
        </div>
      </div>
    </section>

    <section class="stage" aria-labelledby="stage-title">
      <canvas class="stage-wave" id="wave" aria-hidden="true"></canvas>
      <div class="stage-body">
        <div class="stage-text">
          <h2 id="stage-title">Every engine has its own voice</h2>
          <p class="stage-now"><strong id="stage-name"></strong> <span id="stage-character"></span></p>
          <a class="stage-link" href="#/engines">See why they sound different</a>
        </div>
        <div class="engine-chips" role="group" aria-label="Tap an engine to hear it">
          ${WAVE_ENGINES.map((id, index) => {
            const name = escapeHtml(engineById(id).name);
            return `<button class="engine-chip" type="button" style="--i:${index}" data-engine="${id}" data-label="${name}" data-playing-label="■ ${name}" aria-label="Hear a ${name}" aria-pressed="false" data-ink>${name}</button>`;
          }).join('')}
        </div>
      </div>
    </section>

    <section class="doors" data-reveal aria-labelledby="doors-title">
      <h2 id="doors-title">What brought you here?</h2>
      <ul>
        <li style="--i:0"><button class="door" type="button" data-go="recorder" data-ink><strong>My vehicle is making a noise</strong><span>Record it or describe it, and see what it could be.</span></button></li>
        <li style="--i:1"><a class="door" href="#/help/quote" data-ink><strong>A shop gave me a quote</strong><span>See whether the price is in the usual range, and what to ask.</span></a></li>
        <li style="--i:2"><a class="door" href="#/help/after" data-ink><strong>It got worse after a repair</strong><span>What to do, what to keep and how to get it put right.</span></a></li>
        <li style="--i:3"><a class="door" href="#/help/afford" data-ink><strong>I can’t afford this right now</strong><span>What can wait, what can’t, and the cheapest next step.</span></a></li>
        <li style="--i:4"><button class="door" type="button" data-action="mechanic" data-ink><strong>I’m a mechanic</strong><span>Turn on sound signatures, test steps, codes and book times.</span></button></li>
      </ul>
    </section>

    <section class="step" id="recorder" data-reveal aria-labelledby="record-title">
      <div class="step-head">
        <span class="step-number" aria-hidden="true">1</span>
        <div>
          <h2 id="record-title">Record it</h2>
          <p>Optional, but it helps. No microphone? <button class="link-button" type="button" data-go="questions">Skip to the questions</button>.</p>
        </div>
      </div>

      <div class="recorder">
        <div class="chart">
          <div class="chart-y" id="chart-y" aria-hidden="true"></div>
          <div class="chart-plot" id="chart-plot">
            <canvas id="scope" role="img" aria-label="Sound print of the recording"></canvas>
            <p class="chart-caption" id="scope-caption"></p>
          </div>
          <div class="chart-x" aria-hidden="true">
            <span>0 s</span>
            <span class="chart-key">Quiet <span class="chart-key-ramp"></span> Loud</span>
            <span id="chart-end">8 s</span>
          </div>
        </div>

        <div class="controls">
          <button class="record-button" id="record" type="button" data-ink>
            <span class="record-icon" aria-hidden="true"></span>
            <span id="record-label">Start recording</span>
          </button>
          <p class="timer" id="timer" aria-hidden="true">0:00 / 0:08</p>
          <div class="meter-wrap">
            <p class="meter-label" id="mic-name">Microphone level</p>
            <div class="level-meter" aria-hidden="true"><span id="level"></span></div>
          </div>
          <p class="status" id="status" role="status"></p>
        </div>

        <div class="mic-help" id="mic-help" role="alert" hidden></div>

        <div class="recorder-foot">
          <label class="field-stack" id="mic-picker" hidden>
            <span>Microphone</span>
            <select id="mic-select"></select>
          </label>
          <label class="btn file-button" data-ink>
            <input class="visually-hidden" id="upload" type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg">
            Upload a recording
          </label>
          <p class="fine">Your recording stays on this device. Nothing is uploaded.</p>
        </div>
      </div>

      <div class="tips">
        <p><strong>Stay safe.</strong> Keep your hands, phone and clothes clear of belts and fans.</p>
        <p><strong>Get close.</strong> Hold it near the noise, with the radio and cabin fans off.</p>
        <p><strong>On the road?</strong> Ask a passenger to record it. Never while you’re driving.</p>
      </div>

      <div class="heard" id="heard" hidden></div>
    </section>

    <section class="step" id="questions" data-reveal aria-labelledby="questions-title">
      <div class="step-head">
        <span class="step-number" aria-hidden="true">2</span>
        <div>
          <h2 id="questions-title">Tell us about it</h2>
          <p>Answer what you can. When and where a noise happens is often as useful as the sound itself.</p>
        </div>
      </div>

      <div class="question-grid">
        <fieldset class="question question-wide">
          <legend>What does it sound like?</legend>
          <div class="chips" id="word-chips">${chipGroup('words', SOUND_WORDS)}</div>
        </fieldset>
        <fieldset class="question question-wide">
          <legend>When does it happen?</legend>
          <div class="chips">${chipGroup('contexts', CONTEXTS)}</div>
        </fieldset>
        <fieldset class="question">
          <legend>Where does it seem to come from?</legend>
          <div class="chips">${chipGroup('where', LOCATIONS, 'radio')}</div>
        </fieldset>
        <fieldset class="question">
          <legend>Does it speed up with anything?</legend>
          <p class="hint">While parked, rev the engine gently. Does the noise follow?</p>
          <div class="chips">${chipGroup('follows', FOLLOWS, 'radio')}</div>
        </fieldset>
        <div class="question">
          <label class="legend-like" for="engine-select">What engine does it have?</label>
          <p class="hint">If you know. It rules out some faults and changes the example sounds.</p>
          <select id="engine-select">
            <option value="" data-hint="That’s fine. Check your owner’s manual if you want to find out.">Not sure</option>
            ${engineOptions()}
          </select>
        </div>
        <fieldset class="question question-wide">
          <legend>Is any of this happening too?</legend>
          <div class="chips">
            ${RED_FLAGS.map((flag) => `
              <label class="chip chip-warn">
                <input type="checkbox" name="redFlags" value="${flag.id}">
                <span>${escapeHtml(flag.label)}</span>
              </label>`).join('')}
            <label class="chip">
              <input type="checkbox" name="afterRepair" value="yes">
              <span>It started right after a repair or service</span>
            </label>
          </div>
        </fieldset>
      </div>

      <div class="go-bar">
        <button class="cta cta-primary" id="show-results" type="button" data-ink>See what it could be</button>
        <p class="status" id="go-status" role="status"></p>
      </div>
    </section>

    <section id="result" class="result" hidden></section>
  `;
}

export function renderHome(main) {
  main.innerHTML = template();
  splitLetters($('.hero-title', main));

  const cleanups = [watchReveals(main)];

  const el = {
    record: $('#record', main),
    recordLabel: $('#record-label', main),
    timer: $('#timer', main),
    status: $('#status', main),
    goStatus: $('#go-status', main),
    scope: $('#scope', main),
    caption: $('#scope-caption', main),
    chartEnd: $('#chart-end', main),
    level: $('#level', main),
    micName: $('#mic-name', main),
    micHelp: $('#mic-help', main),
    micPicker: $('#mic-picker', main),
    micSelect: $('#mic-select', main),
    upload: $('#upload', main),
    heard: $('#heard', main),
    result: $('#result', main),
    engine: $('#engine-select', main),
    stageName: $('#stage-name', main),
    stageCharacter: $('#stage-character', main),
  };

  let phase = 'idle';
  let recorder = null;
  let stopTrace = null;
  let timerHandle = null;
  let meterFrame = null;
  let loudestDb = -120;
  let ticketCleanup = null;

  /* ---------- The living wave ---------- */

  let waveIndex = 0;
  let userChoseEngine = false;
  const wave = startWave($('#wave', main), { engine: WAVE_ENGINES[0] });
  cleanups.push(() => wave.stop());

  function showEngine(id) {
    const engine = engineById(id);
    el.stageName.textContent = `${engine.name}:`;
    el.stageCharacter.textContent = engine.character;
    $$('.engine-chip', main).forEach((chip) => chip.classList.toggle('is-current', chip.dataset.engine === id));
    wave.setEngine(id);
  }
  showEngine(WAVE_ENGINES[0]);

  if (!reducedMotion()) {
    const cycle = setInterval(() => {
      if (userChoseEngine || document.hidden) return;
      waveIndex = (waveIndex + 1) % WAVE_ENGINES.length;
      showEngine(WAVE_ENGINES[waveIndex]);
    }, CYCLE_SECONDS * 1000);
    cleanups.push(() => clearInterval(cycle));

    // Scrolling stirs the ink, and the headline drifts up and away at its own pace.
    const hero = $('.hero', main);
    let lastY = scrollY;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const speed = Math.abs(scrollY - lastY);
        lastY = scrollY;
        hero.style.setProperty('--lift', Math.min(1, scrollY / 520).toFixed(3));
        if (speed > 2) wave.nudge(Math.min(6, speed * 0.07));
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => removeEventListener('scroll', onScroll));
  }
  cleanups.push(magnetize(main));

  /* ---------- Recording chart ---------- */

  (function setUpChart() {
    const axis = $('#chart-y', main);
    const plot = $('#chart-plot', main);
    let bottom = 0;
    for (const range of RANGES) {
      const top = range.below === Infinity ? 1 : freqToPosition(range.below);
      const label = document.createElement('span');
      label.textContent = range.name;
      label.style.bottom = `${((bottom + top) / 2) * 100}%`;
      axis.append(label);
      if (top < 1) {
        const line = document.createElement('div');
        line.className = 'chart-line';
        line.style.bottom = `${top * 100}%`;
        plot.append(line);
      }
      bottom = top;
    }
  })();

  function showExample() {
    const image = state.db?.faultImages.get(EXAMPLE_FAULT);
    if (!image) return;
    drawImage(el.scope, image);
    el.caption.textContent = `Example: ${faultById(EXAMPLE_FAULT).name.toLowerCase()}, computer-generated`;
    el.caption.hidden = false;
    el.chartEnd.textContent = '4 s';
  }

  function showRecordingOnChart() {
    const { print } = session.recording;
    drawImage(el.scope, print.image);
    el.caption.textContent = 'Your recording';
    el.caption.hidden = false;
    el.chartEnd.textContent = `${Math.round(print.seconds)} s`;
    el.scope.setAttribute('aria-label', `Sound print of your recording. ${hearSound(print).label}.`);
    attachReadout(el.scope, print.image, print.seconds);
  }

  /* ---------- Phases and messages ---------- */

  const IDLE_HINT = `Start while the noise is happening. It stops by itself after ${RECORD_SECONDS} seconds.`;
  const PHASE_LABELS = {
    idle: 'Start recording',
    asking: 'Waiting for microphone',
    recording: 'Stop recording',
    analysing: 'Measuring the sound',
  };

  function setStatus(message, isError = false) {
    el.status.textContent = message;
    el.status.classList.toggle('is-error', isError);
  }

  function setPhase(next) {
    phase = next;
    el.record.dataset.phase = next;
    el.recordLabel.textContent = PHASE_LABELS[next];
    el.record.disabled = next === 'asking' || next === 'analysing';
    el.upload.disabled = next !== 'idle';
    el.upload.closest('.file-button').dataset.disabled = String(next !== 'idle');
    el.micSelect.disabled = next !== 'idle';
  }

  const clock = (seconds) => `0:${String(Math.floor(seconds)).padStart(2, '0')}`;
  const setTimer = (elapsed = 0) => {
    el.timer.textContent = `${clock(elapsed)} / ${clock(RECORD_SECONDS)}`;
  };

  function hideMicHelp() {
    el.micHelp.hidden = true;
    el.micHelp.innerHTML = '';
  }

  function showMicHelp(error, deviceLabel) {
    const { title, steps } = micHelp(error, deviceLabel);
    el.micHelp.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <ul class="dash-list">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul>
      <p>You can still <button class="link-button" type="button" data-go="questions">answer the questions without it</button>, or upload a recording made on your phone.</p>`;
    el.micHelp.hidden = false;
  }

  /* ---------- Choosing a microphone ---------- */

  async function refreshMicrophones(activeId = null) {
    const microphones = await listMicrophones().catch(() => []);
    if (microphones.length === 0) return;
    const preferred = activeId ?? readPreference('enginie-mic');
    el.micSelect.innerHTML = microphones.map((mic) => `<option value="${escapeHtml(mic.id)}">${escapeHtml(mic.label)}</option>`).join('');
    if (microphones.some((mic) => mic.id === preferred)) el.micSelect.value = preferred;
    el.micPicker.hidden = microphones.length < 2;
  }
  refreshMicrophones();

  el.micSelect.addEventListener('change', () => {
    writePreference('enginie-mic', el.micSelect.value);
    hideMicHelp();
    setStatus(IDLE_HINT);
  });

  /* ---------- Recording ---------- */

  function runMeter() {
    if (!recorder) return;
    const db = recorder.level();
    if (db > loudestDb) loudestDb = db;
    el.level.style.transform = `scaleX(${Math.max(0, Math.min(1, (db + 80) / 70))})`;
    meterFrame = requestAnimationFrame(runMeter);
  }

  function stopMeters() {
    clearInterval(timerHandle);
    cancelAnimationFrame(meterFrame);
    stopTrace?.();
    el.level.style.transform = 'scaleX(0)';
  }

  async function beginRecording() {
    stopAllPlayback();
    hideMicHelp();
    setStatus('Allow the microphone if your browser asks.');
    setPhase('asking');
    try {
      recorder = await startRecording({
        deviceId: el.micSelect.value || readPreference('enginie-mic'),
        onTrackEnded: () => finishRecording(),
      });
    } catch (error) {
      setPhase('idle');
      setStatus('');
      showMicHelp(error);
      refreshMicrophones();
      return;
    }

    setPhase('recording');
    setStatus('Listening. Keep the microphone near the noise.');
    el.micName.textContent = recorder.deviceLabel ? `Listening with ${recorder.deviceLabel}` : 'Microphone level';
    refreshMicrophones(recorder.deviceId);
    el.caption.hidden = true;
    el.chartEnd.textContent = `${RECORD_SECONDS} s`;
    stopTrace = startLiveTrace(el.scope, recorder.analyser, recorder.sampleRate, RECORD_SECONDS);

    loudestDb = -120;
    runMeter();

    const started = performance.now();
    const label = recorder.deviceLabel;
    let warned = false;
    timerHandle = setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      setTimer(Math.min(elapsed, RECORD_SECONDS));
      if (!warned && elapsed > SILENCE_CHECK_SECONDS && loudestDb < SILENT_DB) {
        warned = true;
        showMicHelp({ name: 'Silent' }, label);
      }
      if (elapsed >= RECORD_SECONDS) finishRecording();
    }, 100);
  }

  async function finishRecording() {
    if (phase !== 'recording' || !recorder) return;
    stopMeters();
    setPhase('analysing');
    setStatus('');
    const finished = recorder;
    recorder = null;
    const samples = await finished.stop();
    await useSamples(samples, { source: 'microphone', deviceLabel: finished.deviceLabel });
  }

  async function useSamples(samples, details) {
    setPhase('analysing');
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    const check = checkRecording(samples);
    setTimer();
    if (!check.ok) {
      setPhase('idle');
      if (check.problem === 'silent') {
        setStatus('');
        showMicHelp({ name: 'Silent' }, details.deviceLabel);
      } else {
        setStatus(`That recording was too short. Record at least ${MIN_SECONDS} seconds.`, true);
      }
      return;
    }

    hideMicHelp();
    session.recording = { samples, print: analyze(samples), overloaded: check.overloaded, savedAs: null, ...details };
    showRecordingOnChart();
    setPhase('idle');
    setStatus(IDLE_HINT);
    showHeard();
    if (session.showResults) renderResults();
    else $('#questions', main).scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function showHeard() {
    const recording = session.recording;
    if (!recording) return;
    const heard = hearSound(recording.print);
    const detail = heard.pitch
      ? ` near ${heard.pitch}`
      : heard.beatsPerSecond ? `, about ${Math.round(heard.beatsPerSecond)} times a second` : '';
    el.heard.hidden = false;
    el.heard.innerHTML = `
      <p class="field-label">What we measured</p>
      <p class="heard-kind">${escapeHtml(heard.label)}${detail}</p>
      <p>${escapeHtml(heard.meaning)} We’ve marked the words that usually go with it below.</p>
      ${recording.overloaded ? '<p class="heard-warning">The microphone was overloaded, so move back a little if you record again.</p>' : ''}
      ${recording.trimmed ? `<p class="heard-warning">Enginie measured the first ${MAX_FILE_SECONDS} seconds of this file.</p>` : ''}`;

    // Point out the words that usually go with this kind of sound, without choosing for them.
    $$('#word-chips .chip', main).forEach((chip) => {
      chip.classList.toggle('is-suggested', heard.words.includes($('input', chip).value));
    });
  }

  /* ---------- Answers ---------- */

  function restoreAnswers() {
    const { answers } = session;
    for (const name of ['words', 'contexts', 'redFlags']) {
      answers[name].forEach((value) => {
        const input = $(`input[name="${name}"][value="${value}"]`, main);
        if (input) input.checked = true;
      });
    }
    for (const name of ['where', 'follows']) {
      const input = answers[name] && $(`input[name="${name}"][value="${answers[name]}"]`, main);
      if (input) {
        input.checked = true;
        input.dataset.was = 'on';
      }
    }
    $('input[name="afterRepair"]', main).checked = answers.afterRepair;
    el.engine.value = answers.engine ?? '';
  }

  function readAnswers() {
    const checked = (name) => $$(`input[name="${name}"]:checked`, main).map((input) => input.value);
    session.answers = {
      words: checked('words'),
      contexts: checked('contexts'),
      where: checked('where')[0] ?? null,
      follows: checked('follows')[0] ?? null,
      engine: el.engine.value || null,
      redFlags: checked('redFlags'),
      afterRepair: checked('afterRepair').length > 0,
    };
  }

  const hasAnswers = () => {
    const { words, contexts, where, follows } = session.answers;
    return words.length > 0 || contexts.length > 0 || Boolean(where) || Boolean(follows);
  };

  // Tapping a chosen single-answer chip again clears it, so nobody gets stuck with a wrong guess.
  const questions = $('#questions', main);
  questions.addEventListener('click', (event) => {
    const input = event.target.closest('.chip input[type="radio"]');
    if (!input) return;
    if (input.dataset.was === 'on') {
      input.checked = false;
      input.dataset.was = '';
      questions.dispatchEvent(new Event('change'));
    } else {
      $$(`input[name="${input.name}"]`, main).forEach((other) => { other.dataset.was = ''; });
      input.dataset.was = 'on';
    }
  });

  questions.addEventListener('change', () => {
    readAnswers();
    session.selectedId = null;
    if (session.showResults) renderResults();
  });

  /* ---------- Results ---------- */

  function candidateRow(entry, selected) {
    const { fault } = entry;
    const label = entry.realMatch?.score >= REAL_MATCH ? 'Matches a real recording' : fitLabel(entry.fit);
    return `
      <li>
        <button class="candidate ${selected ? 'is-selected' : ''}" type="button" data-select="${fault.id}" aria-pressed="${selected}" data-ink>
          <span class="candidate-name">${escapeHtml(fault.name)}</span>
          <span class="candidate-fit">${escapeHtml(label)}</span>
          <span class="meter" aria-hidden="true"><span style="width:${Math.round(entry.fit)}%"></span></span>
          ${stampHtml(fault, { mini: true, tag: 'span' })}
        </button>
      </li>`;
  }

  function redFlagsHtml() {
    const flags = RED_FLAGS.filter((flag) => session.answers.redFlags.includes(flag.id));
    if (flags.length === 0) return '';
    return `
      <section class="alarm" role="alert" aria-label="Safety first">
        ${flags.map((flag) => `
          <div>
            <h3>${escapeHtml(flag.title)}</h3>
            <p>${escapeHtml(flag.advice)}</p>
          </div>`).join('')}
      </section>`;
  }

  function compareSection(fault) {
    const recording = session.recording;
    const image = state.db?.faultImages.get(fault.id);
    const engine = engineById(session.answers.engine);
    return `
      <section class="ticket-row compare" aria-label="Compare by ear">
        <div class="field">
          <p class="field-label">Your recording</p>
          ${recording ? `
            <canvas id="print-yours" role="img" aria-label="Sound print of your recording."></canvas>
            <button class="btn" type="button" data-action="play-recording" data-label="Play your recording" data-ink>Play your recording</button>
          ` : '<p>Record the noise above to see and hear it next to this example.</p>'}
        </div>
        <div class="field">
          <p class="field-label">Computer-generated example${engine && fault.id !== 'diesel-injector-knock' ? ` on a ${escapeHtml(engine.name)}` : ''}</p>
          ${image ? '<canvas id="print-theirs" aria-hidden="true"></canvas>' : ''}
          <button class="btn" type="button" data-action="play-sample" data-label="Play the example" data-ink>Play the example</button>
        </div>
      </section>`;
  }

  function saveSection(fault) {
    const recording = session.recording;
    if (!recording) return '';
    if (recording.savedAs) {
      return `<section class="ticket-block" aria-label="Saved"><p class="field-label">Saved</p><p role="status">Saved under “${escapeHtml(recording.savedAs)}”. Enginie will now compare new recordings with it. In our tests, real recordings like this were the most reliable evidence of all.</p></section>`;
    }
    if (state.storageFailed) {
      return '<section class="ticket-block"><p class="field-label">Save your recording</p><p>This browser is blocking storage, so recordings can’t be saved. Private windows often do this.</p></section>';
    }
    return `
      <section class="ticket-block" aria-label="Save your recording">
        <p class="field-label">Has a mechanic confirmed the fault?</p>
        <p>Save this recording under it. Real recordings are what make future matches reliable, and it stays in this browser.</p>
        <form class="save-row" id="save-form">
          <label class="field-stack">
            <span>Confirmed fault</span>
            <select name="fault">${faultOptions(fault.id)}</select>
          </label>
          <button class="btn btn-solid" type="submit" data-ink>Save recording</button>
        </form>
        <p class="is-error" id="save-error" role="alert"></p>
      </section>`;
  }

  function currentRanking() {
    return rankFaults({ print: session.recording?.print ?? null, answers: session.answers, saved: realReferences() });
  }

  function renderResults({ moveFocus = false, animate = false } = {}) {
    if (!state.db) return;
    stopAllPlayback();
    hideReadout();
    ticketCleanup?.();

    const ranking = currentRanking();
    const top = ranking.slice(0, 3);
    const selected = ranking.find((entry) => entry.fault.id === session.selectedId) ?? top[0];
    const { fault } = selected;
    const shown = top.includes(selected) ? top : [...top.slice(0, 2), selected];
    const unsure = selected === top[0] && top[0].fit < PARTIAL_FIT;

    let leadIn = 'These are possibilities to check, not a diagnosis. Compare the examples with what you hear, and take the shortlist to a mechanic.';
    if (!hasAnswers()) leadIn = 'The sound alone only narrows down the kind of problem. Answer the questions above to sharpen this list.';
    else if (unsure) leadIn = 'Nothing fits well, so treat these as weak guesses. Try recording closer to the noise, or add more answers.';

    el.result.hidden = false;
    el.result.innerHTML = `
      ${redFlagsHtml()}
      <div class="result-head">
        <h2>What it could be</h2>
        <p>${escapeHtml(leadIn)}</p>
      </div>
      <ul class="candidates">
        ${shown.map((entry) => candidateRow(entry, entry === selected)).join('')}
      </ul>
      ${ticketHtml(fault, {
        label: selected === top[0] ? 'Best match' : 'Another possibility',
        unsure,
        afterRepair: session.answers.afterRepair,
        animate,
        extra: compareSection(fault),
        note: selected.realMatch?.score >= REAL_MATCH
          ? '<p class="score-note">This closely matches a real recording of this fault, which is the most reliable evidence we have.</p>'
          : '',
      })}
      ${saveSection(fault)}
      ${session.answers.afterRepair ? '<p class="ticket-notice">Did it start right after a repair? <a href="#/help/after">Here’s what to do, step by step</a>.</p>' : ''}
    `;

    ticketCleanup = wireTicket(el.result, fault);

    const yours = $('#print-yours', el.result);
    if (yours && session.recording) {
      drawImage(yours, session.recording.print.image);
      attachReadout(yours, session.recording.print.image, session.recording.print.seconds);
    }
    const theirs = $('#print-theirs', el.result);
    const image = state.db.faultImages.get(fault.id);
    if (theirs && image) drawImage(theirs, image);

    if (moveFocus) {
      el.result.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      focusTicket(el.result);
    }
  }

  el.result.addEventListener('click', (event) => {
    const select = event.target.closest('[data-select]');
    if (select) {
      session.selectedId = select.dataset.select;
      renderResults({ animate: true });
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'play-recording' && session.recording) {
      togglePlayback(button, () => session.recording.samples);
    } else if (button.dataset.action === 'play-sample') {
      const id = session.selectedId ?? currentRanking()[0].fault.id;
      togglePlayback(button, () => simulatedTake(id, session.answers.engine));
    }
  });

  el.result.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = new FormData(event.target).get('fault');
    const { samples, print } = session.recording;
    try {
      await saveRecording(id, samples, print);
      session.recording.savedAs = faultById(id).name;
      renderResults();
    } catch {
      $('#save-error', el.result).textContent = 'The recording didn’t save. Your browser’s storage may be full or blocked.';
    }
  });

  /* ---------- Wiring ---------- */

  el.record.addEventListener('click', () => {
    if (phase === 'recording') finishRecording();
    else if (phase === 'idle') beginRecording();
  });

  el.upload.addEventListener('change', async () => {
    const file = el.upload.files[0];
    el.upload.value = '';
    if (!file) return;
    stopAllPlayback();
    hideMicHelp();
    setPhase('analysing');
    setStatus('');
    try {
      const { samples, trimmed } = await decodeFile(file);
      await useSamples(samples, { source: 'file', trimmed });
    } catch {
      setPhase('idle');
      setStatus(`“${file.name}” couldn’t be read. Use an audio file such as WAV, MP3 or M4A.`, true);
    }
  });

  $('#show-results', main).addEventListener('click', async () => {
    readAnswers();
    if (!hasAnswers() && !session.recording) {
      el.goStatus.textContent = 'Record the noise or answer at least one question first.';
      el.goStatus.classList.add('is-error');
      return;
    }
    el.goStatus.textContent = '';
    el.goStatus.classList.remove('is-error');
    try {
      await databaseReady;
    } catch {
      el.goStatus.textContent = 'Part of the site didn’t load. Check your connection and reload the page.';
      el.goStatus.classList.add('is-error');
      return;
    }
    session.showResults = true;
    session.selectedId = null;
    renderResults({ moveFocus: true, animate: true });
  });

  $$('.engine-chip', main).forEach((chip) => {
    chip.addEventListener('click', () => {
      userChoseEngine = true;
      const id = chip.dataset.engine;
      showEngine(id);
      wave.setExcited(true);
      togglePlayback(
        chip,
        () => synthesize('healthy-engine', { seed: 321, duration: 5, engine: id, throughPhone: false }),
        () => wave.setExcited(false),
      );
    });
  });

  main.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]');
    if (go) $(`#${go.dataset.go}`, main).scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });

  setPhase('idle');
  setTimer();
  setStatus(IDLE_HINT);
  restoreAnswers();

  databaseReady.then(() => {
    if (!main.contains(el.scope)) return;
    if (session.recording) {
      showRecordingOnChart();
      showHeard();
    } else {
      showExample();
    }
    if (session.showResults) renderResults();
  }).catch(() => {
    if (main.contains(el.status)) setStatus('Part of the site didn’t load, but you can still record. Reload the page when you’re back online.', true);
  });

  return () => {
    if (recorder) {
      stopMeters();
      recorder.stop().catch(() => {});
      recorder = null;
    }
    ticketCleanup?.();
    hideReadout();
    cleanups.forEach((cleanup) => cleanup());
  };
}
