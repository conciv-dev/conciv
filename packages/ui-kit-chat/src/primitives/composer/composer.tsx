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
import {ComposerProvider, useComposerContext} from './composer-context.js'
import {AttachmentProvider} from '../attachment/attachment.js'
import {
  fileMatchesAccept,
  isCompleteAttachment,
  type Attachment,
  type AttachmentAdapter,
  type PendingAttachment,
} from '../attachment/attachment-adapter.js'
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

type FormProps = JSX.HTMLAttributes<HTMLFormElement> & {attachmentAdapter?: AttachmentAdapter}

type SubmitEvent = globalThis.SubmitEvent & {currentTarget: HTMLFormElement; target: Element}

function buildContent(text: string, attachments: Attachment[]): string | MultimodalContent {
  if (attachments.length === 0) return text
  const parts = [
    ...(text ? [{type: 'text', content: text} as const] : []),
    ...attachments.flatMap((attachment) => (isCompleteAttachment(attachment) ? attachment.content : [])),
  ]
  return {content: parts}
}

function invokeSubmit(handler: FormProps['onSubmit'], event: SubmitEvent): void {
  if (typeof handler === 'function') handler(event)
}

function canSubmit(canSend: boolean, attachmentCount: number, unavailable: boolean): boolean {
  return !unavailable && (canSend || attachmentCount > 0)
}

function sendContent(
  handler: ((content: string | MultimodalContent) => void) | undefined,
  fallback: (content: string | MultimodalContent) => unknown,
  content: string | MultimodalContent,
): void {
  if (handler) handler(content)
  else void fallback(content)
}

function isAsyncGenerator(
  value: Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void>,
): value is AsyncGenerator<PendingAttachment, void> {
  return Symbol.asyncIterator in value
}

function requireAttachmentAdapter(adapter: AttachmentAdapter | undefined): AttachmentAdapter {
  if (!adapter) throw new Error('Attachments are not supported')
  return adapter
}

