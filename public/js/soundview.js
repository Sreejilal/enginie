// Draws sounds the way a voice message does: a row of rounded bars, taller where it's louder.
// Each bar is coloured by its pitch, from a warm orange rumble up to a cool aqua hiss, so a
// squeal and a knock look different at a glance. While a sound plays, the bars behind the dot
// light up and the ones ahead wait, dimmed.

import { freqToPosition, positionToFreq, RANGES } from './features.js';

// From rumble at 0 to hiss at 1, in the same positions as the pitch scale used for matching.
const PITCH_STOPS = [
  [0, [255, 96, 64]],
  [0.28, [255, 160, 52]],
  [0.5, [255, 223, 63]],
  [0.74, [150, 240, 165]],
  [1, [100, 224, 255]],
];

const PITCH_COLOURS = Array.from({ length: 65 }, (_, i) => {
  const level = i / 64;
  const upper = Math.max(1, PITCH_STOPS.findIndex(([stop]) => stop >= level));
  const [toStop, to] = PITCH_STOPS[upper];
  const [fromStop, from] = PITCH_STOPS[upper - 1];
  const blend = (level - fromStop) / (toStop - fromStop);
  const [r, g, b] = from.map((value, c) => Math.round(value + (to[c] - value) * blend));
  return `rgb(${r}, ${g}, ${b})`;
});
const pitchColour = (position) => PITCH_COLOURS[Math.round(Math.min(1, Math.max(0, position)) * 64)];

const pitchName = (position) => {
  const hz = positionToFreq(Math.min(0.999, Math.max(0, position)));
  return (RANGES.find((range) => hz < range.below) ?? RANGES[RANGES.length - 1]).name.toLowerCase();
};

const HOT = '#fff6d6';
const RECORDING = '#ff5a5f';

/** Fades the quietest parts of the pitch picture so background noise doesn't pull the colour around. */
const CONTRAST = Uint8Array.from({ length: 256 }, (_, value) => Math.round(255 * Math.max(0, (value / 255 - 0.22) / 0.78) ** 1.15));

/** Older saved recordings have no loudness line, so work one out from the picture. */
function levelsOf(image) {
  if (image.levels) return image.levels;
  const levels = new Uint8Array(image.columns);
  for (let column = 0; column < image.columns; column++) {
    let peak = 0;
    for (let row = 0; row < image.rows; row++) peak = Math.max(peak, image.data[column * image.rows + row]);
    levels[column] = peak;
  }
  image.levels = levels;
  return levels;
}

// Loudness is shown against the clip's own range, so beats and swells stand out the way they do
// in a voice message. The minimum span keeps a steady sound looking steady instead of jagged.
const MIN_SPAN = 120;

function normalise(raw, count = raw.length, minSpan = MIN_SPAN) {
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < count; i++) {
    if (raw[i] < low) low = raw[i];
    if (raw[i] > high) high = raw[i];
  }
  const floor = Math.min(low, high - minSpan);
  const span = Math.max(1e-6, high - floor);
  const out = new Float32Array(raw.length);
  for (let i = 0; i < count; i++) out[i] = ((raw[i] - floor) / span) ** 1.7;
  return out;
}

const barCache = new WeakMap();

