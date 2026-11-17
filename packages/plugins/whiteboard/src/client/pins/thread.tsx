import {For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import type {Context} from '@conciv/plugin/experimental'
import {useComments, type Comment} from '../model/comments.js'

type Kit = {ui: Context['ui']; dialogs: Context['dialogs']}

const TextPart = z.object({type: z.literal('text'), text: z.string()})
const MentionPart = z.object({type: z.literal('mention'), id: z.string(), label: z.string()})
const ToolPart = z.object({
  type: z.literal('tool'),
  name: z.string(),
  arguments: z.unknown().optional(),
  output: z.unknown().optional(),
})

const AVATAR =
  'inline-grid size-6 shrink-0 place-items-center rounded-chat-pill bg-chat-fill text-chat-xs font-semibold uppercase leading-none text-chat-text-2'

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const relativeTime = new Intl.RelativeTimeFormat(undefined, {numeric: 'auto'})

const timeAgo = (date: number, now: number): string => {
  const elapsed = date - now
  const size = Math.abs(elapsed)
  if (size < MINUTE) return relativeTime.format(Math.round(elapsed / SECOND), 'second')
  if (size < HOUR) return relativeTime.format(Math.round(elapsed / MINUTE), 'minute')
  if (size < DAY) return relativeTime.format(Math.round(elapsed / HOUR), 'hour')
  return relativeTime.format(Math.round(elapsed / DAY), 'day')
}

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('') || '?'

function Avatar(props: {name: string}): JSX.Element {
  return (
    <span class={AVATAR} aria-hidden="true">
      {initials(props.name)}
    </span>
  )
}

function Part(props: {part: unknown; ui: Context['ui']}): JSX.Element {
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
        <Show when={mention()} fallback={<props.ui.Code content={code()} language="json" />}>
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

function CommentEntry(props: {comment: Comment; ui: Context['ui']}): JSX.Element {
  const model = useComments()
  const parts = (): unknown[] => (Array.isArray(props.comment.parts) ? props.comment.parts : [])
  return (
    <article class="px-3 py-2 border-t border-chat-line-soft flex flex-col gap-1 first:border-t-0">
      <div class="flex gap-2 items-center">
        <Avatar name={model.displayName(props.comment)} />
        <span class="text-chat-sm text-chat-text font-medium truncate">{model.displayName(props.comment)}</span>
        <time class="text-chat-xs text-chat-text-3 shrink-0" datetime={new Date(props.comment.createdAt).toISOString()}>
          {timeAgo(props.comment.createdAt, Date.now())}
        </time>
        <Show when={model.ownedBySelf(props.comment)}>
          <span class="ms-auto">
            <props.ui.Menu
              label="Comment actions"
              icon="ellipsis"
              items={[{label: 'Remove', icon: 'trash', onSelect: () => model.removeComment(props.comment)}]}
            />
          </span>
        </Show>
      </div>
      <div class="ps-8 flex flex-col gap-1">
        <For each={parts()}>{(part) => <Part part={part} ui={props.ui} />}</For>
      </div>
    </article>
  )
}

function ThreadHeader(props: Kit): JSX.Element {
  const model = useComments()
  const confirmDelete = (): void => {
    props.dialogs.open((dialog) => (
      <props.ui.Dialog
        title="Delete this thread?"
        description="This removes the comment, all its replies, and its pin."
        footer={
          <>
            <props.ui.Button variant="ghost" onClick={() => dialog.close()}>
              Cancel
            </props.ui.Button>
            <props.ui.Button
              variant="danger"
              onClick={() => {
                model.deleteThread()
                dialog.close()
              }}
            >
              Delete
            </props.ui.Button>
          </>
        }
      />
    ))
  }
  return (
    <header class="px-2 py-1.5 border-b border-chat-line-soft flex gap-0.5 items-center">
      <props.ui.Tooltip value="Previous thread" placement="bottom">
        <props.ui.IconButton
          icon="chevron-left"
          label="Previous thread"
          variant="ghost-muted"
          disabled={!model.canStep(1)}
          onClick={() => model.stepThread(1)}
        />
      </props.ui.Tooltip>
      <props.ui.Tooltip value="Next thread" placement="bottom">
        <props.ui.IconButton
          icon="chevron-right"
          label="Next thread"
          variant="ghost-muted"
          disabled={!model.canStep(-1)}
          onClick={() => model.stepThread(-1)}
        />
      </props.ui.Tooltip>
      <span class="flex-1" />
      <props.ui.Tooltip value="Resolve thread" placement="bottom">
        <props.ui.IconButton
          icon="check"
          label="Resolve thread"
          variant="ghost-muted"
          onClick={() => model.resolve()}
        />
      </props.ui.Tooltip>
      <props.ui.Tooltip value="Delete thread" placement="bottom">
        <props.ui.IconButton icon="trash" label="Delete thread" variant="ghost-muted" onClick={confirmDelete} />
      </props.ui.Tooltip>
      <props.ui.Tooltip value="Close thread" placement="bottom">
        <props.ui.IconButton icon="x" label="Close thread" variant="ghost-muted" onClick={() => model.closeThread()} />
      </props.ui.Tooltip>
    </header>
  )
}

function ThreadReply(props: {ui: Context['ui']}): JSX.Element {
  const model = useComments()
  const [draft, setDraft] = createStore({text: ''})
  const send = (): void => {
    const text = draft.text.trim()
    if (!text) return
    model.reply(text)
    setDraft('text', '')
  }
  return (
    <div class="p-2 border-t border-chat-line-soft flex gap-2 items-center">
      <Avatar name="You" />
      <props.ui.TextInput
        class="flex-1"
        label="Reply"
        placeholder="Reply"
        value={draft.text}
        onInput={(value) => setDraft('text', value)}
        onSubmit={send}
      />
      <props.ui.Tooltip value="Send reply">
        <props.ui.IconButton icon="arrow-up" label="Send reply" disabled={!draft.text.trim()} onClick={send} />
      </props.ui.Tooltip>
    </div>
  )
}

function ThreadContent(props: Kit): JSX.Element {
  const model = useComments()
  return (
    <Show when={model.openRoot()}>
      {(root) => (
        <div class="flex flex-col max-h-full min-h-0">
          <ThreadHeader ui={props.ui} dialogs={props.dialogs} />
          <div class="overscroll-contain flex-1 min-h-0 overflow-y-auto">
            <For each={model.collectThread(root().cid)}>
              {(comment) => <CommentEntry comment={comment} ui={props.ui} />}
            </For>
          </div>
          <Show when={root().cid} keyed>
            <ThreadReply ui={props.ui} />
          </Show>
        </div>
      )}
    </Show>
  )
}

export function ThreadPopover(props: Kit & {visible: boolean}): JSX.Element {
  const model = useComments()
  const [refs, setRefs] = createStore<{content?: HTMLDivElement}>({})
  return (
    <props.ui.Popover
      anchor={model.openPinButton}
      open={props.visible && model.openRoot() !== undefined}
      onOpenChange={(open) => open || model.closeThread()}
      label="Comment thread"
      initialFocus={() => refs.content?.querySelector('input') ?? undefined}
    >
      <div
        ref={(element) => setRefs('content', element)}
        class="flex flex-col max-h-120 w-85 pointer-events-auto overflow-hidden"
      >
        <ThreadContent ui={props.ui} dialogs={props.dialogs} />
      </div>
    </props.ui.Popover>
  )
}
