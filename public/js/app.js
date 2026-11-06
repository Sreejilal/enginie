// The site shell: page routing, and the parts that live on every page.

import { autoEnhance, closeOpenDropdown } from './dropdown.js';
import { reducedMotion, startInkPress, swapView } from './motion.js';
import { $, $$, state, writePreference } from './shared.js';
import { renderAbout } from './views/about.js';
import { renderEngines } from './views/engines.js';
import { renderHelp } from './views/help.js';
import { renderHome } from './views/home.js';
import { renderFault, renderLibrary } from './views/library.js';

const main = $('#main');
let cleanup = null;

const ROUTES = [
  { match: /^#?\/?$/, title: 'Enginie: what’s that noise?', nav: 'home', render: () => renderHome(main) },
  { match: /^#\/faults$/, title: 'Sound database: Enginie', nav: 'faults', render: () => renderLibrary(main) },
  { match: /^#\/fault\/([\w-]+)$/, title: 'Fault: Enginie', nav: 'faults', render: (id) => renderFault(main, id) },
  { match: /^#\/engines$/, title: 'Why engines sound different: Enginie', nav: 'engines', render: () => renderEngines(main) },
  { match: /^#\/help(?:\/([\w-]+))?$/, title: 'Dealing with the shop: Enginie', nav: 'help', render: (section) => renderHelp(main, section) },
  { match: /^#\/about$/, title: 'How far you can trust this: Enginie', nav: 'about', render: () => renderAbout(main) },
];

function route() {
  const found = ROUTES.map((candidate) => ({ candidate, result: candidate.match.exec(location.hash) }))
    .find(({ result }) => result);
  const { candidate, result } = found ?? { candidate: ROUTES[0], result: [] };

  closeOpenDropdown();
  swapView(() => {
    cleanup?.();
    document.title = candidate.title;
    cleanup = candidate.render(result[1]) ?? null;
    $$('[data-nav]').forEach((link) => {
      if (link.dataset.nav === candidate.nav) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    closeMenu();
    if (!(candidate.nav === 'help' && result[1])) window.scrollTo(0, 0);
  });
}

/* ---------- Mechanic mode ---------- */

const modeToggle = $('#mechanic-toggle');

function showMode() {
  modeToggle.setAttribute('aria-pressed', String(state.mechanicMode));
  modeToggle.textContent = state.mechanicMode ? 'Mechanic mode: on' : 'Mechanic mode: off';
}

function setMechanicMode(on) {
  state.mechanicMode = on;
  writePreference('enginie-mechanic', on ? 'on' : null);
  showMode();
}

modeToggle.addEventListener('click', () => {
  setMechanicMode(!state.mechanicMode);
  route();
});

// The "I'm a mechanic" choice on the home page.
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-action="mechanic"]')) return;
  setMechanicMode(true);
  if (location.hash === '#/faults') route();
  else location.hash = '#/faults';
});

/* ---------- Menu on small screens ---------- */

const menuButton = $('#menu-button');
const menu = $('#site-menu');

function closeMenu() {
  menu.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
}

menuButton.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(open));
});

/* ---------- Offline support ---------- */

// Keeps the site working in a garage with no signal, or if the server goes away mid-visit.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // The site works fine without it, just not offline.
    });
  });
}

document.documentElement.classList.toggle('reduced', reducedMotion());
showMode();
startInkPress();
autoEnhance(main);
addEventListener('hashchange', route);
route();
