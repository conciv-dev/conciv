import {For, Show, createMemo, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Effect} from 'effect'
import {z} from 'zod'
import {usePlugin} from '@conciv/plugin/experimental'
import {OpaqueUi} from '@internal/plugin'
import type {CommentRow} from './rows.js'
import {useComments} from './comments.js'
import {useWhiteboardRuntime} from './solid-runtime.js'

const TextPart = z.object({type: z.literal('text'), text: z.string()})
const MentionPart = z.object({type: z.literal('mention'), id: z.string(), label: z.string()})
const ToolPart = z.object({
  type: z.literal('tool'),
  name: z.string(),
  arguments: z.unknown().optional(),
  output: z.unknown().optional(),
})

const InlinePart = z.discriminatedUnion('type', [TextPart, MentionPart])
type MentionField = Parameters<(typeof OpaqueUi.TInternal)['MentionField']>[0]
type MentionItem = ReturnType<MentionField['items']>[number]
type MentionFieldApi = Parameters<NonNullable<MentionField['onReady']>>[0]
type InlineSegment = z.output<typeof InlinePart>
type PartRun = {kind: 'inline'; segments: InlineSegment[]} | {kind: 'block'; part: unknown}

function groupPartRuns(parts: unknown[]): PartRun[] {
  return parts.reduce<PartRun[]>((runs, part) => {
    const inline = InlinePart.safeParse(part)
    if (!inline.success) return [...runs, {kind: 'block', part}]
    const last = runs.at(-1)
    if (last?.kind === 'inline')
      return [...runs.slice(0, -1), {kind: 'inline', segments: [...last.segments, inline.data]}]
    return [...runs, {kind: 'inline', segments: [inline.data]}]
  }, [])
}

function Segment(props: {segment: InlineSegment}): JSX.Element {
  const label = (): string | undefined => (props.segment.type === 'mention' ? props.segment.label : undefined)
  const text = (): string => (props.segment.type === 'text' ? props.segment.text : '')
  return (
    <Show when={label()} fallback={text()}>
      {(value) => <span class="text-chat-accent-hi px-1 rounded-chat-surface-sm bg-chat-accent-08">@{value()}</span>}
    </Show>
  )
}

function BlockPart(props: {part: unknown}): JSX.Element {
  const ui = usePlugin().ui
  const code = (): string => {
    const tool = ToolPart.safeParse(props.part)
    return JSON.stringify(tool.success ? tool.data : props.part, null, 2)
  }
  return <ui.Code content={code()} language="json" />
}

function PartRunView(props: {run: PartRun}): JSX.Element {
  const segments = (): InlineSegment[] | undefined => (props.run.kind === 'inline' ? props.run.segments : undefined)
  const block = (): unknown => (props.run.kind === 'block' ? props.run.part : undefined)
  return (
    <Show when={segments()} fallback={<BlockPart part={block()} />}>
      {(inline) => (
        <p class="text-chat-sm text-chat-text leading-snug whitespace-pre-wrap">
          <For each={inline()}>{(segment) => <Segment segment={segment} />}</For>
        </p>
      )}
    </Show>
  )
}

function CommentEntry(props: {comment: CommentRow}): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const partRuns = createMemo((): PartRun[] =>
    groupPartRuns(Array.isArray(props.comment.parts) ? props.comment.parts : []),
  )
  return (
    <article class="py-2 border-t border-chat-line-soft flex flex-col gap-1 first:border-t-0">
      <div class="flex gap-2 items-center">
        <ui.Avatar name={model.displayName(props.comment)} src={props.comment.authorAvatar ?? undefined} />
        <span class="text-chat-sm text-chat-text font-medium truncate">{model.displayName(props.comment)}</span>
        <span class="text-chat-xs text-chat-text-3 shrink-0">
          <ui.RelativeTime value={new Date(props.comment.createdAt)} />
        </span>
        <Show when={model.ownedBySelf(props.comment)}>
          <span class="ms-auto">
            <ui.Menu
              label="Comment actions"
              icon="ellipsis"
              items={[{label: 'Remove', icon: 'trash', onSelect: () => model.removeComment(props.comment)}]}
            />
          </span>
        </Show>
      </div>
      <div class="ps-8 flex flex-col gap-1">
        <For each={partRuns()}>{(run) => <PartRunView run={run} />}</For>
      </div>
    </article>
  )
}

const PREVIOUS_THREAD = 'Previous thread'
const NEXT_THREAD = 'Next thread'

