import {useTheme} from 'next-themes'
import {useCallback, useEffect, useState} from 'react'
import {PAPER_GRAIN_FRAGMENT, PAPER_GRAIN_VERTEX} from './paper-grain-source'
import {createFullScreenTriangle, createShaderProgram, readAlphaToken, readColorTriple} from './shader-program'

const MAX_PIXEL_RATIO = 2
const MAX_DECODED_PIXELS = 12_000_000

type BandSize = {width: number; height: number}

function measureBand(host: HTMLElement): BandSize | null {
  const width = host.clientWidth
  const height = host.clientHeight
  if (width * height === 0) return null
  return {width, height}
}

function pixelRatioFor(gl: WebGLRenderingContext, band: BandSize): number {
  const surfaceLimit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))
  const longestEdge = Math.max(band.width, band.height)
  const memoryFit = Math.sqrt(MAX_DECODED_PIXELS / (band.width * band.height))
  return Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO, surfaceLimit / longestEdge, memoryFit)
}

function rasterizeGrain(host: HTMLElement, band: BandSize, onReady: (objectUrl: string) => void): void {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    preserveDrawingBuffer: true,
  })
  if (!gl) return
  const program = createShaderProgram(gl, PAPER_GRAIN_VERTEX, PAPER_GRAIN_FRAGMENT)
  if (!program) return

  const ratio = pixelRatioFor(gl, band)
  canvas.width = Math.round(band.width * ratio)
  canvas.height = Math.round(band.height * ratio)

  gl.useProgram(program)
  const quad = createFullScreenTriangle(gl, program)
  gl.uniform3fv(gl.getUniformLocation(program, 'u_color'), readColorTriple(window.getComputedStyle(host).color))
  gl.uniform1f(gl.getUniformLocation(program, 'u_alpha'), readAlphaToken(host, '--od-paper-grain-alpha'))
  gl.clearColor(0, 0, 0, 0)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  canvas.toBlob((blob) => {
    if (quad) gl.deleteBuffer(quad)
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (blob) onReady(URL.createObjectURL(blob))
  })
}

function startPaperGrain(host: HTMLImageElement): () => void {
  let painted = ''
  let objectUrl = ''
  let stopped = false

  const release = () => {
    if (!objectUrl) return
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }

  const render = () => {
    const band = measureBand(host)
    if (!band) return
    const wanted = `${band.width}x${band.height}`
    if (wanted === painted) return
    painted = wanted
    rasterizeGrain(host, band, (nextUrl) => {
      if (stopped) {
        URL.revokeObjectURL(nextUrl)
        return
      }
      release()
      objectUrl = nextUrl
      host.src = nextUrl
      host.style.visibility = 'visible'
    })
  }

  const sizeObserver = new ResizeObserver(render)
  sizeObserver.observe(host)
  render()

  return () => {
    stopped = true
    sizeObserver.disconnect()
    host.removeAttribute('src')
    host.style.visibility = 'hidden'
    release()
  }
}

export function PaperGrain() {
  const {resolvedTheme} = useTheme()
  const [host, setHost] = useState<HTMLImageElement | null>(null)
  const captureHost = useCallback((node: HTMLImageElement | null) => setHost(node), [])

  useEffect(() => {
    if (!host) return
    return startPaperGrain(host)
  }, [host, resolvedTheme])

  return (
    <div aria-hidden className="od-paper-grain-band">
      <div className="od-page od-paper-grain-page">
        <img alt="" ref={captureHost} className="od-paper-grain" style={{visibility: 'hidden'}} />
      </div>
    </div>
  )
}
