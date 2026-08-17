export const FERROFLUID_VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

export const FERROFLUID_FRAGMENT = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_attractor;
uniform vec3 u_accent;
uniform vec3 u_ink;
uniform float u_alpha;

varying vec2 v_uv;

#define PI 3.14159265

const float REFERENCE_SPAN = 700.0;
const float SCALE = 1.6;
const float SPEED = 0.3;
const float TURBULENCE = 0.8;
const float FLUIDITY = 0.1;
const float RIM_WIDTH = 0.2;
const float SHARPNESS = 2.5;
const float SHIMMER = 0.8;
const float GLOW = 1.2;
const float OPACITY = 0.9;
const float ATTRACTOR_STRENGTH = 0.55;
const float ATTRACTOR_RADIUS = 0.35;
const vec2 FLOW = vec2(0.0, -1.0);

vec3 palette(float hue) {
  return hue < 0.5 ? u_accent : u_ink;
}

float hash(vec3 seed) {
  vec3 wrapped = fract(seed * 0.1031);
  wrapped += dot(wrapped, wrapped.zyx + 33.33);
  return fract((wrapped.x + wrapped.y) * wrapped.z);
}

float smin(float a, float b, float k) {
  float r = exp2(-a / k) + exp2(-b / k);
  return -k * log2(r);
}

float sinlerp(float a, float b, float w) {
  return mix(a, b, (sin(w * PI - PI / 2.0) + 1.0) / 2.0);
}

float valueNoise(vec2 p, float s, float seed) {
  vec2 cell = floor(p / s);
  vec2 offset = mod(p, s);
  float g1 = hash(vec3(cell, seed));
  float g2 = hash(vec3(cell.x + 1.0, cell.y, seed));
  float g3 = hash(vec3(cell.x + 1.0, cell.y + 1.0, seed));
  float g4 = hash(vec3(cell.x, cell.y + 1.0, seed));
  float bottom = sinlerp(g1, g2, offset.x / s);
  float top = sinlerp(g4, g3, offset.x / s);
  return sinlerp(bottom, top, offset.y / s);
}

float blendedNoise(vec2 p, float s, float seed) {
  float o = s / 2.0;
  float n0 = valueNoise(p, s, seed);
  float n1 = valueNoise(p + vec2(o, o), s, seed + 0.1);
  float n2 = valueNoise(p + vec2(-o, o), s, seed + 0.2);
  float n3 = valueNoise(p + vec2(o, -o), s, seed + 0.3);
  float n4 = valueNoise(p + vec2(-o, -o), s, seed + 0.4);
  return (2.0 * n0 + 1.5 * n1 + 1.25 * n2 + 1.125 * n3 + n4) / 7.0;
}

void main() {
  float reference = REFERENCE_SPAN / SCALE;
  vec2 p = v_uv * u_resolution / u_resolution.y * reference;

  float pace = 200.0 * SPEED;
  float drift = u_time * pace;
  vec2 perpendicular = vec2(-FLOW.y, FLOW.x);

  float distortNear = valueNoise(p + perpendicular * drift, 60.0, 10.0) * 50.0 * TURBULENCE;
  float distortFar = valueNoise(p - perpendicular * drift, 120.0, 15.0) * 100.0 * TURBULENCE;

  float peaks = blendedNoise(p + distortNear + FLOW * (drift * 0.5), 40.0, 1.0);
  float troughs = blendedNoise(p + distortFar - FLOW * (drift * 0.5), 40.0, 0.0);
  float ridge = smin(peaks, troughs, FLUIDITY);

  vec2 attractor = u_attractor / u_resolution.y * reference;
  float reach = length(p - attractor) / reference;
  float pull = exp(-reach * reach / (ATTRACTOR_RADIUS * ATTRACTOR_RADIUS)) * ATTRACTOR_STRENGTH;

  float band = (RIM_WIDTH - abs((ridge - 0.4) * 2.0)) * 5.0;
  float sheen = clamp(band - valueNoise(p + FLOW * (drift * 0.5), 60.0, 12.0) * SHIMMER, 0.0, 1.0);
  sheen = pow(sheen, SHARPNESS) * GLOW;
  sheen *= clamp(1.0 - pull, 0.0, 1.0);

  vec3 tint = palette(clamp(0.5 + (peaks - troughs) * 0.8, 0.0, 1.0));
  vec3 lit = tint * sheen;
  float alpha = clamp(max(lit.r, max(lit.g, lit.b)), 0.0, 1.0);
  gl_FragColor = vec4(lit, alpha * OPACITY * u_alpha);
}
`
