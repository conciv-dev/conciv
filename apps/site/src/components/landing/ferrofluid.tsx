import {FERROFLUID_FRAGMENT, FERROFLUID_VERTEX} from './ferrofluid-source'
import {FrameEffectCanvas, watchFrameCanvas} from './frame-canvas'
import {createFullScreenTriangle, createShaderProgram, readAlphaToken, readColorTriple} from './shader-program'

const MAX_PIXEL_RATIO = 2
const STATIC_TIME = 8
const ATTRACTOR_PERIOD_X = 37
const ATTRACTOR_PERIOD_Y = 53
const ATTRACTOR_PHASE = Math.PI / 3
const ATTRACTOR_SPAN_X = 0.34
const ATTRACTOR_SPAN_Y = 0.28
const FULL_TURN = Math.PI * 2

function readStageColor(canvas: HTMLCanvasElement, property: string): Float32Array {
  return readColorTriple(window.getComputedStyle(canvas).getPropertyValue(property).trim())
}

function attractorX(time: number, width: number): number {
  return width * (0.5 + ATTRACTOR_SPAN_X * Math.sin((FULL_TURN * time) / ATTRACTOR_PERIOD_X))
}

function attractorY(time: number, height: number): number {
  return height * (0.5 + ATTRACTOR_SPAN_Y * Math.sin((FULL_TURN * time) / ATTRACTOR_PERIOD_Y + ATTRACTOR_PHASE))
}

function measureBuffer(canvas: HTMLCanvasElement): {width: number; height: number} | null {
  const parent = canvas.parentElement
  if (!parent) return null
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  const width = Math.round(parent.clientWidth * ratio)
  const height = Math.round(parent.clientHeight * ratio)
  if (Math.min(width, height) < 1) return null
  return {width, height}
}

type FerrofluidContext = {gl: WebGLRenderingContext; program: WebGLProgram}

function createFerrofluidContext(canvas: HTMLCanvasElement): FerrofluidContext | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  })
  if (!gl) return null
  const program = createShaderProgram(gl, FERROFLUID_VERTEX, FERROFLUID_FRAGMENT)
  return program ? {gl, program} : null
}

function startFerrofluid(canvas: HTMLCanvasElement): () => void {
  const context = createFerrofluidContext(canvas)
  if (!context) return () => {}
  const {gl, program} = context

  gl.useProgram(program)
  const triangle = createFullScreenTriangle(gl, program)
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  const attractorLocation = gl.getUniformLocation(program, 'u_attractor')
  gl.uniform3fv(gl.getUniformLocation(program, 'u_accent'), readStageColor(canvas, '--od-ferro-accent'))
  gl.uniform3fv(gl.getUniformLocation(program, 'u_ink'), readStageColor(canvas, '--od-ferro-ink'))
  gl.uniform1f(gl.getUniformLocation(program, 'u_alpha'), readAlphaToken(canvas, '--od-frame-alpha'))
  gl.clearColor(0, 0, 0, 0)

  let startedAt = performance.now()
  let pausedAt = 0
  let frameHandle = 0

  const syncClock = (now: number) => {
    if (!watch.isAwake()) {
      if (pausedAt === 0) pausedAt = now
      return
    }
    if (pausedAt === 0) return
    startedAt += now - pausedAt
    pausedAt = 0
  }

  const draw = (now: number) => {
    const elapsed = watch.staysStill.matches ? STATIC_TIME : (now - startedAt) / 1000
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.uniform1f(timeLocation, elapsed)
    gl.uniform2f(attractorLocation, attractorX(elapsed, canvas.width), attractorY(elapsed, canvas.height))
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const frame = (now: number) => {
    frameHandle = 0
    syncClock(now)
    if (!watch.isAwake()) return
    draw(now)
    frameHandle = requestAnimationFrame(frame)
  }

  const schedule = () => {
    syncClock(performance.now())
    if (frameHandle === 0 && watch.isAwake()) frameHandle = requestAnimationFrame(frame)
  }

  const resize = () => {
    const buffer = measureBuffer(canvas)
    if (!buffer) return
    canvas.width = buffer.width
    canvas.height = buffer.height
    draw(performance.now())
    schedule()
  }

  const watch = watchFrameCanvas(canvas, {onResize: resize, onWake: schedule})
  resize()

  return () => {
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
    watch.dispose()
    if (triangle) gl.deleteBuffer(triangle)
    gl.deleteProgram(program)
  }
}

export function Ferrofluid() {
  return <FrameEffectCanvas start={startFerrofluid} />
}
