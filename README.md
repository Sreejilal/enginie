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
- **Sound database:** 44 faults across the engine, exhaust, accessories, brakes, wheels, drivetrain and cabin, plus common sounds that are perfectly normal.
- **Engines:** why a V8, an inline 6 and others sound different, generated from their real firing orders.
- **Dealing with the shop:** a quote checker, what to do before you approve work, what to do when it’s worse after a repair, and how to spend less.
- **Mechanic mode:** sound signatures, confirmation tests, likely codes and typical book times.

## How accurate is it?

This was tested on real phone recordings the site had never heard, covering 4 faults:

| Method | Top answer right | Right fault in top three |
| --- | --- | --- |
| Random guessing, among 44 faults | 2% | 7% |
| Recording plus basic answers | 41% | 63% |
| Recording, compared with real recordings of those faults | 91% | 98% |

Things to know:

- Only 4 of the 44 faults could be tested this way, so the rest rely on mechanical knowledge.
- Comparing real recordings with computer-generated sounds did no better than guessing. That’s why generated sounds are only for listening, and play no part in the results.
- Real recordings are what make it accurate. The fault whose real recording sounds closest gets a capped boost, scaled by how well the answers fit, and never against the sound words someone picked. Letting a close match override everything made results worse on a mixed set of 38 real recordings of 16 faults.
- The fault advice hasn’t been reviewed by a professional mechanic yet.

The site’s “How far to trust this” page explains all this for visitors.

## Adding real recordings

Real, correctly labeled recordings are the biggest improvement you can make, so long as you have the rights to use them.

1. Put the clips in `recordings/<fault-id>/`, such as `recordings/worn-brake-pads/`. WAV works as it is. Phone recordings and voice notes (m4a, mp3, ogg, opus and so on) work too if [ffmpeg](https://ffmpeg.org/) is installed, for example with `winget install ffmpeg`, or if `FFMPEG` is set to its path.
2. Note where each clip came from and its license in a `SOURCES.md` in the same folder.
3. Run `npm run build:database`.

Only the measurements of each clip go into `public/data/sound-database.json`, never the audio itself. The `.gitignore` stops audio being committed by accident.

**Check before you add.** A real recording only gives a capped boost to the closest match, but a lopsided set can still tilt results when someone records without answering the questions. With only healthy engines saved, a faulty engine recorded on its own can come out as healthy. Add recordings of faults alongside any healthy ones, and measure accuracy before and after:

```
node scripts/evaluate-recordings.mjs <folder> [--half-as-references]
```

The folder can hold files named after the fault, such as `lifter-tick_004.wav`, or folders named after it, as in `recordings/`.

### Finding recordings you can reuse

Freesound has real recordings of many faults under licenses that allow reuse. With a free API key from [freesound.org/apiv2/apply](https://freesound.org/apiv2/apply):

```
FREESOUND_TOKEN=<your key> node scripts/fetch-freesound.mjs [fault-id ...]
```

It keeps only CC0 and CC BY sounds, saves them to `recordings-review/` with their credits, and makes `recordings-review/index.html` so you can listen to each one. Uploaders' labels are often wrong, so only move a clip into `recordings/` if you can clearly hear the fault.

Most other fault recordings online, on YouTube, forums and in datasets built from them, have no license that allows reuse. They can still be used privately with the evaluation script to measure accuracy, but don't add them to `recordings/`.

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
