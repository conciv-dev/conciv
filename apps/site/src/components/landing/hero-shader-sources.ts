export type HeroShaderVariant = 'morph' | 'morph-dive' | 'dive'

export const HERO_SHADER_VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

const CORE = `
#extension GL_OES_standard_derivatives : enable
precision mediump float;
uniform highp float u_time;
uniform highp vec2 u_resolution;
uniform vec3 u_color;
uniform float u_alpha;
#define TAU 6.28318530718
const int MAX_ITERATIONS = 96;
const float BASE_ITERATIONS = 64.0;
const float ESCAPE_RADIUS = 256.0;
const float BAND_SCALE = 2.5;
const float VIEW_SCALE = 1.25;
const vec2 VIEW_CENTER = vec2(0.01, 0.0);
const vec2 ZOOM_FOCUS = vec2(-0.5, 0.02);
const float BOUNDARY_OFFSET = 0.012;
const float MORPH_PERIOD = 300.0;
const float MORPH_PHASE = 0.28;
const float MORPH_CENTER = 3.15;
const float MORPH_ARC = 5.2;
const float MORPH_BASE = 2.85;
const float ZOOM_PERIOD = 240.0;

highp vec2 juliaConstant(highp float theta) {
  highp vec2 first = vec2(cos(theta), sin(theta));
  highp vec2 second = vec2(cos(2.0 * theta), sin(2.0 * theta));
  highp vec2 seed = first * 0.5 - second * 0.25;
  return seed + BOUNDARY_OFFSET * normalize(seed - vec2(-0.25, 0.0));
}

highp float morphAngle(highp float seconds) {
  highp float phase = fract(seconds / MORPH_PERIOD + MORPH_PHASE);
  highp float sweep = abs(2.0 * phase - 1.0);
  highp float eased = mix(sweep, sweep * sweep * (3.0 - 2.0 * sweep), 0.7);
  return MORPH_CENTER + MORPH_ARC * (eased - 0.5);
}

float quietWeight(highp vec2 uv) {
  vec2 headline = vec2(uv - vec2(0.0, 0.06)) / vec2(0.62, 0.36);
  return smoothstep(0.55, 1.45, length(headline));
}

vec4 juliaLayer(highp vec2 uv, highp float theta, highp float zoom, highp float levelShift) {
  highp float spin = MORPH_BASE - theta;
  float quiet = quietWeight(uv);
  if (quiet < 0.004) return vec4(0.0);
  highp float iterationCap = clamp(BASE_ITERATIONS + 12.0 * log2(zoom), 32.0, float(MAX_ITERATIONS));
  highp vec2 c = juliaConstant(theta);
  highp vec2 aim = vec2(uv.x * cos(spin) - uv.y * sin(spin), uv.x * sin(spin) + uv.y * cos(spin));
  highp vec2 z = VIEW_CENTER + (ZOOM_FOCUS + (aim - ZOOM_FOCUS) / zoom) * VIEW_SCALE;
  highp float iteration = iterationCap;
  float escaped = 0.0;
  for (int i = 0; i < MAX_ITERATIONS; i++) {
    if (float(i) >= iterationCap) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    highp float magnitude = dot(z, z);
    if (magnitude > ESCAPE_RADIUS) {
      iteration = float(i) + 1.0 - log2(log2(magnitude)) + 4.0;
      escaped = 1.0;
      break;
    }
  }
  highp float level = log2(iteration + 1.0) * BAND_SCALE + levelShift;
  highp float density = fwidth(level);
  highp float ridge = fract(level);
  highp float distanceInPixels = min(ridge, 1.0 - ridge) / max(density, 1e-6);
  float coverage = 1.0 - smoothstep(0.45, 1.15, distanceInPixels);
  float resolved = 1.0 - smoothstep(0.22, 0.48, density);
  float depthFade = smoothstep(5.0, 12.0, iteration);
  float weight = coverage * resolved * depthFade * quiet * escaped;
  float alpha = min(weight * u_alpha, 1.0);
  return vec4(u_color * alpha, alpha);
}
`

const MORPH = `
${CORE}
void main() {
  highp vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / u_resolution.y;
  gl_FragColor = juliaLayer(uv, morphAngle(u_time), 1.0, 0.0);
}
`

const MORPH_DIVE = `
${CORE}
void main() {
  highp vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / u_resolution.y;
  highp float travel = 0.5 - 0.5 * cos(TAU * u_time / ZOOM_PERIOD);
  gl_FragColor = juliaLayer(uv, morphAngle(u_time), exp(0.6931471806 * travel), 0.0);
}
`

const DIVE = `
${CORE}
void main() {
  highp vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / u_resolution.y;
  highp float travel = 0.5 - 0.5 * cos(TAU * u_time / ZOOM_PERIOD);
  gl_FragColor = juliaLayer(uv, MORPH_BASE, exp(0.6931471806 * travel), -u_time / 45.0);
}
`

export const HERO_SHADER_FRAGMENTS: Record<HeroShaderVariant, string> = {
  morph: MORPH,
  'morph-dive': MORPH_DIVE,
  dive: DIVE,
}
