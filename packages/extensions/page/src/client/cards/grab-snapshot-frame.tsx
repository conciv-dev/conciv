import type {JSX} from 'solid-js'

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:"

const FRAME = 'block border-none bg-transparent pointer-events-none'

function documentFor(html: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{margin:0;background:transparent}</style></head><body>${html}</body></html>`
}

export function GrabSnapshotFrame(props: {html: string; width: number; height: number; class: string}): JSX.Element {
  return (
    <svg class={props.class} width={props.width} height={props.height} viewBox={`0 0 ${props.width} ${props.height}`}>
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
          srcdoc={documentFor(props.html)}
        />
      </foreignObject>
    </svg>
  )
}
