export const DITHERING_WARP_BLOCK_SIZE = 2.5

export const DITHERING_WARP_VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

export const DITHERING_WARP_FRAGMENT = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color;
uniform float u_alpha;

const float BLOCK_SIZE = ${DITHERING_WARP_BLOCK_SIZE};
const float WARP_SCALE = 0.003;
const float WARP_GAIN = 0.6;
const float RIDGE_GAIN = 0.15;
const float RIDGE_FLOOR = 0.001;
const float SHAPE_LOW = 0.02;
const float SHAPE_HIGH = 1.0;
const float TIME_GAIN = 0.5;

float bayer2(vec2 cell) {
  vec2 whole = floor(cell);
  return fract(whole.x * 0.5 + whole.y * whole.y * 0.75);
}

float bayer4(vec2 cell) {
  return bayer2(cell * 0.5) * 0.25 + bayer2(cell);
}

void main() {
  vec2 block = floor(gl_FragCoord.xy - 0.5 * u_resolution);
  vec2 warp = (block + 0.5) * BLOCK_SIZE * WARP_SCALE;
  float t = TIME_GAIN * u_time;

  for (float i = 1.0; i < 6.0; i++) {
    warp.x += WARP_GAIN / i * cos(i * 2.5 * warp.y + t);
    warp.y += WARP_GAIN / i * cos(i * 1.5 * warp.x + t);
  }

  float shape = RIDGE_GAIN / max(RIDGE_FLOOR, abs(sin(t - warp.y - warp.x)));
  shape = smoothstep(SHAPE_LOW, SHAPE_HIGH, shape);
  float ink = step(0.5, shape + bayer4(block) - 0.5);

  gl_FragColor = vec4(u_color * u_alpha * ink, u_alpha * ink);
}
`
