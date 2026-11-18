import {For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Effect} from 'effect'
import {z} from 'zod'
import {usePlugin} from '@conciv/plugin/experimental'
import type {CommentRow} from './rows.js'
import {useComments} from './comments.js'

const TextPart = z.object({type: z.literal('text'), text: z.string()})
const MentionPart = z.object({type: z.literal('mention'), id: z.string(), label: z.string()})
const ToolPart = z.object({
  type: z.literal('tool'),
  name: z.string(),
  arguments: z.unknown().optional(),
  output: z.unknown().optional(),
})

function Part(props: {part: unknown}): JSX.Element {
  const ui = usePlugin().ui
  const text = (): string | undefined => {
    const parsed = TextPart.safeParse(props.part)
    return parsed.success ? parsed.data.text : undefined
  }
  const mention = (): string | undefined => {
    const parsed = MentionPart.safeParse(props.part)
    return parsed.success ? parsed.data.label : undefined
  }
  const code = (): string => {
    const tool = ToolPart.safeParse(props.part)
    return JSON.stringify(tool.success ? tool.data : props.part, null, 2)
  }
  return (
    <Show
      when={text()}
      fallback={
        <Show when={mention()} fallback={<ui.Code content={code()} language="json" />}>
          {(label) => (
            <span class="text-chat-sm text-chat-accent-hi px-1 rounded-chat-surface-sm bg-chat-accent-08 inline-flex items-center">
              @{label()}
            </span>
          )}
        </Show>
      }
    >
      {(value) => <p class="text-chat-sm text-chat-text leading-snug whitespace-pre-wrap">{value()}</p>}
    </Show>
  )
}

function CommentEntry(props: {comment: CommentRow}): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const parts = (): unknown[] => (Array.isArray(props.comment.parts) ? props.comment.parts : [])
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
        <For each={parts()}>{(part) => <Part part={part} />}</For>
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
  const confirmDelete = (): void => {
    const root = props.root
    Effect.runFork(
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

function ThreadReply(): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const [draft, setDraft] = createStore({text: ''})
  const send = (): void => {
    const text = draft.text.trim()
    if (!text) return
    model.reply(text)
    setDraft('text', '')
  }
  return (
    <div class="pt-2 border-t border-chat-line-soft flex gap-2 items-center">
      <ui.Avatar name="You" />
      <ui.TextInput
        class="flex-1"
        label="Reply"
        placeholder="Reply"
        autofocus
        value={draft.text}
        onInput={(value) => setDraft('text', value)}
        onSubmit={send}
      />
      <ui.Tooltip value="Send reply">
        <ui.IconButton icon="arrow-up" label="Send reply" disabled={!draft.text.trim()} onClick={send} />
      </ui.Tooltip>
    </div>
  )
}

function ThreadContent(): JSX.Element {
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
            <ThreadReply />
          </Show>
        </div>
      )}
    </Show>
  )
}

export function ThreadPopover(props: {visible: boolean}): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  return (
    <ui.Popover
      anchor={model.openPinButton}
      open={props.visible && model.openRoot() !== undefined}
      onOpenChange={(open) => open || model.closeThread()}
      label="Comment thread"
    >
      <div class="flex flex-col max-h-120 w-85 pointer-events-auto">
        <ThreadContent />
      </div>
    </ui.Popover>
  )
}
