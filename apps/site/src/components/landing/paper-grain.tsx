import {useCallback} from 'react'
import {FrameEffectCanvas} from './frame-canvas'
import {PAPER_GRAIN_FRAGMENT, PAPER_GRAIN_VERTEX} from './paper-grain-source'
import {createFullScreenTriangle, createShaderProgram, readAlphaToken, readColorTriple} from './shader-program'

const MAX_PIXEL_RATIO = 2

function sizeLayer(canvas: HTMLCanvasElement): {width: number; height: number} | null {
  const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO)
  const width = Math.round(canvas.clientWidth * ratio)
  const height = Math.round(canvas.clientHeight * ratio)
  if (width * height === 0) return null
  return {width, height}
}

function startPaperGrain(canvas: HTMLCanvasElement): () => void {
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

  let drawn = ''

  const render = () => {
    const size = sizeLayer(canvas)
    if (!size) return
    const wanted = `${size.width}x${size.height}`
    if (wanted === drawn) return
    drawn = wanted
    canvas.width = size.width
    canvas.height = size.height
    gl.viewport(0, 0, size.width, size.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const sizeObserver = new ResizeObserver(render)
  sizeObserver.observe(canvas)
  render()

  return () => {
    sizeObserver.disconnect()
    if (quad) gl.deleteBuffer(quad)
    gl.deleteProgram(program)
  }
}

export function PaperGrain() {
  const start = useCallback((canvas: HTMLCanvasElement) => startPaperGrain(canvas), [])

  return (
    <div aria-hidden className="od-paper-grain-band">
      <div className="od-page od-paper-grain-page">
        <FrameEffectCanvas start={start} className="od-paper-grain" />
      </div>
    </div>
  )
}
