export * as Conciv from './client.js'

import {Schedule, Stream} from 'effect'
import {z} from 'zod'
import {contract, type EventEnvelopeSchema, type RpcClient} from '@conciv/contract'
import {SharedEvents} from '../shared-events.js'
import type {EventSubscribeOutput} from './generated/types.js'
import {makeRpc, type RpcApi} from './rpc.js'

export type {RequestOptions} from './generated/client.js'

export function make(
  raw: RpcClient,
  options: {readonly server: () => string},
): Omit<RpcClient, 'event'> & {
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
    chat: raw.chat,
    registry: raw.registry,
    location: raw.location,
    code: raw.code,
    meta: raw.meta,
    skill: raw.skill,
    agent: raw.agent,
    fs: raw.fs,
    plugin: raw.plugin,
    experimental: raw.experimental,
    event: raw.event,
  } satisfies {readonly [Group in keyof typeof contract]: RpcClient[Group]}
  return {
    ...groups,
    rpc: Object.assign(makeRpc(raw, events, options.server), {call: raw.plugin.call}),
    event: events,
  }
}

const UntrustedSchema = z.object({code: z.literal('UNAUTHORIZED')})

const UNTIL_TRUSTED = Schedule.spaced('1 second')

function received(raw: RpcClient, signal: AbortSignal, onActivity: () => void): AsyncIterable<EventSubscribeOutput> {
  return Stream.toAsyncIterable(
    Stream.fromAsyncIterable(
      {[Symbol.asyncIterator]: () => subscribed(raw, signal, onActivity)},
      (cause) => cause,
    ).pipe(
      Stream.catch((cause) => (UntrustedSchema.safeParse(cause).success ? Stream.fail(cause) : Stream.die(cause))),
      Stream.retry(UNTIL_TRUSTED),
    ),
  )
}

async function* subscribed(raw: RpcClient, signal: AbortSignal, onActivity: () => void) {
  for await (const event of await raw.event.subscribe(undefined, {signal})) {
    onActivity()
    if (isEvent(event)) yield event
  }
}

function isEvent(event: z.infer<typeof EventEnvelopeSchema>): event is EventSubscribeOutput {
  return event.type !== 'server.heartbeat'
}
