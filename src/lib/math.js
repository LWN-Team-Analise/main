export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Normalizes `v` into 0..1 across the [start, end] window. */
export const range = (v, start, end) => clamp((v - start) / (end - start));

export const smoothstep = (t) => t * t * (3 - 2 * t);
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInQuad = (t) => t * t;

/**
 * An ease for physical, unhurried motion: the speed builds along a half cosine
 * over the first `ramp` of the way, holds steady, and fades the same way at the
 * end — no jolt when it starts or stops, and no rush through the middle.
 */
export function cruise(ramp = 0.35) {
  const a = clamp(ramp, 0.001, 0.5);
  const speed = 1 / (1 - a);
  const edge = (x) => speed * (x / 2 - (a / (2 * Math.PI)) * Math.sin((Math.PI * x) / a));
  return (t) => {
    const x = clamp(t);
    if (x < a) return edge(x);
    if (x > 1 - a) return 1 - edge(1 - x);
    return speed * (x - a / 2);
  };
}

/** Rises from 0 to 1 across [a, b] and falls back to 0 across [c, d]. */
export const pulse = (v, a, b, c, d) => smoothstep(range(v, a, b)) * (1 - smoothstep(range(v, c, d)));

/** Frame-rate independent exponential damping factor. */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

/** Deterministic pseudo random generator so the scene looks identical on every load. */
export function seededRandom(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monotone cubic (Fritsch–Carlson) interpolation through [[t, value], ...] keys.
 * Gives smooth camera motion without the overshoot of Catmull–Rom splines.
 */
export function createTrack(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const slopes = [];
  for (let i = 0; i < n - 1; i++) slopes.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));

  const tangents = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      tangents[i] = k * a * slopes[i];
      tangents[i + 1] = k * b * slopes[i];
    }
  }

  return (t) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const s = (t - xs[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * ys[i] +
      (s3 - 2 * s2 + s) * h * tangents[i] +
      (-2 * s3 + 3 * s2) * ys[i + 1] +
      (s3 - s2) * h * tangents[i + 1]
    );
  };
}
