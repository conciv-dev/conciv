import {createSignal} from 'solid-js'

// Minimal slice of the Excalidraw API the controls drive (zoom + fit).
export type ExcalidrawApi = {
  updateScene: (scene: {appState?: Record<string, unknown>}) => void
  getAppState: () => {zoom: {value: number}}
  getSceneElements: () => readonly unknown[]
  scrollToContent: (target?: unknown, opts?: {fitToContent?: boolean; animate?: boolean}) => void
}

const ZOOM_STEP = 1.2
const clampZoom = (z: number) => Math.min(30, Math.max(0.1, z))

// Our own chrome (Excalidraw's is hidden via zen mode): a Draw toggle that flips the canvas between
// pass-through (idle — click the app beneath) and interactive (draw), plus zoom in/out/reset/fit.
export function Controls(props: {api: () => ExcalidrawApi | null; onDrawChange: (draw: boolean) => void}) {
  const [draw, setDraw] = createSignal(false)
  const toggleDraw = () => {
    const next = !draw()
    setDraw(next)
    props.onDrawChange(next)
  }
  const zoom = (factor: number) => {
    const api = props.api()
    if (!api) return
    api.updateScene({appState: {zoom: {value: clampZoom(api.getAppState().zoom.value * factor)}}})
  }
  const reset = () => props.api()?.updateScene({appState: {zoom: {value: 1}}})
  const fit = () => {
    const api = props.api()
    if (api) api.scrollToContent(api.getSceneElements(), {fitToContent: true, animate: false})
  }

  const bar = {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '4px',
    padding: '4px',
    'border-radius': '10px',
    background: 'rgba(20,20,28,0.85)',
    'box-shadow': '0 4px 16px rgba(0,0,0,0.3)',
    'pointer-events': 'auto',
  } as const
  const btn = {
    'min-width': '34px',
    height: '30px',
    padding: '0 8px',
    border: 'none',
    'border-radius': '7px',
    background: 'transparent',
    color: 'white',
    'font-size': '13px',
    cursor: 'pointer',
  } as const

  return (
    <div style={bar}>
      <button
        type="button"
        style={{...btn, background: draw() ? '#6366f1' : 'transparent'}}
        aria-label={draw() ? 'Stop drawing' : 'Draw'}
        onClick={toggleDraw}
      >
        {draw() ? '✏️ Drawing' : '✏️ Draw'}
      </button>
      <button type="button" style={btn} aria-label="Zoom in" onClick={() => zoom(ZOOM_STEP)}>
        +
      </button>
      <button type="button" style={btn} aria-label="Zoom out" onClick={() => zoom(1 / ZOOM_STEP)}>
        −
      </button>
      <button type="button" style={btn} aria-label="Reset zoom" onClick={reset}>
        100%
      </button>
      <button type="button" style={btn} aria-label="Zoom to fit" onClick={fit}>
        Fit
      </button>
    </div>
  )
}
