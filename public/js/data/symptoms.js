// The questions Enginie asks. Published research on this problem found that knowing when and
// where a sound happens helps as much as the sound itself, so these matter as much as the mic.

export const SOUND_WORDS = {
  squeal: 'Squeal or screech',
  grind: 'Grinding or scraping',
  knock: 'Deep knock or thud',
  tick: 'Light ticking or tapping',
  click: 'Clicking',
  rattle: 'Rattle or buzz',
  hiss: 'Hiss or whoosh',
  whine: 'Whine or siren',
  roar: 'Loud roar',
  hum: 'Low hum, drone or growl',
  clunk: 'Clunk or bang',
  ping: 'Metallic pinging',
  puff: 'Puffing or chuffing',
};

export const CONTEXTS = {
  starting: 'starting up',
  cold: 'the engine is cold',
  idling: 'idling',
  accelerating: 'speeding up',
  cruising: 'cruising',
  braking: 'braking',
  turning: 'turning',
  bumps: 'going over bumps',
  ac: 'the A/C is on',
};

export const LOCATIONS = {
  engine: 'Engine bay',
  under: 'Under the vehicle',
  wheel: 'A wheel',
  rear: 'The rear',
};

export const FOLLOWS = {
  engine: 'With the revs, even when parked',
  road: 'With road speed, not the revs',
  neither: 'Neither of those',
};

export const URGENCY = {
  stop: 'Stop driving',
  soon: 'Fix soon',
  watch: 'Keep an eye on it',
  ok: 'Sounds normal',
};

export const DRIVE_LABELS = {
  no: 'Don’t drive it',
  careful: 'Short, gentle trips only',
  yes: 'OK to keep driving',
};

// Things that override any sound match. If someone ticks one, its advice comes first.
export const RED_FLAGS = [
  {
    id: 'oil-light',
    label: 'Oil pressure light is on',
    title: 'Stop the engine as soon as it’s safe',
    advice: 'Low oil pressure can destroy an engine within minutes. Pull over, switch off and check the oil. If it’s full and the light stays on, have it towed.',
  },
  {
    id: 'overheating',
    label: 'Temperature gauge is high, or steam',
    title: 'Pull over and switch off',
    advice: 'Driving while overheating can ruin the engine. Never open the radiator cap while it’s hot, because the coolant can burn you. Let it cool and check the level.',
  },
  {
    id: 'flashing-cel',
    label: 'Check engine light is flashing',
    title: 'Ease off and stop as soon as it’s safe',
    advice: 'A flashing light usually means a misfire bad enough to damage the catalytic converter. Avoid hard acceleration and have the code read before driving further.',
  },
  {
    id: 'brake-pedal',
    label: 'Brake pedal feels soft or sinks',
    title: 'Don’t drive it',
    advice: 'This can mean a brake fluid leak or a failing master cylinder, which puts your stopping power at risk. Have it towed.',
  },
  {
    id: 'steering',
    label: 'Steering feels loose, or a wheel wobbles',
    title: 'Slow down and pull over',
    advice: 'Check the lug nuts on every wheel. Loose steering can mean a failing ball joint or tie rod. Have it towed unless you’ve found and fixed the cause.',
  },
  {
    id: 'smoke',
    label: 'Smoke or a burning smell',
    title: 'Pull over and switch off',
    advice: 'If there’s smoke or a burning smell from under the hood, get everyone away from the vehicle and call emergency services if you see flames. Don’t open the hood if you suspect a fire.',
  },
  {
    id: 'fuel-smell',
    label: 'Strong fuel smell',
    title: 'Don’t start it',
    advice: 'A fuel leak is a fire risk. Keep away from flames and sparks, and have it towed.',
  },
  {
    id: 'fumes',
    label: 'Exhaust fumes inside',
    title: 'Open the windows and stop driving',
    advice: 'Exhaust gas contains carbon monoxide, which you can’t always smell, and it can be deadly. Get fresh air, and if anyone feels dizzy or sick, get medical help.',
  },
];
