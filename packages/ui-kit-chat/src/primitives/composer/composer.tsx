import {
  createEffect,
  createSignal,
  For,
  onMount,
  Show,
  splitProps,
  type JSX,
  type ParentProps,
  type ValidComponent,
} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {MultimodalContent} from '@tanstack/ai-client'
import {TextArea, type TextAreaProps} from '@conciv/ui-kit-system'
import {useChatContext, useComposer} from '../../store/chat-context.js'
import {Primitive} from '../util/primitive.js'
import {ComposerProvider, useComposerContext, type AttachmentDraft} from './composer-context.js'
import {AttachmentProvider} from '../attachment/attachment.js'
import {QueueItemProvider, type QueuedMessage} from '../queue-item/queue-item.js'
import {createActionButton, type ActionButtonState} from '../util/create-action-button.js'
import {useComposerHandlers} from './composer-handlers.js'
import {
  TriggerPopover,
  TriggerPopoverBack,
  TriggerPopoverCategories,
  TriggerPopoverCategoryItem,
  TriggerPopoverItem,
  TriggerPopoverItems,
  TriggerPopoverRoot,
  useTriggerPopoverRootOptional,
} from './trigger/trigger-popover.js'

type FormProps = JSX.HTMLAttributes<HTMLFormElement>

function buildContent(text: string, attachments: AttachmentDraft[]): string | MultimodalContent {
  if (attachments.length === 0) return text
  const parts = [...(text ? [{type: 'text', content: text} as const] : []), ...attachments.map((draft) => draft.part)]
  return {content: parts}
}

function Root(props: FormProps): JSX.Element {
  const chat = useChatContext()
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const [attachments, setAttachments] = createSignal<AttachmentDraft[]>([])
  const [quote, setQuote] = createSignal<string | null>(null)
  const [editing, setEditing] = createSignal(false)
  const [dictating, setDictating] = createSignal(false)
  const [local, rest] = splitProps(props, ['onSubmit'])
  const submit = (event: SubmitEvent & {currentTarget: HTMLFormElement; target: Element}) => {
    event.preventDefault()
    if (typeof local.onSubmit === 'function') local.onSubmit(event)
    if (!composer.canSend() && attachments().length === 0) return
    const text = chat.view.draft.trim()
    const content = buildContent(text, attachments())
    chat.setView('draft', '')
    setAttachments([])
    setQuote(null)

    if (handlers.onSend) handlers.onSend(text)
    else void chat.sendMessage(content)
  }
  return (
    <ComposerProvider
      value={{
        attachments,
        addAttachment: (draft) => setAttachments((prev) => [...prev, draft]),
        removeAttachment: (id) => setAttachments((prev) => prev.filter((draft) => draft.id !== id)),
        quote,
        setQuote,
        editing,
        setEditing,
        dictating,
        setDictating,
      }}
    >
      <Primitive.form onSubmit={submit} {...rest} />
    </ComposerProvider>
  )
}

type InputProps = TextAreaProps & {
  submitMode?: 'enter' | 'ctrlEnter' | 'none'
  cancelOnEscape?: boolean
  focusOnRunStart?: boolean
  focusOnThreadSwitched?: boolean
  addAttachmentOnPaste?: boolean
}

