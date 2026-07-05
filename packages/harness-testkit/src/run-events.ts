import {EventType, type StreamChunk} from '@tanstack/ai'
import {CONCIV_UI_EVENT, parseUiSpec, type UiSpec} from '@conciv/protocol/ui-types'

export type RunEvents = {
  all: StreamChunk[]
  text: () => string
  uiSpecs: () => UiSpec[]
  errors: () => string[]
  runs: () => number
}

export function makeRunEvents(all: StreamChunk[]): RunEvents {
  return {
    all,
    text: () =>
      all.flatMap((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta ?? ''] : [])).join(''),
    uiSpecs: () =>
      all.flatMap((chunk) => {
        if (chunk.type !== EventType.CUSTOM || chunk.name !== CONCIV_UI_EVENT) return []
        const spec = parseUiSpec(chunk.value)
        return spec ? [spec] : []
      }),
    errors: () => all.flatMap((chunk) => (chunk.type === EventType.RUN_ERROR ? [chunk.message] : [])),
    runs: () => all.filter((chunk) => chunk.type === EventType.RUN_FINISHED).length,
  }
}
