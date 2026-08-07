import {splitProps, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {ComposerPrimitive} from '@conciv/ui-kit-chat'

export type SelectionOffsets = {start: number; end: number}

export type ComposerInputHandle = {
  focus: () => void
  selection: () => SelectionOffsets
}

export type ComposerInputAdapterProps = {
  placeholder: string
  inputLabel: string
  class?: string
  addAttachmentOnPaste?: boolean
  onReady?: (handle: ComposerInputHandle) => void
  onSelectionChange?: (offsets: SelectionOffsets) => void
}

function elementSelection(element: HTMLTextAreaElement): SelectionOffsets {
  return {start: element.selectionStart, end: element.selectionEnd}
}

export function ComposerInputAdapter(props: ComposerInputAdapterProps): JSX.Element {
  const [local, rest] = splitProps(props, ['onReady', 'onSelectionChange', 'inputLabel'])
  const bind = (element: HTMLTextAreaElement) => {
    const report = () => local.onSelectionChange?.(elementSelection(element))
    makeEventListener(element, 'input', report)
    makeEventListener(element, 'select', report)
    makeEventListener(element, 'keyup', report)
    makeEventListener(element, 'click', report)
    makeEventListener(element, 'focus', report)
    local.onReady?.({
      focus: () => element.focus(),
      selection: () => elementSelection(element),
    })
  }
  return <ComposerPrimitive.Input unstyled ref={bind} aria-label={local.inputLabel} {...rest} />
}