/** How loud each bar is, from 0 to 1, and where its sound sits in pitch. Worked out once per size. */
function barsOf(image, count) {
  let byCount = barCache.get(image);
  if (!byCount) barCache.set(image, (byCount = new Map()));
  const cached = byCount.get(count);
  if (cached) return cached;

  const levels = levelsOf(image);
  const raw = new Float32Array(count);
  const centres = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const from = Math.min(image.columns - 1, Math.floor((i * image.columns) / count));
    const to = Math.max(from + 1, Math.floor(((i + 1) * image.columns) / count));
    let peak = 0;
    let sum = 0;
    let weight = 0;
    let centre = 0;
    for (let column = from; column < to; column++) {
      peak = Math.max(peak, levels[column]);
      sum += levels[column];
      for (let row = 0; row < image.rows; row++) {
        const strength = CONTRAST[image.data[column * image.rows + row]] ** 2;
        weight += strength;
        centre += strength * ((row + 0.5) / image.rows);
      }
    }
    // Partly the loudest moment, so knocks show, and partly the moment under the bar's middle,
    // so a beat keeps its ups and downs instead of every bar reaching the same peak.
    raw[i] = 0.45 * peak + 0.35 * levels[(from + to) >> 1] + (0.2 * sum) / (to - from);
    centres[i] = weight ? centre / weight : 0.4;
  }
  // Neighbouring bars share a little of their colour, so it flows instead of flickering.
  const pitch = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const before = centres[Math.max(0, i - 1)];
    const after = centres[Math.min(count - 1, i + 1)];
    pitch[i] = 0.25 * before + 0.5 * centres[i] + 0.25 * after;
  }
  const bars = { amps: normalise(raw), pitch };
  byCount.set(count, bars);
  return bars;
}

/**
 * Bar thickness and spacing, about as much gap as bar, like a voice message. Big screens get
 * chunkier bars, and the tallest bar stops short of the edge so loud parts have room to stand out.
 */
function geometry(width, height, compact) {
  const bar = compact ? 3 : 5;
  const gap = compact ? (width < 200 ? 2.5 : 3) : 4;
  const count = Math.max(8, Math.floor((width + gap) / (bar + gap)));
  const step = count > 1 ? (width - bar) / (count - 1) : 0;
  const middle = height / 2;
  const pad = compact ? Math.min(6, height * 0.1) : 18;
  const maxHalf = Math.max(2, Math.min(middle - pad, compact ? middle : 110));
  const minHalf = Math.min(maxHalf, bar / 2 + 0.75);
  return { bar, count, step, middle, maxHalf, minHalf, x: (i) => bar / 2 + i * step };
}

/**
 * One rounded bar with a soft halo and a bright core, like a lit tube. The halo is a wider,
 * faint stroke rather than a shadow blur, which would cost far more to draw.
 */
function drawBar(context, x, middle, half, bar, colour, { halo = true, core = true } = {}) {
  const reach = Math.max(0.01, half - bar / 2);
  context.strokeStyle = colour;
  if (halo) {
    context.globalAlpha = 0.16;
    context.lineWidth = bar + 5;
    context.beginPath();
    context.moveTo(x, middle - reach);
    context.lineTo(x, middle + reach);
    context.stroke();
    context.globalAlpha = 1;
  }
  context.lineWidth = bar;
  context.beginPath();
  context.moveTo(x, middle - reach);
  context.lineTo(x, middle + reach);
  context.stroke();
  if (core && half > bar * 1.5) {
    context.strokeStyle = HOT;
    context.globalAlpha = 0.5;
    context.lineWidth = Math.max(1, bar * 0.38);
    context.beginPath();
    context.moveTo(x, middle - reach * 0.55);
    context.lineTo(x, middle + reach * 0.55);
    context.stroke();
    context.globalAlpha = 1;
  }
}

