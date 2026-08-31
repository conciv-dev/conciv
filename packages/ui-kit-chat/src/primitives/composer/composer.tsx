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
import {createStore} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import type {MultimodalContent} from '@tanstack/ai-client'
import {TextArea, type TextAreaProps} from '@conciv/ui-kit-system'
import type {WebStorage} from '@conciv/storage-history'
import {useChatContext, useComposer} from '../../store/chat-context.js'
import {readComposerDraft} from '../../behaviors/composer-draft-storage.js'
import {useComposerDraftPersistence} from '../../behaviors/use-composer-draft.js'
import {Primitive} from '../util/primitive.js'
import {ComposerProvider, useComposerContext, type ComposerDraft} from './composer-context.js'
import {AttachmentProvider} from '../attachment/attachment.js'
import {
  fileMatchesAccept,
  isCompleteAttachment,
  type Attachment,
  type AttachmentAdapter,
  type CompleteAttachment,
  type PendingAttachment,
} from '../attachment/attachment-adapter.js'
import {QueueItemProvider, type QueuedMessage} from '../queue-item/queue-item.js'
import {createActionButton, type ActionButtonState} from '../util/create-action-button.js'
import {useComposerHandlers} from './composer-handlers.js'
import {useSendFromUser} from '../thread/viewport-context.js'

type FormProps = JSX.HTMLAttributes<HTMLFormElement> & {
  attachmentAdapter?: AttachmentAdapter
  draftStorage?: WebStorage
  draftKey?: string
}

type ComposerState = {
  attachments: Attachment[]
  quote: string | null
  editing: boolean
  dictating: boolean
  sendingAttachments: boolean
}

const DEFAULT_DRAFT_KEY = 'conciv-composer-draft'

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

async function sendContent(
  handler: ((content: string | MultimodalContent) => void | Promise<unknown>) | undefined,
  fallback: (content: string | MultimodalContent) => Promise<unknown>,
  content: string | MultimodalContent,
): Promise<void> {
  if (handler) await handler(content)
  else await fallback(content)
}

function sendFailure(error: unknown): unknown {
  return error ?? new Error('The message could not be sent')
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

function restoredAttachments(attachments: Attachment[], error: unknown): Attachment[] {
  return attachments.map((attachment) =>
    isCompleteAttachment(attachment) ? attachment : failedAttachment(attachment, error),
  )
}

async function completeAll(
  adapter: AttachmentAdapter | undefined,
  attachments: Attachment[],
): Promise<CompleteAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (isCompleteAttachment(attachment)) return attachment
      return requireAttachmentAdapter(adapter).send(attachment)
    }),
  )
}

function pastedFiles(event: ClipboardEvent): File[] {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (files.length > 0) event.preventDefault()
  return files
}

async function addPastedFiles(
  event: ClipboardEvent,
  enabled: boolean | undefined,
  add: (file: File) => Promise<unknown>,
): Promise<void> {
  if (!enabled) return
  await Promise.allSettled(pastedFiles(event).map((file) => add(file)))
}

