// Hero airflow configuration. Positions are fractions of the cleanroom photo,
// measured from its TOP-LEFT corner; timings use the hero scroll progress (0–1).

export const PHOTO = {
  url: '/assets/hero/hero-sala-limpa.webp',
  width: 900,
  height: 450,
};

// The three ceiling diffusers visible in the photo: outlet centre + strength.
export const DIFFUSERS = [
  { x: 0.325, y: 0.172, strength: 0.9 },
  { x: 0.505, y: 0.162, strength: 1 },
  { x: 0.68, y: 0.172, strength: 0.9 },
];

export const FLOW = {
  // How far below the diffusers the air front has travelled (photo height units).
  reach: [
    [0, 0.045], // at rest: only a faint breath right under the ducts
    [0.25, 0.2],
    [0.5, 0.44],
    [0.75, 0.68],
    [1, 0.95],
  ],
  // Downward advection of the smoke texture — this is what makes the air move
  // with the scroll wheel (and move back up when scrolling up).
  travel: 1.6,
  // A barely perceptible drift so the air never looks frozen between scrolls.
  idleDrift: 0.01,
  // Overall opacity of the smoke over the timeline.
  intensity: [
    [0, 0.55],
    [0.3, 0.85],
    [1, 1],
  ],
  // Cone geometry of each plume.
  outletWidth: 0.055,
  spread: 0.6,
};

export const PARTICLES = {
  count: { high: 900, medium: 600, low: 320 },
  alpha: [
    [0, 0.35],
    [0.4, 0.85],
    [1, 0.9],
  ],
};

// Camera push-in on the photo while the air descends (CSS scale of the media).
export const PUSH_IN = { from: 1.03, to: 1.1 };

// Hero copy timing.
export const TEXT = {
  description: { start: 0.08, end: 0.78, window: 0.18 },
  actions: { start: 0.78, end: 0.9 },
  cue: { start: 0, end: 0.06 },
};
