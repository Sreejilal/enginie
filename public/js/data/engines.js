// How each engine layout fires. The sound of every engine in the database is generated
// from these firing angles, so a V8 and an inline 6 differ for the same physical reasons
// they do on a real vehicle, rather than being the same noise at a different pitch.

const evenFiring = (cylinders, banks = () => 0) => Array.from({ length: cylinders }, (_, index) => ({
  at: (720 / cylinders) * index,
  bank: banks(index),
}));

// A cross-plane V8 fires 1-8-4-3-6-5-7-2, with odd cylinders on one bank and even on the other.
// That sends some pairs down the same pipe 90 degrees apart, and leaves long gaps elsewhere.
const CROSS_PLANE_BANKS = [0, 1, 1, 0, 1, 0, 0, 1];

export const ENGINES = [
  {
    id: 'i3',
    name: 'Inline 3',
    cylinders: 3,
    idle: [850, 1000],
    firing: evenFiring(3),
    tract: { resonances: [190, 620, 1500], bankSpread: 0, rasp: 0.34, mistune: 0.06 },
    examples: 'Ford 1.0 EcoBoost, Toyota GR Yaris, many small turbo cars',
    character: 'A thrummy, slightly off-beat growl. You can almost count the pulses.',
    why: 'Pulses are 240 degrees apart, the longest gap here, so each one stands alone. At idle there are only about 19 a second, low enough to feel as a shake.',
  },
  {
    id: 'i4',
    name: 'Inline 4',
    cylinders: 4,
    idle: [700, 850],
    firing: evenFiring(4),
    tract: { resonances: [170, 560, 1350], bankSpread: 0, rasp: 0.3, mistune: 0.04 },
    examples: 'Honda Civic, Toyota Corolla, most everyday cars',
    character: 'A plain, buzzy hum that gets thin and busy at high revs.',
    why: 'Even pulses every 180 degrees, about 25 a second at idle. Four-cylinder engines also shake at twice crank speed, which adds their familiar buzz.',
  },
  {
    id: 'i5',
    name: 'Inline 5',
    cylinders: 5,
    idle: [700, 850],
    firing: evenFiring(5),
    tract: { resonances: [155, 500, 1250], bankSpread: 0, rasp: 0.3, mistune: 0.05 },
    examples: 'Audi RS3 and TT RS, older Volvo and Ford RS models',
    character: 'A warbling, slightly uneven note between a 4 and a 6.',
    why: 'Each pulse is 144 degrees apart, and five is an odd number, so the pipes never pair up evenly. That gives the warble people call the five-cylinder sound.',
  },
  {
    id: 'i6',
    name: 'Inline 6',
    cylinders: 6,
    idle: [600, 750],
    firing: evenFiring(6, (index) => index % 2),
    tract: { resonances: [145, 470, 1150], bankSpread: 0.015, rasp: 0.24, mistune: 0.015 },
    examples: 'BMW 3 Series and X5, Toyota Supra, Ram Hurricane, Mercedes 450',
    character: 'Smooth and silky, almost like a turbine. No lumps at all.',
    why: 'Pulses arrive perfectly evenly every 120 degrees, and an inline 6 is naturally balanced, so nothing shakes or lopes. Evenness is the whole character.',
  },
  {
    id: 'v6',
    name: 'V6',
    cylinders: 6,
    idle: [600, 750],
    firing: evenFiring(6, (index) => index % 2),
    tract: { resonances: [150, 490, 1250], bankSpread: 0.09, rasp: 0.32, mistune: 0.04 },
    examples: 'Toyota Camry V6, Ford F-150 EcoBoost, Honda Pilot',
    character: 'Same pulse rate as an inline 6, but raspier and less pure.',
    why: 'It fires as often as an inline 6, but splits its pulses between two separate banks of 3. Each bank sounds a little different, so the note is rougher.',
  },
  {
    id: 'v8',
    name: 'V8 (cross-plane)',
    cylinders: 8,
    idle: [600, 750],
    firing: evenFiring(8, (index) => CROSS_PLANE_BANKS[index]),
    tract: { resonances: [110, 380, 950], bankSpread: 0.16, rasp: 0.26, mistune: 0.05, gapBoost: 0.3 },
    examples: 'Ford Mustang GT and F-150 5.0, Chevy Silverado and Corvette, Dodge Hemi',
    character: 'The classic deep, lumpy burble. It lopes rather than hums.',
    why: 'The engine fires evenly overall, but each bank does not: its pipes get pulses 90, 180 and 270 degrees apart. That uneven beat on each side is the V8 burble, with a lump at crank speed under the firing note.',
  },
  {
    id: 'v8-flat',
    name: 'V8 (flat-plane)',
    cylinders: 8,
    idle: [800, 1000],
    firing: evenFiring(8, (index) => index % 2),
    tract: { resonances: [150, 560, 1500], bankSpread: 0.03, rasp: 0.34, mistune: 0.03 },
    examples: 'Ferrari 458, Shelby GT350, Corvette Z06 (C8)',
    character: 'A hard, high wail with no burble, like two four-cylinders at once.',
    why: 'Its crank fires the banks strictly in turn, so each pipe gets even pulses 180 degrees apart. Same cylinder count as a muscle-car V8, and an entirely different sound.',
  },
  {
    id: 'boxer4',
    name: 'Boxer 4',
    cylinders: 4,
    idle: [650, 800],
    firing: [
      { at: 0, bank: 0, delay: 0 },
      { at: 180, bank: 0, delay: 24 },
      { at: 360, bank: 1, delay: -15 },
      { at: 540, bank: 1, delay: 10 },
    ],
    tract: { resonances: [145, 470, 1200], bankSpread: 0.12, rasp: 0.28, mistune: 0.07 },
    examples: 'Older Subaru WRX and Impreza, Toyota GR86. Newer Subarus are smoother.',
    character: 'A burbling, uneven rumble that is surprisingly V8-like for its size.',
    why: 'It fires evenly, but on many engines the exhaust pipes are different lengths, so pulses reach the collector at uneven moments. That rumble is a plumbing effect.',
  },
  {
    id: 'diesel4',
    name: 'Diesel 4',
    cylinders: 4,
    diesel: true,
    idle: [750, 900],
    firing: evenFiring(4),
    tract: { resonances: [170, 600, 1500], bankSpread: 0, rasp: 0.3, mistune: 0.05, clatter: 0.55 },
    examples: 'VW and Audi TDI, Ford Transit, many vans and small trucks',
    character: 'The familiar diesel clatter on top of a plain four-cylinder beat.',
    why: 'Fuel ignites from compression alone, so pressure rises very sharply. That hard hit on each firing makes the metallic clatter. A healthy diesel does this by design.',
  },
  {
    id: 'diesel6',
    name: 'Diesel 6',
    cylinders: 6,
    diesel: true,
    idle: [650, 800],
    firing: evenFiring(6, (index) => index % 2),
    tract: { resonances: [125, 420, 1200], bankSpread: 0.015, rasp: 0.26, mistune: 0.02, clatter: 0.5 },
    examples: 'Ram Cummins 6.7, Mercedes and BMW straight-six diesels',
    character: 'A deep, even clatter, like a smooth inline 6 with a hard edge.',
    why: 'It has the even pulses of an inline 6 with the sharp combustion of a diesel. The clatter stays, but the beat underneath is smooth.',
  },
  {
    id: 'diesel8',
    name: 'Diesel V8',
    cylinders: 8,
    diesel: true,
    idle: [650, 750],
    firing: evenFiring(8, (index) => CROSS_PLANE_BANKS[index]),
    tract: { resonances: [105, 360, 1100], bankSpread: 0.1, rasp: 0.26, mistune: 0.04, gapBoost: 0.15, clatter: 0.5 },
    examples: 'Ford Power Stroke, Chevy and GMC Duramax',
    character: 'Heavy clatter with a muffled V8 lope underneath.',
    why: 'It has the same uneven banks as a petrol V8, but the turbo smooths much of the lope out of the exhaust, leaving the clatter to dominate.',
  },
];

/** For each cylinder, how many crank degrees since the last pulse went down the same pipe. */
export function bankGaps(firing) {
  return firing.map((cylinder, index) => {
    for (let back = 1; back <= firing.length; back++) {
      const previous = firing[(index - back + firing.length) % firing.length];
      if (previous.bank === cylinder.bank) return (cylinder.at - previous.at + 720) % 720 || 720;
    }
    return 720;
  });
}

/** A quick follow-up down the same pipe hits harder, and a long gap softer. This makes the V8 lope. */
export function pulseBoost(tract, gap, strength = 1) {
  if (!tract.gapBoost) return 1;
  return 1 + strength * tract.gapBoost * (gap <= 120 ? 1 : gap >= 240 ? -0.8 : 0);
}

export const engineById = (id) => ENGINES.find((engine) => engine.id === id);
export const DIESEL_ENGINES = ENGINES.filter((engine) => engine.diesel).map((engine) => engine.id);
