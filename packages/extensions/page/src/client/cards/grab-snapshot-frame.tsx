import type {JSX} from 'solid-js'

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:"

const WRAPPER = 'block overflow-hidden max-w-full'

const FRAME = 'block border-none bg-transparent pointer-events-none'

function documentFor(html: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{margin:0;background:transparent}</style></head><body>${html}</body></html>`
}

export function GrabSnapshotFrame(props: {html: string; width: number; height: number; scale: number}): JSX.Element {
  return (
    <div class={WRAPPER} style={{width: `${props.width * props.scale}px`, height: `${props.height * props.scale}px`}}>
      <iframe
        class={FRAME}
        title="Grabbed element snapshot"
        sandbox=""
        referrerpolicy="no-referrer"
        scrolling="no"
        tabindex={-1}
        style={{
          width: `${props.width}px`,
          height: `${props.height}px`,
          transform: `scale(${props.scale})`,
          'transform-origin': '0 0',
        }}
        srcdoc={documentFor(props.html)}
      />
    </div>
  )
}
