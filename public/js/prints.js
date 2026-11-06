// Draws sound prints: time runs left to right, low sounds at the bottom, and darker ink is louder.

import { positionToFreq } from './features.js';
import { formatHz } from './match.js';

// A single-hue scale from the chart paper to the blue ink.
const INK_STOPS = [
  [0, [255, 252, 232]],
  [0.3, [214, 216, 245]],
  [0.6, [125, 133, 226]],
  [0.85, [52, 60, 178]],
  [1, [20, 24, 115]],
];

const INK = (() => {
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const level = i / 255;
    const upper = Math.max(1, INK_STOPS.findIndex(([stop]) => stop >= level));
    const [toStop, to] = INK_STOPS[upper];
    const [fromStop, from] = INK_STOPS[upper - 1];
    const blend = (level - fromStop) / (toStop - fromStop);
    for (let c = 0; c < 3; c++) table[i * 3 + c] = from[c] + (to[c] - from[c]) * blend;
  }
  return table;
})();

function writeInk(pixels, index, level) {
  pixels[index] = INK[level * 3];
  pixels[index + 1] = INK[level * 3 + 1];
  pixels[index + 2] = INK[level * 3 + 2];
  pixels[index + 3] = 255;
}

/** Fades the quietest levels to bare paper so background noise doesn't muddy the picture. */
const contrast = (value) => {
  const level = value / 255;
  return Math.round(255 * Math.max(0, (level - 0.25) / 0.75) ** 1.3);
};

export function drawImage(canvas, image) {
  canvas.width = image.columns;
  canvas.height = image.rows;
  const context = canvas.getContext('2d');
  const output = context.createImageData(image.columns, image.rows);
  for (let column = 0; column < image.columns; column++) {
    for (let row = 0; row < image.rows; row++) {
      const value = image.data[column * image.rows + row];
      const y = image.rows - 1 - row;
      writeInk(output.data, (y * image.columns + column) * 4, contrast(value));
    }
  }
  context.putImageData(output, 0, 0);
}

/**
 * Inks a recording onto the canvas as it comes in, reaching the right edge when time is up.
 * The scale follows the loudest sound so far, so even a very quiet microphone still draws.
 */
export function startLiveTrace(canvas, analyser, sampleRate, seconds) {
  const rows = 96;
  const rangeDb = 55;
  canvas.width = 480;
  canvas.height = rows;
  const context = canvas.getContext('2d');
  context.fillStyle = `rgb(${INK[0]} ${INK[1]} ${INK[2]})`;
  context.fillRect(0, 0, canvas.width, rows);

  const levels = new Float32Array(analyser.frequencyBinCount);
  const hzPerBin = sampleRate / analyser.fftSize;
  const rowBins = Array.from({ length: rows }, (_, row) => {
    const bin = Math.round(positionToFreq((rows - 1 - row) / (rows - 1)) / hzPerBin);
    return Math.min(levels.length - 1, Math.max(1, bin));
  });

  const column = context.createImageData(1, rows);
  const started = performance.now();
  let drawnTo = 0;
  let top = -120;
  let frame = requestAnimationFrame(function draw(now) {
    const reached = Math.min(canvas.width, Math.floor((((now - started) / 1000) / seconds) * canvas.width));
    if (reached > drawnTo) {
      analyser.getFloatFrequencyData(levels);
      for (let row = 0; row < rows; row++) {
        const db = levels[rowBins[row]];
        if (Number.isFinite(db) && db > top) top = db;
      }
      for (let row = 0; row < rows; row++) {
        const db = levels[rowBins[row]];
        const value = Number.isFinite(db) ? 255 * Math.min(1, Math.max(0, (db - (top - rangeDb)) / rangeDb)) : 0;
        writeInk(column.data, row * 4, contrast(value));
      }
      for (; drawnTo < reached; drawnTo++) context.putImageData(column, drawnTo, 0);
    }
    if (drawnTo < canvas.width) frame = requestAnimationFrame(draw);
  });

  return () => cancelAnimationFrame(frame);
}

let readout = null;

/** Shows the time, pitch and loudness under the pointer. Everything here is also on the page in words. */
export function attachReadout(canvas, image, seconds) {
  if (!readout) {
    readout = document.createElement('div');
    readout.className = 'readout';
    readout.hidden = true;
    document.body.append(readout);
  }

  canvas.addEventListener('pointermove', (event) => {
    const box = canvas.getBoundingClientRect();
    const across = Math.min(0.999, Math.max(0, (event.clientX - box.left) / box.width));
    const up = Math.min(0.999, Math.max(0, 1 - (event.clientY - box.top) / box.height));
    const value = image.data[Math.floor(across * image.columns) * image.rows + Math.floor(up * image.rows)];
    const loudness = value > 190 ? 'loud' : value > 120 ? 'medium' : 'quiet';

    readout.textContent = `${(across * seconds).toFixed(1)} s, around ${formatHz(positionToFreq(up))}, ${loudness}`;
    readout.hidden = false;
    const flip = event.clientX > window.innerWidth - 240;
    readout.style.transform = flip ? 'translate(-100%, -130%)' : 'translate(8px, -130%)';
    readout.style.left = `${event.clientX}px`;
    readout.style.top = `${event.clientY}px`;
  });
  canvas.addEventListener('pointerleave', () => {
    readout.hidden = true;
  });
}

export function hideReadout() {
  if (readout) readout.hidden = true;
}
