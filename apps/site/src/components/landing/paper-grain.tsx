import {type RefObject, useCallback} from 'react'
import {FrameEffectCanvas} from './frame-canvas'
import {PAPER_GRAIN_FRAGMENT, PAPER_GRAIN_VERTEX} from './paper-grain-source'
import {createFullScreenTriangle, createShaderProgram, readAlphaToken, readColorTriple} from './shader-program'

const MAX_PIXEL_RATIO = 2

type BandSize = {width: number; height: number}

function sizeLayer(canvas: HTMLCanvasElement, stop: HTMLElement | null): BandSize | null {
  const parent = canvas.parentElement
  if (!stop || !parent) return null
  const bandHeight = Math.max(stop.getBoundingClientRect().top - canvas.getBoundingClientRect().top, 0)
  canvas.style.height = `${bandHeight}px`
  const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO)
  const width = Math.round(parent.clientWidth * ratio)
  const height = Math.round(bandHeight * ratio)
  if (width * height === 0) return null
  return {width, height}
}

function drawBand(gl: WebGLRenderingContext, canvas: HTMLCanvasElement, size: BandSize): void {
  canvas.width = size.width
  canvas.height = size.height
  gl.viewport(0, 0, size.width, size.height)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function makeBandRenderer(
  gl: WebGLRenderingContext,
  canvas: HTMLCanvasElement,
  stopAt: RefObject<HTMLElement | null>,
): () => void {
  let drawn = ''

  return () => {
    const size = sizeLayer(canvas, stopAt.current)
    if (!size) return
    const wanted = `${size.width}x${size.height}`
    if (wanted === drawn) return
    drawn = wanted
    drawBand(gl, canvas, size)
  }
}

function observeBand(canvas: HTMLCanvasElement, stop: HTMLElement | null, onResize: () => void): ResizeObserver {
  const observer = new ResizeObserver(onResize)
  for (const element of [canvas.parentElement, stop, stop?.parentElement]) {
    if (element) observer.observe(element)
  }
  return observer
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

  const render = makeBandRenderer(gl, canvas, stopAt)
  const sizeObserver = observeBand(canvas, stopAt.current, render)
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
