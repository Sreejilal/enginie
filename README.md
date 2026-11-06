# Enginie

Your vehicle is making a noise. Enginie helps you work out what it could be, whether it’s safe to keep driving, what a fair price looks like and what to ask the mechanic. It’s free, works on phones, works offline and never uploads your recordings.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer. There’s nothing to install.

```
npm start
```

Then open http://localhost:3000.

Phones only allow the microphone on `https`, so to record on a phone the site needs to be hosted. Everything in `public/` is static, so any static host works. See [Put it online](#put-it-online).

## What’s in it

- **Check a noise:** record it, upload a clip, or answer a few questions. You get the top three possibilities, each with whether you can keep driving, rough US costs, what to try first and what to tell the mechanic.
- **Sound database:** 32 faults across the engine, exhaust, accessories, brakes, wheels and drivetrain.
- **Engines:** why a V8, an inline 6 and others sound different, generated from their real firing orders.
- **Dealing with the shop:** a quote checker, what to do before you approve work, what to do when it’s worse after a repair, and how to spend less.
- **Mechanic mode:** sound signatures, confirmation tests, likely codes and typical book times.

## How accurate is it?

This was tested on real phone recordings the site had never heard, covering 4 faults:

| Method | Top answer right | Right fault in top three |
| --- | --- | --- |
| Random guessing, among 32 faults | 3% | 10% |
| Recording plus basic answers | 41% | 63% |
| Recording, compared with real recordings of those faults | 83% | 98% |

Things to know:

- Only 4 of the 32 faults could be tested this way, so the rest rely on mechanical knowledge.
- Comparing real recordings with computer-generated sounds did no better than guessing. That’s why generated sounds are only for listening, and play no part in the results.
- Real recordings are what make it accurate. Recordings saved from the results page count heavily in future matches.
- The fault advice hasn’t been reviewed by a professional mechanic yet.

The site’s “How far to trust this” page explains all this for visitors.

## Adding real recordings

Real, correctly labeled recordings are the biggest improvement you can make, so long as you have the rights to use them.

1. Put WAV files in `recordings/<fault-id>/`, such as `recordings/worn-brake-pads/`.
2. Run `npm run build:database`.

Only the measurements of each clip go into `public/data/sound-database.json`, never the audio itself. The `.gitignore` stops audio being committed by accident.

To measure accuracy on a folder of labeled clips:

```
node scripts/evaluate-recordings.mjs <folder> [--half-as-references]
```

## Put it online

The live site is at **https://sreejilal.github.io/enginie/**.

GitHub Pages publishes it from the `main` branch, using the repository root. The `index.html` at the root forwards visitors to `public/`, and `.nojekyll` makes GitHub serve the files exactly as they are. Pushing to `main` updates the site within a minute or two, and `.github/workflows/pages.yml` runs the tests on every push.

## Project layout

| Path | What it holds |
| --- | --- |
| `public/js/data/faults.js` | Each fault: symptoms, safety, costs, advice and mechanic details |
| `public/js/data/engines.js` | How each engine layout fires |
| `public/js/match.js` | How faults are ranked, and why |
| `public/js/features.js` | Sound measurement |
| `public/js/synth.js` | The generated listening examples |
| `public/js/audio.js` | Microphone, file upload and playback |
| `public/js/views/` | Each page |
| `test/` | `npm test` |

After changing a sound or the analysis, run `npm run build:database`. The tests fail if the database is out of date.
