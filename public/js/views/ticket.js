// The repair ticket: everything we know about one fault, in the order people need it.
// Safety first, then what it is, then money, then what to do, then how to deal with the shop.

import { diyCost, LABOR_RATE, money, moneyRange, shopCost } from '../cost.js';
import { faultById } from '../data/faults.js';
import { CONTEXTS, DRIVE_LABELS, URGENCY } from '../data/symptoms.js';
import { $, escapeHtml, listWithOr, state } from '../shared.js';

const bullets = (items) => `<ul class="dash-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

export function stampHtml(fault, { unsure = false, mini = false, tag = 'p' } = {}) {
  const size = mini ? 'stamp-mini' : 'stamp';
  if (unsure) return `<${tag} class="${size} stamp-unsure">Not sure</${tag}>`;
  return `<${tag} class="${size} stamp-${fault.urgency}">${URGENCY[fault.urgency]}</${tag}>`;
}

/** Typical cost as range bars on one shared scale, with the numbers written beside them. */
export function costChart(fault, { quote = null, rate = LABOR_RATE } = {}) {
  const shop = shopCost(fault, rate);
  if (!shop) return '<p>Nothing to pay for, based on this result.</p>';
  const diy = diyCost(fault);
  const top = Math.max(shop.high, quote ?? 0) * 1.04;
  const place = (value) => `${((100 * value) / top).toFixed(2)}%`;
  const row = (label, range, showQuote) => `
    <div class="cost-row">
      <p class="cost-label">${label}</p>
      <p class="cost-value">${moneyRange(range)}</p>
      <div class="cost-track" aria-hidden="true">
        <span class="cost-range" style="left:${place(range.low)};width:calc(${place(range.high)} - ${place(range.low)})"></span>
        ${showQuote ? `<span class="cost-quote" style="left:${place(quote)}"></span>` : ''}
      </div>
    </div>`;
  return `
    <div class="cost-chart">
      ${row('At a shop', shop, quote !== null)}
      ${diy ? row('Parts, if you do it yourself', diy, false) : ''}
    </div>`;
}

function proPanel(fault) {
  const { pro } = fault;
  const labor = fault.noRepair
    ? ''
    : `<p class="when"><strong>Typical book time:</strong> ${fault.labor[0]} to ${fault.labor[1]} hours. <strong>Parts:</strong> ${money(fault.parts[0])} to ${money(fault.parts[1])}.</p>`;
  return `
    <section class="ticket-row ticket-row-3 pro-panel" aria-label="Details for mechanics">
      <div class="field">
        <p class="field-label">Sound signature</p>
        <p>${escapeHtml(pro.signature)}</p>
        ${labor}
      </div>
      <div class="field">
        <p class="field-label">How to confirm it</p>
        ${bullets(pro.tests)}
      </div>
      <div class="field">
        <p class="field-label">Codes that may set</p>
        ${pro.codes.length ? bullets(pro.codes) : '<p>None typically. This one is found by inspection.</p>'}
      </div>
    </section>`;
}

/** The plain-text version, for sending to a shop or a friend. */
export function summaryText(fault) {
  const shop = shopCost(fault);
  return [
    `${fault.name} (a possibility from Enginie, not a confirmed diagnosis)`,
    `Urgency: ${URGENCY[fault.urgency]}. ${DRIVE_LABELS[fault.drive]}.`,
    `What it sounds like: ${fault.sound}`,
    `What's probably happening: ${fault.plain}`,
    shop ? `Rough US shop cost: ${moneyRange(shop)}.` : null,
    '',
    `What to tell the mechanic: ${fault.tellMechanic}`,
    '',
    'Questions to ask:',
    ...fault.ask.map((question) => `- ${question}`),
  ].filter((line) => line !== null).join('\n');
}

