import {initLogger, log, type DrainContext} from 'evlog'
import {createDrainPipeline} from 'evlog/pipeline'
import type {LogLevel} from '@conciv/types/config-types'
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

export function startWidgetLog(rpc: EngineClient, signal: AbortSignal): void {
  const drain = createDrainPipeline<DrainContext>({
    batch: BATCH,
    retry: {maxAttempts: 1},
    maxBufferSize: 200,
    onDropped: () => {},
  })(async (batch) => {
    await rpc.logs.write({events: readEvents(batch)}, {signal})
  })
  applyLevel('off', drain)
  const follow = async (): Promise<void> => {
    for await (const levels of await rpc.logs.level(undefined, {signal})) applyLevel(levels.widget, drain)
  }
  follow().catch((error: unknown) => {
    if (!signal.aborted)
      log.warn({action: 'widget log level', message: 'following the widget log level stopped', error})
  })
  signal.addEventListener('abort', () => applyLevel('off', drain), {once: true})
}
