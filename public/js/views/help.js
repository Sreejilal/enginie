// Help with the part people find hardest: dealing with a shop, and paying for it.

import { judgeQuote, LABOR_RATE, money, moneyRange, shopCost } from '../cost.js';
import { faultById, FAULTS } from '../data/faults.js';
import { DRIVE_LABELS } from '../data/symptoms.js';
import { watchReveals } from '../motion.js';
import { $, escapeHtml, faultOptions } from '../shared.js';
import { costChart } from './ticket.js';

const VERDICTS = {
  typical: {
    title: 'That’s in the usual range',
    text: 'It looks like a normal price for this job. It’s still fair to ask what’s included.',
  },
  upper: {
    title: 'That’s at the high end',
    text: 'That may be fine for your vehicle, especially if it’s European, luxury or heavy-duty. Ask them to list parts and labor separately.',
  },
  high: {
    title: 'That’s well above the usual range',
    text: 'There may be a good reason, such as extra work or a hard-to-reach part, but ask them to explain it. It’s worth getting a second quote before you agree.',
  },
  low: {
    title: 'That’s unusually low',
    text: 'It could be a good deal, or it may leave something out. Ask what’s included and what quality of parts they use.',
  },
};

export function renderHelp(main, section) {
  const canWait = FAULTS.filter((fault) => fault.drive === 'yes' && !fault.noRepair);
  const cannotWait = FAULTS.filter((fault) => fault.drive === 'no');

  main.innerHTML = `
    <div class="page-head">
      <h1>Dealing with the shop</h1>
      <p>In a AAA survey, about two in three US drivers said they don’t trust repair shops, mostly because of unneeded work and overcharging. Most shops are honest, and these steps protect you either way.</p>
    </div>

    <nav class="help-nav" aria-label="On this page">
      <a href="#/help/quote">Check a quote</a>
      <a href="#/help/before">Before you say yes</a>
      <a href="#/help/after">Worse after a repair</a>
      <a href="#/help/afford">Can’t afford it</a>
    </nav>

    <section class="help-section" id="quote" data-reveal aria-labelledby="quote-title">
      <h2 id="quote-title">Check a quote</h2>
      <form class="quote-form" id="quote-form">
        <label class="field-stack">
          <span>What repair did they quote?</span>
          <select id="quote-fault">${faultOptions(null, { repairableOnly: true })}</select>
        </label>
        <label class="field-stack">
          <span>Total quote, in US dollars</span>
          <input id="quote-amount" type="number" min="1" step="1" inputmode="numeric" placeholder="450" required>
        </label>
        <label class="field-stack">
          <span>Their hourly labor rate, if you know it</span>
          <input id="quote-rate" type="number" min="1" step="1" inputmode="numeric" placeholder="Optional">
        </label>
        <button class="btn btn-solid" type="submit" data-ink>Check this quote</button>
      </form>
      <div id="quote-result" role="status"></div>
    </section>

    <section class="help-section" id="before" data-reveal aria-labelledby="before-title">
      <h2 id="before-title">Before you say yes</h2>
      <ol class="step-list">
        <li><strong>Get it in writing.</strong> Ask for a written estimate that lists parts and labor separately.</li>
        <li><strong>Say how to handle extra work.</strong> Ask them to call you for approval before doing anything that isn’t on the estimate.</li>
        <li><strong>Ask to see it.</strong> Ask them to show you the worn part or the measurement. An honest shop won’t mind.</li>
        <li><strong>Ask for the old parts.</strong> Ask before the work starts, and in writing if you can. In some places, the law then requires them to give the parts back.</li>
        <li><strong>Sort it by urgency.</strong> Ask, “What’s a safety issue today, and what can wait?” Then you can plan what to spend.</li>
        <li><strong>Get a second opinion on big jobs.</strong> For anything over about $500, it’s reasonable to get another quote. You can also pay for a diagnosis to take with you.</li>
      </ol>
    </section>

    <section class="help-section" id="after" data-reveal aria-labelledby="after-title">
      <h2 id="after-title">It got worse after a repair</h2>
      <p class="section-lede">First, if the vehicle feels unsafe, stop driving it. Loose wheels are a common problem after tire work, so check the lug nuts if your wheels have been off.</p>
      <ol class="step-list">
        <li><strong>Gather your paperwork.</strong> Find the estimate, work order, invoice and any messages from the shop.</li>
        <li><strong>Check the invoice against the estimate.</strong> Many places limit how far a bill can go over an approved estimate without your agreement.</li>
        <li><strong>Record the problem.</strong> Record the noise with this site or your phone, take photos and write down when it started. Evidence makes everything easier.</li>
        <li><strong>Go back to the shop first.</strong> Explain in writing what’s wrong and that it began after their work. Ask them to check it under their warranty or at no charge. Most shops would rather fix it.</li>
        <li><strong>Get an independent inspection.</strong> If that doesn’t work, ask another shop to look at it, and give them a copy of the first invoice. Ask for their findings in writing.</li>
        <li><strong>Escalate if you need to.</strong> Options include your state attorney general or consumer protection office, and small claims court.</li>
      </ol>
      <p class="ticket-watch"><strong>Watch out:</strong> Check your local rules before you refuse to pay or take your vehicle back. In some places, a shop can keep a vehicle under a lien while a bill is disputed. Laws vary by state and country, and this isn’t legal advice.</p>
    </section>

    <section class="help-section" id="afford" data-reveal aria-labelledby="afford-title">
      <h2 id="afford-title">Can’t afford it right now</h2>
      <p class="section-lede">You’re far from alone. In a 2025 survey, about six in ten Americans said they couldn’t cover a surprise car repair over $1,000. Here’s how to spend as little as you safely can.</p>

      <div class="afford-grid">
        <div>
          <h3>Do these first, for free or close to it</h3>
          <ul class="dash-list">
            <li>Have your check engine codes read. Many US parts stores do this for free.</li>
            <li>Have your battery and charging system tested. Many parts stores do this for free too.</li>
            <li>Check your oil, coolant and tire pressures yourself.</li>
            <li>Look for the cheap fix on your fault’s page. Sometimes a hose or a clamp is all it needs.</li>
          </ul>
        </div>
        <div>
          <h3>Ways to pay less</h3>
          <ul class="dash-list">
            <li>Get a quote from an independent shop as well as the dealer.</li>
            <li>Ask about remanufactured or used parts, where they’re safe to use.</li>
            <li>Ask which work is urgent, and do the rest in stages.</li>
            <li>Ask whether the shop offers a payment plan.</li>
            <li>Ask whether a nearby auto technician school takes customer vehicles.</li>
            <li>In the US, call 211 to ask about local help with car repairs, especially if you need your vehicle for work.</li>
          </ul>
        </div>
      </div>

      <div class="afford-grid">
        <div>
          <h3 class="danger-title">These can’t wait, whatever the budget</h3>
          <ul class="link-list">
            ${cannotWait.map((fault) => `<li><a href="#/fault/${fault.id}">${escapeHtml(fault.name)}</a><span>${DRIVE_LABELS[fault.drive]}</span></li>`).join('')}
            <li><span class="link-list-plain">An oil pressure light, overheating, a soft brake pedal or a strong fuel smell</span><span>Don’t drive it</span></li>
          </ul>
        </div>
        <div>
          <h3>These can usually wait while you save</h3>
          <ul class="link-list">
            ${canWait.map((fault) => `<li><a href="#/fault/${fault.id}">${escapeHtml(fault.name)}</a><span>${moneyRange(shopCost(fault))} at a shop</span></li>`).join('')}
          </ul>
        </div>
      </div>
    </section>
  `;

  const form = $('#quote-form', main);
  const output = $('#quote-result', main);
  const onSubmit = (event) => {
    event.preventDefault();
    const fault = faultById($('#quote-fault', main).value);
    const amount = Number($('#quote-amount', main).value);
    const hourly = Number($('#quote-rate', main).value);
    if (!(amount > 0)) return;
    const rate = hourly > 0 ? { low: hourly, high: hourly } : LABOR_RATE;
    const result = judgeQuote(fault, amount, rate);
    const verdict = VERDICTS[result.verdict];
    output.innerHTML = `
      <div class="quote-answer quote-${result.verdict}">
        <h3>${escapeHtml(verdict.title)}</h3>
        <p>You were quoted ${money(amount)} for ${escapeHtml(fault.name.toLowerCase())}. The typical range is ${moneyRange(result.range)}. ${escapeHtml(verdict.text)}</p>
        ${costChart(fault, { quote: amount, rate })}
        <p class="fine">Your quote is the dot on the top bar. These are rough US ranges that can’t account for your vehicle or area, so use them to ask questions, not as proof of anything.</p>
        <p class="field-label">Ask them</p>
        <ul class="dash-list">${fault.ask.map((question) => `<li>${escapeHtml(question)}</li>`).join('')}</ul>
        <p class="ticket-watch"><strong>Watch out:</strong> ${escapeHtml(fault.watchOut)}</p>
        <p><a href="#/fault/${fault.id}">Read everything about this fault</a></p>
      </div>`;
  };
  form.addEventListener('submit', onSubmit);

  const stopReveals = watchReveals(main);
  if (section) {
    const target = main.querySelector(`#${CSS.escape(section)}`);
    if (target) {
      target.classList.add('in');
      requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    }
  }

  return () => {
    form.removeEventListener('submit', onSubmit);
    stopReveals();
  };
}
