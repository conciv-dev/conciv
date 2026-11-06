import {createMemo, createSignal, createUniqueId, Show, onMount, type JSX} from 'solid-js'
import {
  Button,
  ByteSize,
  Combobox,
  createListCollection,
  TooltipIconButton,
  TruncatedText,
  VirtualList,
} from '@conciv/ui-kit-system'
import {createDebouncedValue} from '@tanstack/solid-pacer'
import {skipToken, useInfiniteQuery, useMutation, useQuery} from '@tanstack/solid-query'
import {groupBy} from 'es-toolkit'
import Check from 'lucide-solid/icons/check'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import Sparkles from 'lucide-solid/icons/sparkles'
import SquarePen from 'lucide-solid/icons/square-pen'
import Plus from 'lucide-solid/icons/plus'
import type {SessionMeta} from '@conciv/contract'
import type {HarnessListCursor} from '@conciv/protocol/harness-types'
import {useAnnounce, useAppData, useRpc} from '../app/context.js'
import {useHarnesses} from '../data/harness-meta.js'

let instanceSeq = 0

const ACT =
  'inline-flex items-center justify-center size-7 shrink-0 [border:0] rounded-chat-surface-sm bg-transparent text-chat-text-2 cursor-pointer hover:bg-chat-fill-strong hover:text-chat-text-hi [&[aria-disabled=true]]:opacity-50 [&[aria-disabled=true]]:cursor-not-allowed'

const RUNNING_LABEL = 'running'

const PAGE_SIZE = 30

const SKEL = 'h-8 rounded-chat-surface-sm skel-bg [background-size:200%_100%] anim-skel'

const SEARCH_WAIT_MS = 250

const HEADER_ROW_SIZE = 26

const SESSION_ROW_SIZE = 48

const MORE_ROW_SIZE = 44

const BUCKETS = ['Today', 'Yesterday', 'Earlier'] as const

type Bucket = (typeof BUCKETS)[number]

type PickerRow = {kind: 'header'; name: Bucket} | {kind: 'session'; session: SessionMeta}

type SessionPage = {next: HarnessListCursor | null}

function bucketOf(updatedAt: number, now: number): Bucket {
  const day = 86_400_000
  const startOfToday = now - (now % day)
  if (updatedAt >= startOfToday) return 'Today'
  if (updatedAt >= startOfToday - day) return 'Yesterday'
  return 'Earlier'
}

