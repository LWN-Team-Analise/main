// GLSL for the hero airflow. Everything is computed in the photo's own
// coordinate space (x right, y down, 0–1) so the air always leaves the real
// diffusers, whatever the viewport crop is.

const COMMON = /* glsl */ `
  uniform vec2 uCover;       // visible fraction of the photo (object-fit: cover)
  uniform float uAspect;     // photo width / height
  uniform vec3 uSources[3];  // diffuser outlet x, y, strength
  uniform float uReach;      // how far the air front has travelled
  uniform float uFlow;       // scroll-driven advection of the air
  uniform float uOutlet;     // plume width at the outlet
  uniform float uSpread;     // plume widening per unit of fall
`;

export const fullscreenVertex = /* glsl */ `#version 300 es
  void main() {
    // One oversized triangle covers the screen; no vertex buffer needed.
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }
`;

export const smokeFragment = /* glsl */ `#version 300 es
  precision highp float;
  ${COMMON}
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uIntensity;
  out vec4 outColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    const mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.03 + 11.7;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 screen = gl_FragCoord.xy / uResolution;
    screen.y = 1.0 - screen.y;
    vec2 uv = 0.5 + (screen - 0.5) * uCover;

    // Cheap coverage test first: most of the frame is outside every plume.
    float coverage = 0.0;
    for (int i = 0; i < 3; i++) {
      float dy = uv.y - uSources[i].y;
      float w = uOutlet + max(dy, 0.0) * uSpread;
      float dx = abs(uv.x - uSources[i].x) * uAspect;
      coverage += step(-0.03, dy) * step(dx, w * 2.4) * step(dy, uReach + 0.12);
    }
    if (coverage < 0.5) {
      outColor = vec4(0.0);
      return;
    }

    // Turbulence field that bends the plumes as the air falls.
    vec2 wp = vec2(uv.x * uAspect * 2.4, uv.y * 2.2 - uFlow * 0.9);
    vec2 warp = vec2(
      fbm(wp + vec2(0.0, uTime * 0.05)),
      fbm(wp + vec2(5.2, 1.3 - uTime * 0.04))
    ) - 0.5;

    float density = 0.0;
    float glow = 0.0;
    for (int i = 0; i < 3; i++) {
      vec3 src = uSources[i];
      float dy = uv.y - src.y;
      if (dy < -0.03) continue;
      float fall = max(dy, 0.0);

      float bend = warp.x * (0.02 + fall * 0.35);
      float w = uOutlet + fall * uSpread;
      float lateral = ((uv.x - src.x) * uAspect + bend) / w;
      float profile = exp(-lateral * lateral * 1.6);

      // Noisy leading edge of the travelling air, with a soft billow at the front.
      float edge = uReach + warp.y * 0.09;
      float front = 1.0 - smoothstep(edge - 0.1, edge + 0.015, fall);
      float billow = exp(-pow((fall - edge + 0.03) / 0.05, 2.0)) * step(0.06, uReach);

      float birth = smoothstep(-0.02, 0.015, dy);
      float dilution = 1.0 / (1.0 + fall * 2.2);

      // Three depths of wisps, each advected at its own speed: parallax.
      float qx = lateral * 0.9 + float(i) * 3.7;
      float nearL = fbm(vec2(qx * 1.3 + warp.x, (fall - uFlow) * 5.0));
      float midL = fbm(vec2(qx * 2.4 - warp.y + 7.0, (fall - uFlow * 0.72) * 9.0));
      float farL = fbm(vec2(qx * 4.2 + 13.0, (fall - uFlow * 0.5) * 15.0));
      float wisps = smoothstep(0.32, 0.78, nearL) * 0.72
        + smoothstep(0.36, 0.84, midL) * 0.46
        + smoothstep(0.42, 0.9, farL) * 0.28;

      float body = profile * birth * dilution * src.z;
      density += body * front * (wisps * 1.7 + 0.14) + body * billow * nearL * 0.9;
      glow += exp(-lateral * lateral * 3.0) * birth * exp(-fall * 18.0) * src.z;
    }

    density *= uIntensity;
    float alpha = min(1.0 - exp(-density * 1.8), 0.86) + glow * 0.22 * uIntensity;
    vec3 cold = vec3(0.64, 0.86, 1.0);
    vec3 pale = vec3(0.93, 0.97, 1.0);
    vec3 color = mix(cold, pale, clamp((uv.y - 0.18) * 1.6, 0.0, 1.0));
    outColor = vec4(color * alpha, alpha);
  }
`;

export const particleVertex = /* glsl */ `#version 300 es
  precision highp float;
  ${COMMON}
  in vec4 aSeed;             // source, lateral, depth, phase
  uniform float uPointSize;
  uniform float uAlpha;
  uniform vec2 uPointer;
  out float vAlpha;

  void main() {
    int si = int(min(2.0, floor(aSeed.x * 3.0)));
    vec3 src = uSources[si];
    float depth = aSeed.z;
    // Near motes fall faster than far ones.
    float t = fract(aSeed.w + uFlow * mix(0.35, 1.0, depth) * 0.5);
    float fall = t * 0.95;
    float w = uOutlet + fall * uSpread;
    float lateral = (aSeed.y * 2.0 - 1.0) * w * 0.85;
    lateral += sin(fall * 11.0 + aSeed.w * 37.0) * (0.004 + fall * 0.03);

    vec2 uv = vec2(src.x + lateral / uAspect, src.y + fall);
    uv += uPointer * depth * 0.004;
    vec2 screen = 0.5 + (uv - 0.5) / uCover;
    gl_Position = vec4(screen.x * 2.0 - 1.0, 1.0 - screen.y * 2.0, 0.0, 1.0);
    gl_PointSize = uPointSize * mix(1.1, 4.2, depth * depth);

    float fade = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.7, 1.0, t));
    float front = 1.0 - smoothstep(uReach - 0.06, uReach + 0.01, fall);
    vAlpha = fade * front * mix(0.35, 1.0, depth) * uAlpha * src.z;
  }
`;

export const particleFragment = /* glsl */ `#version 300 es
  precision mediump float;
  in float vAlpha;
  out vec4 outColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.15, 0.5, d)) * vAlpha;
    outColor = vec4(vec3(0.88, 0.95, 1.0) * a, a);
  }
`;
