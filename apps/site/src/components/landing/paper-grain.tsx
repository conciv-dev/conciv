import {type RefObject, useCallback} from 'react'
import {FrameEffectCanvas} from './frame-canvas'
import {PAPER_GRAIN_FRAGMENT, PAPER_GRAIN_VERTEX} from './paper-grain-source'
import {createFullScreenTriangle, createShaderProgram, readAlphaToken, readColorTriple} from './shader-program'

const MAX_PIXEL_RATIO = 2

function sizeLayer(canvas: HTMLCanvasElement, stop: HTMLElement | null): {width: number; height: number} | null {
  const parent = canvas.parentElement
  if (!stop || !parent) return null
  const regionHeight = Math.max(stop.getBoundingClientRect().top - canvas.getBoundingClientRect().top, 0)
  canvas.style.height = `${regionHeight}px`
  const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO)
  const width = Math.round(parent.clientWidth * ratio)
  const height = Math.round(regionHeight * ratio)
  if (width * height === 0) return null
  return {width, height}
}

function startPaperGrain(canvas: HTMLCanvasElement, stopAt: RefObject<HTMLElement | null>): () => void {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  })
  if (!gl) return () => {}
  const program = createShaderProgram(gl, PAPER_GRAIN_VERTEX, PAPER_GRAIN_FRAGMENT)
  if (!program) return () => {}

  gl.useProgram(program)
  const quad = createFullScreenTriangle(gl, program)
  gl.uniform3fv(gl.getUniformLocation(program, 'u_color'), readColorTriple(window.getComputedStyle(canvas).color))
  gl.uniform1f(gl.getUniformLocation(program, 'u_alpha'), readAlphaToken(canvas, '--od-paper-grain-alpha'))
  gl.clearColor(0, 0, 0, 0)

  let drawnWidth = 0
  let drawnHeight = 0

  const render = () => {
    const size = sizeLayer(canvas, stopAt.current)
    if (!size) return
    if (size.width === drawnWidth && size.height === drawnHeight) return
    drawnWidth = size.width
    drawnHeight = size.height
    canvas.width = size.width
    canvas.height = size.height
    gl.viewport(0, 0, size.width, size.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const sizeObserver = new ResizeObserver(render)
  if (canvas.parentElement) sizeObserver.observe(canvas.parentElement)
  render()

  return () => {
    sizeObserver.disconnect()
    if (quad) gl.deleteBuffer(quad)
    gl.deleteProgram(program)
  }
}

export function PaperGrain({stopAt}: {stopAt: RefObject<HTMLElement | null>}) {
  const start = useCallback((canvas: HTMLCanvasElement) => startPaperGrain(canvas, stopAt), [stopAt])

  return <FrameEffectCanvas start={start} className="od-paper-grain" />
}