function relativeTime(updatedAt: number, now: number): string {
  const s = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function pickerRows(list: SessionMeta[], now: number): PickerRow[] {
  const byBucket = groupBy(list, (session) => bucketOf(session.updatedAt, now))
  return BUCKETS.flatMap((name): PickerRow[] => {
    const sessions = byBucket[name]
    if (sessions === undefined) return []
    return [{kind: 'header', name}, ...sessions.map((session): PickerRow => ({kind: 'session', session}))]
  })
}

function rowSize(row: PickerRow): number {
  return row.kind === 'header' ? HEADER_ROW_SIZE : SESSION_ROW_SIZE
}

export function SessionSelector(props: {
  variant: 'pill' | 'bar'
  activeId: () => string | null
  onActivate: (id: string) => void
  onNewSession: () => void
}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const idPrefix = `conciv-session-${++instanceSeq}`

  const [query, setQuery] = createSignal('')
  const [debouncedQuery] = createDebouncedValue(query, {wait: SEARCH_WAIT_MS})
  const search = () => (query().trim() === '' ? '' : debouncedQuery().trim())
  const list = useInfiniteQuery(() => {
    const term = search()
    const paging = {initialPageParam: null, getNextPageParam: (page: SessionPage) => page.next}
    return term === ''
      ? appData.utils.sessions.list.infiniteOptions({
          input: (cursor: HarnessListCursor | null) => ({cursor, limit: PAGE_SIZE}),
          ...paging,
        })
      : appData.utils.sessions.search.infiniteOptions({
          input: (cursor: HarnessListCursor | null) => ({term, cursor, limit: PAGE_SIZE}),
          ...paging,
        })
  })
  const active = useQuery(() => {
    const sessionId = props.activeId()
    return appData.utils.sessions.get.queryOptions({input: sessionId === null ? skipToken : {sessionId}})
  })
  const harnesses = useHarnesses()
  const harnessSuffix = (s: SessionMeta): string =>
    harnesses.switchable() ? ` · ${harnesses.nameOf(s.harnessKind)}` : ''
  const sessionsLoaded = createMemo((): SessionMeta[] => list.data?.pages.flatMap((page) => page.sessions) ?? [])
  const loadMore = () => {
    if (!list.hasNextPage || list.isFetchingNextPage || list.isFetchNextPageError) return undefined
    return list.fetchNextPage()
  }
  const activeId = () => props.activeId()

  const valueArr = (): string[] => {
    const id = activeId()
    return id ? [id] : []
  }
  const [now, setNow] = createSignal(0)
  const collection = createMemo(() =>
    createListCollection<SessionMeta>({
      items: sessionsLoaded(),
      itemToValue: (session) => session.id,
      itemToString: (session) => session.title,
    }),
  )
  const rows = createMemo(() => pickerRows(sessionsLoaded(), now()))
  let scrollToRow: ((index: number) => void) | undefined
  const scrollToItem = (index: number) => {
    const id = collection().items[index]?.id
    const row = rows().findIndex((candidate) => candidate.kind === 'session' && candidate.session.id === id)
    if (row >= 0) scrollToRow?.(row)
  }
  onMount(() => setNow(Date.now()))

  const activeRow = () => active.data ?? null
  const triggerLabel = () => activeRow()?.title || 'New session'
  const canRename = () => activeRow() !== null

  const [renaming, setRenaming] = createSignal(false)
  const [draft, setDraft] = createSignal('')
  let searchEl: HTMLInputElement | undefined

  const focusSearch = () => requestAnimationFrame(() => searchEl?.focus())
  const rename = useMutation(() => ({
    mutationFn: (input: {sessionId: string; title: string}) => rpc.sessions.rename(input),
    onSuccess: (result: {title: string}) => announce(`Renamed to ${result.title}`),
    onError: () => announce('Rename failed', true),
    onSettled: () => appData.invalidateSessions(),
  }))
  const startRename = () => {
    const row = activeRow()
    if (!row) return
    setDraft(row.title)
    setRenaming(true)
  }
  const cancelRename = () => {
    setRenaming(false)
    focusSearch()
  }
  const commitRename = () => {
    if (!renaming()) return
    setRenaming(false)
    const row = activeRow()
    const id = activeId()
    const next = draft().trim()
    if (!row || !id || !next || next === row.title) {
      focusSearch()
      return
    }
    rename.mutate({sessionId: id, title: next})
    focusSearch()
  }

  const select = (id: string) => {
    if (!id || id === activeId()) return
    const title = sessionsLoaded().find((s) => s.id === id)?.title ?? id
    props.onActivate(id)
    announce(`Switched to ${title}`)
  }

  const isPill = () => props.variant === 'pill'
  return (
    <Combobox.Root
      ids={{root: idPrefix}}
      class={isPill() ? 'inline-flex min-w-0 max-w-full' : 'flex min-w-0 max-w-full'}
      collection={collection()}
      value={valueArr()}
      inputValue={query()}
      scrollToIndexFn={(details) => scrollToItem(details.index)}
      onValueChange={(d) => {
        const id = d.value[0]
        if (id) select(id)
        setQuery('')
      }}
      onInputValueChange={(d) => setQuery(d.inputValue)}
      onOpenChange={(d) => {
        if (d.open) {
          setNow(Date.now())
          setQuery('')
          appData.invalidateSessions()
        }
      }}
      openOnClick
      selectionBehavior="clear"
      positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 6}}
    >
      <Combobox.Control class="inline-flex min-w-0 max-w-full">
        <Combobox.Trigger
          class={`group text-[0.75rem] text-chat-text-2 border border-transparent rounded-chat-pill bg-transparent inline-flex gap-1.5 h-7 min-w-0 cursor-pointer trans-cbb items-center hover:text-chat-text-hi [&[aria-disabled=true]]:opacity-[0.55] [&[aria-disabled=true]]:cursor-not-allowed ${
            isPill()
              ? 'max-w-64 py-0 pr-1.5 pl-2 hover:border-chat-line hover:bg-chat-fill-soft data-[state=open]:border-chat-line data-[state=open]:bg-chat-fill-soft data-[state=open]:text-chat-text-hi'
              : 'max-w-full p-0 font-chat-mono'
          }`}
          data-empty={canRename() ? undefined : ''}
          aria-label={`Session: ${triggerLabel()}`}
        >
          <Show
            when={canRename()}
            fallback={<Sparkles class="text-chat-accent shrink-0 size-3.25" aria-hidden="true" />}
          >
            <span class="rounded-chat-pill bg-chat-accent shrink-0 size-1.75" aria-hidden="true" />
          </Show>
          <TruncatedText class="min-w-0 group-data-[empty]:text-chat-text-2" text={triggerLabel()} />
          <ChevronDown
            class="opacity-45 shrink-0 size-3.25 [transition:rotate_160ms_var(--chat-ease),opacity_120ms_var(--chat-ease)] group-data-[state=open]:opacity-90 group-hover:opacity-90 group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content class="p-1 border border-chat-line-2 rounded-chat-surface-md bg-chat-panel flex-col max-h-90 w-70 hidden shadow-chat-lg z-10 focus-visible:outline-none data-[state=open]:flex data-[state=open]:anim-combo">
          <div class="mb-1 border-b border-b-chat-line-soft flex gap-1 items-center">
            <Show
              when={!renaming()}
              fallback={
                <input
                  class="text-[0.8125rem] text-chat-text px-2 bg-transparent flex-1 h-8 min-w-0 [border:none] focus:outline-none"
                  aria-label="Rename session"
                  aria-busy={rename.isPending}
                  value={draft()}
                  ref={(el) => requestAnimationFrame(() => el.focus())}
                  onInput={(e) => setDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      commitRename()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      cancelRename()
                    }
                  }}
                  onBlur={commitRename}
                />
              }
            >
              <Combobox.Input
                class="text-[0.8125rem] text-chat-text px-2 bg-transparent flex-1 h-8 min-w-0 [border:none] placeholder:text-chat-text-3 focus:outline-none"
                placeholder="Search sessions…"
                ref={(el) => (searchEl = el)}
              />
              <TooltipIconButton
                tooltip="Rename current session"
                class={ACT}
                aria-disabled={!canRename()}
                onClick={() => canRename() && startRename()}
              >
                <SquarePen class="size-5 block" aria-hidden="true" />
              </TooltipIconButton>
              <TooltipIconButton tooltip="New session" class={ACT} onClick={() => props.onNewSession()}>
                <Plus class="size-5 block" aria-hidden="true" />
              </TooltipIconButton>
            </Show>
          </div>
          <Show when={list.isLoading && sessionsLoaded().length === 0}>
            <div class="px-1 py-1.5 flex flex-col gap-1.5" role="status" aria-busy="true">
              <div class={SKEL} />
              <div class={SKEL} />
              <div class={SKEL} />
              <span class="sr-only">Loading sessions…</span>
            </div>
          </Show>
          <Show when={list.isError && !list.isFetchNextPageError}>
            <div
              class="text-[0.75rem] text-chat-text-3 px-2 py-2.5 flex gap-2 items-center justify-between"
              role="status"
            >
              <span>Couldn't load sessions</span>
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
                Retry
              </Button>
            </div>
          </Show>
          <Show when={list.isSuccess && sessionsLoaded().length === 0 && !list.hasNextPage}>
            <div class="text-[0.75rem] text-chat-text-3 px-2 py-2.5" role="status">
              {search() ? 'No sessions match' : 'No other sessions yet'}
            </div>
          </Show>
          <VirtualList
            class="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            rows={rows()}
            sizeOf={rowSize}
            more={list.hasNextPage}
            moreRowSize={MORE_ROW_SIZE}
            onReachMore={loadMore}
            onScroller={(scroll) => {
              scrollToRow = scroll
            }}
            moreRow={
              <Show
                when={list.isFetchNextPageError}
                fallback={
                  <div
                    class="text-[0.75rem] text-chat-text-3 px-2 flex gap-2 h-full items-center"
                    role="status"
                    aria-busy="true"
                  >
                    <span class="rounded-chat-pill bg-chat-text-3 shrink-0 size-1.75 anim-pulse" aria-hidden="true" />
                    Loading more…
                  </div>
                }
              >
                <div
                  class="text-[0.75rem] text-chat-text-3 px-2 py-1.5 flex gap-2 items-center justify-between"
                  role="status"
                >
                  <span>Couldn't load more sessions</span>
                  <Button variant="outline" size="sm" onClick={() => void list.fetchNextPage()}>
                    Retry
                  </Button>
                </div>
              </Show>
            }
          >
            {(row) => (
              <Show
                when={row.kind === 'session' ? row.session : undefined}
                fallback={
                  <div
                    class="text-[0.6875rem] text-chat-text-3 tracking-[0.02em] font-semibold px-2 pb-0.5 pt-1.5 [text-transform:uppercase]"
                    aria-hidden="true"
                  >
                    {row.kind === 'header' ? row.name : ''}
                  </div>
                }
              >
                {(session) => <SessionOption session={session()} now={now()} suffix={harnessSuffix(session())} />}
              </Show>
            )}
          </VirtualList>
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  )
}

