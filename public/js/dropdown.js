// Dropdowns that look and move like the rest of the site. Each one is built on top of a real
// <select>, which stays in the page, so forms, change events and existing code all keep working.
// Keyboard: arrow keys, Home and End, Enter or Space to choose, Escape to close, or type to jump.

import { reducedMotion } from './motion.js';

const VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
const isPhone = () => matchMedia('(max-width: 600px)').matches;

let counter = 0;
let openDropdown = null;
let backdrop = null;

export function closeOpenDropdown() {
  openDropdown?.close(false);
}

function make(tag, className, attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

export function enhanceSelect(select) {
  if (select.dataset.enhanced || select.multiple || select.size > 1) return;
  select.dataset.enhanced = 'true';
  if (!select.id) select.id = `dropdown-${++counter}`;
  const id = select.id;

  const wrapper = make('div', 'dropdown');
  const button = make('button', 'dropdown-button', {
    type: 'button',
    id: `${id}-button`,
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
  });
  const value = make('span', 'dropdown-value', { id: `${id}-value` });
  button.append(value, make('span', 'dropdown-caret', { 'aria-hidden': 'true' }));
  const panel = make('div', 'dropdown-panel', { role: 'listbox', tabindex: '-1', id: `${id}-list` });
  panel.hidden = true;

  select.before(wrapper);
  wrapper.append(button, panel, select);
  select.classList.add('dropdown-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  // Point the visible label at the new button, and give the button the label plus its value as a name.
  const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
  const wrappingLabel = wrapper.closest('label');
  let nameElement = null;
  if (forLabel) {
    forLabel.htmlFor = button.id;
    nameElement = forLabel;
  } else if (wrappingLabel) {
    nameElement = wrappingLabel.querySelector(':scope > span');
  }
  if (nameElement) {
    nameElement.id ||= `${id}-label`;
    button.setAttribute('aria-labelledby', `${nameElement.id} ${value.id}`);
    panel.setAttribute('aria-labelledby', nameElement.id);
  } else {
    button.setAttribute('aria-labelledby', value.id);
  }

  const nativeValue = () => VALUE.get.call(select);
  const items = () => [...panel.querySelectorAll('[role="option"]')];
  const choosable = () => items().filter((item) => item.getAttribute('aria-disabled') !== 'true');
  let active = null;

  function optionElement(option, index) {
    const item = make('div', 'dropdown-option', {
      role: 'option',
      id: `${id}-option-${index}`,
      'aria-selected': 'false',
    });
    item.dataset.value = option.value;
    item.style.setProperty('--i', index);
    if (option.disabled) item.setAttribute('aria-disabled', 'true');
    const label = make('span', 'option-label');
    label.textContent = option.textContent;
    item.append(label);
    if (option.dataset.hint) {
      const hint = make('span', 'option-hint');
      hint.textContent = option.dataset.hint;
      item.append(hint);
    }
    return item;
  }

  function build() {
    panel.replaceChildren();
    let index = 0;
    for (const child of select.children) {
      if (child.tagName === 'OPTGROUP') {
        const heading = make('p', 'dropdown-group', { id: `${id}-group-${index}` });
        heading.textContent = child.label;
        const group = make('div', '', { role: 'group', 'aria-labelledby': heading.id });
        group.append(heading);
        for (const option of child.children) group.append(optionElement(option, index++));
        panel.append(group);
      } else if (child.tagName === 'OPTION') {
        panel.append(optionElement(child, index++));
      }
    }
    sync();
  }

  function sync() {
    const current = select.selectedOptions[0];
    value.textContent = current ? current.textContent : '';
    const selectedValue = nativeValue();
    items().forEach((item) => item.setAttribute('aria-selected', String(Boolean(current) && item.dataset.value === selectedValue)));
    button.disabled = select.disabled;
  }

  // Code elsewhere sets select.value directly. Keep the button in step when it does.
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return VALUE.get.call(this); },
    set(next) { VALUE.set.call(this, next); sync(); },
  });
  Object.defineProperty(select, 'selectedIndex', {
    configurable: true,
    get() { return INDEX.get.call(this); },
    set(next) { INDEX.set.call(this, next); sync(); },
  });

  function setActive(item, scroll = true) {
    if (!item) return;
    active?.classList.remove('is-active');
    active = item;
    item.classList.add('is-active');
    panel.setAttribute('aria-activedescendant', item.id);
    if (scroll) item.scrollIntoView({ block: 'nearest' });
  }

  function place() {
    if (isPhone()) {
      wrapper.dataset.side = 'sheet';
      panel.style.maxHeight = '';
      return;
    }
    const box = button.getBoundingClientRect();
    const below = innerHeight - box.bottom;
    const above = box.top;
    const side = below < 280 && above > below ? 'top' : 'bottom';
    wrapper.dataset.side = side;
    panel.style.maxHeight = `${Math.max(180, Math.min(400, (side === 'bottom' ? below : above) - 20))}px`;
  }

  const onOutside = (event) => {
    if (!wrapper.contains(event.target)) close(false);
  };

  function finishClosing() {
    if (wrapper.dataset.state !== 'closing') return;
    panel.hidden = true;
    wrapper.dataset.state = '';
  }

  function open() {
    if (select.disabled) return;
    if (openDropdown && openDropdown !== api) openDropdown.close(false);
    openDropdown = api;
    finishClosing();
    panel.hidden = false;
    wrapper.dataset.state = 'open';
    button.setAttribute('aria-expanded', 'true');
    place();
    if (wrapper.dataset.side === 'sheet') {
      backdrop ??= make('div', 'dropdown-backdrop', { 'aria-hidden': 'true' });
      document.body.append(backdrop);
    }
    const selected = items().find((item) => item.getAttribute('aria-selected') === 'true');
    setActive(selected ?? choosable()[0]);
    panel.focus({ preventScroll: true });
    document.addEventListener('pointerdown', onOutside, true);
  }

  function close(returnFocus = true) {
    if (panel.hidden || wrapper.dataset.state === 'closing') return;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (openDropdown === api) openDropdown = null;
    backdrop?.remove();
    wrapper.dataset.state = 'closing';
    if (reducedMotion()) finishClosing();
    else {
      panel.addEventListener('animationend', finishClosing, { once: true });
      setTimeout(finishClosing, 260);
    }
    if (returnFocus) button.focus({ preventScroll: true });
  }

  function choose(item, returnFocus = true) {
    if (!item || item.getAttribute('aria-disabled') === 'true') return;
    const changed = nativeValue() !== item.dataset.value;
    VALUE.set.call(select, item.dataset.value);
    sync();
    close(returnFocus);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  let typed = '';
  let typedTimer = null;
  function typeAhead(char) {
    typed += char.toLowerCase();
    clearTimeout(typedTimer);
    typedTimer = setTimeout(() => { typed = ''; }, 600);
    const list = choosable();
    const start = list.indexOf(active);
    const ordered = [...list.slice(start + 1), ...list.slice(0, start + 1)];
    const match = ordered.find((item) => item.textContent.trim().toLowerCase().startsWith(typed))
      ?? ordered.find((item) => item.textContent.trim().toLowerCase().startsWith(typed[0]));
    if (match) setActive(match);
  }

  button.addEventListener('click', () => {
    if (panel.hidden || wrapper.dataset.state === 'closing') open();
    else close();
  });

  button.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });

  panel.addEventListener('keydown', (event) => {
    const list = choosable();
    const index = list.indexOf(active);
    const keys = {
      ArrowDown: () => setActive(list[Math.min(index + 1, list.length - 1)]),
      ArrowUp: () => setActive(list[Math.max(index - 1, 0)]),
      Home: () => setActive(list[0]),
      PageUp: () => setActive(list[Math.max(index - 8, 0)]),
      End: () => setActive(list[list.length - 1]),
      PageDown: () => setActive(list[Math.min(index + 8, list.length - 1)]),
      Enter: () => choose(active),
      ' ': () => (typed ? typeAhead(' ') : choose(active)),
      Escape: () => close(),
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    } else if (event.key === 'Tab') {
      choose(active, false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeAhead(event.key);
    }
  });

  panel.addEventListener('pointermove', (event) => {
    const item = event.target.closest('[role="option"]');
    if (item && item !== active && item.getAttribute('aria-disabled') !== 'true') setActive(item, false);
  });

  // Stop a surrounding <label> from turning clicks inside the list into clicks on the button.
  panel.addEventListener('click', (event) => {
    event.preventDefault();
    choose(event.target.closest('[role="option"]'));
  });

  new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList')) build();
    else sync();
  }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  const api = { open, close };
  build();
}

/** Enhances every dropdown on the page now, and any added later. */
export function autoEnhance(root = document.body) {
  root.querySelectorAll('select').forEach(enhanceSelect);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('select')) enhanceSelect(node);
        node.querySelectorAll('select').forEach(enhanceSelect);
      }
    }
  }).observe(root, { childList: true, subtree: true });
}
