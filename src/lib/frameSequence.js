// Scroll-scrubbed video, done the way premium product pages do it.
//
// Why not just set <video>.currentTime? These files are encoded with a single
// keyframe, so every seek makes the browser decode again from frame 1 — the
// picture lags and jumps ("frame by frame"). Instead, a worker (frameWorker.js)
// decodes every frame once and hands back compressed stills. Here we keep a
// small window of them decoded as bitmaps around the current position,
// prefetching in the direction of travel, and paint the eased scroll progress
// on a canvas with a cross-fade between neighbouring frames — continuous motion
// in both directions, with a bounded memory footprint.

export const canDecodeFrames = () =>
  typeof window !== 'undefined' &&
  'VideoDecoder' in window &&
  'OffscreenCanvas' in window &&
  'createImageBitmap' in window &&
  typeof Worker !== 'undefined';

const isSmallDevice = () => window.innerWidth < 768 || (navigator.deviceMemory && navigator.deviceMemory <= 4);

// Decoded bitmaps kept around the playhead (the rest stay as JPEG blobs).
const AHEAD = 12;
const BEHIND = 5;
const MAX_DECODING = 3;

export function createFrameSequence(canvas, src, { onUnsupported } = {}) {
  const ctx = canvas.getContext('2d');
  let worker = null;
  let blobs = [];
  let total = 0;
  const bitmaps = new Map();
  const decoding = new Set();
  let generation = 0;
  let started = false;
  let active = false;
  let loadedAspect = 0;
  let loadedWidth = 0;
  let progress = 0;
  let direction = 1;
  let center = 0;
  let painted = '';

  const paint = (force = false) => {
    if (!total || !bitmaps.size) return;
    const f = progress * (total - 1);
    const i = Math.floor(f);
    const t = f - i;
    let a = bitmaps.get(i);
    let b = t > 0.002 ? bitmaps.get(i + 1) : null;
    let key;
    if (a) {
      key = `${i}:${b ? Math.round(t * 255) : 0}`;
    } else {
      // Not decoded yet (a fast fling): hold the closest frame we do have.
      let best = -1;
      let distance = Infinity;
      for (const k of bitmaps.keys()) {
        const d = Math.abs(k - f);
        if (d < distance) {
          distance = d;
          best = k;
        }
      }
      a = bitmaps.get(best);
      b = null;
      key = `~${best}`;
    }
    if (!force && key === painted) return;
    painted = key;
    ctx.globalAlpha = 1;
    ctx.drawImage(a, 0, 0, canvas.width, canvas.height);
    if (b) {
      ctx.globalAlpha = t;
      ctx.drawImage(b, 0, 0, canvas.width, canvas.height);
    }
    if (!canvas.dataset.ready) canvas.dataset.ready = 'true';
  };

  // Keep the bitmap window around the playhead, nearest frames first.
  const fill = () => {
    if (!active || !total) return;
    const ahead = direction >= 0 ? AHEAD : BEHIND;
    const behind = direction >= 0 ? BEHIND : AHEAD;
    const lo = Math.max(0, center - behind);
    const hi = Math.min(total - 1, center + ahead);

    for (const [i, bmp] of bitmaps) {
      if (i < lo - 2 || i > hi + 2) {
        bmp.close();
        bitmaps.delete(i);
      }
    }

    const run = generation;
    for (let d = 0; d <= Math.max(ahead, behind) && decoding.size < MAX_DECODING; d++) {
      for (const i of d ? [center + d * direction, center - d * direction] : [center]) {
        if (i < lo || i > hi || bitmaps.has(i) || decoding.has(i) || !blobs[i]) continue;
        if (decoding.size >= MAX_DECODING) break;
        decoding.add(i);
        createImageBitmap(blobs[i])
          .then((bmp) => {
            if (run !== generation || !active) return bmp.close();
            bitmaps.set(i, bmp);
            if (Math.abs(i - progress * (total - 1)) <= 1.5 || bitmaps.size === 1) paint(true);
            return undefined;
          })
          .catch(() => {})
          .finally(() => {
            decoding.delete(i);
            if (run === generation) fill();
          });
      }
    }
  };

  const dropBitmaps = () => {
    bitmaps.forEach((bmp) => bmp.close());
    bitmaps.clear();
    painted = '';
  };

  const stopWorker = () => {
    worker?.terminate();
    worker = null;
  };

  /** Starts decoding the file (once). Cheap to call repeatedly. */
  const load = () => {
    if (started) return;
    started = true;
    const run = ++generation;
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    loadedAspect = cssW / cssH;
    loadedWidth = cssW;

    // Stills sized to what is on screen, within a pixel budget.
    const small = isSmallDevice();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const maxPixels = small ? 900_000 : 1_400_000;
    let w = Math.min(1920, cssW * dpr);
    let h = w / loadedAspect;
    const scale = Math.min(1, Math.sqrt(maxPixels / (w * h)));
    w = Math.max(2, Math.round(w * scale));
    h = Math.max(2, Math.round(h * scale));
    canvas.width = w;
    canvas.height = h;

    try {
      worker = new Worker(new URL('./frameWorker.js', import.meta.url), { type: 'module' });
    } catch (error) {
      onUnsupported?.(error);
      return;
    }
    worker.onmessage = ({ data }) => {
      if (run !== generation) return;
      if (data.type === 'meta') {
        total = data.total;
        blobs = new Array(total);
      } else if (data.type === 'frame') {
        blobs[data.index] = data.blob;
        if (Math.abs(data.index - center) <= AHEAD) fill();
      } else if (data.type === 'done') {
        stopWorker();
      } else if (data.type === 'error') {
        stopWorker();
        started = false;
        onUnsupported?.(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      stopWorker();
      started = false;
      onUnsupported?.(event);
    };
    worker.postMessage({ src: new URL(src, window.location.href).href, width: w, height: h, quality: 0.88 });
  };

  return {
    load,
    /** Near the viewport: keep a decoded window and paint. */
    activate() {
      active = true;
      load();
      fill();
      paint(true);
    },
    /** Far away: free the decoded bitmaps (the compressed stills stay). */
    deactivate() {
      active = false;
      dropBitmaps();
    },
    setProgress(p) {
      if (p !== progress) direction = p > progress ? 1 : -1;
      progress = p;
      const next = total ? Math.round(p * (total - 1)) : 0;
      if (next !== center) {
        center = next;
        fill();
      }
      paint();
    },
    /** Re-decode when the canvas changes shape enough to make the crop wrong. */
    resize() {
      if (!started) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const drift = Math.abs(w / h - loadedAspect) / loadedAspect;
      if (drift > 0.15 || w > loadedWidth * 1.35) {
        generation++;
        stopWorker();
        dropBitmaps();
        blobs = [];
        total = 0;
        started = false;
        load();
        if (active) fill();
      }
    },
    /** Debug/verification hook: which frame index is currently on screen. */
    get frame() {
      return total ? progress * (total - 1) : 0;
    },
    get stats() {
      return { total, stored: blobs.filter(Boolean).length, decoded: bitmaps.size, painted };
    },
    destroy() {
      generation++;
      stopWorker();
      dropBitmaps();
      blobs = [];
      total = 0;
      active = false;
    },
  };
}
