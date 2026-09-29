import { createTrack, damp, seededRandom } from '../lib/math';
import { DIFFUSERS, FLOW, PARTICLES, PHOTO } from './config';
import { fullscreenVertex, particleFragment, particleVertex, smokeFragment } from './shaders';

const tracks = {
  reach: createTrack(FLOW.reach),
  intensity: createTrack(FLOW.intensity),
  particleAlpha: createTrack(PARTICLES.alpha),
};

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function program(gl, vertexSource, fragmentSource) {
  const p = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const uniforms = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(p, name);
  }
  return { program: p, uniforms };
}

export function pickQuality() {
  const w = window.innerWidth;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (w < 768 || (coarse && w < 1024)) return { name: 'low', scale: 0.62, maxDpr: 2 };
  if (w < 1280 || coarse) return { name: 'medium', scale: 0.72, maxDpr: 1.5 };
  return { name: 'high', scale: 0.8, maxDpr: 1.5 };
}

/**
 * Scroll-driven HVAC airflow rendered over the cleanroom photo.
 * The canvas is transparent: it only draws the air, the photo stays an <img>.
 * Throws if WebGL2 is unavailable so the caller can fall back to the plain photo.
 */
export function createAirflow(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 unavailable');

  const quality = pickQuality();
  const smoke = program(gl, fullscreenVertex, smokeFragment);
  const motes = program(gl, particleVertex, particleFragment);

  // Particle seeds: source, lateral position, depth, phase.
  const count = PARTICLES.count[quality.name];
  const random = seededRandom(11);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const seedLoc = gl.getAttribLocation(motes.program, 'aSeed');
  gl.enableVertexAttribArray(seedLoc);
  gl.vertexAttribPointer(seedLoc, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const emptyVao = gl.createVertexArray();

  const sources = new Float32Array(DIFFUSERS.flatMap((d) => [d.x, d.y, d.strength]));
  const photoAspect = PHOTO.width / PHOTO.height;
  const state = { width: 0, height: 0, scale: 1, cover: [1, 1], pointer: { x: 0, y: 0 }, time: 0 };

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  function resize(cssWidth, cssHeight) {
    if (!cssWidth || !cssHeight) return;
    state.scale = Math.min(window.devicePixelRatio || 1, quality.maxDpr) * quality.scale;
    state.width = Math.max(1, Math.round(cssWidth * state.scale));
    state.height = Math.max(1, Math.round(cssHeight * state.scale));
    canvas.width = state.width;
    canvas.height = state.height;
    const viewAspect = cssWidth / cssHeight;
    state.cover = [Math.min(1, viewAspect / photoAspect), Math.min(1, photoAspect / viewAspect)];
  }

  function setCommon(u, progress, flow) {
    gl.uniform2f(u.uCover, state.cover[0], state.cover[1]);
    gl.uniform1f(u.uAspect, photoAspect);
    gl.uniform3fv(u.uSources, sources);
    gl.uniform1f(u.uReach, tracks.reach(progress));
    gl.uniform1f(u.uFlow, flow);
    gl.uniform1f(u.uOutlet, FLOW.outletWidth);
    gl.uniform1f(u.uSpread, FLOW.spread);
  }

  /** Draws one frame. `progress` is the hero scroll progress (0–1). */
  function render(progress, { dt = 0, pointer, animate = true } = {}) {
    if (!state.width) return;
    if (animate) state.time += dt;
    const k = damp(3, dt);
    state.pointer.x += ((pointer?.x ?? 0) - state.pointer.x) * k;
    state.pointer.y += ((pointer?.y ?? 0) - state.pointer.y) * k;
    const flow = progress * FLOW.travel + state.time * FLOW.idleDrift;

    gl.viewport(0, 0, state.width, state.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(smoke.program);
    setCommon(smoke.uniforms, progress, flow);
    gl.uniform2f(smoke.uniforms.uResolution, state.width, state.height);
    gl.uniform1f(smoke.uniforms.uTime, state.time);
    gl.uniform1f(smoke.uniforms.uIntensity, tracks.intensity(progress));
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(motes.program);
    setCommon(motes.uniforms, progress, flow);
    gl.uniform1f(motes.uniforms.uPointSize, state.scale);
    gl.uniform1f(motes.uniforms.uAlpha, tracks.particleAlpha(progress));
    gl.uniform2f(motes.uniforms.uPointer, state.pointer.x, -state.pointer.y);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }

  return {
    quality,
    resize,
    render,
    isContextLost: () => gl.isContextLost(),
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(emptyVao);
      gl.deleteProgram(smoke.program);
      gl.deleteProgram(motes.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
