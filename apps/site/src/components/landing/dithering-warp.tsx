import {DITHERING_WARP_BLOCK_SIZE, DITHERING_WARP_FRAGMENT, DITHERING_WARP_VERTEX} from './dithering-warp-source'
import {FrameEffectCanvas, watchFrameCanvas} from './frame-canvas'
import {createFullScreenTriangle, createShaderProgram, readColorTriple, readFrameAlpha} from './shader-program'

const FRAME_INTERVAL_MS = 1000 / 12
const TIME_SPEED = 0.08
const TIME_PERIOD = Math.PI * 4

function readTint(canvas: HTMLCanvasElement): Float32Array {
  return readColorTriple(window.getComputedStyle(canvas).color)
}

type WarpContext = {gl: WebGLRenderingContext; program: WebGLProgram}

function createWarpContext(canvas: HTMLCanvasElement): WarpContext | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  })
  if (!gl) return null
  const program = createShaderProgram(gl, DITHERING_WARP_VERTEX, DITHERING_WARP_FRAGMENT)
  return program ? {gl, program} : null
}

function startDitheringWarp(canvas: HTMLCanvasElement): () => void {
  const context = createWarpContext(canvas)
  if (!context) return () => {}
  const {gl, program} = context

  gl.useProgram(program)
  const quad = createFullScreenTriangle(gl, program)
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  gl.uniform3fv(gl.getUniformLocation(program, 'u_color'), readTint(canvas))
  gl.uniform1f(gl.getUniformLocation(program, 'u_alpha'), readFrameAlpha(canvas))
  gl.clearColor(0, 0, 0, 0)

  let startedAt = performance.now()
  let pausedAt = 0
  let lastFrameAt = 0
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
    const elapsed = watch.staysStill.matches ? 0 : ((now - startedAt) / 1000) * TIME_SPEED
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.uniform1f(timeLocation, elapsed % TIME_PERIOD)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const frame = (now: number) => {
    frameHandle = 0
    syncClock(now)
    if (!watch.isAwake()) return
    if (now - lastFrameAt >= FRAME_INTERVAL_MS) {
      lastFrameAt = now
      draw(now)
    }
    frameHandle = requestAnimationFrame(frame)
  }

  const schedule = () => {
    syncClock(performance.now())
    if (frameHandle === 0 && watch.isAwake()) frameHandle = requestAnimationFrame(frame)
  }

  const applySize = (width: number, height: number) => {
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
  }

  const resize = () => {
    const parent = canvas.parentElement
    if (!parent) return
    applySize(
      Math.round(parent.clientWidth / DITHERING_WARP_BLOCK_SIZE),
      Math.round(parent.clientHeight / DITHERING_WARP_BLOCK_SIZE),
    )
    draw(performance.now())
    schedule()
  }

  const watch = watchFrameCanvas(canvas, {onResize: resize, onWake: schedule})
  resize()

  return () => {
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
    watch.dispose()
    if (quad) gl.deleteBuffer(quad)
    gl.deleteProgram(program)
  }
}

export function DitheringWarp() {
  return <FrameEffectCanvas start={startDitheringWarp} className="od-frame-dither" />
}