function Input(props: InputProps): JSX.Element {
  const chat = useChatContext()
  const composer = useComposer()
  const context = useComposerContext()
  const triggerRoot = useTriggerPopoverRootOptional()
  const [local, rest] = splitProps(props, [
    'submitMode',
    'cancelOnEscape',
    'focusOnRunStart',
    'focusOnThreadSwitched',
    'addAttachmentOnPaste',
    'onKeyDown',
    'onPaste',
    'ref',
  ])
  let element: HTMLTextAreaElement | undefined
  const forwardRef = local.ref
  const isRunning = () => chat.status() === 'streaming' || chat.status() === 'submitted'

  createEffect<boolean>((wasRunning) => {
    const running = isRunning()
    if (local.focusOnRunStart && running && !wasRunning) element?.focus()
    return running
  }, false)

  onMount(() => {
    if (local.focusOnThreadSwitched) element?.focus()
  })
  const openTrigger = () => triggerRoot?.triggers().find((scope) => scope.open())
  const syncCursor = (target: HTMLTextAreaElement) => {
    const triggers = triggerRoot?.triggers() ?? []
    for (const scope of triggers) scope.setCursorPosition(target.selectionStart ?? target.value.length)
  }
  const onKeyDown = (event: KeyboardEvent & {currentTarget: HTMLTextAreaElement; target: Element}) => {
    if (typeof local.onKeyDown === 'function') local.onKeyDown(event)
    if (openTrigger()?.handleKeyDown(event)) return
    const mode = local.submitMode ?? 'enter'
    if ((local.cancelOnEscape ?? true) && event.key === 'Escape' && composer.canCancel()) {
      event.preventDefault()
      composer.cancel()
      return
    }
    if (event.key !== 'Enter' || event.isComposing) return
    const wantsSubmit =
      mode === 'enter' ? !event.shiftKey : mode === 'ctrlEnter' ? event.ctrlKey || event.metaKey : false
    if (!wantsSubmit) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }
  const onPaste = async (event: ClipboardEvent & {currentTarget: HTMLTextAreaElement; target: Element}) => {
    if (typeof local.onPaste === 'function') local.onPaste(event)
    if (!local.addAttachmentOnPaste) return
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length > 0) event.preventDefault()
    for (const file of files) context.addAttachment(await fileToDraft(file))
  }
  return (
    <TextArea
      ref={(node) => {
        element = node
        if (typeof forwardRef === 'function') forwardRef(node)
      }}
      value={composer.text()}
      onInput={(event) => {
        composer.setText(event.currentTarget.value)
        syncCursor(event.currentTarget)
      }}
      onKeyUp={(event) => syncCursor(event.currentTarget)}
      onClick={(event) => syncCursor(event.currentTarget)}
      onKeyDown={onKeyDown}
      onPaste={(event) => void onPaste(event)}
      aria-haspopup={triggerRoot?.activeAria() ? 'listbox' : undefined}
      aria-expanded={triggerRoot?.activeAria() ? true : undefined}
      aria-controls={triggerRoot?.activeAria()?.popoverId}
      aria-activedescendant={triggerRoot?.activeAria()?.highlightedItemId}
      {...rest}
    />
  )
}

function Send(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const composer = useComposer()
  const context = useComposerContext()
  const [local, rest] = splitProps(props, ['disabled'])
  return (
    <button
      type="submit"
      disabled={local.disabled || (!composer.canSend() && context.attachments().length === 0)}
      {...rest}
    />
  )
}

function Cancel(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const composer = useComposer()
  return (
    <Show when={composer.canCancel()}>
      <button type="button" aria-label="Stop" onClick={() => composer.cancel()} {...props} />
    </Show>
  )
}

type AddAttachmentProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {multiple?: boolean; accept?: string}

function fileToDraft(file: File): Promise<AttachmentDraft> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? (reader.result.split(',')[1] ?? '') : ''
      resolve({
        id: `${file.name}-${file.size}`,
        name: file.name,
        part: {type: 'image', source: {type: 'data', value: result, mimeType: file.type || 'image/png'}},
      })
    })
    reader.readAsDataURL(file)
  })
}

function AddAttachment(props: AddAttachmentProps): JSX.Element {
  const context = useComposerContext()
  const [local, rest] = splitProps(props, ['multiple', 'accept'])
  let input: HTMLInputElement | undefined
  const onPick = async (event: Event & {currentTarget: HTMLInputElement}) => {
    const files = Array.from(event.currentTarget.files ?? [])
    for (const file of files) context.addAttachment(await fileToDraft(file))
    event.currentTarget.value = ''
  }
  return (
    <>
      <input
        ref={(node) => {
          input = node
        }}
        type="file"
        class="sr-only"
        multiple={local.multiple}
        accept={local.accept ?? 'image/*'}
        onChange={(event) => void onPick(event)}
      />
      <button type="button" aria-label="Add attachment" onClick={() => input?.click()} {...rest} />
    </>
  )
}

