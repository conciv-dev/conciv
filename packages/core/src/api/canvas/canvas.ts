import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {readFile} from 'node:fs/promises'
import {type H3, getValidatedQuery, readValidatedBody} from 'h3'
import {z} from 'zod'
import {sseStream} from '../sse.js'
import type {CanvasRelay} from '../../canvas/relay.js'
import type {Doctor} from '../../comments/doctor.js'

// Resolve the lazily-served overlay bundle (built separately into @mandarax/widget/dist). Best-effort:
// returns null if the widget package or its build isn't resolvable, and the route then 404s clearly.
function overlayBundlePath(): string | null {
  try {
    // Resolve via the package's "./global" export (package.json is blocked by the exports map), then
    // take the sibling overlay bundle in the same dist dir.
    const req = createRequire(import.meta.url)
    return join(dirname(req.resolve('@mandarax/widget/global')), 'canvas-overlay.global.js')
  } catch {
    return null
  }
}

// Yjs updates are binary; SSE frames are text, so updates ride as base64. POST bodies carry base64 too.
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

const SessionQuery = z.object({session: z.string().min(1)})
const UpdateBody = z.object({session: z.string().min(1), update: z.string().min(1)})

// The canvas Yjs sync relay over the existing h3 server. Gating: the global registerCors middleware
// already rejects non-loopback Origin + Host (DNS-rebinding). A per-session secret token is layered in
// Phase 9 (security pass) — tracked, not yet here.
export function registerCanvasRoutes(app: H3, opts: {relay: CanvasRelay; doctor: Doctor}): void {
  // Manual re-anchor sweep (the CLI `mandarax doctor` hits this; it also auto-runs on session_start).
  app.post('/api/canvas/doctor', async () => ({report: await opts.doctor.run()}))

  // Serve the lazy overlay bundle (Excalidraw island + Solid pins). The widget injects this on the
  // first canvas toggle, keeping the ~1MB React+Excalidraw out of the base widget bundle.
  app.get('/api/canvas/overlay.js', async () => {
    const path = overlayBundlePath()
    if (!path) return new Response('overlay bundle not built', {status: 404})
    try {
      const js = await readFile(path, 'utf8')
      return new Response(js, {status: 200, headers: {'content-type': 'application/javascript; charset=utf-8'}})
    } catch {
      return new Response('overlay bundle not built', {status: 404})
    }
  })

  // SSE: emit the full snapshot first, then live updates, until the client disconnects.
  app.get('/api/canvas/sync', async (event) => {
    const {session} = await getValidatedQuery(event, SessionQuery)
    const snapshot = await opts.relay.snapshot(session)
    return sseStream(event, 'canvas', (emit) => {
      emit({type: 'snapshot', update: b64(snapshot)})
      let unsubscribe = () => {}
      void opts.relay
        .subscribe(session, (u) => emit({type: 'update', update: b64(u)}))
        .then((fn) => {
          unsubscribe = fn
        })
      return () => unsubscribe()
    })
  })

  // Browser -> core: apply a client update into the authoritative doc (relay broadcasts + persists).
  app.post('/api/canvas/update', async (event) => {
    const {session, update} = await readValidatedBody(event, UpdateBody)
    await opts.relay.applyUpdate(session, unb64(update))
    return {ok: true}
  })
}
