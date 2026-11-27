import {initLogger, log, type DrainContext} from 'evlog'
import {createDrainPipeline} from 'evlog/pipeline'
import type {LogLevel} from '@conciv/types/config-types'
import type {EngineConnection} from '../connection/engine-connection.js'
import type {EngineClient} from '../connection/rpc-client.js'

const BATCH = {size: 25, intervalMs: 2000}

function readEvents(batch: readonly DrainContext[]) {
  return batch.map(({event}) => {
    const {level, timestamp, service, ...fields} = event
    return {level, timestamp, service, fields}
  })
}

function applyLevel(level: LogLevel, drain: (context: DrainContext) => void): void {
  initLogger({
    enabled: level !== 'off',
    ...(level === 'off' ? {} : {minLevel: level}),
    env: {service: 'conciv-widget'},
    pretty: false,
    silent: true,
    redact: true,
    drain,
  })
}

function followLevels(rpc: EngineClient, drain: (context: DrainContext) => void, signal: AbortSignal): Promise<void> {
  return rpc.logs.level(undefined, {signal}).then(async (levels) => {
    for await (const current of levels) applyLevel(current.widget, drain)
  })
}

export function startWidgetLog(rpc: EngineClient, connection: EngineConnection | undefined, signal: AbortSignal): void {
  const drain = createDrainPipeline<DrainContext>({
    batch: BATCH,
    retry: {maxAttempts: 1},
    maxBufferSize: 200,
    onDropped: () => {},
  })(async (batch) => {
    await rpc.logs.write({events: readEvents(batch)}, {signal})
  })
  applyLevel('off', drain)
  const live: {following: AbortController | undefined} = {following: undefined}
  const stopFollowing = (): void => {
    live.following?.abort()
    live.following = undefined
  }
  const follow = (): void => {
    if (live.following !== undefined || signal.aborted) return
    const following = new AbortController()
    live.following = following
    followLevels(rpc, drain, AbortSignal.any([signal, following.signal]))
      .catch((error: unknown) => {
        if (!following.signal.aborted && !signal.aborted)
          log.warn({action: 'widget log level', message: 'following the widget log level stopped', error})
      })
      .finally(() => {
        if (live.following === following) live.following = undefined
      })
  }
  follow()
  const unsubscribe = connection?.subscribeReachability((reachable) => (reachable ? follow() : stopFollowing()))
  signal.addEventListener(
    'abort',
    () => {
      unsubscribe?.()
      stopFollowing()
      applyLevel('off', drain)
    },
    {once: true},
  )
}
