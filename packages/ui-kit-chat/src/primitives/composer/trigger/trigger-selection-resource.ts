import type {Accessor} from 'solid-js'
import type {DetectedTrigger} from './trigger-detection-resource.js'
import type {SelectItemOverride, TriggerBehavior, TriggerItem} from './types.js'

export type TriggerSelectionResource = {
  selectItem(item: TriggerItem): void
  close(): void
  registerSelectItemOverride(fn: SelectItemOverride): () => void
}

export function createTriggerSelectionResource(options: {
  behavior: () => TriggerBehavior | undefined
  trigger: Accessor<DetectedTrigger | null>
  triggerChar: string
  text: Accessor<string>
  setText(value: string): void
  setCursorPosition(position: number): void
  onSelected(): void
}): TriggerSelectionResource {
  let selectItemOverride: SelectItemOverride | null = null

  const registerSelectItemOverride = (fn: SelectItemOverride) => {
    selectItemOverride = fn
    return () => {
      if (selectItemOverride === fn) selectItemOverride = null
    }
  }

  const selectItem = (item: TriggerItem) => {
    const trigger = options.trigger()
    const behavior = options.behavior()
    if (!trigger || !behavior) return

    if (selectItemOverride?.(item)) {
      options.onSelected()
      return
    }

    const currentText = options.text()
    const before = currentText.slice(0, trigger.offset)
    const after = currentText.slice(trigger.offset + options.triggerChar.length + trigger.query.length)

    const insertDirective = () => {
      const directive = behavior.formatter.serialize(item)
      options.setText(before + directive + (after.startsWith(' ') ? after : ` ${after}`))
      options.setCursorPosition(before.length + directive.length + 1)
    }

    if (behavior.kind === 'directive') {
      insertDirective()
      behavior.onInserted?.(item)
      options.onSelected()
      return
    }

    if (behavior.removeOnExecute) {
      options.setText(before + (after.startsWith(' ') ? after.slice(1) : after))
      options.setCursorPosition(before.length)
    }
    if (!behavior.removeOnExecute) insertDirective()
    behavior.onExecute(item)
    options.onSelected()
  }

  const close = () => {
    options.onSelected()
    const trigger = options.trigger()
    if (trigger) options.setCursorPosition(trigger.offset)
  }

  return {selectItem, close, registerSelectItemOverride}
}
