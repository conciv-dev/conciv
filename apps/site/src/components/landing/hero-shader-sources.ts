export type HeroShaderVariant = 'julia' | 'mandelbrot'

export const HERO_SHADER_VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

const PRELUDE = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_color;
uniform float u_alpha;
#define TAU 6.28318530718
mat2 rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}
float isoline(float value) {
  float f = fract(value);
  float distance = min(f, 1.0 - f);
  float width = fwidth(value);
  return 1.0 - smoothstep(0.0, width * 1.5, distance - width * 0.25);
}
`

const JULIA = `
${PRELUDE}
const int ITERATIONS = 128;
vec2 cardioidPoint(float theta) {
  vec2 mu = vec2(cos(theta), sin(theta));
  vec2 mu2 = vec2(cos(2.0 * theta), sin(2.0 * theta));
  return mu * 0.5 - mu2 * 0.25;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / u_resolution.y;
  vec2 c = cardioidPoint(2.85);
  c += 0.012 * normalize(c - vec2(-0.25, 0.0));
  float zoom = 1.0 + 0.04 * sin(u_time * TAU / 40.0);
  vec2 pivot = vec2(0.22, 0.08);
  vec2 z = (rotate(u_time * TAU / 360.0) * (uv - pivot) * zoom + pivot) * 1.25;
  float smoothIteration = -1.0;
  for (int i = 0; i < ITERATIONS; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    float magnitude = dot(z, z);
    if (magnitude > 256.0) {
      smoothIteration = float(i) + 1.0 - log2(log2(magnitude)) + 4.0;
      break;
    }
  }
  if (smoothIteration < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float level = log2(smoothIteration + 1.0) * 2.5 - u_time / 45.0;
  float weight = smoothstep(9.0, 22.0, smoothIteration);
  vec2 headline = (uv - vec2(0.0, 0.06)) / vec2(0.5, 0.3);
  float quiet = mix(0.3, 1.0, smoothstep(0.7, 1.4, length(headline)));
  float coverage = isoline(level) * weight * quiet;
  float alpha = coverage * u_alpha;
  gl_FragColor = vec4(u_color * alpha, alpha);
}
`

const MANDELBROT = `
${PRELUDE}
const int ITERATIONS = 64;
void main() {
  vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / u_resolution.y;
  float zoom = 1.0 + 0.015 * sin(u_time * TAU / 160.0);
  float scale = 2.5 / zoom;
  vec2 c = vec2(1.05, 0.0) + uv * scale;
  vec2 z = vec2(0.0);
  vec2 dz = vec2(0.0);
  float smoothIteration = -1.0;
  float distanceEstimate = 0.0;
  for (int i = 0; i < ITERATIONS; i++) {
    dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2(1.0, 0.0);
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    float magnitude = dot(z, z);
    if (magnitude > 1024.0) {
      float length_z = sqrt(magnitude);
      distanceEstimate = length_z * log(length_z) / length(dz);
      smoothIteration = float(i) + 1.0 - log2(log2(magnitude)) + 5.0;
      break;
    }
  }
  if (smoothIteration < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float pixel = scale / u_resolution.y;
  float outline = 1.0 - smoothstep(pixel * 0.3, pixel * 1.3, distanceEstimate);
  float level = log2(smoothIteration + 1.0) * 1.5 - u_time / 96.0;
  float outer = isoline(level) * step(level, 6.0 - u_time / 96.0) * 0.6;
  float coverage = clamp(outline + outer, 0.0, 1.0);
  float alpha = coverage * u_alpha;
  gl_FragColor = vec4(u_color * alpha, alpha);
}
`

export const HERO_SHADER_FRAGMENTS: Record<HeroShaderVariant, string> = {
  julia: JULIA,
  mandelbrot: MANDELBROT,
}
