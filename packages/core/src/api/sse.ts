import type {H3Event} from 'h3'
import {corsHeadersFor} from './cors.js'

const BASE_SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
}

// A streamed Response bypasses the global CORS middleware (that middleware decorates
// handler-returned bodies, not raw Response objects), so every SSE endpoint must carry the
// CORS headers itself. One place to get that right.
export function sseHeaders(event: H3Event): Record<string, string> {
  return {...BASE_SSE_HEADERS, ...corsHeadersFor(event)}
}

// Open a push-based SSE response. `start` runs once the stream opens: emit `data:` frames via
// the supplied callback and return an unsubscribe that fires on cancel.
export function sseStream(
  event: H3Event,
  openComment: string,
  start: (emit: (data: unknown) => void) => () => void,
): Response {
  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`: ${openComment}\n\n`))
      unsubscribe = start((data) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)))
    },
    cancel() {
      unsubscribe()
    },
  })
  return new Response(stream, {status: 200, headers: sseHeaders(event)})
}
