import {EventPublisher} from '@orpc/server'

type EngineEvent = {
  readonly id: string
  readonly type: string
  readonly created: number
  readonly data: Record<string, unknown>
  readonly location: {readonly directory: string}
}

export type Publish = (type: string, data: Record<string, unknown>) => void

export function createEvents(directory: string) {
  const publisher = new EventPublisher<{event: EngineEvent}>()
  const publish: Publish = (type, data) =>
    publisher.publish('event', {id: crypto.randomUUID(), type, created: Date.now(), data, location: {directory}})
  async function* subscribe(types: readonly string[] | undefined, signal: AbortSignal | undefined) {
    yield {id: crypto.randomUUID(), type: 'server.connected', data: {}}
    for await (const event of publisher.subscribe('event', {signal})) {
      if (types === undefined || types.includes(event.type)) yield event
    }
  }
  return {publish, subscribe}
}
