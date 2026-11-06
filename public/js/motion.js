// The site's movement. All of it stands down for anyone who has asked for reduced motion.

import { bankGaps, engineById, pulseBoost } from './data/engines.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Page changes: new pages wash in like ink from wherever you pressed ---------- */

let lastPress = { x: innerWidth / 2, y: 0 };
addEventListener('pointerdown', (event) => {
  lastPress = { x: event.clientX, y: event.clientY };
}, { capture: true, passive: true });

export function swapView(change) {
  if (!document.startViewTransition || reducedMotion()) {
    change();
    return;
  }
  document.documentElement.style.setProperty('--wash-x', `${lastPress.x}px`);
  document.documentElement.style.setProperty('--wash-y', `${lastPress.y}px`);
  document.startViewTransition(change);
}

/* ---------- Buttons: an ink blot spreads from your finger ---------- */

export function startInkPress() {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest('[data-ink]');
    if (!target || target.disabled || reducedMotion()) return;
    const box = target.getBoundingClientRect();
    const blot = document.createElement('span');
    blot.className = 'blot';
    blot.setAttribute('aria-hidden', 'true');
    blot.style.left = `${event.clientX - box.left}px`;
    blot.style.top = `${event.clientY - box.top}px`;
    target.append(blot);
    blot.addEventListener('animationend', () => blot.remove(), { once: true });
  }, { passive: true });
}

/* ---------- Scrolling: sections rise in as they arrive ---------- */

export function watchReveals(root) {
  const items = [...root.querySelectorAll('[data-reveal]')];
  if (reducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('in'));
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  items.forEach((item) => observer.observe(item));
  return () => observer.disconnect();
}

/* ---------- Buttons that lean towards the pointer ---------- */

export function magnetize(root) {
  if (reducedMotion() || matchMedia('(hover: none)').matches) return () => {};
  const items = [...root.querySelectorAll('[data-magnet]')];
  const onMove = (event) => {
    const item = event.currentTarget;
    const box = item.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) / box.width;
    const y = (event.clientY - (box.top + box.height / 2)) / box.height;
    item.style.translate = `${(x * 12).toFixed(1)}px ${(y * 10).toFixed(1)}px`;
  };
  const onLeave = (event) => {
    event.currentTarget.style.translate = '';
  };
  items.forEach((item) => {
    item.addEventListener('pointermove', onMove);
    item.addEventListener('pointerleave', onLeave);
  });
  return () => items.forEach((item) => {
    item.removeEventListener('pointermove', onMove);
    item.removeEventListener('pointerleave', onLeave);
  });
}

/** Splits a headline into letters so that they can rise in one after another. */
export function splitLetters(element) {
  const text = element.textContent.trim();
  element.setAttribute('aria-label', text);
  element.innerHTML = '';
  let index = 0;
  text.split(' ').forEach((word, wordIndex, words) => {
    const wordSpan = document.createElement('span');
    wordSpan.className = 'word';
    wordSpan.setAttribute('aria-hidden', 'true');
    for (const char of word) {
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.style.setProperty('--i', index++);
      letter.textContent = char;
      wordSpan.append(letter);
    }
    element.append(wordSpan);
    if (wordIndex < words.length - 1) element.append(' ');
  });
}

/* ---------- The hero: a liquid surface moving to an engine's real firing pattern ---------- */

const PATTERN_SIZE = 360; // One entry per 2 crank degrees, across a full 720-degree cycle.

function firingPattern(engine) {
  const pattern = new Float32Array(PATTERN_SIZE);
  const { firing, tract } = engine;
  const gaps = bankGaps(firing);
  firing.forEach((cylinder, index) => {
    // Exaggerated a little so that the difference is easy to see, not just to hear.
    const spread = 1.4 * (tract.bankSpread ?? 0);
    const bank = cylinder.bank === 0 ? 1 - spread : 1 + spread;
    const gain = bank * pulseBoost(tract, gaps[index], 2.2);
    const at = cylinder.at + (cylinder.delay ?? 0);
    for (let i = 0; i < PATTERN_SIZE; i++) {
      const since = (i * 2 - at + 720) % 720;
      if (since < 200) pattern[i] += gain * Math.exp(-since / 34) * Math.sin(since * 0.15);
    }
  });
  let peak = 0;
  for (let i = 0; i < PATTERN_SIZE; i++) peak = Math.max(peak, Math.abs(pattern[i]));
  for (let i = 0; i < PATTERN_SIZE; i++) pattern[i] /= peak || 1;
  return pattern;
}

