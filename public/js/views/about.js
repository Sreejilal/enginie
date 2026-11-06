// What Enginie can and can't do, with the evidence. People deciding about their car deserve this.

import { FAULTS } from '../data/faults.js';
import { watchReveals } from '../motion.js';

export function renderAbout(main) {
  main.innerHTML = `
    <div class="page-head">
      <h1>How far you can trust this</h1>
      <p>Enginie gives you a shortlist to check, not a diagnosis. Here’s exactly what it can do, what it can’t and how we know.</p>
    </div>

    <section class="help-section" data-reveal aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol class="step-list">
        <li><strong>It measures your recording.</strong> It checks whether there’s a clear steady pitch or a regular beat. Those simple measurements held up when we tested them on real recordings.</li>
        <li><strong>It uses your answers.</strong> Published research found that when and where a noise happens is about as useful as the sound itself.</li>
        <li><strong>It gives you a shortlist.</strong> Compare the top three by ear, then take what you’ve learned to a mechanic.</li>
      </ol>
    </section>

    <section class="help-section" data-reveal aria-labelledby="tested-title">
      <h2 id="tested-title">What happened when we tested it</h2>
      <p class="section-lede">We tested Enginie on 80 real phone recordings of small petrol cars that it had never heard before. They covered four conditions: healthy, misfire, tappet noise and belt noise. Each time, it had to choose from all ${FAULTS.length} faults.</p>
      <div class="table-wrap">
        <table class="evidence">
          <thead>
            <tr><th scope="col">Method</th><th scope="col">Top answer right</th><th scope="col">Right fault in top three</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">Random guessing</th><td>3%</td><td>10%</td></tr>
            <tr><th scope="row">Your recording plus basic answers</th><td>41%</td><td>63%</td></tr>
            <tr><th scope="row">Your recording, compared with real recordings of those faults</th><td>83%</td><td>98%</td></tr>
          </tbody>
        </table>
      </div>
      <ul class="dash-list">
        <li><strong>Only 4 of the ${FAULTS.length} faults could be tested</strong> on real recordings. The rest rely on mechanical knowledge and haven’t been tested this way, including all the brake and wheel faults and rod knock.</li>
        <li><strong>Some of the recordings may come from the same cars,</strong> which would make the 83% look better than it is. It shows what’s possible, not a promise.</li>
        <li><strong>The site doesn’t include those real recordings,</strong> because their license isn’t clear. So the 83% row only applies once you’ve saved real recordings of your own. Until then, expect something closer to the middle row.</li>
        <li><strong>Misfires were the hardest to measure.</strong> They read as an uneven beat only about 40% of the time, so trust a code reader over this site for misfires.</li>
      </ul>
      <p>For comparison, a <a href="https://arxiv.org/abs/1911.02073" rel="noopener">published study of the same idea</a> got the top answer right 59% of the time, and had it in the top three 83% of the time, choosing from 12 faults. People with no tool at all got 37%.</p>
    </section>

    <section class="help-section" data-reveal aria-labelledby="sounds-title">
      <h2 id="sounds-title">What the example sounds are</h2>
      <p class="section-lede">Every example sound is computer-generated, because real recordings aren’t available yet. Engines are built from their real firing order, so a V8 and an inline 6 sound different for the right reasons. But in our tests, comparing a real recording with generated sounds did no better than guessing. So they’re only there for you to listen to, and they play no part in choosing your results.</p>
    </section>

    <section class="help-section" data-reveal aria-labelledby="costs-title">
      <h2 id="costs-title">Where the rest comes from</h2>
      <ul class="dash-list">
        <li><strong>Costs</strong> are rough US estimates, worked out from a range of parts prices and typical shop hours, with labor at $110 to $180 an hour. We checked several against published ranges, but those sources vary a lot, and your price will depend on your vehicle and where you live.</li>
        <li><strong>Fault advice</strong> is general mechanical knowledge. A professional mechanic hasn’t reviewed it yet, so treat it as a starting point.</li>
        <li><strong>Help with shops</strong> is general consumer guidance, not legal advice, and the rules differ from place to place.</li>
      </ul>
    </section>

    <section class="help-section" data-reveal aria-labelledby="privacy-title">
      <h2 id="privacy-title">Your privacy</h2>
      <p class="section-lede">Your recordings are analyzed on your own device, and nothing is uploaded. There are no accounts, ads or tracking. A recording you save stays in this browser until you delete it or clear your browser’s data.</p>
    </section>

    <section class="help-section" data-reveal aria-labelledby="sources-title">
      <h2 id="sources-title">Sources</h2>
      <ul class="dash-list">
        <li><a href="https://arxiv.org/abs/1911.02073" rel="noopener">OtoMechanic: Auditory Automobile Diagnostics via Query-by-Example</a></li>
        <li><a href="https://newsroom.aaa.com/wp-content/uploads/2016/12/Auto-Repair-Survey-FINAL.pdf" rel="noopener">AAA survey on trust in auto repair shops (2016)</a></li>
        <li><a href="https://financebuzz.com/car-maintenance-survey" rel="noopener">FinanceBuzz car maintenance survey (2025)</a></li>
        <li><a href="https://atg.wa.gov/all-consuming-blog/car-talk-interpreting-pings-and-squeaks" rel="noopener">Washington Attorney General: auto repair guidance</a></li>
        <li><a href="https://vehicleservicepros.com/service-repair/diagnostics-and-drivability/article/21093831/diagnosing-nvh" rel="noopener">Vehicle Service Pros: diagnosing noise and vibration</a></li>
        <li><a href="https://huggingface.co/datasets/RashmiKarunarathne/MyDataSet" rel="noopener">The phone recordings used for testing</a>. We used them to measure accuracy and to set the measurement thresholds and the overall balance of the example sounds. No audio from them is included in this site.</li>
      </ul>
    </section>
  `;
  return watchReveals(main);
}