type AttachmentsProps = {component?: ValidComponent}

function Attachments(props: AttachmentsProps): JSX.Element {
  const context = useComposerContext()
  return (
    <For each={context.attachments()}>
      {(draft) => (
        <AttachmentProvider value={draft}>
          <Show when={props.component} fallback={<span data-attachment>{draft.name}</span>}>
            {(component) => <Dynamic component={component()} />}
          </Show>
        </AttachmentProvider>
      )}
    </For>
  )
}

type DropzoneProps = JSX.HTMLAttributes<HTMLDivElement> & {disabled?: boolean}

function AttachmentDropzone(props: DropzoneProps): JSX.Element {
  const context = useComposerContext()
  const [dragging, setDragging] = createSignal(false)
  const [local, rest] = splitProps(props, ['disabled', 'onDrop', 'onDragOver', 'onDragLeave'])
  const onDrop = async (event: DragEvent & {currentTarget: HTMLDivElement}) => {
    event.preventDefault()
    setDragging(false)
    if (local.disabled) return
    const files = Array.from(event.dataTransfer?.files ?? [])
    for (const file of files) context.addAttachment(await fileToDraft(file))
  }
  return (
    <Primitive.div
      data-dragging={dragging() ? '' : undefined}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => void onDrop(event)}
      {...rest}
    />
  )
}

function If(props: ParentProps<{editing?: boolean; dictation?: boolean}>): JSX.Element {
  const context = useComposerContext()
  const matches = () => {
    const checks: boolean[] = []
    if (props.editing !== undefined) checks.push(context.editing() === props.editing)
    if (props.dictation !== undefined) checks.push(context.dictating() === props.dictation)
    return checks.every(Boolean)
  }
  return <Show when={matches()}>{props.children}</Show>
}

function Quote(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const context = useComposerContext()
  return (
    <Show when={context.quote()}>{(text) => <Primitive.div {...props}>{props.children ?? text()}</Primitive.div>}</Show>
  )
}

function QuoteDismiss(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const context = useComposerContext()
  return (
    <Show when={context.quote()}>
      <button type="button" aria-label="Dismiss quote" onClick={() => context.setQuote(null)} {...props} />
    </Show>
  )
}

const Dictate = createActionButton('Dictate', () => {
  const context = useComposerContext()
  const handlers = useComposerHandlers()
  return (): ActionButtonState | null =>
    handlers.onStartDictation
      ? {
          run: () => {
            context.setDictating(true)
            handlers.onStartDictation?.()
          },
        }
      : null
})

const StopDictation = createActionButton('Stop dictation', () => {
  const context = useComposerContext()
  const handlers = useComposerHandlers()
  return (): ActionButtonState | null =>
    context.dictating()
      ? {
          run: () => {
            context.setDictating(false)
            handlers.onStopDictation?.()
          },
        }
      : null
})

function DictationTranscript(props: JSX.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  const handlers = useComposerHandlers()
  return (
    <Show when={handlers.transcript}>
      {(transcript) => <Primitive.span {...props}>{transcript()()}</Primitive.span>}
    </Show>
  )
}

function Queue(props: {children: (item: () => QueuedMessage) => JSX.Element}): JSX.Element {
  const handlers = useComposerHandlers()
  return (
    <For each={handlers.queue?.() ?? []}>
      {(item) => <QueueItemProvider value={item}>{props.children(() => item)}</QueueItemProvider>}
    </For>
  )
}

export const Composer = Object.assign(Root, {
  Root,
  Input,
  Send,
  Cancel,
  AddAttachment,
  Attachments,
  AttachmentDropzone,
  If,
  Quote,
  QuoteDismiss,
  Dictate,
  StopDictation,
  DictationTranscript,
  TriggerPopoverRoot,
  TriggerPopover,
  TriggerPopoverCategories,
  TriggerPopoverCategoryItem,
  TriggerPopoverItems,
  TriggerPopoverItem,
  TriggerPopoverBack,
  Queue,
})
