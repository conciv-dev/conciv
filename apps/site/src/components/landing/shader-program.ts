const TRANSPARENT_TRIPLE = new Float32Array([0, 0, 0])

export function readColorTriple(color: string): Float32Array {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d')
  if (!context) return TRANSPARENT_TRIPLE
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  return Float32Array.from(context.getImageData(0, 0, 1, 1).data.subarray(0, 3), (channel) => channel / 255)
}

export function readAlphaToken(element: HTMLElement, token: string): number {
  const alpha = Number(window.getComputedStyle(element).getPropertyValue(token))
  return Number.isFinite(alpha) ? alpha : 0
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

function linkShaders(gl: WebGLRenderingContext, program: WebGLProgram, shaders: WebGLShader[]): WebGLProgram | null {
  for (const shader of shaders) gl.attachShader(program, shader)
  gl.linkProgram(program)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  gl.deleteProgram(program)
  return null
}

export function createShaderProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  return linkShaders(gl, program, [vertex, fragment])
}

export function createFullScreenTriangle(gl: WebGLRenderingContext, program: WebGLProgram): WebGLBuffer | null {
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const positionLocation = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  return quad
}
