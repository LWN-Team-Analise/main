// The home page globe, shared by "Onde encontrar o Grupo LWN" and "Nossos
// Clientes": the Earth drawn as fields of dots, with a scroll-driven camera.
//
// One continuous journey, a pure function of the timeline position T (0..3):
//   0 → 1  offices   world → Brazil → São Paulo → Barueri → Anápolis
//   1 → 2  bridge    the camera pulls back from Anápolis over the region
//   2 → 3  clients   the six client states, then the whole network
// Between two places the camera flies (see `flight`): it rises as it leaves,
// travels on a gently curved track with a slight bank, and descends as it
// arrives, easing in and out. Every highlight, marker, label and route line
// fades or draws continuously with T, so scrolling back plays the journey in
// reverse, and stopping mid-scroll holds the camera mid-flight. While the page
// is idle the Earth keeps turning slowly (see `render`).
//
// Geometry: unit sphere, v(lat, lon) = (cos lat · sin lon, sin lat, cos lat · cos lon).
// The camera looks at a focus point; the view rotation is Rx(lat₀) · Ry(−lon₀),
// so the focus lands at the centre with north up and east to the right, and the
// sphere is projected orthographically (x → right, y → up, z → viewer).

import { BRAZIL_STATES } from '../../data/brazilStates';
import { CITY_SHAPES } from '../../data/cityShapes';
import { LAND_B64, LAND_H, LAND_W } from '../../data/globeLand';
import { ROUTE } from '../../data/serviceRoute';
import { offices } from '../../data/site';
import { clamp, cruise, lerp, range, smoothstep } from '../../lib/math';

const DEG = Math.PI / 180;

// How close the camera gets to each office.
const OFFICE_ZOOM = { saoPaulo: 32, barueri: 42, anapolis: 32 };

// ---------- Journey timing (in T units; each section's scroll is one unit) ----------

const OFFICE_T = [0.4, 0.61, 0.86];
const OFFICE_HOLD = 0.02; // half-width of the rest at each place
const REGION_T = [1.77, 1.82]; // the pause high over the region, between the two sections
const CLIENT_T = [2.12, 2.265, 2.41, 2.555, 2.7, 2.845];
const CLIENT_HOLD = 0.016;
const OVERVIEW_T = 2.965;

// ---------- Vector helpers ----------

const vec = (lat, lon) => {
  const la = lat * DEG;
  const lo = lon * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
};

const latLon = (v) => [Math.asin(clamp(v[1], -1, 1)) / DEG, Math.atan2(v[0], v[2]) / DEG];

function slerp(a, b, t) {
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  const w = Math.acos(dot);
  if (w < 1e-6) return a.slice();
  const s = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / s;
  const kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/** Turns a point about the polar axis so its longitude grows by `a` radians. */
const turn = (v, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

const angleBetween = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------- Flights between places ----------

/**
 * The smooth zoom-and-pan path of van Wijk & Nuij (2003): a camera travelling
 * `d` (radians of arc) from a view `w0` wide to one `w1` wide rises and falls
 * so that the ground appears to move at a steady pace however high it is.
 * Returns the path length S and, for s in 0..S, [fraction of the way, view width].
 * `rho` sets how high it climbs (lower = flatter).
 */
function zoomPath(d, w0, w1, rho) {
  const r2 = rho * rho;
  if (d < 1e-7) {
    const S = Math.abs(Math.log(w1 / w0)) / rho;
    const dir = w1 > w0 ? 1 : -1;
    return { S, at: (s) => [S ? s / S : 1, w0 * Math.exp(dir * rho * s)] };
  }
  const b0 = (w1 * w1 - w0 * w0 + r2 * r2 * d * d) / (2 * w0 * r2 * d);
  const b1 = (w1 * w1 - w0 * w0 - r2 * r2 * d * d) / (2 * w1 * r2 * d);
  const q0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const q1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (q1 - q0) / rho;
  const c0 = Math.cosh(q0);
  const s0 = Math.sinh(q0);
  return {
    S,
    at: (s) => [(w0 / (r2 * d)) * (c0 * Math.tanh(rho * s + q0) - s0), (w0 * c0) / Math.cosh(rho * s + q0)],
  };
}

// How the camera gathers speed and settles on each flight.
const FLIGHT_EASE = cruise(0.4);

// How far a camera move between two views (not along a route) bows off the
// straight line, as a share of its length.
const ARC_BOW = 0.24;

/**
 * A curved path over the sphere from `a` to `b`: the great circle between
 * them, bowed smoothly off to one side (most at the middle, none at the ends),
 * so a route always reads as an arc — at any zoom, wherever it lies on the
 * globe. `side` is +1 to bow to the left of the direction of travel, -1 to the
 * right (by default the side facing south); `share` is how far, as a share of
 * the length. `at(f)` gives the point a fraction `f` of the way along.
 */
function curve(a, b, share, side) {
  const d = angleBetween(a, b);
  let normal = cross(a, b); // points to the left of the direction of travel
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  normal = length > 1e-9 ? normal.map((c) => c / length) : null;
  const way = side ?? (normal && normal[1] > 0 ? -1 : 1);
  const bow = normal ? way * share * d : 0;
  return {
    d,
    side: way,
    share,
    at(f) {
      const v = slerp(a, b, f);
      if (!normal) return v;
      const off = bow * Math.sin(Math.PI * f);
      const c = Math.cos(off);
      const n = Math.sin(off);
      return [v[0] * c + normal[0] * n, v[1] * c + normal[1] * n, v[2] * c + normal[2] * n];
    },
  };
}

const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * The arcs of a route through `markers`, one per hop. Every hop curves, but
 * not all the same way: the first bows away from the middle of the network,
 * and each next one away from the bulge of the arc before it. A route that
 * doubles back therefore opens into a lens instead of stacking its arcs on one
 * side, and the whole reads as a network of flight paths — some bending left,
 * some right. How much each bends follows the geography too: short hops a
 * little more than long ones, and a hop that turns back on the last one a
 * little more again.
 */
function routeArcs(markers) {
  const centre = unit(markers.reduce(vAdd, [0, 0, 0]));
  const arcs = [];
  let lastSide = 1;
  let lastHeading = null;
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i];
    const b = markers[i + 1];
    const normal = unit(cross(a, b)); // left of the direction of travel
    const middle = unit(vAdd(a, b));
    const away = i === 0 ? centre : arcs[i - 1].at(0.5);
    const lean = vDot(vSub(away, middle), normal); // > 0: what to avoid is on the left
    const side = Math.abs(lean) < 1e-5 ? -lastSide : -Math.sign(lean);
    const heading = unit(vSub(b, a));
    const turnBack = lastHeading ? Math.max(0, -vDot(heading, lastHeading)) : 0;
    const degrees = angleBetween(a, b) / DEG;
    const share = lerp(0.3, 0.17, clamp((degrees - 2) / 20)) + 0.04 * turnBack;
    arcs.push(curve(a, b, share, side));
    lastSide = side;
    lastHeading = heading;
  }
  return arcs;
}

