import {createMemo, createSignal, type Accessor} from 'solid-js'
import {detectTrigger} from './detect-trigger.js'

export type DetectedTrigger = {
  readonly offset: number
  readonly query: string
}

export type TriggerDetectionResource = {
  trigger: Accessor<DetectedTrigger | null>
  query: Accessor<string>
  setCursorPosition(position: number): void
}

export function createTriggerDetectionResource(options: {
  text: Accessor<string>
  triggerChar: string
}): TriggerDetectionResource {
  const [cursorPosition, setCursorPosition] = createSignal(options.text().length)

  const trigger = createMemo(() => {
    const position = Math.min(cursorPosition(), options.text().length)
    return detectTrigger(options.text(), options.triggerChar, position)
  })

  const query = () => trigger()?.query ?? ''

  return {trigger, query, setCursorPosition}
}
