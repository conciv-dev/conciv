import {For, Show, createMemo, createSignal, type JSX} from 'solid-js'
import {z} from 'zod'
import {Inbox as InboxIcon, ListFilter} from 'lucide-solid'
import {RelativeTime, ScrollArea, TextField} from '@conciv/ui-kit-system'
import {useComments, type Comment} from './model/comments.js'
import {Avatar, Menu, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, Tabs} from './ui.js'

const PANEL =
  'fixed right-0 top-0 bottom-0 m-3 w-[clamp(20rem,28vw,25rem)] max-sm:left-0 max-sm:top-auto max-sm:w-auto max-sm:h-[65vh] max-sm:m-2 pointer-events-auto flex flex-col bg-pw-panel text-pw-text border border-pw-line rounded-pw-lg shadow-pw-lg overflow-hidden'
const TOGGLE =
  'fixed right-4 top-4 pointer-events-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-pw-pill bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg text-[0.8125rem] [outline:none] focus-ring'
const ICON_BTN =
  'inline-flex size-7 items-center justify-center rounded-pw-sm text-pw-text-2 [outline:none] hover:bg-pw-fill focus-ring'
const FEED_ITEM =
  'w-full flex gap-2 px-3 py-2.5 text-left border-t border-pw-line-soft first:border-t-0 [outline:none] hover:bg-pw-fill-soft focus-ring'

const partText = (part: unknown): string => {
  const text = z.object({text: z.string()}).safeParse(part)
  if (text.success) return text.data.text
  const mention = z.object({label: z.string()}).safeParse(part)
  return mention.success ? `@${mention.data.label}` : ''
}
const textOf = (comment: Comment): string =>
  (Array.isArray(comment.parts) ? comment.parts : []).map(partText).join(' ').trim()

const stripeClass = (unread: boolean): string =>
  `rounded-pw-pill w-0.5 self-stretch ${unread ? 'bg-pw-accent' : 'bg-transparent'}`
const nameClass = (unread: boolean): string =>
  `text-[0.8125rem] truncate ${unread ? 'font-semibold text-pw-text' : 'text-pw-text-2'}`
const avatarClass = (index: number): string => (index > 0 ? 'size-5 -ml-1.5' : 'size-5')

function FeedItem(props: {root: Comment}): JSX.Element {
  const model = useComments()
  const unread = (): boolean => model.isUnread(props.root.cid)
  const replies = (): number => model.replyCount(props.root.cid)
  const activity = (): number => model.lastActivityAt(props.root.cid) ?? props.root.createdAt
  const select = (): void => {
    model.panToThread(props.root.cid)
    model.openThread(props.root.cid)
  }
  return (
    <button
      type="button"
      aria-label={`${model.displayName(props.root)}${unread() ? ' (unread)' : ''}`}
      class={FEED_ITEM}
      onClick={() => select()}
    >
      <span class={stripeClass(unread())} aria-hidden="true" />
      <div class="flex flex-1 flex-col gap-1 min-w-0">
        <div class="flex gap-2 items-center">
          <span class="flex">
            <For each={model.threadParticipants(props.root.cid)}>
              {(participant, index) => <Avatar name={participant.label} class={avatarClass(index())} />}
            </For>
          </span>
          <span class={nameClass(unread())}>{model.displayName(props.root)}</span>
          <RelativeTime value={new Date(activity())} class="text-[0.75rem] text-pw-text-3 ml-auto shrink-0" />
        </div>
        <p class="text-[0.8125rem] text-pw-text-2 truncate">{textOf(props.root)}</p>
        <Show when={replies() > 0}>
          <span class="text-[0.75rem] text-pw-text-3">
            {replies()} {replies() === 1 ? 'reply' : 'replies'}
          </span>
        </Show>
      </div>
    </button>
  )
}

