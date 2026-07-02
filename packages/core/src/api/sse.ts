import type {H3Event} from 'h3'
import {corsHeadersFor} from './cors.js'

const BASE_SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
}

export function sseHeaders(event: H3Event): Record<string, string> {
  return {...BASE_SSE_HEADERS, ...corsHeadersFor(event)}
}

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
