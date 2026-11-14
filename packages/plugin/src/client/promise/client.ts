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

async function* received(raw: RpcClient, signal: AbortSignal, onActivity: () => void) {
  for await (const event of await raw.event.subscribe(undefined, {signal})) {
    onActivity()
    yield event as EventSubscribeOutput
  }
}
