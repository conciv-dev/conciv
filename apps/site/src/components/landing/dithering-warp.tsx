import {useTheme} from 'next-themes'
import {useCallback, useEffect, useState} from 'react'
import {DITHERING_WARP_BLOCK_SIZE, DITHERING_WARP_FRAGMENT, DITHERING_WARP_VERTEX} from './dithering-warp-source'

const FRAME_INTERVAL_MS = 1000 / 12
const TIME_SPEED = 0.08
const TIME_PERIOD = Math.PI * 4

const TRANSPARENT_TINT = new Float32Array([0, 0, 0])

function readTint(canvas: HTMLCanvasElement): Float32Array {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d')
  if (!context) return TRANSPARENT_TINT
  context.fillStyle = window.getComputedStyle(canvas).color
  context.fillRect(0, 0, 1, 1)
  return Float32Array.from(context.getImageData(0, 0, 1, 1).data.subarray(0, 3), (channel) => channel / 255)
}

function readAlpha(canvas: HTMLCanvasElement): number {
  const alpha = Number(window.getComputedStyle(canvas).getPropertyValue('--od-frame-alpha'))
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

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, DITHERING_WARP_VERTEX)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, DITHERING_WARP_FRAGMENT)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  return linkShaders(gl, program, [vertex, fragment])
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
  const program = createProgram(gl)
  return program ? {gl, program} : null
}

function startDitheringWarp(canvas: HTMLCanvasElement): () => void {
  const context = createWarpContext(canvas)
  if (!context) return () => {}
  const {gl, program} = context

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.useProgram(program)
  const positionLocation = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  gl.uniform3fv(gl.getUniformLocation(program, 'u_color'), readTint(canvas))
  gl.uniform1f(gl.getUniformLocation(program, 'u_alpha'), readAlpha(canvas))
  gl.clearColor(0, 0, 0, 0)

  const staysStill = window.matchMedia('(prefers-reduced-motion: reduce)')
  let startedAt = performance.now()
  let pausedAt = 0
  let lastFrameAt = 0
  let frameHandle = 0
  let onScreen = false

  const shouldDrift = () => onScreen && document.visibilityState === 'visible' && !staysStill.matches

  const syncClock = (now: number) => {
    if (!shouldDrift()) {
      if (pausedAt === 0) pausedAt = now
      return
    }
    if (pausedAt === 0) return
    startedAt += now - pausedAt
    pausedAt = 0
  }

  const draw = (now: number) => {
    const elapsed = staysStill.matches ? 0 : ((now - startedAt) / 1000) * TIME_SPEED
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    gl.uniform1f(timeLocation, elapsed % TIME_PERIOD)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const frame = (now: number) => {
    frameHandle = 0
    syncClock(now)
    if (!shouldDrift()) return
    if (now - lastFrameAt >= FRAME_INTERVAL_MS) {
      lastFrameAt = now
      draw(now)
    }
    frameHandle = requestAnimationFrame(frame)
  }

  const schedule = () => {
    syncClock(performance.now())
    if (frameHandle === 0 && shouldDrift()) frameHandle = requestAnimationFrame(frame)
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

  const sizeObserver = new ResizeObserver(resize)
  if (canvas.parentElement) sizeObserver.observe(canvas.parentElement)
  const viewObserver = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting)
    schedule()
  })
  viewObserver.observe(canvas)
  document.addEventListener('visibilitychange', schedule)
  staysStill.addEventListener('change', schedule)
  resize()

  return () => {
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
    sizeObserver.disconnect()
    viewObserver.disconnect()
    document.removeEventListener('visibilitychange', schedule)
    staysStill.removeEventListener('change', schedule)
    gl.deleteBuffer(quad)
    gl.deleteProgram(program)
  }
}

export function DitheringWarp() {
  const {resolvedTheme} = useTheme()
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const captureCanvas = useCallback((node: HTMLCanvasElement | null) => setCanvas(node), [])

  useEffect(() => {
    if (!canvas) return
    return startDitheringWarp(canvas)
  }, [canvas, resolvedTheme])

  return <canvas aria-hidden className="od-frame-dither size-full" ref={captureCanvas} />
}
