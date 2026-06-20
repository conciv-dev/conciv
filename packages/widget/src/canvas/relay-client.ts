import type {CanvasDoc} from './canvas-doc.js'

// base64 <-> bytes for the text SSE channel (browser + node both expose btoa/atob globals).
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

// Connect a canvas doc to core's gated relay: SSE applies the snapshot + live updates (as REMOTE so
// they neither rebroadcast nor enter local undo); local edits (USER/EXCALIDRAW) POST to core. The
// REMOTE-origin skip is the echo guard — a just-applied remote update never bounces back to core.
export function connectRelay(doc: CanvasDoc, opts: {base: string; session: string}): () => void {
  const url = `${opts.base}/api/canvas/sync?session=${encodeURIComponent(opts.session)}`
  const es = new EventSource(url, {withCredentials: true})
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data) as {type: 'snapshot' | 'update'; update: string}
    doc.applyRemote(fromBase64(msg.update))
  }
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === doc.origin.REMOTE) return
    void fetch(`${opts.base}/api/canvas/update`, {
      method: 'POST',
      credentials: 'include',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({session: opts.session, update: toBase64(update)}),
    })
  }
  doc.doc.on('update', onUpdate)
  return () => {
    es.close()
    doc.doc.off('update', onUpdate)
  }
}