// ---------- Smooth curve through keyframes (monotone cubic, Fritsch–Carlson) ----------
// C¹-continuous and never overshoots a keyframe, so the camera glides through
// the journey without bumps and without swinging past a place.

function monotoneTangents(t, y) {
  const n = t.length;
  const d = [];
  const m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (t[i + 1] - t[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return m;
}

function hermite(t, y, m, x) {
  if (x <= t[0]) return y[0];
  const n = t.length;
  if (x >= t[n - 1]) return y[n - 1];
  let k = 0;
  while (k < n - 2 && x > t[k + 1]) k++;
  const h = t[k + 1] - t[k];
  const s = (x - t[k]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * y[k] + (s3 - 2 * s2 + s) * h * m[k] + (-2 * s3 + 3 * s2) * y[k + 1] + (s3 - s2) * h * m[k + 1]
  );
}

// ---------- Geography (built once) ----------

function landTest() {
  const bin = atob(LAND_B64);
  const bits = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
  return (lon, lat) => {
    const gx = Math.floor(((lon + 180) / 360) * LAND_W);
    const gy = Math.floor(((90 - lat) / 180) * LAND_H);
    if (gx < 0 || gx >= LAND_W || gy < 0 || gy >= LAND_H) return false;
    const b = gy * LAND_W + gx;
    return ((bits[b >> 3] >> (b & 7)) & 1) === 1;
  };
}

function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Bounding box, area-weighted centroid and unit-vector rings of a set of [lon, lat] rings. */
function prepareShape(rings) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let centroid = null;
  let bestArea = 0;
  for (const ring of rings) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      minLon = Math.min(minLon, ring[i]);
      maxLon = Math.max(maxLon, ring[i]);
      minLat = Math.min(minLat, ring[i + 1]);
      maxLat = Math.max(maxLat, ring[i + 1]);
      const cross = ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
      area += cross;
      cx += (ring[j] + ring[i]) * cross;
      cy += (ring[j + 1] + ring[i + 1]) * cross;
    }
    if (Math.abs(area) > bestArea) {
      bestArea = Math.abs(area);
      centroid = [cx / (3 * area), cy / (3 * area)];
    }
  }
  const vecs = rings.map((ring) => {
    const out = new Float32Array((ring.length / 2) * 3);
    for (let i = 0, o = 0; i < ring.length; i += 2, o += 3) {
      const v = vec(ring[i + 1], ring[i]);
      out[o] = v[0];
      out[o + 1] = v[1];
      out[o + 2] = v[2];
    }
    return out;
  });
  return { rings, bbox: [minLon, minLat, maxLon, maxLat], centroid, vecs };
}

const inBox = (box, lat, lon) => lat > box.minLat && lat < box.maxLat && lon > box.minLon && lon < box.maxLon;
const shapeAt = (shapes, lon, lat) => {
  for (let i = 0; i < shapes.length; i++) {
    const [a, b, c, d] = shapes[i].bbox;
    if (lon < a || lon > c || lat < b || lat > d) continue;
    if (shapes[i].rings.some((ring) => inRing(ring, lon, lat))) return i;
  }
  return -1;
};

// Detail levels: each finer grid covers a smaller area and fades in as the
// camera closes in; where it overlaps, the coarser grid fades out. Every level
// only appears once its area fills the view, so no grid edge is ever seen.
const FINE = { minLat: -47, maxLat: 12, minLon: -82, maxLon: -24 };
const LEVELS = [
  { step: 1.5 }, // 0 · the world
  { step: 0.5, boxes: [FINE] }, // 1 · South America
  { step: 0.15, boxes: [{ minLat: -28, maxLat: -11, minLon: -57, maxLon: -39 }] }, // 2 · São Paulo ↔ Goiás
  {
    step: 0.05, // 3 · around each office city
    boxes: [
      { minLat: -26.3, maxLat: -20.9, minLon: -49.8, maxLon: -43.6 },
      { minLat: -18.8, maxLat: -13.8, minLon: -51.6, maxLon: -46.3 },
    ],
  },
];

