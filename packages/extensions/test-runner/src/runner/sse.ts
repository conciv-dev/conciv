import type {Context} from 'hono'
import {streamSSE} from 'hono/streaming'

export function sseStream(
  c: Context,
  openComment: string,
  start: (emit: (data: unknown) => void) => () => void,
): Response {
  return streamSSE(c, async (stream) => {
    await stream.write(`: ${openComment}\n\n`)
    await new Promise<void>((resolve) => {
      const unsubscribe = start((data) => void stream.writeSSE({data: JSON.stringify(data)}))
      stream.onAbort(() => {
        unsubscribe()
        resolve()
      })
    })
  })
}