/**
 * Draws layered ribbons of ink over a true one-dimensional wave simulation, so that touching the
 * surface sends ripples along it. Each engine's firing pattern shapes the ribbons, and changing
 * engine flows smoothly from one to the next.
 */
export function startWave(canvas, { engine: firstEngine, ink = '#1a1f8f' }) {
  const context = canvas.getContext('2d');
  const RIBBONS = 6;
  const NODE_SPACING = 6;

  let width = 0;
  let height = 0;
  let nodes = 0;
  let surface = new Float32Array(0);
  let velocity = new Float32Array(0);
  let frame = null;
  let running = false;
  let lastTime = 0;
  let time = 0;
  let phase = 0;
  let excitement = 0;
  let excitementTarget = 0;
  let nextDrop = 2;
  let pointerX = null;

  // On arrival the ink pours in: it rises from below and sloshes as it settles.
  // It starts below zero so that the ink band underneath fills up first, then the surface rises.
  const INTRO_SECONDS = 1.8;
  let intro = reducedMotion() ? 1 : -0.3;
  let sloshed = reducedMotion();
  const easeOut = (t) => 1 - (1 - t) ** 3;

  const shape = firingPattern(engineById(firstEngine));
  let target = firingPattern(engineById(firstEngine));

  function resize() {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(2, devicePixelRatio || 1);
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    nodes = Math.max(8, Math.ceil(width / NODE_SPACING) + 1);
    surface = new Float32Array(nodes);
    velocity = new Float32Array(nodes);
  }

  function push(x, strength, spread = 5) {
    const center = Math.round(x / NODE_SPACING);
    for (let i = Math.max(0, center - spread * 3); i < Math.min(nodes, center + spread * 3); i++) {
      const distance = (i - center) / spread;
      velocity[i] += strength * Math.exp(-distance * distance);
    }
  }

  function stepSurface() {
    for (let i = 0; i < nodes; i++) {
      const left = i > 0 ? surface[i - 1] : surface[i];
      const right = i < nodes - 1 ? surface[i + 1] : surface[i];
      velocity[i] = (velocity[i] + 0.22 * (left + right - 2 * surface[i]) - 0.004 * surface[i]) * 0.992;
    }
    for (let i = 0; i < nodes; i++) surface[i] += velocity[i];
  }

  // A softened copy of the pattern, so the deeper layers and the ink itself flow like liquid
  // while the thin top ribbons keep the sharp detail of each firing pulse.
  const smooth = new Float32Array(PATTERN_SIZE);
  function updateSmooth() {
    const reach = 9;
    for (let i = 0; i < PATTERN_SIZE; i++) {
      let sum = 0;
      for (let k = -reach; k <= reach; k++) sum += shape[(i + k + PATTERN_SIZE) % PATTERN_SIZE];
      smooth[i] = sum / (reach * 2 + 1);
    }
  }

  function sample(position, softness) {
    const wrapped = ((position % PATTERN_SIZE) + PATTERN_SIZE) % PATTERN_SIZE;
    const index = Math.floor(wrapped);
    const next = (index + 1) % PATTERN_SIZE;
    const fraction = wrapped - index;
    const sharp = shape[index] * (1 - fraction) + shape[next] * fraction;
    const soft = (smooth[index] * (1 - fraction) + smooth[next] * fraction) * 3.2;
    return sharp * (1 - softness) + soft * softness;
  }

  const points = [];
  function draw() {
    context.clearRect(0, 0, width, height);
    updateSmooth();
    const cycles = Math.max(1.1, width / 620);
    const perNode = (NODE_SPACING / width) * cycles * PATTERN_SIZE;
    const swing = Math.min(height * 0.2, 46) * (1 + excitement * 0.75);

    const rise = (1 - easeOut(Math.max(0, intro))) * height * 0.95;
    for (let ribbon = 0; ribbon < RIBBONS; ribbon++) {
      const depth = ribbon / (RIBBONS - 1);
      // The fill arrives first, and the lighter ribbons follow it in one after another.
      const arrival = Math.max(0, Math.min(1, (intro - (RIBBONS - 1 - ribbon) * 0.09) / 0.45));
      if (arrival === 0) continue;
      const base = height * (0.34 + depth * 0.42) + rise;
      const amplitude = swing * (0.6 - depth * 0.15);
      const softness = Math.min(1, depth * 1.15);
      const lag = ribbon * 9;

      points.length = 0;
      for (let i = 0; i < nodes; i++) {
        const x = i * NODE_SPACING;
        const drift = Math.sin(x * 0.0065 + time * 0.65 + ribbon * 0.9) * (5 + depth * 6);
        points.push(x, base + drift
          + sample(i * perNode + phase + lag, softness) * amplitude
          + surface[i] * (0.45 + depth * 0.55));
      }

      // Curves through the midpoints between nodes, so the line flows rather than zigzags.
      context.beginPath();
      context.moveTo(points[0], points[1]);
      for (let p = 2; p < points.length - 2; p += 2) {
        context.quadraticCurveTo(points[p], points[p + 1], (points[p] + points[p + 2]) / 2, (points[p + 1] + points[p + 3]) / 2);
      }
      context.lineTo(points[points.length - 2], points[points.length - 1]);

      if (ribbon === RIBBONS - 1) {
        // The last ribbon is the surface of the ink itself, so it fills everything below it.
        context.lineTo(width, height);
        context.lineTo(0, height);
        context.closePath();
        context.fillStyle = ink;
        context.fill();
      } else {
        context.strokeStyle = ink;
        context.globalAlpha = (0.22 + depth * 0.62) * arrival;
        context.lineWidth = 1.2 + depth * 1.3;
        context.stroke();
        context.globalAlpha = 1;
      }
    }
  }

  function tick(now) {
    const delta = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    time += delta;
    intro = Math.min(1, intro + delta / INTRO_SECONDS);
    if (!sloshed && intro > 0.35) {
      // A pour lands off-center, so the surface rocks before it settles.
      sloshed = true;
      push(width * 0.18, -16, 14);
      push(width * 0.72, 11, 18);
    }
    excitement += (excitementTarget - excitement) * Math.min(1, delta * 2.5);
    phase += delta * (70 + excitement * 110);

    const blend = Math.min(1, delta * 3);
    for (let i = 0; i < PATTERN_SIZE; i++) shape[i] += (target[i] - shape[i]) * blend;

    // An occasional drop keeps the surface alive when nobody is touching it.
    nextDrop -= delta;
    if (nextDrop <= 0) {
      push(Math.random() * width, 2.4 + Math.random() * 2);
      nextDrop = 1.6 + Math.random() * 2.4;
    }

    stepSurface();
    stepSurface();
    draw();
    if (running) frame = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reducedMotion()) return;
    running = true;
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
  }

  function onPointerMove(event) {
    const x = event.clientX - canvas.getBoundingClientRect().left;
    if (pointerX !== null) push(x, Math.min(4.5, Math.abs(x - pointerX) * 0.11), 4);
    pointerX = x;
  }
  const onPointerLeave = () => { pointerX = null; };
  const onPointerDown = (event) => push(event.clientX - canvas.getBoundingClientRect().left, -15, 7);

  const host = canvas.parentElement;
  host.addEventListener('pointermove', onPointerMove, { passive: true });
  host.addEventListener('pointerleave', onPointerLeave, { passive: true });
  host.addEventListener('pointerdown', onPointerDown, { passive: true });

  const sizeWatcher = new ResizeObserver(() => {
    resize();
    if (!running) draw();
  });
  sizeWatcher.observe(canvas);

  // Only move while it can be seen, to save batteries.
  const viewWatcher = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !document.hidden) start();
    else pause();
  });
  viewWatcher.observe(canvas);
  const onVisibility = () => {
    if (document.hidden) pause();
    else if (canvas.getBoundingClientRect().bottom > 0) start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  draw();

  return {
    setEngine(id) {
      target = firingPattern(engineById(id));
      push(width * 0.5, -9, 16);
      if (reducedMotion()) {
        shape.set(target);
        draw();
      }
    },
    /** Livens the surface up while the engine can be heard. */
    setExcited(on) {
      excitementTarget = on ? 1 : 0;
    },
    /** Stirs the surface, such as when the page is scrolled. */
    nudge(strength) {
      if (!running) return;
      push(Math.random() * width, (Math.random() < 0.5 ? -1 : 1) * strength, 6 + Math.random() * 8);
    },
    stop() {
      pause();
      sizeWatcher.disconnect();
      viewWatcher.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('pointerdown', onPointerDown);
    },
  };
}
