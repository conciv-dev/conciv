import type {FakeEngineHandlers} from '@conciv/client/testing'
import type {PluginInfo} from '@conciv/backend-plugin-api'

type PluginHandlers = NonNullable<FakeEngineHandlers['plugin']>

type EventHandlers = NonNullable<FakeEngineHandlers['event']>

type JsonOption = string | number | boolean

export type FakeBundle = {
  readonly id: string
  readonly code: string
  readonly server?: boolean
  readonly options?: Readonly<Record<string, JsonOption>>
}

const location = {directory: '/workspace'}

function listing(bundle: FakeBundle): PluginInfo {
  return {
    id: bundle.id,
    source: {type: 'local', path: `conciv/plugins/${bundle.id}`},
    features: bundle.server === true ? {experimental: true, server: true} : {experimental: true},
    state: {status: 'active'},
  }
}

function missingBundle(id: string): never {
  throw new Error(`the fake engine serves no plugin bundle ${id}`)
}

export function pluginBundles(
  bundles: () => readonly FakeBundle[],
  others: readonly PluginInfo[] = [],
): Pick<PluginHandlers, 'list' | 'experimental'> {
  return {
    list: () => ({location, data: [...bundles().map(listing), ...others]}),
    experimental: ({id}) => {
      const bundle = bundles().find((candidate) => candidate.id === id) ?? missingBundle(id)
      return {
        location,
        data: {
          file: 'plugin-experimental.js',
          code: bundle.code,
          revision: bundle.id,
          options: {...bundle.options},
          chunks: [],
        },
      }
    },
  }
}

function aborted(signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) return new Promise(() => undefined)
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), {once: true}))
}

export function pluginUpdates(): {readonly event: Pick<EventHandlers, 'subscribe'>; readonly announce: () => void} {
  const announced = {count: 0, wake: Promise.withResolvers<void>()}
  return {
    announce: () => {
      announced.count += 1
      const woken = announced.wake
      announced.wake = Promise.withResolvers<void>()
      woken.resolve()
    },
    event: {
      subscribe: async function* (_input, call) {
        yield {id: crypto.randomUUID(), type: 'server.connected', data: {}}
        const seen = {count: announced.count}
        while (call.signal?.aborted !== true) {
          if (seen.count < announced.count) {
            seen.count += 1
            yield {id: crypto.randomUUID(), type: 'plugin.updated', data: {}}
            continue
          }
          await Promise.race([announced.wake.promise, aborted(call.signal)])
        }
      },
    },
  }
}