function buildGeography() {
  const isLand = landTest();
  const states = BRAZIL_STATES.map((s) => ({ uf: s.uf, ...prepareShape(s.rings) }));
  const cities = offices.map((o) => ({ id: o.id, ...prepareShape(CITY_SHAPES[o.id]) }));

  // Land near Brazil comes from the IBGE mesh; elsewhere from the world mask,
  // except where only ocean can be (east of the Brazilian coast).
  const classify = (lat, lon) => {
    if (!inBox(FINE, lat, lon)) return { land: isLand(lon, lat), state: -1 };
    const state = shapeAt(states, lon, lat);
    if (state >= 0) return { land: true, state };
    if ((lat < 2.5 && lon > -50.5) || (lat < -27 && lon > -53)) return { land: false, state: -1 };
    return { land: isLand(lon, lat), state: -1 };
  };

  const nodes = { x: [], y: [], z: [], kind: [], level: [], covered: [], state: [], city: [] };
  let sea = 0;
  const add = (lat, lon, level) => {
    const { land, state } = classify(lat, lon);
    if (!land && sea++ % 2) return; // the ocean is drawn at half density
    const next = LEVELS[level + 1];
    const v = vec(lat, lon);
    nodes.x.push(v[0]);
    nodes.y.push(v[1]);
    nodes.z.push(v[2]);
    nodes.kind.push(land ? 1 : 0);
    nodes.level.push(level);
    nodes.covered.push(next && next.boxes.some((box) => inBox(box, lat, lon)) ? 1 : 0);
    nodes.state.push(state);
    nodes.city.push(level >= 2 && land ? shapeAt(cities, lon, lat) : -1);
  };

  // The world: rows of equal-area points.
  const worldStep = LEVELS[0].step;
  for (let lat = -84; lat <= 84; lat += worldStep) {
    const n = Math.max(1, Math.round((360 / worldStep) * Math.cos(lat * DEG)));
    for (let i = 0; i < n; i++) add(lat, -180 + (360 * i) / n, 0);
  }

  // Finer grids over their boxes.
  for (let level = 1; level < LEVELS.length; level++) {
    const { step, boxes } = LEVELS[level];
    for (const box of boxes) {
      for (let lat = box.minLat + step / 2; lat < box.maxLat; lat += step) {
        const lonStep = step / Math.cos(lat * DEG);
        for (let lon = box.minLon; lon < box.maxLon; lon += lonStep) add(lat, lon, level);
      }
    }
  }

  return {
    states,
    cities,
    count: nodes.x.length,
    x: Float32Array.from(nodes.x),
    y: Float32Array.from(nodes.y),
    z: Float32Array.from(nodes.z),
    kind: Uint8Array.from(nodes.kind),
    level: Uint8Array.from(nodes.level),
    covered: Uint8Array.from(nodes.covered),
    state: Int8Array.from(nodes.state),
    city: Int8Array.from(nodes.city),
  };
}

// ---------- Palettes ----------

const PALETTES = {
  light: {
    body: ['#ffffff', '#eef3fa', '#dbe4f1'],
    atmosphere: 'rgba(62, 125, 198, 0.16)',
    shade: 'rgba(13, 31, 69, 0.14)',
    ink: '#0d1f45',
    accent: '#2a52be',
    accentSoft: 'rgba(42, 82, 190, 0.16)',
    border: 'rgba(13, 31, 69, 0.2)',
    marker: '#1f3c96',
    markerRing: '#ffffff',
  },
  dark: {
    body: ['#122652', '#0b1a3d', '#060f27'],
    atmosphere: 'rgba(110, 165, 240, 0.3)',
    shade: 'rgba(2, 6, 18, 0.35)',
    ink: '#9fc2ee',
    accent: '#8fb8ea',
    accentSoft: 'rgba(143, 184, 234, 0.2)',
    border: 'rgba(170, 200, 240, 0.22)',
    marker: '#a9cbf5',
    markerRing: '#060d20',
  },
};

// The place names beside the markers (px; matches .geo-label in GeoGlobe.css).
const LABEL_SIZE = 14;

const markerRadius = (pop, focus, k) => (3.6 + 2.2 * focus) * k * (0.5 + 0.5 * pop);

// ---------- Idle motion ----------

// The Earth turns west → east, so the point under the camera drifts westward.
const SPIN_RATE = 2.5 * DEG; // per second, at the world view
const SWAY_REACH = 0.045; // radians at zoom 1; shrinks as the camera closes in

// ---------- Engine ----------

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ radius?: number, centerY?: number }} options  sphere radius at zoom 1 as a
 *   fraction of the canvas' short side, and the vertical position of its centre (0..1)
 */
