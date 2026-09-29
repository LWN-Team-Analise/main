import { useInView, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { BRAZIL_DOTS, BRAZIL_MARKERS, BRAZIL_OUTLINE, BRAZIL_VIEWBOX } from '../../data/brazilMap';
import './BrazilMap.css';

// São Paulo and Barueri are ~25 km apart — a few pixels at country scale — so a
// magnified inset shows the metropolitan pair; the main map shows the route north.
const INSET = { cx: 835, cy: 820, r: 88, zoom: 16 };
const cluster = {
  x: (BRAZIL_MARKERS.saoPaulo[0] + BRAZIL_MARKERS.barueri[0]) / 2,
  y: (BRAZIL_MARKERS.saoPaulo[1] + BRAZIL_MARKERS.barueri[1]) / 2,
};
const toInset = ([x, y]) => [INSET.cx + (x - cluster.x) * INSET.zoom, INSET.cy + (y - cluster.y) * INSET.zoom];
const spInset = toInset(BRAZIL_MARKERS.saoPaulo);
const barueriInset = toInset(BRAZIL_MARKERS.barueri);
const anapolis = BRAZIL_MARKERS.anapolis;

// Leader line from the real location to the rim of the inset.
const lead = (() => {
  const dx = cluster.x - INSET.cx;
  const dy = cluster.y - INSET.cy;
  const len = Math.hypot(dx, dy);
  return { x: INSET.cx + (dx / len) * INSET.r, y: INSET.cy + (dy / len) * INSET.r };
})();

const ROUTE_METRO = `M${spInset[0]} ${spInset[1]} Q ${INSET.cx} ${INSET.cy - 34} ${barueriInset[0]} ${barueriInset[1]}`;
const ROUTE_NORTH = `M${cluster.x} ${cluster.y} Q ${cluster.x + 58} ${(cluster.y + anapolis[1]) / 2 + 8} ${anapolis[0]} ${anapolis[1]}`;

function Marker({ x, y, label, active, align = 'right', delay = 0 }) {
  return (
    <g className={`map-marker${active ? ' is-active' : ''}`} style={{ '--delay': `${delay}s` }}>
      <circle className="map-marker__pulse" cx={x} cy={y} r="7" />
      <circle className="map-marker__halo" cx={x} cy={y} r="11" />
      <circle className="map-marker__dot" cx={x} cy={y} r="5.5" />
      <text
        className="map-marker__label"
        x={align === 'right' ? x + 16 : align === 'left' ? x - 16 : x}
        y={align === 'below' ? y + 28 : y + 5}
        textAnchor={align === 'right' ? 'start' : align === 'left' ? 'end' : 'middle'}
      >
        {label}
      </text>
    </g>
  );
}

export default function BrazilMap({ activeId }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });
  const reduce = useReducedMotion();

  return (
    <svg
      ref={ref}
      className={`brazil-map${inView ? ' is-drawn' : ''}`}
      viewBox={BRAZIL_VIEWBOX}
      role="img"
      aria-label="Mapa do Brasil com as unidades do Grupo LWN em São Paulo, Barueri e Anápolis"
    >
      <defs>
        <radialGradient id="map-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3e7dc6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3e7dc6" stopOpacity="0" />
        </radialGradient>
        <clipPath id="inset-clip">
          <circle cx={INSET.cx} cy={INSET.cy} r={INSET.r} />
        </clipPath>
        <pattern id="inset-grid" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="1.6" className="brazil-map__inset-dot" />
        </pattern>
      </defs>

      <path className="brazil-map__dots" d={BRAZIL_DOTS} />
      <path className="brazil-map__outline" d={BRAZIL_OUTLINE} />

      <circle cx={cluster.x} cy={cluster.y} r="120" fill="url(#map-glow)" />
      <circle cx={anapolis[0]} cy={anapolis[1]} r="110" fill="url(#map-glow)" />

      {/* Route north: São Paulo / Barueri → Anápolis */}
      <path id="route-north" className="brazil-map__route" d={ROUTE_NORTH} pathLength="1" />

      {/* Metropolitan inset */}
      <line className="brazil-map__leader" x1={cluster.x} y1={cluster.y} x2={lead.x} y2={lead.y} />
      <circle className="brazil-map__cluster" cx={cluster.x} cy={cluster.y} r="6" />
      <g className="brazil-map__inset">
        <circle className="brazil-map__inset-bg" cx={INSET.cx} cy={INSET.cy} r={INSET.r} />
        <rect
          x={INSET.cx - INSET.r}
          y={INSET.cy - INSET.r}
          width={INSET.r * 2}
          height={INSET.r * 2}
          fill="url(#inset-grid)"
          clipPath="url(#inset-clip)"
        />
        <circle className="brazil-map__inset-ring" cx={INSET.cx} cy={INSET.cy} r={INSET.r} />
        <text className="brazil-map__inset-title" x={INSET.cx} y={INSET.cy + INSET.r - 16} textAnchor="middle">
          Grande São Paulo
        </text>
        <path id="route-metro" className="brazil-map__route" d={ROUTE_METRO} pathLength="1" />
      </g>

      <Marker x={spInset[0]} y={spInset[1]} label="São Paulo" active={activeId === 'saoPaulo'} align="below" />
      <Marker x={barueriInset[0]} y={barueriInset[1]} label="Barueri" active={activeId === 'barueri'} align="below" delay={0.4} />
      <Marker x={anapolis[0]} y={anapolis[1]} label="Anápolis" active={activeId === 'anapolis'} delay={0.8} />

      {/* Travelling light: São Paulo → Barueri, then on to Anápolis. */}
      {inView && !reduce && (
        <g className="brazil-map__travellers">
          <circle r="4.5" className="brazil-map__light" opacity="0">
            <animateMotion id="leg-metro" dur="1.6s" begin="1.2s; leg-north.end + 1.4s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.35 1">
              <mpath href="#route-metro" />
            </animateMotion>
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="1.6s" begin="leg-metro.begin" />
          </circle>
          <circle r="4.5" className="brazil-map__light" opacity="0">
            <animateMotion id="leg-north" dur="2.6s" begin="leg-metro.end" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.35 1">
              <mpath href="#route-north" />
            </animateMotion>
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="2.6s" begin="leg-north.begin" />
          </circle>
        </g>
      )}
    </svg>
  );
}
