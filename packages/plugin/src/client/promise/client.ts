export * as Conciv from './client.js'

import {contract, type RpcClient} from '@conciv/contract'
import {SharedEvents} from '../shared-events.js'
import type {EventSubscribeOutput} from './generated/types.js'
import {makeRpc, type RpcApi} from './rpc.js'

export type {RequestOptions} from './generated/client.js'

export function make(raw: RpcClient): Omit<RpcClient, 'event'> & {
  rpc: RpcApi & {call: RpcClient['plugin']['call']}
  event: ReturnType<typeof SharedEvents.make<EventSubscribeOutput>>
} {
  const events = SharedEvents.make((signal, onActivity) => received(raw, signal, onActivity))
  const groups = {
    auth: raw.auth,
    sessions: raw.sessions,
    settings: raw.settings,
    drafts: raw.drafts,
    markers: raw.markers,
    navigation: raw.navigation,
    chat: raw.chat,
    registry: raw.registry,
    captures: raw.captures,
    tabs: raw.tabs,
    code: raw.code,
    page: raw.page,
    server: raw.server,
    editor: raw.editor,
    meta: raw.meta,
    plugin: raw.plugin,
    event: raw.event,
  } satisfies {readonly [Group in keyof typeof contract]: RpcClient[Group]}
  return {
    ...groups,
    rpc: Object.assign(makeRpc(raw, events), {call: raw.plugin.call}),
    event: events,
  }
}

const reconnectDelay = 1_000
const idleTimeout = 45_000

async function* received(raw: RpcClient, signal: AbortSignal, onActivity: () => void) {
  while (!signal.aborted) {
    const attempt = new AbortController()
    const cancel = () => attempt.abort(signal.reason)
    signal.addEventListener('abort', cancel, {once: true})
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const touch = () => {
      onActivity()
      clearTimeout(watchdog)
      watchdog = setTimeout(() => attempt.abort(new Error('Event stream stalled')), idleTimeout)
    }
    try {
      for await (const event of await raw.event.subscribe(undefined, {signal: attempt.signal})) {
        touch()
        if (event.type === 'server.heartbeat') continue
        yield event as EventSubscribeOutput
      }
      if (!signal.aborted) console.warn('[conciv] the event stream ended; subscribing again')
    } catch (error) {
      if (signal.aborted) return
      console.error('[conciv] the event stream failed; subscribing again', error)
    } finally {
      clearTimeout(watchdog)
      signal.removeEventListener('abort', cancel)
    }
    if (signal.aborted) return
    await wait(reconnectDelay, signal)
  }
}

function wait(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, delay)
    signal.addEventListener('abort', done, {once: true})
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}
