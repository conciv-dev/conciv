import {useCallback} from 'react'
import {HERO_SHADER_FRAGMENTS, HERO_SHADER_VERTEX, type HeroShaderVariant} from './hero-shader-sources'

const MAX_PIXEL_RATIO = 1
const FRAME_INTERVAL_MS = 1000 / 24

type Rgb = [number, number, number]

function readCurrentColor(element: HTMLElement): Rgb {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d')
  if (!context) return [0, 0, 0]
  context.fillStyle = getComputedStyle(element).color
  context.fillRect(0, 0, 1, 1)
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data
  return [red / 255, green / 255, blue / 255]
}

function readLineAlpha(element: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue('--od-hero-line-alpha'))
  return Number.isFinite(value) ? value : 0.15
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

function linkProgram(
  gl: WebGLRenderingContext,
  vertex: WebGLShader | null,
  fragment: WebGLShader | null,
): WebGLProgram | null {
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  return linkShaders(gl, program, [vertex, fragment])
}

function createProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, HERO_SHADER_VERTEX)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  return linkProgram(gl, vertex, fragment)
}

type ShaderContext = {gl: WebGLRenderingContext; program: WebGLProgram}

function createShaderContext(canvas: HTMLCanvasElement, variant: HeroShaderVariant): ShaderContext | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  })
  if (!gl) return null
  gl.getExtension('OES_standard_derivatives')
  const program = createProgram(gl, HERO_SHADER_FRAGMENTS[variant])
  return program ? {gl, program} : null
}

function startHeroShader(canvas: HTMLCanvasElement, variant: HeroShaderVariant): () => void {
  const context = createShaderContext(canvas, variant)
  if (!context) return () => {}
  const {gl, program} = context

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.useProgram(program)
  const positionLocation = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const colorLocation = gl.getUniformLocation(program, 'u_color')
  const alphaLocation = gl.getUniformLocation(program, 'u_alpha')
  gl.clearColor(0, 0, 0, 0)

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const startedAt = performance.now()
  let lastFrameAt = 0
  let frameHandle = 0
  let animatedFrames = 0
  let inView = true
  let color = readCurrentColor(canvas)
  let alpha = readLineAlpha(canvas)

  const draw = (now: number) => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform1f(timeLocation, reducedMotion.matches ? 0 : (now - startedAt) / 1000)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.uniform3f(colorLocation, color[0], color[1], color[2])
    gl.uniform1f(alphaLocation, alpha)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    canvas.dataset.ready = ''
  }

  const shouldAnimate = () => inView && document.visibilityState === 'visible' && !reducedMotion.matches

  const frame = (now: number) => {
    frameHandle = 0
    if (!shouldAnimate()) return
    if (now - lastFrameAt >= FRAME_INTERVAL_MS) {
      lastFrameAt = now
      draw(now)
      animatedFrames += 1
      canvas.dataset.frames = String(animatedFrames)
    }
    frameHandle = requestAnimationFrame(frame)
  }

  const schedule = () => {
    if (frameHandle === 0 && shouldAnimate()) frameHandle = requestAnimationFrame(frame)
  }

  const resize = () => {
    const parent = canvas.parentElement
    if (!parent) return
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    canvas.width = Math.round(parent.clientWidth * ratio)
    canvas.height = Math.round(parent.clientHeight * ratio)
    draw(performance.now())
    schedule()
  }

  const recolor = () => {
    color = readCurrentColor(canvas)
    alpha = readLineAlpha(canvas)
    draw(performance.now())
    schedule()
  }

  const resizeObserver = new ResizeObserver(resize)
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement)
  const intersectionObserver = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting)
    schedule()
  })
  intersectionObserver.observe(canvas)
  const themeObserver = new MutationObserver(recolor)
  themeObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'style']})
  document.addEventListener('visibilitychange', schedule)
  reducedMotion.addEventListener('change', recolor)

  canvas.dataset.frames = String(animatedFrames)
  resize()

  return () => {
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    themeObserver.disconnect()
    document.removeEventListener('visibilitychange', schedule)
    reducedMotion.removeEventListener('change', recolor)
  }
}

export function HeroShader({variant}: {variant: HeroShaderVariant}) {
  const attach = useCallback((canvas: HTMLCanvasElement) => startHeroShader(canvas, variant), [variant])
  return <canvas ref={attach} className="size-full opacity-0 transition-opacity duration-600 data-ready:opacity-100" />
}