export function InboxToggle(): JSX.Element {
  const model = useComments()
  const unread = (): number => model.orderedThreads().filter((thread) => model.isUnread(thread.cid)).length
  return (
    <Show when={!model.inboxOpen()}>
      <button type="button" aria-label="Toggle comments inbox" class={TOGGLE} onClick={() => model.toggleInbox()}>
        <InboxIcon size={16} />
        Comments
        <Show when={unread() > 0}>
          <span class="text-[0.6875rem] text-pw-on-accent px-1 rounded-pw-pill bg-pw-accent inline-flex h-4 min-w-4 items-center justify-center">
            {unread()}
          </span>
        </Show>
      </button>
    </Show>
  )
}

export function Inbox(): JSX.Element {
  const model = useComments()
  const [search, setSearch] = createSignal('')
  const feed = createMemo(() => {
    const query = search().trim().toLowerCase()
    if (!query) return model.orderedThreads()
    return model.orderedThreads().filter((root) =>
      model
        .threadOf(root.cid)
        .map((comment) => `${textOf(comment)} ${model.displayName(comment)}`)
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  })
  return (
    <Show when={model.inboxOpen()}>
      <aside class={PANEL} aria-label="Comments inbox">
        <header class="px-3 py-2 border-b border-pw-line-soft flex items-center justify-between">
          <Tabs value="comments" tabs={[{value: 'comments', label: 'Comments', trigger: <InboxIcon size={16} />}]} />
          <button type="button" aria-label="Close inbox" class={ICON_BTN} onClick={() => model.closeInbox()}>
            ✕
          </button>
        </header>
        <div class="px-3 py-2 flex gap-2 items-center">
          <TextField
            aria-label="Quick search"
            class="flex-1"
            placeholder="Quick search"
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
          <kbd class="text-[0.75rem] text-pw-accent-hi shrink-0">⌘3</kbd>
        </div>
        <div class="px-3 py-1.5 border-b border-pw-line-soft flex items-center justify-between">
          <Menu
            label="Filter comments"
            trigger={
              <span class={`${ICON_BTN} text-[0.8125rem] px-2 gap-1.5 w-auto`} aria-label="Filter comments">
                <ListFilter size={15} />
              </span>
            }
          >
            <MenuRadioGroup
              value={model.sortMode()}
              onValueChange={(value) => model.setSortMode(value === 'unread' ? 'unread' : 'date')}
            >
              <MenuRadioItem value="date">Sort by date</MenuRadioItem>
              <MenuRadioItem value="unread">Sort by unread</MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuCheckboxItem
              value="resolved"
              checked={model.showResolved()}
              onCheckedChange={(checked) => model.setShowResolved(checked)}
            >
              Show resolved comments
            </MenuCheckboxItem>
          </Menu>
          <button
            type="button"
            class="text-[0.75rem] text-pw-text-2 px-2 rounded-pw-sm inline-flex h-7 [outline:none] focus-ring items-center hover:bg-pw-fill"
            onClick={() => model.markAllRead()}
          >
            Mark all as read
          </button>
        </div>
        <ScrollArea.Root class="flex-1 min-h-0">
          <ScrollArea.Viewport class="size-full [outline:none]">
            <ScrollArea.Content>
              <Show
                when={model.orderedThreads().length > 0}
                fallback={
                  <div class="px-4 py-10 text-center flex flex-col gap-1">
                    <strong class="text-[0.8125rem] text-pw-text">No comments yet</strong>
                    <p class="text-[0.75rem] text-pw-text-3">Click an element or the canvas to leave one.</p>
                  </div>
                }
              >
                <Show
                  when={feed().length > 0}
                  fallback={
                    <p class="text-[0.8125rem] text-pw-text-3 px-4 py-10 text-center">
                      No comments match “{search()}”.
                    </p>
                  }
                >
                  <For each={feed()}>{(root) => <FeedItem root={root} />}</For>
                </Show>
              </Show>
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar>
            <ScrollArea.Thumb />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </aside>
    </Show>
  )
}
