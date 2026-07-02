import type {H3Event} from 'h3'

const BASE_SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
}

function sseHeaders(event: H3Event): Record<string, string> {
  const origin = event.req.headers.get('origin')
  const cors: Record<string, string> = origin
    ? {'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'origin'}
    : {}
  return {...BASE_SSE_HEADERS, ...cors}
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
