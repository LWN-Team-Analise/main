import { useEffect, useState } from 'react';

export const LIQUID_GLASS_FILTER_ID = 'lwn-liquid-glass';

// Only Chromium renders SVG filters inside `backdrop-filter`; elsewhere the
// header keeps the plain frosted blur.
export const supportsLiquidGlass = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand))) &&
  CSS.supports('backdrop-filter', `url(#${LIQUID_GLASS_FILTER_ID})`);

/**
 * Builds a displacement map for a rounded rectangle: pixels near the rim are
 * pushed toward the centre, which bends the background like the thick edge
 * of a glass slab. The centre stays undistorted.
 */
function displacementMap(width, height, radius, bezel) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const hw = width / 2;
  const hh = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = x + 0.5 - hw;
      const cy = y + 0.5 - hh;
      // Rounded-rectangle signed distance and its gradient.
      const qx = Math.abs(cx) - (hw - radius);
      const qy = Math.abs(cy) - (hh - radius);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const depth = radius - outside - Math.min(Math.max(qx, qy), 0); // distance in from the rim
      let dx = 0;
      let dy = 0;
      if (depth < bezel) {
        const k = Math.pow(1 - Math.max(depth, 0) / bezel, 2);
        let gx = 0;
        let gy = 1;
        if (outside > 0) {
          gx = ox / outside;
          gy = oy / outside;
        } else if (qx > qy) {
          gx = 1;
          gy = 0;
        }
        // Sample toward the centre: the rim magnifies what is behind it.
        dx = -gx * Math.sign(cx) * k;
        dy = -gy * Math.sign(cy) * k;
      }
      const i = (y * width + x) * 4;
      img.data[i] = 128 + dx * 127;
      img.data[i + 1] = 128 + dy * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** SVG filter referenced by the header's backdrop-filter; tracks the glass size. */
export default function LiquidGlassFilter({ target, radius = 18, bezel = 16, strength = 26 }) {
  const [size, setSize] = useState(null);

  useEffect(() => {
    const el = target.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h, map: displacementMap(w, h, radius, bezel) }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, radius, bezel]);

  if (!size) return null;
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <filter
        id={LIQUID_GLASS_FILTER_ID}
        x="0"
        y="0"
        width={size.w}
        height={size.h}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={size.map} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={strength} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
