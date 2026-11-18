import type {Context} from '@conciv/plugin/experimental'
import {TestRunner} from './rpc.js'
import {TestEventSchema} from './events.js'
import type {RunAction} from './run-state.js'

type Client = Context['client']

export async function followTestRun(
  client: Client,
  signal: AbortSignal,
  dispatch: (action: RunAction) => void,
): Promise<void> {
  const read = async () => {
    try {
      const runner = client.rpc(TestRunner)
      const result = await runner.status(undefined, {signal})
      if (!signal.aborted) dispatch({type: 'status', result})
      const current = await runner.current(undefined, {signal})
      if (!signal.aborted) dispatch({type: 'current', ...current})
    } catch (error) {
      if (!signal.aborted) console.error('[test-runner] the test run could not be read', error)
    }
  }
  try {
    for await (const event of client.event.subscribe({types: ['rpc.test-runner.event'], signal})) {
      if (event.type === 'server.connected') {
        dispatch({type: 'connected'})
        void read()
        continue
      }
      const parsed = TestEventSchema.safeParse(event.data)
      if (parsed.success) dispatch(parsed.data)
      else console.error('[test-runner] a live test event did not match its schema', parsed.error)
    }
  } catch (error) {
    if (!signal.aborted) console.error('[test-runner] the live test events stopped', error)
  }
}
