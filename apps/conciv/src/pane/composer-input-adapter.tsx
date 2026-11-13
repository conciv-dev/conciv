import {createMemo, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {useComposer, useComposerContext, useComposerHandlers} from '@conciv/ui-kit-chat'
import {RichTextField, type RichTextFieldTriggerSource} from '@conciv/ui-kit-tap'

export type SelectionOffsets = {start: number; end: number}

export type ComposerInputHandle = {
  focus: () => void
  append: (text: string) => void
  select: (offsets: SelectionOffsets) => void
}

export type ComposerTriggerSources = {
  slash: RichTextFieldTriggerSource
  mention: RichTextFieldTriggerSource
}

export type ComposerInputAdapterProps = {
  placeholder: string
  inputLabel: string
  editableClass?: string
  addAttachmentOnPaste?: boolean
  triggers?: ComposerTriggerSources
  onReady?: (handle: ComposerInputHandle) => void
  onSelectionChange?: (offsets: SelectionOffsets) => void
}

export function ComposerInputAdapter(props: ComposerInputAdapterProps): JSX.Element {
  const composer = useComposer()
  const context = useComposerContext()
  const handlers = useComposerHandlers()
  let wrapper: HTMLDivElement | undefined
  const submit = () => wrapper?.closest('form')?.requestSubmit()
  const stoppingPeriod = createMemo(() => (composer.isStopping() ? {escapeIgnored: false} : undefined))
  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const period = stoppingPeriod()
    if (period && !period.escapeIgnored) {
      period.escapeIgnored = true
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!composer.canCancel()) return
    event.preventDefault()
    event.stopPropagation()
    if (handlers.onCancel) {
      handlers.onCancel()
      return
    }
    composer.cancel()
  }
  const consumeFilePaste = (event: ClipboardEvent): boolean => {
    if (!props.addAttachmentOnPaste) return false
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length === 0) return false
    void Promise.allSettled(files.map((file) => context.addAttachment(file)))
    return true
  }
  const removeLastAttachment = (): boolean => {
    const last = context.attachments().at(-1)
    if (!last) return false
    context.removeAttachment(last.id).catch((error: unknown) => {
      console.error('[conciv] could not remove the attachment', error)
    })
    return true
  }
  const bind = (element: HTMLDivElement) => {
    wrapper = element
    makeEventListener(element, 'keydown', cancelOnEscape)
  }
  return (
    <div class="contents" ref={bind}>
      <RichTextField
        class="grow basis-16"
        value={composer.text()}
        onValueChange={composer.setText}
        onSubmit={submit}
        onSelectionChange={props.onSelectionChange}
        placeholder={props.placeholder}
        label={props.inputLabel}
        editableClass={props.editableClass}
        onPaste={consumeFilePaste}
        onBackspaceAtStart={removeLastAttachment}
        slashTrigger={props.triggers?.slash}
        mentionTrigger={props.triggers?.mention}
        onReady={(handle) => {
          props.onReady?.({
            focus: () => handle.focus(),
            append: (text) => handle.appendText(composer.text() === '' ? text : `\n${text}`),
            select: (offsets) => handle.select(offsets),
          })
        }}
      />
    </div>
  )
}