function Root(props: FormProps): JSX.Element {
  const chat = useChatContext()
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const [state, setState] = createStore<ComposerState>({
    attachments: [],
    quote: null,
    editing: false,
    dictating: false,
    sendingAttachments: false,
  })
  const [local, rest] = splitProps(props, ['onSubmit', 'attachmentAdapter', 'draftStorage', 'draftKey'])
  const sendFromUser = useSendFromUser()
  const removedIds = new Set<string>()
  const attachmentAdapter = () => local.attachmentAdapter
  const attachments = () => state.attachments
  const draftKey = () => local.draftKey ?? DEFAULT_DRAFT_KEY
  const upsertAttachment = (attachment: PendingAttachment) => {
    if (removedIds.has(attachment.id)) return
    setState('attachments', (current) => {
      const index = current.findIndex((value) => value.id === attachment.id)
      if (index < 0) return [...current, attachment]
      return current.toSpliced(index, 1, attachment)
    })
  }
  const addAttachment = async (file: File): Promise<string | null> => {
    const adapter = requireAttachmentAdapter(attachmentAdapter())
    assertAcceptedFile(file, adapter)
    const id = await addAdapterAttachment(adapter, file, upsertAttachment)
    if (id) removedIds.delete(id)
    return id ?? null
  }
  const hasAttachment = (id: string): boolean => attachments().some((entry) => entry.id === id)
  const replaceAttachment = async (id: string, file: File): Promise<string | null> => {
    if (!hasAttachment(id)) return null
    const adapter = requireAttachmentAdapter(attachmentAdapter())
    assertAcceptedFile(file, adapter)
    const staged: PendingAttachment[] = []
    const collect = (attachment: PendingAttachment): void => {
      const index = staged.findIndex((entry) => entry.id === attachment.id)
      if (index < 0) staged.push(attachment)
      if (index >= 0) staged.splice(index, 1, attachment)
    }
    const added = await addAdapterAttachment(adapter, file, collect).catch(async (error: unknown) => {
      const orphan = staged.at(-1)
      if (orphan) await removeAdapterAttachment(adapter, orphan).catch(() => {})
      throw error
    })
    const replacement = staged.find((entry) => entry.id === added)
    if (!added || !replacement) return null
    const displaced = attachments().find((entry) => entry.id === id)
    if (!displaced) {
      await removeAdapterAttachment(adapter, replacement).catch(() => {})
      return null
    }
    setState('attachments', (current) => {
      const position = current.findIndex((entry) => entry.id === id)
      if (position < 0) return current
      return current.toSpliced(position, 1, replacement)
    })
    removedIds.add(id)
    await removeAdapterAttachment(adapter, displaced).catch(() => {})
    return added
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
    setState('attachments', (current) => current.filter((value) => value.id !== id))
  }
  const snapshotDraft = (): ComposerDraft => ({
    draft: chat.view.draft,
    attachments: [...state.attachments],
    quote: state.quote,
  })
  const restoreDraft = (original: ComposerDraft) => {
    setState('attachments', (current) => {
      const currentIds = new Set(current.map((value) => value.id))
      return [...current, ...original.attachments.filter((value) => !currentIds.has(value.id))]
    })
    if (chat.view.draft !== '' || state.quote !== null) return
    chat.setView('draft', original.draft)
    setState({quote: original.quote})
  }
  const clearDraft = () => {
    chat.setView('draft', '')
    setState({attachments: [], quote: null})
  }
  onMount(() => {
    const storage = local.draftStorage
    const restored = storage ? readComposerDraft(storage, draftKey()) : null
    if (!restored) return
    chat.setView('draft', restored.draft)
    setState({attachments: restored.attachments, quote: restored.quote})
  })
  useComposerDraftPersistence({storage: () => local.draftStorage, key: draftKey, draft: snapshotDraft})
  const markSendFailed = (error: unknown) => {
    setState('attachments', (current) => restoredAttachments(current, error))
  }
  const completedContent = async (original: ComposerDraft): Promise<string | MultimodalContent | null> => {
    try {
      const complete = await completeAll(attachmentAdapter(), original.attachments)
      return buildContent(original.draft.trim(), complete)
    } catch (error) {
      markSendFailed(error)
      return null
    } finally {
      setState('sendingAttachments', false)
    }
  }
  const runSend = async (content: string | MultimodalContent): Promise<unknown> => {
    const before = chat.error()
    try {
      await sendContent(handlers.onSend, (value) => chat.sendMessage(value), content)
    } catch (error) {
      return sendFailure(error)
    }
    const after = chat.error()
    return after === before ? undefined : after
  }
  const deliverDraft = async (): Promise<void> => {
    const original = snapshotDraft()
    setState('sendingAttachments', true)
    const content = await completedContent(original)
    if (content === null) return
    clearDraft()
    const failure = await runSend(content)
    if (!failure) return
    restoreDraft(original)
    handlers.onSendError?.(failure)
  }
  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    invokeSubmit(local.onSubmit, event)
    if (!canSubmit(composer.canSend(), state.attachments.length, state.sendingAttachments)) return
    await sendFromUser(deliverDraft)
  }
  return (
    <ComposerProvider
      value={{
        attachments,
        attachmentAdapter,
        addAttachment,
        hasAttachment,
        replaceAttachment,
        removeAttachment,
        sendingAttachments: () => state.sendingAttachments,
        snapshotDraft,
        restoreDraft,
        clearDraft,
        quote: () => state.quote,
        setQuote: (value) => setState('quote', value),
        editing: () => state.editing,
        setEditing: (value) => setState('editing', value),
        dictating: () => state.dictating,
        setDictating: (value) => setState('dictating', value),
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

type ComposerKeyboardEvent = KeyboardEvent & {currentTarget: HTMLTextAreaElement; target: Element}

function forwardKeyDown(event: ComposerKeyboardEvent, handler: InputProps['onKeyDown']): void {
  if (typeof handler === 'function') handler(event)
}

function shouldCancelOnEscape(event: ComposerKeyboardEvent, cancelOnEscape: boolean, canCancel: boolean): boolean {
  return cancelOnEscape && event.key === 'Escape' && canCancel
}

function wantsEnterSubmit(event: ComposerKeyboardEvent, mode: 'enter' | 'ctrlEnter' | 'none'): boolean {
  if (mode === 'enter') return !event.shiftKey
  if (mode === 'ctrlEnter') return event.ctrlKey || event.metaKey
  return false
}

function Input(props: InputProps): JSX.Element {
  const chat = useChatContext()
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const context = useComposerContext()
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
  const isRunning = () => chat.status() === 'streaming' || chat.status() === 'submitted'

  createEffect<boolean>((wasRunning) => {
    const running = isRunning()
    if (local.focusOnRunStart && running && !wasRunning) element?.focus()
    return running
  }, false)

  onMount(() => {
    if (local.focusOnThreadSwitched) element?.focus()
  })
  const cancelViaHandlers = () => (handlers.onCancel ? handlers.onCancel() : composer.cancel())
  const onKeyDown = (event: ComposerKeyboardEvent) => {
    forwardKeyDown(event, local.onKeyDown)
    if (event.isComposing) return
    if (shouldCancelOnEscape(event, local.cancelOnEscape ?? true, composer.canCancel())) {
      event.preventDefault()
      cancelViaHandlers()
      return
    }
    if (event.key !== 'Enter') return
    if (!wantsEnterSubmit(event, local.submitMode ?? 'enter')) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }
  const onPaste = (event: ClipboardEvent & {currentTarget: HTMLTextAreaElement; target: Element}) => {
    if (typeof local.onPaste === 'function') local.onPaste(event)
    void addPastedFiles(event, local.addAttachmentOnPaste, context.addAttachment)
  }
  return (
    <TextArea
      ref={(node) => {
        element = node
        const forwardRef = local.ref
        if (typeof forwardRef === 'function') forwardRef(node)
      }}
      value={composer.text()}
      onInput={(event) => composer.setText(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
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
      disabled={
        local.disabled || context.sendingAttachments() || (!composer.canSend() && context.attachments().length === 0)
      }
      {...rest}
      type="submit"
    />
  )
}

function Cancel(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const cancel = () => (handlers.onCancel ? handlers.onCancel() : composer.cancel())
  return (
    <Show when={composer.canCancel()}>
      <button type="button" aria-label="Stop" onClick={cancel} {...props} disabled={composer.isStopping()} />
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
  const chat = useChatContext()
  return (
    <For each={chat.queue()}>
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
  Queue,
})