function SessionSize(props: {sizeBytes: number | undefined}): JSX.Element {
  return (
    <Show when={props.sizeBytes}>
      {(sizeBytes) => (
        <>
          {' · '}
          <ByteSize value={sizeBytes()} />
        </>
      )}
    </Show>
  )
}

function SessionOption(props: {session: SessionMeta; now: number; suffix: string}): JSX.Element {
  const labelId = createUniqueId()
  return (
    <Combobox.Item
      item={props.session}
      class="text-chat-text px-2 py-[0.4375rem] rounded-chat-surface-sm flex gap-2 h-full cursor-pointer items-center data-[highlighted]:text-chat-text-hi data-[highlighted]:bg-chat-fill-strong"
      aria-labelledby={labelId}
    >
      <span id={labelId} class="sr-only">
        {props.session.title}, Edited {relativeTime(props.session.updatedAt, props.now)}
        <SessionSize sizeBytes={props.session.sizeBytes} />
        {props.session.origin === 'conciv' ? ' · started in conciv' : ' · started externally'}
        {props.suffix}
        {props.session.running ? `, ${RUNNING_LABEL}` : ''}
      </span>
      <div class="flex flex-1 flex-col gap-px min-w-0">
        <TruncatedText text={props.session.title}>
          <Combobox.ItemText>{props.session.title}</Combobox.ItemText>
        </TruncatedText>
        <span class="text-[0.6875rem] text-chat-text-3 truncate" aria-hidden="true">
          Edited {relativeTime(props.session.updatedAt, props.now)}
          <SessionSize sizeBytes={props.session.sizeBytes} />
          {props.suffix}
        </span>
      </div>
      <Show when={props.session.origin === 'conciv'}>
        <Sparkles class="text-chat-accent opacity-80 shrink-0 size-3.25" aria-hidden="true" />
      </Show>
      <Show when={props.session.running}>
        <span class="rounded-chat-pill bg-chat-success shrink-0 size-1.75 anim-pulse" aria-hidden="true" />
      </Show>
      <Combobox.ItemIndicator class="text-chat-accent ml-auto hidden data-[state=checked]:inline-flex">
        <Check class="size-5 block" aria-hidden="true" />
      </Combobox.ItemIndicator>
    </Combobox.Item>
  )
}
