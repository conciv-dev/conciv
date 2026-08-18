import {useTheme} from 'next-themes'
import {useCallback, useEffect, useState} from 'react'
import {PAPER_GRAIN_FRAGMENT, PAPER_GRAIN_VERTEX} from './paper-grain-source'
import {createFullScreenTriangle, createShaderProgram, readAlphaToken, readColorTriple} from './shader-program'

const MAX_PIXEL_RATIO = 2

type BandSize = {width: number; height: number}

function sizeLayer(host: HTMLElement): BandSize | null {
  const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO)
  const width = Math.round(host.clientWidth * ratio)
  const height = Math.round(host.clientHeight * ratio)
  if (width * height === 0) return null
  return {width, height}
}

function rasterizeGrain(host: HTMLElement, size: BandSize, onReady: (objectUrl: string) => void): void {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
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

  gl.useProgram(program)
  const quad = createFullScreenTriangle(gl, program)
  gl.uniform3fv(gl.getUniformLocation(program, 'u_color'), readColorTriple(window.getComputedStyle(host).color))
  gl.uniform1f(gl.getUniformLocation(program, 'u_alpha'), readAlphaToken(host, '--od-paper-grain-alpha'))
  gl.clearColor(0, 0, 0, 0)
  gl.viewport(0, 0, size.width, size.height)
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
    const size = sizeLayer(host)
    if (!size) return
    const wanted = `${size.width}x${size.height}`
    if (wanted === painted) return
    painted = wanted
    rasterizeGrain(host, size, (nextUrl) => {
      if (stopped) {
        URL.revokeObjectURL(nextUrl)
        return
      }
      release()
      objectUrl = nextUrl
      host.src = nextUrl
    })
  }

  const sizeObserver = new ResizeObserver(render)
  sizeObserver.observe(host)
  render()

  return () => {
    stopped = true
    sizeObserver.disconnect()
    sizeObserver.unobserve(host)
    host.removeAttribute('src')
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
        <img alt="" ref={captureHost} className="od-paper-grain" />
      </div>
    </div>
  )
}
