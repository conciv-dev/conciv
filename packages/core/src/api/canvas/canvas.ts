import {type H3, getValidatedQuery, readValidatedBody} from 'h3'
import {z} from 'zod'
import {sseStream} from '../sse.js'
import type {CanvasRelay} from '../../canvas/relay.js'

// Yjs updates are binary; SSE frames are text, so updates ride as base64. POST bodies carry base64 too.
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

const SessionQuery = z.object({session: z.string().min(1)})
const UpdateBody = z.object({session: z.string().min(1), update: z.string().min(1)})

// The canvas Yjs sync relay over the existing h3 server. Gating: the global registerCors middleware
// already rejects non-loopback Origin + Host (DNS-rebinding). A per-session secret token is layered in
// Phase 9 (security pass) — tracked, not yet here.
export function registerCanvasRoutes(app: H3, opts: {relay: CanvasRelay}): void {
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
