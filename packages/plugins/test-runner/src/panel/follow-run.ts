import type {Context} from '@conciv/plugin/experimental'
import {TestEventSchema} from '../shared/events.js'
import type {RunAction} from './run-state.js'

type Client = Context['client']

export async function followTestRun(
  client: Client,
  signal: AbortSignal,
  handlers: {
    readonly dispatch: (action: RunAction) => void
    readonly read: (client: Client, signal: AbortSignal) => Promise<void>
  },
): Promise<void> {
  const read = async () => {
    try {
      await handlers.read(client, signal)
    } catch (error) {
      if (!signal.aborted) console.error('[test-runner] the test run could not be read', error)
    }
  }
  try {
    for await (const event of client.event.subscribe({types: ['rpc.test-runner.event'], signal})) {
      if (event.type === 'server.connected') {
        handlers.dispatch({type: 'connected'})
        void read()
        continue
      }
      const parsed = TestEventSchema.safeParse(event.data)
      if (parsed.success) handlers.dispatch(parsed.data)
      else console.error('[test-runner] a live test event did not match its schema', parsed.error)
    }
  } catch (error) {
    if (!signal.aborted) console.error('[test-runner] the live test events stopped', error)
  }
}
