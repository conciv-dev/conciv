import {createMemo, For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {usePlugin} from '@conciv/plugin/experimental'
import type {CommentRow} from './rows.js'
import {useComments} from './comments.js'

const PANEL =
  'fixed top-16 bottom-3 end-3 w-96 max-w-full pointer-events-auto flex flex-col bg-chat-panel text-chat-text border border-chat-line rounded-chat-surface-lg shadow-chat-lg overflow-hidden anim-presence-in'
const TOGGLE = 'fixed top-4 start-16 pointer-events-auto shadow-chat-lg'
const FEED_ITEM = 'w-full h-auto justify-start text-start px-3 py-2.5 rounded-none'

const TextPart = z.object({text: z.string()})
const MentionPart = z.object({label: z.string()})
const replyRules = new Intl.PluralRules('en')

const partText = (part: unknown): string => {
  const text = TextPart.safeParse(part)
  if (text.success) return text.data.text
  const mention = MentionPart.safeParse(part)
  return mention.success ? `@${mention.data.label}` : ''
}

const readText = (comment: CommentRow): string =>
  (Array.isArray(comment.parts) ? comment.parts : []).map(partText).join(' ').trim()

const replyLabel = (count: number): string => `${count} ${replyRules.select(count) === 'one' ? 'reply' : 'replies'}`

function FeedItem(props: {root: CommentRow}): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const unread = (): boolean => model.isUnread(props.root.cid)
  const replies = (): number => model.replyCount(props.root.cid)
  const activity = (): number => model.lastActivityAt(props.root.cid) ?? props.root.createdAt
  const select = (): void => {
    model.panToThread(props.root.cid)
    model.openThread(props.root.cid)
  }
  return (
    <ui.Button variant="ghost" class={FEED_ITEM} onClick={select}>
      <span class="flex flex-1 flex-col gap-1 min-w-0">
        <span class="flex gap-2 items-center">
          <span
            class={
              unread() ? 'text-chat-sm text-chat-text font-semibold truncate' : 'text-chat-sm text-chat-text-2 truncate'
            }
          >
            {model.displayName(props.root)}
          </span>
          <Show when={unread()}>
            <span class="sr-only">unread</span>
            <span class="rounded-full bg-chat-accent shrink-0 size-2" aria-hidden="true" />
          </Show>
          <span class="text-chat-xs text-chat-text-3 ms-auto shrink-0">
            <ui.RelativeTime value={new Date(activity())} />
          </span>
        </span>
        <span class="text-chat-sm text-chat-text-2 truncate">{readText(props.root)}</span>
        <Show when={replies() > 0}>
          <span class="text-chat-xs text-chat-text-3">{replyLabel(replies())}</span>
        </Show>
        <span class="sr-only">{model.threadParticipants(props.root.cid).join(', ')}</span>
      </span>
    </ui.Button>
  )
}

export function InboxToggle(): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const unread = (): number => model.inboxThreads().filter((thread) => model.isUnread(thread.cid)).length
  return (
    <Show when={!model.inboxOpen()}>
      <ui.Button variant="neutral" icon="inbox" class={TOGGLE} onClick={() => model.setInboxOpen(true)}>
        Comments
        <Show when={unread() > 0}>
          <span class="text-chat-accent-hi font-semibold tabular-nums">{unread()}</span>
          <span class="sr-only">unread</span>
        </Show>
      </ui.Button>
    </Show>
  )
}

export function Inbox(): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const [search, setSearch] = createStore({query: ''})
  const feed = createMemo(() => {
    const query = search.query.trim().toLowerCase()
    if (!query) return model.inboxThreads()
    return model.inboxThreads().filter((root) =>
      model
        .collectThread(root.cid)
        .map((comment) => `${readText(comment)} ${model.displayName(comment)}`)
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  })
  return (
    <Show when={model.inboxOpen()}>
      <aside class={PANEL} aria-label="Comments inbox">
        <header class="py-1.5 pe-1.5 ps-3 border-b border-chat-line-soft flex items-center justify-between">
          <span class="text-chat-sm text-chat-text font-medium">Comments</span>
          <ui.Tooltip value="Close inbox" placement="bottom">
            <ui.IconButton
              icon="x"
              label="Close inbox"
              variant="ghost-muted"
              onClick={() => model.setInboxOpen(false)}
            />
          </ui.Tooltip>
        </header>
        <div class="px-3 py-2">
          <ui.TextInput
            type="search"
            label="Quick search"
            placeholder="Quick search"
            value={search.query}
            onInput={(query) => setSearch('query', query)}
          />
        </div>
        <div class="px-3 py-1.5 border-b border-chat-line-soft flex items-center justify-between">
          <ui.Menu
            label="Filter comments"
            icon="list-filter"
            placement="bottom-start"
            items={[
              {
                type: 'radio-group',
                label: 'Sort',
                value: model.inbox().sort,
                onValueChange: (value) => model.setInboxSort(value === 'unread' ? 'unread' : 'date'),
                items: [
                  {value: 'date', label: 'Sort by date'},
                  {value: 'unread', label: 'Sort by unread'},
                ],
              },
              {type: 'separator'},
              {
                type: 'checkbox',
                label: 'Show resolved comments',
                checked: model.inbox().showResolved,
                onCheckedChange: model.setShowResolved,
              },
            ]}
          />
          <ui.Button variant="ghost" size="small" onClick={() => model.markAllRead()}>
            Mark all as read
          </ui.Button>
        </div>
        <div class="overscroll-contain flex-1 min-h-0 overflow-y-auto">
          <Show
            when={model.inboxThreads().length > 0}
            fallback={
              <div class="px-4 py-10 text-center flex flex-col gap-1">
                <strong class="text-chat-sm text-chat-text">No comments yet</strong>
                <p class="text-chat-xs text-chat-text-3">Comment on a page element from the composer to leave one.</p>
              </div>
            }
          >
            <Show
              when={feed().length > 0}
              fallback={
                <p class="text-chat-sm text-chat-text-3 px-4 py-10 text-center">No comments match “{search.query}”.</p>
              }
            >
              <div class="flex flex-col divide-chat-line-soft divide-y">
                <For each={feed()}>{(root) => <FeedItem root={root} />}</For>
              </div>
            </Show>
          </Show>
        </div>
      </aside>
    </Show>
  )
}