export function createGlobe(canvas, { radius = 0.44, centerY = 0.5 } = {}) {
  const ctx = canvas.getContext('2d');
  const fontFamily = getComputedStyle(canvas).fontFamily || 'sans-serif';
  const geo = buildGeography();
  const ufIndex = new Map(geo.states.map((s, i) => [s.uf, i]));

  const OPENING = vec(14, 8);
  const BRAZIL = vec(-12, -50);
  const VIEW = 1 / radius; // the view's short side at zoom 1, in radians of arc

  // Every place the camera stops at, in order: the offices, the pause high over
  // the region, the client states and the closing overview. Each has a view
  // (focus + zoom) and the stretch of T during which the camera rests on it.
  const place = (view, t, hold) => ({ ...view, arrive: t - hold, leave: t + hold });
  const officeStops = offices.map((office, i) => {
    const marker = vec(office.lat, office.lon);
    const [clon, clat] = geo.cities[i].centroid;
    return place(
      { marker, focus: slerp(marker, vec(clat, clon), 0.35), zoom: OFFICE_ZOOM[office.id], region: i, label: office.city },
      OFFICE_T[i],
      OFFICE_HOLD,
    );
  });
  const clientStops = ROUTE.map((stop, i) => {
    const region = ufIndex.get(stop.uf);
    const marker = vec(stop.lat, stop.lon);
    const [clon, clat] = geo.states[region].centroid;
    return place(
      { marker, focus: slerp(marker, vec(clat, clon), 0.45), zoom: stop.zoom, region, label: stop.name },
      CLIENT_T[i],
      CLIENT_HOLD,
    );
  });
  const regionView = { focus: vec(-18, -46.5), zoom: 2.4, arrive: REGION_T[0], leave: REGION_T[1] };
  const overview = { focus: vec(-17.5, -43), zoom: 2.75, arrive: OVERVIEW_T, leave: 3 };
  const waypoints = [...officeStops, regionView, ...clientStops, overview];

  /**
   * The camera's flight from place `a` to place `b` over [t0, t1]. Rather than
   * sliding straight across, it flies the way a camera crew would:
   *   · altitude — it rises as it leaves and descends on arrival (`zoomPath`),
   *     at least a little even on short hops;
   *   · a curved track — the same arc as the route line it follows (`curve`),
   *     so the line's tip stays near the centre of the view as it is drawn;
   *   · a bank — the view turns a few degrees into the curve and back;
   *   · easing — it gathers speed gently, cruises and settles (`FLIGHT_EASE`).
   * All of it is a pure function of T, so stopping mid-scroll holds the camera
   * mid-flight and scrolling back flies the same path in reverse.
   */
  function flight(a, b, t0, t1, { rho = 1.35, lift = 0.2, side, share = ARC_BOW } = {}) {
    const d = angleBetween(a.focus, b.focus);
    const w0 = VIEW / a.zoom;
    const w1 = VIEW / b.zoom;
    const path = zoomPath(d, w0, w1, rho);
    // How far the path already climbs above a plain zoom; short hops get a little more.
    let climb = 0;
    let widest = Math.max(w0, w1);
    for (let i = 1; i < 48; i++) {
      const x = i / 48;
      const w = path.at(x * path.S)[1];
      widest = Math.max(widest, w);
      climb = Math.max(climb, Math.log(w) - lerp(Math.log(w0), Math.log(w1), x));
    }
    const extra = Math.max(0, lift - climb);
    const wide = widest * Math.exp(extra);

    // The track, and the bank that goes with it: a track bowing to the right
    // of the direction of travel turns left, and the view leans with it.
    const track = curve(a.focus, b.focus, share, side);
    const bank = d > 1e-7 ? -track.side * lerp(1.4, 3, clamp(d / wide)) * DEG : 0;

    const eased = (T) => FLIGHT_EASE(range(T, t0, t1));
    const along = (e) => clamp(path.at(e * path.S)[0]);
    return {
      t0,
      t1,
      eased,
      /** How far along the ground track the camera is (0..1): what the route line follows. */
      progress: (T) => along(eased(T)),
      view(T) {
        const e = eased(T);
        const u = along(e);
        const bump = Math.sin(Math.PI * e);
        return { focus: track.at(u), zoom: VIEW / (path.at(e * path.S)[1] * Math.exp(extra * bump)), roll: bank * bump };
      },
    };
  }
  // Between two places of a story the route is an arc from marker to marker
  // (routeArcs); the camera flies the same way round, just as curved.
  const routes = new Map();
  for (const stops of [officeStops, clientStops]) {
    routeArcs(stops.map((stop) => stop.marker)).forEach((arc, i) => routes.set(stops[i], arc));
  }
  const flights = waypoints.slice(0, -1).map((w, i) => {
    const next = waypoints[i + 1];
    const route = routes.get(w) && next.marker ? routes.get(w) : null;
    const f = flight(w, next, w.leave, next.arrive, route ? { side: route.side, share: route.share } : {});
    f.route = route;
    return f;
  });
  // A route leg: its arc, drawn as far as its flight has come, lifted a touch off the surface.
  const leg = (f) => ({ flight: f, path: f.route, lift: f.route.d * 0.08 });

  const officesStory = {
    stops: officeStops,
    legs: flights.slice(0, 2).map(leg),
    exit: flights[2], // Anápolis → the region
  };
  const clientsStory = {
    stops: clientStops,
    entry: flights[3], // the region → São Paulo
    legs: flights.slice(4, 9).map(leg),
    exit: flights[9], // Pernambuco → the overview
    closing: true,
  };
  [...officeStops, ...clientStops].forEach((stop, i) => {
    stop.index = i; // its name's slot in GeoGlobe's list
  });

  // The dive from the world into São Paulo: a smooth curve through keyframes,
  // ending on the first rest (two equal keys, so it lands without a bump).
  const [sp] = officeStops;
  const keys = [];
  const key = (t, focus, zoom) => {
    const [lat, lon] = latLon(focus);
    keys.push({ t, lat, lon, lz: Math.log(zoom) });
  };
  key(0, OPENING, 0.92); // replaced every frame by the idle-turned opening view
  key(0.12, BRAZIL, 1.3);
  key(0.25, sp.focus, 7); // on target, then a steady ~same-rate zoom the rest of the way in
  key(sp.arrive, sp.focus, sp.zoom);
  key(sp.leave, sp.focus, sp.zoom);
  const kt = keys.map((k) => k.t);

  const labelWidths = [];
  document.fonts?.ready.then(() => {
    if (width && height) placeLabels();
  });

  let palette = PALETTES.light;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let spin = 0;
  let sway = 0;

  // Per-frame buffers, reused: dot batches (tone × depth × level × covered) and
  // accent overlays for the highlighted regions (one list per region).
  const BUCKETS = 5;
  const batches = Array.from({ length: 2 * BUCKETS * LEVELS.length * 2 }, () => []);
  const accentCity = offices.map(() => batches.map(() => []));
  const accentState = geo.states.map(() => batches.map(() => []));

  function setScheme(scheme) {
    palette = PALETTES[scheme] ?? PALETTES.light;
  }

  function resize() {
    // 1.5× is plenty for fields of dots, and keeps the per-frame fill cheap on retina screens.
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    if (width && height) placeLabels();
  }

  /** Where the camera is at T: the dive into São Paulo, then rests and flights. */
  function camera(T) {
    if (T <= sp.leave) {
      // The opening view turns with the idle spin; its longitude is taken on the
      // side facing Brazil so the flight in is always the short way round.
      const [olat, olon] = latLon(turn(OPENING, -spin));
      let lon = olon;
      while (lon - keys[1].lon > 180) lon -= 360;
      while (lon - keys[1].lon < -180) lon += 360;
      keys[0].lat = olat;
      keys[0].lon = lon;
      const lat = hermite(kt, keys.map((k) => k.lat), monotoneTangents(kt, keys.map((k) => k.lat)), T);
      const lo = hermite(kt, keys.map((k) => k.lon), monotoneTangents(kt, keys.map((k) => k.lon)), T);
      const lz = hermite(kt, keys.map((k) => k.lz), monotoneTangents(kt, keys.map((k) => k.lz)), T);
      return { focus: vec(lat, lo), zoom: Math.exp(lz), roll: 0 };
    }
    for (let i = 0; i < flights.length; i++) {
      if (T <= waypoints[i].leave) return { focus: waypoints[i].focus, zoom: waypoints[i].zoom, roll: 0 };
      if (T < waypoints[i + 1].arrive) return flights[i].view(T);
    }
    return { focus: overview.focus, zoom: overview.zoom, roll: 0 };
  }

  /**
   * How present each place of a story is at T: its marker and name (pop), its
   * emphasis (focus) and how far each route line is drawn. All follow the
   * camera's flights, so a place appears as the camera arrives over it; its name
   * then stays, quieter, while the journey moves on (`emph`), and at the closing
   * overview every place is named alike.
   */
  function storyState(s, T, alpha) {
    const n = s.stops.length;
    const closing = s.closing ? s.exit.eased(T) : 0;
    const stops = s.stops.map((stop, i) => {
      const inbound = i > 0 ? s.legs[i - 1].flight : s.entry;
      const way = inbound ? inbound.progress(T) : 0;
      const pop = inbound ? smoothstep(range(way, 0.55, 0.97)) : smoothstep(range(T, stop.arrive - 0.06, stop.arrive + 0.005));
      const rise = inbound ? smoothstep(range(way, 0.4, 0.97)) : pop;
      const fall = i < n - 1 ? 1 - smoothstep(range(s.legs[i].flight.progress(T), 0.03, 0.5)) : 1;
      const focus = Math.min(rise, fall);
      return { pop, focus, emph: lerp(focus, 0.8, closing) };
    });
    const legs = s.legs.map((leg) => leg.flight.progress(T));
    // The place the copy talks about: the camera's destination once it is half-way there.
    let active = -1;
    s.stops.forEach((stop, i) => {
      const inbound = i > 0 ? s.legs[i - 1].flight : s.entry;
      if (inbound ? inbound.progress(T) >= 0.5 : T >= stop.arrive - 0.04) active = i;
    });
    return { stops, legs, alpha, active };
  }

  /**
   * Draws one frame.
   * @param {{ T: number, idle?: number, dt?: number, time?: number }} input  the journey
   *   position (0..3), how idle the page is (0..1) and the frame time — idle drives
   *   the slow turn of the Earth.
   */
  function render({ T, idle = 0, dt = 0, time = 0 }) {
    if (!width || !height) resize();
    if (!width || !height) return null;

    // Idle motion. At the world view the Earth turns freely; closer in it only
    // drifts a little and settles, and scrolling eases it gently back.
    const spinWeight = 1 - smoothstep(range(T, 0, 0.12));
    spin = (spin + SPIN_RATE * idle * spinWeight * dt) % (Math.PI * 2);
    const cam = camera(T);
    const zoom = cam.zoom;
    const reach = (SWAY_REACH / Math.pow(zoom, 0.85)) * (1 - spinWeight) * idle;
    sway += (reach - sway) * (1 - Math.exp(-dt / (0.8 + 6.2 * idle)));
    const [fx, fy, fz] = turn(cam.focus, -sway);

    const lat0 = Math.asin(clamp(fy, -1, 1));
    const lon0 = Math.atan2(fx, fz);
    const cl = Math.cos(lon0);
    const sl = Math.sin(lon0);
    const ca = Math.cos(lat0);
    const sa = Math.sin(lat0);

    const u = Math.min(width, height);
    const R = u * radius * zoom;
    const cx = width / 2;
    const cy = height * centerY;
    const k = Math.sqrt(u / 700);
    const v1 = smoothstep(range(zoom, 1.45, 2.6));
    const v2 = smoothstep(range(zoom, 6.5, 12));
    const v3 = smoothstep(range(zoom, 23, 31));
    // A finer grid comes in slightly after the coarser one starts leaving, so the
    // two lattices barely overlap (no double texture mid-zoom).
    const fadeIn = (v) => smoothstep(range(v, 0.3, 1));
    const fadeOut = (v) => smoothstep(range(v, 0, 0.7));
    const own = [1 - 0.4 * v1, fadeIn(v1), fadeIn(v2), fadeIn(v3)];
    const next = [fadeOut(v1), fadeOut(v2), fadeOut(v3), 0];

    // The bank of a flight turns the whole view about its centre.
    const cr = Math.cos(cam.roll);
    const sr = Math.sin(cam.roll);
    const project = (x, y, z, out, o) => {
      const x1 = x * cl - z * sl;
      const z1 = x * sl + z * cl;
      const px = x1 * R;
      const py = -(y * ca - z1 * sa) * R;
      out[o] = cx + px * cr - py * sr;
      out[o + 1] = cy + px * sr + py * cr;
      out[o + 2] = y * sa + z1 * ca;
    };

    // The two stories: the offices fade as the camera leaves Anápolis, the
    // clients appear as it settles over the region.
    const officeState = storyState(officesStory, T, 1 - smoothstep(range(T, 1.05, 1.55)));
    const clientState = storyState(
      clientsStory,
      T,
      smoothstep(range(T, 1.7, 2.08)) * (1 - 0.25 * smoothstep(range(T, clientStops[5].leave, OVERVIEW_T))),
    );

    // How strongly each region is lit (0..1): reached places glow softly, the one in focus fully.
    const glowOf = (s, st) => {
      const glow = new Map();
      s.stops.forEach((stop, i) => {
        const g = st.alpha * st.stops[i].pop * (0.55 + 0.45 * st.stops[i].focus);
        if (g > 0.005) glow.set(stop.region, Math.max(glow.get(stop.region) ?? 0, g));
      });
      return glow;
    };
    const cityGlow = glowOf(officesStory, officeState);
    const stateGlow = glowOf(clientsStory, clientState);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Atmosphere, then the lit body of the sphere.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.16);
    halo.addColorStop(0, palette.atmosphere);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * 1.02);
    body.addColorStop(0, palette.body[0]);
    body.addColorStop(0.6, palette.body[1]);
    body.addColorStop(1, palette.body[2]);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Project every node once; cull the far side and the off-screen ones.
    const margin = 16;
    const buf = [0, 0, 0];
    for (const list of batches) list.length = 0;
    for (const region of accentCity) for (const list of region) list.length = 0;
    for (const region of accentState) for (const list of region) list.length = 0;

    for (let i = 0; i < geo.count; i++) {
      const level = geo.level[i];
      const alpha = own[level] * (geo.covered[i] ? 1 - next[level] : 1);
      if (alpha < 0.02) continue;
      project(geo.x[i], geo.y[i], geo.z[i], buf, 0);
      const z = buf[2];
      if (z <= 0.03) continue;
      const sx = buf[0];
      const sy = buf[1];
      if (sx < -margin || sx > width + margin || sy < -margin || sy > height + margin) continue;
      const bucket = Math.min(BUCKETS - 1, Math.floor(z * BUCKETS));
      const b = ((geo.kind[i] * BUCKETS + bucket) * LEVELS.length + level) * 2 + geo.covered[i];
      batches[b].push(sx, sy);
      // Land in a lit region is re-drawn in the accent colour, weighted by its glow.
      if (geo.kind[i]) {
        const city = geo.city[i];
        const state = geo.state[i];
        if (city >= 0 && cityGlow.has(city)) accentCity[city][b].push(sx, sy);
        else if (state >= 0 && stateGlow.has(state)) accentState[state][b].push(sx, sy);
      }
    }

    // Dot sizes follow each grid's spacing on screen, so density reads the same at any zoom.
    const TONE = [
      { alpha: 0.18, size: 0.14 }, // sea
      { alpha: 0.55, size: 0.24 }, // land
    ];
    const dotSize = (b) => {
      const level = Math.floor(b / 2) % LEVELS.length;
      const bucket = Math.floor(b / 2 / LEVELS.length) % BUCKETS;
      const spec = TONE[Math.floor(b / 2 / LEVELS.length / BUCKETS)];
      const depth = (bucket + 0.5) / BUCKETS;
      const step = LEVELS[level].step * DEG * R;
      return { spec, depth, level, size: clamp(step * spec.size * (0.6 + 0.4 * depth), 0.8, (level === 0 ? 2.8 : 4) * k) };
    };
    const layerAlpha = (b) => {
      const level = Math.floor(b / 2) % LEVELS.length;
      return own[level] * (b % 2 ? 1 - next[level] : 1);
    };
    ctx.fillStyle = palette.ink;
    batches.forEach((list, b) => {
      if (!list.length) return;
      const { spec, depth, size } = dotSize(b);
      ctx.globalAlpha = spec.alpha * (0.35 + 0.65 * depth) * layerAlpha(b);
      ctx.beginPath();
      for (let q = 0; q < list.length; q += 2) ctx.rect(list[q] - size / 2, list[q + 1] - size / 2, size, size);
      ctx.fill();
    });

    ctx.fillStyle = palette.accent;
    const drawAccent = (regions, glow) => {
      regions.forEach((lists, region) => {
        const g = glow.get(region);
        if (!g) return;
        lists.forEach((list, b) => {
          if (!list.length) return;
          const { depth, size } = dotSize(b);
          const s = size * 1.25;
          ctx.globalAlpha = g * 0.95 * (0.45 + 0.55 * depth) * layerAlpha(b);
          ctx.beginPath();
          for (let q = 0; q < list.length; q += 2) ctx.rect(list[q] - s / 2, list[q + 1] - s / 2, s, s);
          ctx.fill();
        });
      });
    };
    drawAccent(accentState, stateGlow);
    drawAccent(accentCity, cityGlow);
    ctx.globalAlpha = 1;

    const ring = [0, 0, 0];
    const tracePath = (shape) => {
      ctx.beginPath();
      for (const vecs of shape.vecs) {
        for (let q = 0; q < vecs.length; q += 3) {
          project(vecs[q], vecs[q + 1], vecs[q + 2], ring, 0);
          if (q === 0) ctx.moveTo(ring[0], ring[1]);
          else ctx.lineTo(ring[0], ring[1]);
        }
        ctx.closePath();
      }
    };
    const outlineRegion = (shape, g, lineWidth) => {
      tracePath(shape);
      ctx.globalAlpha = g * 0.9;
      ctx.fillStyle = palette.accentSoft;
      ctx.fill();
      ctx.globalAlpha = g;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    // State borders for context once the camera is close, and the lit states.
    if (v1 > 0.01) {
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = v1;
      geo.states.forEach((state) => {
        tracePath(state);
        ctx.stroke();
      });
      stateGlow.forEach((g, si) => outlineRegion(geo.states[si], g * v1, 1.1 + 0.5 * g));
    }
    // The office cities, outlined as the camera reaches them.
    if (v2 > 0.01) cityGlow.forEach((g, ci) => outlineRegion(geo.cities[ci], g * v2, 1.2 + 0.6 * g));
    ctx.globalAlpha = 1;

    // Lighting over the surface: brighter towards the light, deeper at the limb.
    const shade = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(0.75, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, palette.shade);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    drawStory(officesStory, officeState, { project, k, time });
    drawStory(clientsStory, clientState, { project, k, time });

    const labels = placeNames([
      [officesStory, officeState],
      [clientsStory, clientState],
    ], { project, k });

    // What the section copy should show: the place the camera is at or heading to.
    const summarise = (st) => ({ active: st.active, reached: st.stops.filter((s) => s.pop > 0.5).length });
    const offices_ = summarise(officeState);
    const clients_ = summarise(clientState);
    const atOverview = T > OVERVIEW_T - 0.05 ? 1 : 0;
    return {
      phase: T < 1 ? 'locations' : T < 2 ? 'handoff' : 'clients',
      zoom,
      roll: cam.roll / DEG,
      focus: latLon(cam.focus),
      offices: offices_,
      clients: { active: atOverview ? -1 : clients_.active, reached: clients_.reached, overview: atOverview },
      labels,
    };
  }

  /**
   * Where each place's name goes this frame (GeoGlobe draws them as crisp page
   * text): beside its marker, on its preferred side, sliding the last few
   * pixels in as the marker appears. The name of the place in focus wins; a
   * name that would sit on another name or cover another marker is marked
   * `clear: false` (GeoGlobe fades it out until there is room again).
   */
  function placeNames(stories, { project, k }) {
    const labels = [];
    const dots = [];
    const wanted = [];
    const at = [0, 0, 0];
    for (const [s, st] of stories) {
      s.stops.forEach((stop, i) => {
        const { pop, focus, emph } = st.stops[i];
        const alpha = st.alpha * pop;
        project(stop.marker[0], stop.marker[1], stop.marker[2], at, 0);
        const shown = alpha > 0.01 && at[2] > 0.05;
        const r = markerRadius(pop, focus, k);
        const label = {
          alpha: shown ? alpha : 0,
          emph,
          x: at[0],
          y: at[1],
          side: stop.side,
          gap: r + 2 + (7 + 6 * (1 - pop)) * k,
          clear: true,
        };
        labels[stop.index] = label;
        if (!shown) return;
        dots.push({ x: at[0], y: at[1], r: r + 1, index: stop.index });
        wanted.push({ label, index: stop.index, rank: st.alpha * 10 + (i === st.active ? 5 : 0) + i * 0.1 });
      });
    }
    const boxes = [];
    const h = LABEL_SIZE; // the text itself: halos may touch, letters may not
    wanted.sort((a, b) => b.rank - a.rank);
    for (const { label, index } of wanted) {
      const w = labelWidths[index];
      const x0 = label.side > 0 ? label.x + label.gap : label.x - label.gap - w;
      const box = [x0, label.y - h / 2, x0 + w, label.y + h / 2];
      const onName = boxes.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3]);
      const onDot = dots.some(
        (d) => d.index !== index && d.x + d.r > box[0] && d.x - d.r < box[2] && d.y + d.r > box[1] && d.y - d.r < box[3],
      );
      label.clear = !onName && !onDot;
      if (label.clear) boxes.push(box);
    }
    return labels;
  }

  /**
   * Measures each name and picks the side of its marker it prefers: the side
   * clear of the story's other places, both where the camera rests on it and,
   * for the clients, at the closing overview (so Barueri's name goes to the
   * left, away from São Paulo just east of it, and so does São Paulo's among
   * the client states, away from Rio de Janeiro).
   */
  function placeLabels() {
    const u = Math.min(width, height);
    const k = Math.sqrt(u / 700);
    ctx.font = `600 ${LABEL_SIZE}px ${fontFamily}`;
    const offset = (view, v) => {
      const R = u * radius * view.zoom;
      const [la, lo] = latLon(view.focus).map((d) => d * DEG);
      const x1 = v[0] * Math.cos(lo) - v[2] * Math.sin(lo);
      const z1 = v[0] * Math.sin(lo) + v[2] * Math.cos(lo);
      return [x1 * R, -(v[1] * Math.cos(la) - z1 * Math.sin(la)) * R];
    };
    for (const s of [officesStory, clientsStory]) {
      const views = s.closing ? [overview] : [];
      s.stops.forEach((stop) => {
        const width_ = ctx.measureText(stop.label).width;
        labelWidths[stop.index] = width_;
        // Would the name, on side `dir`, cover another place's marker? (The same test as placeNames.)
        const dot = markerRadius(1, 1, k) + 1;
        const near = markerRadius(1, 1, k) + 2 + 7 * k;
        const blocked = (dir) =>
          [stop, ...views].some((view) => {
            const [ox, oy] = offset(view, stop.marker);
            return s.stops.some((other) => {
              if (other === stop) return false;
              const [x, y] = offset(view, other.marker);
              const dx = (x - ox) * dir;
              return dx + dot > near && dx - dot < near + width_ && Math.abs(y - oy) < LABEL_SIZE / 2 + dot;
            });
          });
        stop.side = blocked(1) && !blocked(-1) ? -1 : 1;
      });
    }
  }

  /** Route lines (drawn progressively), their travelling light, and the place markers. */
  function drawStory(s, st, { project, k, time }) {
    if (st.alpha <= 0.01) return;
    const pt = [0, 0, 0];
    const arcPoint = (leg, f) => {
      const v = leg.path.at(f);
      const h = 1 + leg.lift * Math.sin(Math.PI * f);
      project(v[0] * h, v[1] * h, v[2] * h, pt, 0);
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = palette.accent;
    s.legs.forEach((leg, li) => {
      const drawn = st.legs[li];
      if (drawn <= 0.001) return;
      // Sampled finely along the arc: a smooth curve, never a straight segment between the places.
      const steps = Math.max(2, Math.ceil(120 * drawn));
      const path = new Path2D();
      for (let q = 0; q <= steps; q++) {
        arcPoint(leg, (q / steps) * drawn);
        if (q === 0) path.moveTo(pt[0], pt[1]);
        else path.lineTo(pt[0], pt[1]);
      }
      ctx.globalAlpha = 0.1 * st.alpha;
      ctx.lineWidth = 4.5 * k;
      ctx.stroke(path);
      ctx.globalAlpha = 0.9 * st.alpha;
      ctx.lineWidth = 1.4 * k;
      ctx.stroke(path);

      // A soft light travels with the tip while the line is being drawn.
      const tip = Math.sin(Math.PI * drawn);
      if (tip > 0.02) {
        arcPoint(leg, drawn);
        const glow = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 9 * k);
        glow.addColorStop(0, palette.accent);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = st.alpha * tip * 0.65;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 9 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    s.stops.forEach((stop, i) => {
      const { pop, focus } = st.stops[i];
      if (pop <= 0.01) return;
      project(stop.marker[0], stop.marker[1], stop.marker[2], pt, 0);
      if (pt[2] <= 0.05) return;
      const [mx, my] = pt;
      const a = st.alpha * pop;

      // The place in focus breathes a soft ring.
      if (focus > 0.05) {
        const phase = (time / 2200) % 1;
        ctx.globalAlpha = a * focus * (1 - phase) * 0.5;
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(mx, my, (7 + 16 * phase) * k, 0, Math.PI * 2);
        ctx.stroke();
      }

      const r = markerRadius(pop, focus, k);
      ctx.globalAlpha = a;
      ctx.fillStyle = palette.markerRing;
      ctx.beginPath();
      ctx.arc(mx, my, r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.marker;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  return {
    render,
    resize,
    setScheme,
    /** Idle-motion state, for inspection: the world turn and the close-up drift (radians). */
    get motion() {
      return { spin, sway };
    },
  };
}
