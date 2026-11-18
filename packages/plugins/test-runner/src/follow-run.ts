import type {Context} from '@conciv/plugin/experimental'
import {TestRunner} from './rpc.js'
import {TestEventSchema} from './events.js'
import {createFollowState, transitionFollow, type FollowEffect, type FollowEvent} from './follow-machine.js'
import type {RunViewAction} from './run-state.js'

type Client = Context['client']

export async function followTestRun(
  client: Client,
  signal: AbortSignal,
  dispatch: (action: RunViewAction) => void,
): Promise<void> {
  const machine = {state: createFollowState()}
  const step = (event: FollowEvent): void => {
    const next = transitionFollow(machine.state, event)
    machine.state = next.state
    next.effects.forEach(perform)
  }
  const read = async (attempt: number): Promise<void> => {
    try {
      const runner = client.rpc(TestRunner)
      const status = await runner.status(undefined, {signal})
      const current = await runner.current(undefined, {signal})
      step({type: 'read-done', attempt, status, current})
    } catch (error) {
      step({type: 'read-failed', attempt, error})
    }
  }
  const perform = (effect: FollowEffect): void => {
    if (effect.type === 'apply') return dispatch(effect.action)
    if (effect.type === 'log') return console.error(effect.message, effect.error)
    void read(effect.attempt)
  }
  signal.addEventListener('abort', () => step({type: 'disposed'}), {once: true})
  try {
    for await (const event of client.event.subscribe({types: ['rpc.test-runner.event'], signal})) {
      if (event.type === 'server.connected') {
        step({type: 'server-connected'})
        continue
      }
      const parsed = TestEventSchema.safeParse(event.data)
      step(parsed.success ? {type: 'event', event: parsed.data} : {type: 'event-invalid', error: parsed.error})
    }
  } catch (error) {
    step({type: 'stream-failed', error})
  }
}
