export const PAPER_GRAIN_VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

export const PAPER_GRAIN_FRAGMENT = `
precision highp float;
uniform vec3 u_color;
uniform float u_alpha;

const float GRAIN_SCALE = 0.91;
const float COLOR_COUNT = 3.0;
const float INTENSITY = 0.15;
const float SPECKLE = 0.5;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

float hash21(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 fbm(vec2 n0, vec2 n1, vec2 n2, vec2 n3) {
  float amplitude = 0.2;
  vec3 total = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    n0 = rotate(n0, 0.3);
    n1 = rotate(n1, 0.3);
    n2 = rotate(n2, 0.3);
    n3 = rotate(n3, 0.3);
    total.x += valueNoise(n0) * amplitude;
    total.y += valueNoise(n1) * amplitude;
    total.z += valueNoise(n2) * amplitude;
    total.z += valueNoise(n3) * amplitude;
    n0 *= 1.99;
    n1 *= 1.99;
    n2 *= 1.99;
    n3 *= 1.99;
    amplitude *= 0.6;
  }
  return total;
}

void main() {
  vec2 grainUv = gl_FragCoord.xy * GRAIN_SCALE;

  float baseNoise = snoise(grainUv * 0.5);
  vec3 fbmValues = fbm(0.002 * grainUv + 10.0, 0.003 * grainUv, 0.001 * grainUv, rotate(0.4 * grainUv, 2.0));

  float grainDistance = baseNoise * snoise(grainUv * 0.2) - fbmValues.x - fbmValues.y;
  float speckle = clamp(0.75 * baseNoise - fbmValues.z, 0.0, 1.0);

  float grain = INTENSITY * 2.0 / COLOR_COUNT * grainDistance + SPECKLE * 10.0 / COLOR_COUNT * speckle;
  float coverage = clamp(grain, 0.0, 1.0) * u_alpha;

  gl_FragColor = vec4(u_color * coverage, coverage);
}
`