export function ticketHtml(fault, {
  label = 'Fault',
  unsure = false,
  note = '',
  afterRepair = false,
  extra = '',
  animate = true,
} = {}) {
  const heardWhen = listWithOr(fault.contexts.map((id) => CONTEXTS[id]));
  const confused = fault.confusedWith.filter(({ id }) => faultById(id));

  return `
    <article class="ticket ${animate ? 'ticket-print' : ''}" aria-labelledby="ticket-title">
      <header class="ticket-head">
        <div>
          <p class="field-label">${escapeHtml(label)}</p>
          <h2 id="ticket-title" tabindex="-1">${escapeHtml(fault.name)}</h2>
          ${note}
        </div>
        ${stampHtml(fault, { unsure })}
      </header>

      <section class="ticket-row drive-row drive-${fault.drive}" aria-label="Can I keep driving?">
        <div class="field">
          <p class="field-label">Can I keep driving?</p>
          <p class="drive-verdict">${DRIVE_LABELS[fault.drive]}</p>
          <p>${escapeHtml(fault.driveNote)}</p>
        </div>
        <div class="field">
          <p class="field-label">How long can it wait?</p>
          <p>${escapeHtml(fault.wait)}</p>
        </div>
      </section>

      ${afterRepair && fault.afterRepair ? `<p class="ticket-notice">${escapeHtml(fault.afterRepair)}</p>` : ''}

      <section class="ticket-row" aria-label="What it is">
        <div class="field">
          <p class="field-label">What it sounds like</p>
          <p>${escapeHtml(fault.sound)}</p>
          <p class="when">Usually heard when ${escapeHtml(heardWhen)}.</p>
        </div>
        <div class="field">
          <p class="field-label">What’s probably happening</p>
          <p>${escapeHtml(fault.plain)}</p>
        </div>
      </section>

      ${extra}

      <section class="ticket-row" aria-label="Cost">
        <div class="field">
          <p class="field-label">What it should cost</p>
          ${costChart(fault)}
          <p class="fine">Rough US prices, with labor at ${money(LABOR_RATE.low)} to ${money(LABOR_RATE.high)} an hour. European, luxury and heavy-duty vehicles often cost more. <a href="#/help/quote">Check a quote you’ve been given</a>.</p>
        </div>
        <div class="field">
          <p class="field-label">Can I do it myself?</p>
          <p class="typed-value">${escapeHtml(fault.diy ?? 'Nothing to do')}</p>
          <p>${escapeHtml(fault.diyNote ?? '')}</p>
        </div>
      </section>

      <section class="ticket-row" aria-label="What to do next">
        <div class="field">
          <p class="field-label">Try this first</p>
          ${bullets(fault.firstChecks)}
        </div>
        <div class="field">
          <p class="field-label">If money’s tight</p>
          <p>${escapeHtml(fault.ifBroke)}</p>
        </div>
      </section>

      <section class="ticket-row" aria-label="At the shop">
        <div class="field">
          <p class="field-label">What to tell the mechanic</p>
          <blockquote class="say-this">${escapeHtml(fault.tellMechanic)}</blockquote>
          <button class="btn" type="button" data-action="copy-say" data-ink data-label="Copy this">Copy this</button>
        </div>
        <div class="field">
          <p class="field-label">Questions to ask</p>
          ${bullets(fault.ask)}
        </div>
      </section>

      <p class="ticket-watch"><strong>Watch out:</strong> ${escapeHtml(fault.watchOut)}</p>

      ${confused.length ? `
        <section class="ticket-block" aria-label="Easy to confuse with">
          <p class="field-label">Easy to confuse with</p>
          <ul class="confused-list">
            ${confused.map(({ id, tell }) => `
              <li>
                <a class="confused-name" href="#/fault/${id}">${escapeHtml(faultById(id).name)}</a>
                <span>${escapeHtml(tell)}</span>
              </li>`).join('')}
          </ul>
        </section>` : ''}

      ${state.mechanicMode ? proPanel(fault) : ''}

      <div class="ticket-actions">
        <button class="btn" type="button" data-action="copy-summary" data-ink data-label="Copy summary">Copy summary</button>
        <button class="btn" type="button" data-action="print" data-ink>Print or save as PDF</button>
        <button class="btn" type="button" data-action="share" data-ink data-label="Share this fault">Share this fault</button>
      </div>
    </article>`;
}

async function copyText(button, text) {
  let done = false;
  try {
    await navigator.clipboard.writeText(text);
    done = true;
  } catch {
    // The clipboard can be blocked. This older method still works in most of those cases.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'visually-hidden';
    document.body.append(area);
    area.select();
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    area.remove();
  }
  button.textContent = done ? 'Copied' : 'Couldn’t copy. Select the text instead.';
  setTimeout(() => { button.textContent = button.dataset.label; }, 2200);
}

/** Connects a ticket's buttons. Returns a function that disconnects them. */
export function wireTicket(root, fault) {
  const onClick = async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action } = button.dataset;
    if (action === 'copy-say') {
      copyText(button, fault.tellMechanic);
    } else if (action === 'copy-summary') {
      copyText(button, summaryText(fault));
    } else if (action === 'print') {
      print();
    } else if (action === 'share') {
      const url = `${location.origin}${location.pathname}#/fault/${fault.id}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: `${fault.name}: Enginie`, text: fault.sound, url });
        } catch {
          // They closed the share sheet, so there's nothing to do.
        }
      } else {
        copyText(button, url);
      }
    }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

export const focusTicket = (root) => $('#ticket-title', root)?.focus({ preventScroll: true });