function assertAcceptedFile(file: File, adapter: AttachmentAdapter): void {
  if (fileMatchesAccept(file, adapter.accept)) return
  throw new Error(`File type ${file.type || 'unknown'} is not accepted. Accepted types: ${adapter.accept}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function failedAttachment(attachment: PendingAttachment, error: unknown): PendingAttachment {
  return {...attachment, status: {type: 'incomplete', reason: 'error', message: errorMessage(error)}}
}

async function consumeAddedAttachments(
  pending: Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void>,
  update: (attachment: PendingAttachment) => void,
): Promise<void> {
  if (!isAsyncGenerator(pending)) {
    update(await pending)
    return
  }
  for await (const attachment of pending) update(attachment)
}

async function addAdapterAttachment(
  adapter: AttachmentAdapter,
  file: File,
  upsert: (attachment: PendingAttachment) => void,
): Promise<string | undefined> {
  let latest: PendingAttachment | undefined
  const update = (attachment: PendingAttachment) => {
    latest = attachment
    upsert(attachment)
  }
  try {
    await consumeAddedAttachments(adapter.add({file}), update)
  } catch (error) {
    if (latest) upsert(failedAttachment(latest, error))
    throw error
  }
  return latest?.id
}

function requireAttachment(attachments: Attachment[], id: string): Attachment {
  const attachment = attachments.find((value) => value.id === id)
  if (!attachment) throw new Error('Attachment not found')
  return attachment
}

async function removeAdapterAttachment(adapter: AttachmentAdapter | undefined, attachment: Attachment): Promise<void> {
  if (!adapter && isCompleteAttachment(attachment)) return
  await requireAttachmentAdapter(adapter).remove(attachment)
}

function Root(props: FormProps): JSX.Element {
  const chat = useChatContext()
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const [attachments, setAttachments] = createSignal<Attachment[]>([])
  const [sendingAttachments, setSendingAttachments] = createSignal(false)
  const [quote, setQuote] = createSignal<string | null>(null)
  const [editing, setEditing] = createSignal(false)
  const [dictating, setDictating] = createSignal(false)
  const [local, rest] = splitProps(props, ['onSubmit', 'attachmentAdapter'])
  const removedIds = new Set<string>()
  const attachmentAdapter = () => local.attachmentAdapter
  const upsertAttachment = (attachment: PendingAttachment) => {
    if (removedIds.has(attachment.id)) return
    setAttachments((current) => {
      const index = current.findIndex((value) => value.id === attachment.id)
      if (index < 0) return [...current, attachment]
      return current.toSpliced(index, 1, attachment)
    })
  }
  const addAttachment = async (file: File) => {
    const adapter = requireAttachmentAdapter(attachmentAdapter())
    assertAcceptedFile(file, adapter)
    const id = await addAdapterAttachment(adapter, file, upsertAttachment)
    if (id) removedIds.delete(id)
  }
  const removeAttachment = async (id: string) => {
    const attachment = requireAttachment(attachments(), id)
    removedIds.add(id)
    try {
      await removeAdapterAttachment(attachmentAdapter(), attachment)
    } catch (error) {
      removedIds.delete(id)
      throw error
    }
    setAttachments((current) => current.filter((value) => value.id !== id))
  }
  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    invokeSubmit(local.onSubmit, event)
    const isRunning = chat.status() === 'streaming' || chat.status() === 'submitted'
    if (!canSubmit(composer.canSend(), attachments().length, isRunning || sendingAttachments())) return
    const originalDraft = chat.view.draft
    const originalAttachments = attachments()
    const originalQuote = quote()
    const adapter = attachmentAdapter()
    setSendingAttachments(true)
    chat.setView('draft', '')
    setAttachments([])
    setQuote(null)
    try {
      const completeAttachments = await Promise.all(
        originalAttachments.map(async (attachment) => {
          if (isCompleteAttachment(attachment)) return attachment
          if (!adapter) throw new Error('Attachments are not supported')
          return adapter.send(attachment)
        }),
      )
      sendContent(
        handlers.onSend,
        (content) => chat.sendMessage(content),
        buildContent(originalDraft.trim(), completeAttachments),
      )
    } catch (error) {
      const restored = originalAttachments.map((attachment) =>
        isCompleteAttachment(attachment) ? attachment : failedAttachment(attachment, error),
      )
      setAttachments((current) => {
        const currentIds = new Set(current.map((value) => value.id))
        return [...current, ...restored.filter((value) => !currentIds.has(value.id))]
      })
      if (chat.view.draft === '' && quote() === null) {
        chat.setView('draft', originalDraft)
        setQuote(originalQuote)
      }
    } finally {
      setSendingAttachments(false)
    }
  }
  return (
    <ComposerProvider
      value={{
        attachments,
        attachmentAdapter,
        addAttachment,
        removeAttachment,
        sendingAttachments,
        quote,
        setQuote,
        editing,
        setEditing,
        dictating,
        setDictating,
      }}
    >
      <Primitive.form onSubmit={(event) => void submit(event)} {...rest} />
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
  const handlers = useComposerHandlers()
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
  const openTrigger = () => triggerRoot?.triggers().find((trigger) => trigger.scope.open())
  let composing = false
  let lastCursorPosition = -1
  const syncCursor = (target: HTMLTextAreaElement) => {
    if (composing) return
    const position = target.selectionStart ?? target.value.length
    if (position === lastCursorPosition) return
    lastCursorPosition = position
    const triggers = triggerRoot?.triggers() ?? []
    for (const trigger of triggers) trigger.scope.setCursorPosition(position)
  }
  const cancelViaHandlers = () => (handlers.onCancel ? handlers.onCancel() : composer.cancel())
  const onKeyDown = (event: KeyboardEvent & {currentTarget: HTMLTextAreaElement; target: Element}) => {
    if (typeof local.onKeyDown === 'function') local.onKeyDown(event)
    if (event.isComposing) return
    if (openTrigger()?.scope.handleKeyDown(event)) return
    const mode = local.submitMode ?? 'enter'
    if ((local.cancelOnEscape ?? true) && event.key === 'Escape' && composer.canCancel()) {
      event.preventDefault()
      cancelViaHandlers()
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
    await Promise.allSettled(files.map((file) => context.addAttachment(file)))
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
      onCompositionStart={() => {
        composing = true
      }}
      onCompositionEnd={(event) => {
        composing = false
        syncCursor(event.currentTarget)
      }}
      onSelect={(event) => syncCursor(event.currentTarget)}
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
      disabled={
        local.disabled || context.sendingAttachments() || (!composer.canSend() && context.attachments().length === 0)
      }
      {...rest}
    />
  )
}

function Cancel(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const cancel = () => (handlers.onCancel ? handlers.onCancel() : composer.cancel())
  return (
    <Show when={composer.canCancel()}>
      <button type="button" aria-label="Stop" onClick={cancel} {...props} />
    </Show>
  )
}

type AddAttachmentProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {multiple?: boolean; accept?: string}

function attachmentMultiple(value: boolean | undefined): boolean {
  return value ?? true
}

function attachmentAccept(value: string | undefined, adapter: AttachmentAdapter | undefined): string | undefined {
  return value ?? adapter?.accept
}

function attachmentDisabled(value: boolean | undefined, adapter: AttachmentAdapter | undefined): boolean {
  return Boolean(value) || adapter === undefined
}

function AddAttachment(props: AddAttachmentProps): JSX.Element {
  const context = useComposerContext()
  const [local, rest] = splitProps(props, ['multiple', 'accept', 'disabled'])
  let input: HTMLInputElement | undefined
  const onPick = async (event: Event & {currentTarget: HTMLInputElement}) => {
    const inputElement = event.currentTarget
    const files = Array.from(inputElement.files ?? [])
    await Promise.allSettled(files.map((file) => context.addAttachment(file)))
    inputElement.value = ''
  }
  return (
    <>
      <input
        ref={(node) => {
          input = node
        }}
        type="file"
        class="sr-only"
        multiple={attachmentMultiple(local.multiple)}
        accept={attachmentAccept(local.accept, context.attachmentAdapter())}
        onChange={(event) => void onPick(event)}
      />
      <button
        type="button"
        aria-label="Add attachment"
        disabled={attachmentDisabled(local.disabled, context.attachmentAdapter())}
        onClick={() => input?.click()}
        {...rest}
      />
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
    await Promise.allSettled(files.map((file) => context.addAttachment(file)))
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
