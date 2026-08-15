import {createSignal, onMount, type JSX} from 'solid-js'

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:"

const FRAME = 'block border-none bg-transparent pointer-events-none'

const BASE_FALLBACK = '#000'

const OVERLAY_FALLBACK = 'transparent'

const SAFE_COLOR = /^[\w\s%.,()/#-]+$/

type Surface = {base: string; overlay: string}

const DEFAULT_SURFACE: Surface = {base: BASE_FALLBACK, overlay: OVERLAY_FALLBACK}

function safeColor(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed !== '' && SAFE_COLOR.test(trimmed) ? trimmed : fallback
}

function readSurface(node: Element): Surface {
  const styles = getComputedStyle(node)
  return {
    base: safeColor(styles.getPropertyValue('--pw-panel'), BASE_FALLBACK),
    overlay: safeColor(styles.getPropertyValue('--pw-fill'), OVERLAY_FALLBACK),
  }
}

function documentFor(html: string, surface: Surface): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html{background:${surface.base}}body{margin:0;background:${surface.overlay}}</style></head><body>${html}</body></html>`
}

export function GrabSnapshotFrame(props: {html: string; width: number; height: number; class: string}): JSX.Element {
  const [surface, setSurface] = createSignal<Surface>(DEFAULT_SURFACE)
  let node: SVGSVGElement | undefined
  onMount(() => {
    if (node) setSurface(readSurface(node))
  })
  return (
    <svg
      ref={(element) => {
        node = element
      }}
      class={props.class}
      width={props.width}
      height={props.height}
      viewBox={`0 0 ${props.width} ${props.height}`}
    >
      <foreignObject width={props.width} height={props.height}>
        <iframe
          class={FRAME}
          title="Grabbed element snapshot"
          sandbox=""
          referrerpolicy="no-referrer"
          scrolling="no"
          tabindex={-1}
          width={props.width}
          height={props.height}
          srcdoc={documentFor(props.html, surface())}
        />
      </foreignObject>
    </svg>
  )
}