function knob(context, x, y, radius, colour) {
  context.fillStyle = colour;
  context.globalAlpha = 0.22;
  context.beginPath();
  context.arc(x, y, radius * 2.1, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

const clockText = (seconds, round = Math.floor) => {
  const whole = Math.max(0, round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * Markup for a voice-message player: a round play button, the bars and a clock. `play` is the
 * attribute that the page's click handler looks for. Labels must already be escaped.
 */
export function voiceNoteHtml({ canvasId, canvasLabel = '', play, label, seconds = 0 }) {
  const canvasAttributes = canvasLabel ? `role="img" aria-label="${canvasLabel}"` : 'aria-hidden="true"';
  return `
    <div class="voice-note">
      <button class="vn-play" type="button" ${play} data-icon data-label="${label}" aria-label="${label}" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span></button>
      <div class="vn-track"><canvas id="${canvasId}" ${canvasAttributes}></canvas></div>
      <span class="vn-time" data-clock aria-hidden="true">${clockText(seconds, Math.round)}</span>
    </div>`;
}

/**
 * Draws bars from raw audio samples, for short stretches such as one engine's firing pulses.
 * Every bar is canary, since it's the rhythm being shown rather than the pitch.
 */
export function paintSampleBars(canvas, box, samples, count) {
  const ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = 'round';
  const shape = geometry(box.width, box.height, true);
  const raw = new Float32Array(shape.count);
  for (let i = 0; i < shape.count; i++) {
    const from = Math.floor((i * count) / shape.count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * count) / shape.count));
    let peak = 0;
    for (let s = from; s < to; s++) peak = Math.max(peak, Math.abs(samples[s] ?? 0));
    raw[i] = peak;
  }
  const amps = normalise(raw, shape.count, 0);
  for (let i = 0; i < shape.count; i++) {
    const half = shape.minHalf + amps[i] * (shape.maxHalf - shape.minHalf);
    drawBar(context, shape.x(i), shape.middle, half, shape.bar, '#ffdf3f');
  }
}

let readout = null;
function showReadout(text, clientX, clientY) {
  if (!readout) {
    readout = document.createElement('div');
    readout.className = 'readout';
    document.body.append(readout);
  }
  readout.textContent = text;
  readout.hidden = false;
  const flip = clientX > innerWidth - 260;
  readout.style.transform = flip ? 'translate(-100%, -140%)' : 'translate(10px, -140%)';
  readout.style.left = `${clientX}px`;
  readout.style.top = `${clientY}px`;
}

export function hideReadout() {
  if (readout) readout.hidden = true;
}

let activePlayhead = null;

/** Stops whichever sound view is sweeping a playhead. */
export function stopPlayheads() {
  activePlayhead?.stopPlayhead();
}

const views = new WeakMap();

/**
 * Shows a sound on a canvas, and returns the view so it can be updated, swept or drawn live.
 * `compact` is for small thumbnails and side-by-side comparisons. Inside a `.voice-note` or the
 * big `.scope`, the view also keeps its `[data-clock]` up to date.
 */
export function showSound(canvas, image, options = {}) {
  let view = views.get(canvas);
  if (!view) {
    view = createView(canvas);
    views.set(canvas, view);
  }
  view.set(image, options);
  return view;
}

export const viewFor = (canvas) => views.get(canvas) ?? null;

function createView(canvas) {
  const context = canvas.getContext('2d');
  // The finished bars are drawn once onto a hidden layer. Playing then only copies that layer
  // twice, lit and dimmed, instead of redrawing every bar each frame.
  const layer = document.createElement('canvas');
  const layerContext = layer.getContext('2d');
  let layerReady = false;
  let image = null;
  let seconds = 4;
  let compact = false;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let shape = null;
  let playhead = null;
  let playheadFrame = null;
  let hover = null;
  let hoverFrame = null;
  let live = null;
  const clock = canvas.closest('.voice-note, .scope')?.querySelector('[data-clock]') ?? null;

  // Sized from the resize watcher, which runs after layout. Measuring the canvas directly would
  // force the browser to lay out the whole page again for every display, which made pages stutter.
  function resize(box) {
    ratio = Math.min(2, devicePixelRatio || 1);
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    reshape();
  }

  function reshape() {
    shape = width && height ? geometry(width, height, compact) : null;
    layerReady = false;
  }

  function paintLayer() {
    layer.width = canvas.width;
    layer.height = canvas.height;
    layerContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    layerContext.lineCap = 'round';
    const { amps, pitch } = barsOf(image, shape.count);
    for (let i = 0; i < shape.count; i++) {
      const half = shape.minHalf + amps[i] * (shape.maxHalf - shape.minHalf);
      drawBar(layerContext, shape.x(i), shape.middle, half, shape.bar, pitchColour(pitch[i]));
    }
    layerReady = true;
  }

  const barAt = (x) => Math.min(shape.count - 1, Math.max(0, Math.round((x - shape.bar / 2) / (shape.step || 1))));

  function highlight(index, scale, colour) {
    const { amps } = barsOf(image, shape.count);
    const half = Math.min(shape.middle - 1, (shape.minHalf + amps[index] * (shape.maxHalf - shape.minHalf)) * scale);
    drawBar(context, shape.x(index), shape.middle, half, shape.bar, colour, { core: false });
  }

  function render() {
    if (!shape) return;
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    if (live) {
      renderLive();
      return;
    }
    if (!image) {
      waitingDots(0);
      return;
    }
    if (!layerReady) paintLayer();

    if (playhead === null) {
      context.drawImage(layer, 0, 0, width, height);
    } else {
      const x = playhead * width;
      context.save();
      context.beginPath();
      context.rect(0, 0, x, height);
      context.clip();
      context.drawImage(layer, 0, 0, width, height);
      context.restore();
      context.save();
      context.beginPath();
      context.rect(x, 0, width - x, height);
      context.clip();
      context.globalAlpha = 0.3;
      context.drawImage(layer, 0, 0, width, height);
      context.restore();
      // The bar under the dot jumps up, white hot, as the sound passes through it.
      highlight(barAt(x), 1.12, HOT);
      knob(context, x, shape.middle, compact ? 5 : 7, HOT);
    }

    if (hover !== null && playhead === null) highlight(hover, 1.08, HOT);
  }

  /** Small dots along the middle where sound hasn't arrived yet. */
  function waitingDots(fromIndex) {
    context.fillStyle = HOT;
    context.globalAlpha = 0.2;
    context.beginPath();
    const radius = Math.max(1, shape.bar * 0.32);
    for (let i = fromIndex; i < shape.count; i++) {
      context.moveTo(shape.x(i) + radius, shape.middle);
      context.arc(shape.x(i), shape.middle, radius, 0, Math.PI * 2);
    }
    context.fill();
    context.globalAlpha = 1;
  }

  function renderLive() {
    const now = performance.now();
    const drawn = live.drawn();
    const amps = live.amps();
    const pitch = live.pitch();
    const added = live.added();
    for (let i = 0; i < drawn; i++) {
      // Each new bar pops up with a little overshoot, then settles.
      const t = Math.min(1, (now - added[i]) / 180);
      const pop = 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
      const half = shape.minHalf + amps[i] * (shape.maxHalf - shape.minHalf) * Math.max(0, pop);
      drawBar(context, shape.x(i), shape.middle, Math.min(shape.middle - 1, half), shape.bar, pitchColour(pitch[i]), { core: t >= 1 });
    }
    if (drawn < shape.count) {
      // The bar at the head bounces with the microphone right now, before it's written down.
      const x = shape.x(drawn);
      const half = shape.minHalf + live.now() * (shape.maxHalf - shape.minHalf);
      drawBar(context, x, shape.middle, half, shape.bar, HOT, { core: false });
      waitingDots(drawn + 1);
      const beat = 0.5 + 0.5 * Math.sin(now / 160);
      context.fillStyle = RECORDING;
      context.globalAlpha = 0.18 + beat * 0.2;
      context.beginPath();
      context.arc(x, shape.middle, (compact ? 7 : 11) + beat * 4, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      knob(context, x, shape.middle, compact ? 4 : 6, RECORDING);
    }
  }

  canvas.addEventListener('pointermove', (event) => {
    if (!image || live || !shape) return;
    const index = barAt(event.offsetX);
    if (index !== hover) {
      hover = index;
      // Pointers can fire faster than the screen refreshes, so draw at most once a frame.
      hoverFrame ??= requestAnimationFrame(() => {
        hoverFrame = null;
        render();
      });
    }
    const { amps, pitch } = barsOf(image, shape.count);
    const loudness = amps[index] > 0.6 ? 'loud' : amps[index] > 0.25 ? 'medium' : 'quiet';
    const at = ((index + 0.5) / shape.count) * seconds;
    showReadout(`${at.toFixed(1)} s · ${loudness} · mostly ${pitchName(pitch[index])}`, event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    hideReadout();
    render();
  });

  new ResizeObserver(([entry]) => {
    resize(entry.contentRect);
    render();
  }).observe(canvas);

  const showTotal = () => {
    if (clock) clock.textContent = clockText(seconds, Math.round);
  };

  const view = {
    set(next, options = {}) {
      image = next;
      seconds = options.seconds ?? next?.seconds ?? seconds;
      const nextCompact = options.compact ?? compact;
      if (nextCompact !== compact) {
        compact = nextCompact;
        reshape();
      }
      layerReady = false;
      hover = null;
      showTotal();
      // Before its first size arrives this draws nothing, and the resize watcher draws it in time
      // for the next paint.
      render();
    },

    /** Draws the microphone as it records, filling the bars in until time is up. */
    startLive(analyser, sampleRate, duration) {
      view.stopPlayhead();
      live = createLiveCapture(analyser, sampleRate, duration, () => shape?.count ?? 120);
      let frame = requestAnimationFrame(function tick() {
        live.capture();
        render();
        if (live && !live.finished()) frame = requestAnimationFrame(tick);
      });
      return () => {
        cancelAnimationFrame(frame);
        live = null;
        render();
      };
    },

    /** Moves the dot along the bars while the sound plays, lighting up what's been heard. */
    playhead(duration) {
      activePlayhead?.stopPlayhead();
      activePlayhead = view;
      const started = performance.now();
      cancelAnimationFrame(playheadFrame);
      const tick = (now) => {
        const elapsed = Math.max(0, (now - started) / 1000);
        playhead = Math.min(1, elapsed / duration);
        if (clock) clock.textContent = clockText(elapsed);
        render();
        if (playhead < 1) playheadFrame = requestAnimationFrame(tick);
        else view.stopPlayhead();
      };
      playheadFrame = requestAnimationFrame(tick);
    },

    stopPlayhead() {
      cancelAnimationFrame(playheadFrame);
      if (activePlayhead === view) activePlayhead = null;
      if (playhead !== null) {
        playhead = null;
        showTotal();
        render();
      }
    },
  };
  return view;
}

/**
 * Listens to the microphone and writes one bar at a time: how loud it was, and where the sound
 * sat in pitch. Loudness is scaled to the loudest moment so far, so quiet microphones still show.
 */
function createLiveCapture(analyser, sampleRate, duration, countNow) {
  const count = countNow();
  const started = performance.now();
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  const hzPerBin = sampleRate / analyser.fftSize;
  const binPosition = Float32Array.from({ length: spectrum.length }, (_, bin) => Math.min(1, Math.max(0, freqToPosition(Math.max(20, bin * hzPerBin)))));
  const topBin = Math.min(spectrum.length, Math.ceil(positionToFreq(1) / hzPerBin));

  const decibels = new Float32Array(count).fill(-160);
  const pitch = new Float32Array(count).fill(0.4);
  const added = new Float64Array(count);
  let amps = new Float32Array(count);
  let drawn = 0;
  let loudest = -160;
  let current = -160;

  const progress = () => Math.min(1, (performance.now() - started) / 1000 / duration);
  const scale = (db) => Math.min(1, Math.max(0, (db - (loudest - 42)) / 42)) ** 1.3;

  function capture() {
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    current = 10 * Math.log10(sum / wave.length + 1e-12);
    loudest = Math.max(loudest, current);

    const reached = Math.min(count, Math.floor(progress() * count));
    if (reached > drawn) {
      analyser.getFloatFrequencyData(spectrum);
      let weight = 0;
      let centre = 0;
      for (let bin = 1; bin < topBin; bin++) {
        if (!Number.isFinite(spectrum[bin])) continue;
        const strength = 10 ** (spectrum[bin] / 20);
        weight += strength;
        centre += strength * binPosition[bin];
      }
      const position = weight ? centre / weight : 0.4;
      const now = performance.now();
      for (; drawn < reached; drawn++) {
        decibels[drawn] = current;
        pitch[drawn] = position;
        added[drawn] = now;
      }
    }
    amps = Float32Array.from(decibels, scale);
  }

  return {
    capture,
    finished: () => drawn >= count && performance.now() - added[count - 1] > 200,
    drawn: () => drawn,
    amps: () => amps,
    pitch: () => pitch,
    added: () => added,
    now: () => scale(current),
  };
}