function ThreadHeader(props: {root: CommentRow}): JSX.Element {
  const ctx = usePlugin()
  const ui = ctx.ui
  const model = useComments()
  const runtime = useWhiteboardRuntime()
  const confirmDelete = (): void => {
    const root = props.root
    runtime.runFork(
      Effect.tryPromise(() =>
        ctx.dialogs.confirm({
          title: 'Delete this thread?',
          description: 'This removes the comment, all its replies, and its pin.',
          confirm: 'Delete',
          danger: true,
        }),
      ).pipe(
        Effect.map((confirmed) => confirmed && model.deleteThread(root)),
        Effect.catchCause((cause) => Effect.logError('the delete confirm failed', cause)),
        Effect.annotateLogs({plugin: 'whiteboard', thread: root.id}),
      ),
    )
  }
  return (
    <header class="pb-1.5 border-b border-chat-line-soft flex gap-0.5 items-center">
      <ui.Tooltip value={PREVIOUS_THREAD} placement="bottom">
        <ui.IconButton
          icon="chevron-left"
          label={PREVIOUS_THREAD}
          variant="ghost-muted"
          onClick={() => model.stepThread(1)}
        />
      </ui.Tooltip>
      <ui.Tooltip value={NEXT_THREAD} placement="bottom">
        <ui.IconButton
          icon="chevron-right"
          label={NEXT_THREAD}
          variant="ghost-muted"
          onClick={() => model.stepThread(-1)}
        />
      </ui.Tooltip>
      <span class="flex-1" />
      <ui.Tooltip value="Resolve thread" placement="bottom">
        <ui.IconButton icon="check" label="Resolve thread" variant="ghost-muted" onClick={() => model.resolve()} />
      </ui.Tooltip>
      <ui.Tooltip value="Delete thread" placement="bottom">
        <ui.IconButton icon="trash" label="Delete thread" variant="ghost-muted" onClick={confirmDelete} />
      </ui.Tooltip>
      <ui.Tooltip value="Close thread" placement="bottom">
        <ui.IconButton icon="x" label="Close thread" variant="ghost-muted" onClick={() => model.closeThread()} />
      </ui.Tooltip>
    </header>
  )
}

function ThreadReply(props: {onReady: (field: HTMLElement) => void}): JSX.Element {
  const ui = OpaqueUi.toInternal(usePlugin().ui)
  const model = useComments()
  const [field, setField] = createStore<{empty: boolean; api: MentionFieldApi | undefined}>({
    empty: true,
    api: undefined,
  })
  const mentionable = (query: string): MentionItem[] =>
    model.participants().filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
  return (
    <div class="pt-2 border-t border-chat-line-soft flex gap-2 items-end">
      <ui.Avatar name="You" />
      <div class="flex-1 min-w-0">
        <ui.MentionField
          ariaLabel="Reply"
          placeholder="Reply, @mention someone…"
          items={mentionable}
          onSubmit={model.reply}
          onReady={(api) => {
            setField('api', api)
            props.onReady(api.element)
          }}
          onEmptyChange={(empty) => setField('empty', empty)}
        />
      </div>
      <ui.Tooltip value="Send reply">
        <ui.IconButton icon="arrow-up" label="Send reply" disabled={field.empty} onClick={() => field.api?.submit()} />
      </ui.Tooltip>
    </div>
  )
}

function ThreadContent(props: {onReplyReady: (field: HTMLElement) => void}): JSX.Element {
  const model = useComments()
  return (
    <Show when={model.openRoot()}>
      {(root) => (
        <div class="flex flex-col max-h-full min-h-0">
          <ThreadHeader root={root()} />
          <div class="overscroll-contain flex-1 min-h-0 overflow-y-auto">
            <For each={model.collectThread(root().cid)}>{(comment) => <CommentEntry comment={comment} />}</For>
          </div>
          <Show when={root().cid} keyed>
            <ThreadReply onReady={props.onReplyReady} />
          </Show>
        </div>
      )}
    </Show>
  )
}

export function ThreadPopover(props: {visible: boolean}): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const [reply, setReply] = createStore<{field: HTMLElement | undefined; missed: boolean}>({
    field: undefined,
    missed: false,
  })
  const readInitialFocus = (): HTMLElement | undefined => {
    if (reply.field?.isConnected) return reply.field
    setReply('missed', true)
    return undefined
  }
  const takeReply = (field: HTMLElement): void => {
    setReply('field', field)
    if (!reply.missed) return
    setReply('missed', false)
    field.focus()
  }
  return (
    <ui.Popover
      anchor={model.openPinButton}
      initialFocus={readInitialFocus}
      open={props.visible && model.openRoot() !== undefined}
      onOpenChange={(open) => open || model.closeThread()}
      label="Comment thread"
    >
      <div class="flex flex-col max-h-120 w-85 pointer-events-auto">
        <ThreadContent onReplyReady={takeReply} />
      </div>
    </ui.Popover>
  )
}
