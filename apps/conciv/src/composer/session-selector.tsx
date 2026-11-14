import {createMemo, createUniqueId, mapArray, Show, type JSX} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {
  Button,
  ByteSize,
  Combobox,
  createListCollection,
  Highlight,
  Loader,
  Presence,
  RelativeTime,
  Switch,
  Tooltip,
  TooltipIconButton,
  TruncatedText,
  TruncatedTextGroup,
  VirtualList,
} from '@conciv/ui-kit-system'
import {Markdown} from '@conciv/ui-kit-chat'
import {createDateNow} from '@solid-primitives/date'
import {createDebouncer} from '@tanstack/solid-pacer'
import {useNavigate, useSearch} from '@tanstack/solid-router'
import {keepPreviousData, useInfiniteQuery, useQuery} from '@conciv/client'
import {groupBy, isEqual, uniqBy} from 'es-toolkit'
import Check from 'lucide-solid/icons/check'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import Sparkles from 'lucide-solid/icons/sparkles'
import Plus from 'lucide-solid/icons/plus'
import X from 'lucide-solid/icons/x'
import type {SessionHit, SessionMeta} from '@conciv/contract'
import type {HarnessListCursor} from '@conciv/protocol/harness-types'
import {useAnnounce, useAppData} from '../app/context.js'
import {useHarnesses} from '../data/harness-meta.js'
import {createResumeCopy} from './resume-copy.js'
import {SessionPreview} from './session-preview.js'

const ACT =
  'inline-flex items-center justify-center size-7 shrink-0 [border:0] rounded-chat-surface-sm bg-transparent text-chat-text-2 cursor-pointer hover:bg-chat-fill-strong hover:text-chat-text-hi [&[aria-disabled=true]]:opacity-50 [&[aria-disabled=true]]:cursor-not-allowed'

const RUNNING_LABEL = 'running'

const SEARCHING_LABEL = 'Searching sessions'

const PAGE_SIZE = 30

const SKEL = 'h-8 rounded-chat-surface-sm skel-bg [background-size:200%_100%] anim-skel'

const SEARCH_WAIT_MS = 250
const PREVIEW_WAIT_MS = 600
const CLOCK_TICK_MS = 60_000

const HEADER_ROW_SIZE = 26

const SESSION_ROW_SIZE = 48

const EXCERPT_ROW_SIZE = 100

const MORE_ROW_SIZE = 44

const BUCKETS = ['Today', 'Yesterday', 'Earlier'] as const

type Bucket = (typeof BUCKETS)[number]

type PickerSession = SessionMeta | SessionHit

type Elsewhere = {cwd: string; project: string; resume: string | null}

type PickerRow = Bucket | PickerSession

type SessionPage = {next: HarnessListCursor | null}

function pickBucket(updatedAt: number, now: number): Bucket {
  if (updatedAt >= new Date(now).setHours(0, 0, 0, 0)) return 'Today'
  if (updatedAt >= new Date(now).setHours(-24, 0, 0, 0)) return 'Yesterday'
  return 'Earlier'
}

function pickerRows(list: PickerSession[], now: number): PickerRow[] {
  const byBucket = groupBy(list, (session) => pickBucket(session.updatedAt, now))
  return BUCKETS.flatMap((name): PickerRow[] => {
    const sessions = byBucket[name]
    if (sessions === undefined) return []
    return [name, ...sessions]
  })
}

function rowSize(row: PickerRow): number {
  if (typeof row === 'string') return HEADER_ROW_SIZE
  return readExcerpt(row) === null ? SESSION_ROW_SIZE : EXCERPT_ROW_SIZE
}

function rowKey(row: PickerRow): string {
  return typeof row === 'string' ? row : row.id
}

function readExcerpt(session: PickerSession): string | null {
  return 'excerpt' in session ? session.excerpt : null
}

function formatProject(cwd: string): string {
  return cwd.split(/[\\/]/).findLast((segment) => segment !== '') ?? cwd
}

function readMatched(session: PickerSession): string[] {
  return 'matched' in session ? session.matched : []
}

function buildPreview(session: PickerSession | undefined) {
  if (session === undefined) return null
  const native = 'preview' in session ? session.preview : session.native
  if (!native) return null
  const shared = {
    title: session.title,
    harness: native.harnessKind,
    nativeId: native.nativeId,
    matched: readMatched(session),
  }
  const elsewhere = readElsewhere(session)
  if (elsewhere === null) return {...shared, project: formatProject(native.cwd), cwd: null, resume: null}
  return {...shared, project: elsewhere.project, cwd: elsewhere.cwd, resume: elsewhere.resume}
}

function readElsewhere(session: PickerSession | undefined): Elsewhere | null {
  if (session === undefined || !('cwd' in session) || session.cwd === null) return null
  return {cwd: session.cwd, project: formatProject(session.cwd), resume: session.resume}
}

export function SessionSelector(props: {
  variant: 'pill' | 'bar'
  activeId: () => string | null
  onActivate: (id: string) => void
  onNewSession: () => void
}): JSX.Element {
  const appData = useAppData()
  const announce = useAnnounce()
  const routeSearch = useSearch({strict: false})
  const navigate = useNavigate()
  const search = () => (routeSearch().sessionSearch ?? '').trim()
  const allProjects = () => routeSearch().allProjects ?? false
  const writeSearch = (patch: {sessionSearch?: string; allProjects?: boolean}) =>
    void navigate({to: '.', search: (previous) => ({...previous, ...patch}), replace: true})
  const searchWriter = createDebouncer((sessionSearch: string) => writeSearch({sessionSearch}), {
    wait: SEARCH_WAIT_MS,
  })
  const typed = (details: {inputValue: string; reason?: string}) => {
    if (details.reason !== 'input-change' && details.reason !== 'clear-trigger') return
    setPicker('typed', details.inputValue)
    dismissPreview()
    searchWriter.maybeExecute(details.inputValue.trim())
    if (details.inputValue.trim() === '') searchWriter.flush()
  }
  const indexed = useQuery(() => appData.utils.sessions.changes.experimental_liveOptions())
  const indexVersion = () => ({indexVersion: indexed.data?.version ?? null})
  const listOptions = () => {
    const input = (cursor: HarnessListCursor | null) => ({cursor, limit: PAGE_SIZE})
    return appData.utils.sessions.list.infiniteOptions({
      input,
      initialPageParam: null,
      getNextPageParam: (page: SessionPage) => page.next,
    })
  }
  const searchOptions = (term: string) => {
    const input = (cursor: HarnessListCursor | null) => ({term, cursor, limit: PAGE_SIZE, everywhere: allProjects()})
    return appData.utils.sessions.search.infiniteOptions({
      input,
      initialPageParam: null,
      getNextPageParam: (page: SessionPage) => page.next,
      queryKey: [...appData.utils.sessions.search.infiniteKey({input, initialPageParam: null}), indexVersion()],
    })
  }
  const list = useInfiniteQuery(() => ({
    ...(search() === '' ? listOptions() : searchOptions(search())),
    placeholderData: keepPreviousData,
    reconcile: (previous, next) => reconcile(structuredClone(next), {key: 'id'})(previous),
  }))
  const active = useQuery(() => {
    const sessionId = props.activeId()
    return {
      ...appData.utils.sessions.get.queryOptions({input: {sessionId: sessionId ?? ''}}),
      enabled: sessionId !== null,
    }
  })
  const harnesses = useHarnesses()
  const harnessSuffix = (s: SessionMeta): string =>
    harnesses.switchable() ? ` · ${harnesses.resolveName(s.harnessKind)}` : ''
  const sessionsLoaded = createMemo((): PickerSession[] =>
    uniqBy(list.data?.pages.flatMap((page) => page.sessions) ?? [], (session) => session.id),
  )
  const searching = () => list.isFetchingNextPage || (list.isFetching && (list.isPlaceholderData || list.isPending))
  const loadMore = () => {
    if (!list.hasNextPage || list.isFetchingNextPage || list.isFetchNextPageError) return undefined
    return list.fetchNextPage()
  }
  const activeId = () => props.activeId()

  const valueArr = (): string[] => {
    const id = activeId()
    return id ? [id] : []
  }
  const [clock] = createDateNow(CLOCK_TICK_MS)
  const now = () => clock().getTime()
  const collection = createMemo(() =>
    createListCollection<PickerSession>({
      items: sessionsLoaded(),
      itemToValue: (session) => session.id,
      itemToString: (session) => session.title,
    }),
  )
  const rows = createMemo(() => pickerRows(sessionsLoaded(), now()))
  let scrollToRow: ((index: number) => void) | undefined
  const scrollToItem = (index: number) => {
    const id = collection().items[index]?.id
    const row = rows().findIndex((candidate) => typeof candidate !== 'string' && candidate.id === id)
    if (row >= 0) scrollToRow?.(row)
  }

  const activeRow = () => active.data ?? null
  const triggerLabel = () => activeRow()?.title || 'New session'
  const canRename = () => activeRow() !== null

  const findSession = (id: string | null) => sessionsLoaded().find((session) => session.id === id)
  const resumeCopies = createMemo(
    mapArray(sessionsLoaded, (session) => {
      const command = readElsewhere(session)?.resume
      return command ? {id: session.id, copy: createResumeCopy(() => command, announce)} : null
    }),
  )
  const findResumeCopy = (id: string) => resumeCopies().find((entry) => entry?.id === id)?.copy

  const select = (id: string) => {
    if (!id) return
    const session = findSession(id)
    const elsewhere = readElsewhere(session)
    if (elsewhere !== null) return openElsewhere(id, elsewhere)
    const switching = id !== activeId()
    props.onActivate(id)
    if (switching) announce(`Switched to ${session?.title ?? id}`)
  }

  const openElsewhere = (id: string, elsewhere: Elsewhere) => {
    const copy = findResumeCopy(id)
    if (copy === undefined) return announce(`${findSession(id)?.title ?? id} is in ${elsewhere.project}, open it there`)
    copy.copy()
  }

  let content: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  const [picker, setPicker] = createStore<{
    highlighted: string | null
    previewed: string | null
    open: boolean
    typed: string
  }>({
    highlighted: null,
    previewed: null,
    open: false,
    typed: search(),
  })
  const shownInput = createMemo(
    (previous: {term: string; text: string}) => {
      const term = search()
      const text = picker.typed
      if (term !== previous.term && term !== text.trim()) return {term, text: term}
      return {term, text}
    },
    {term: search(), text: search()},
  )
  const settle = createDebouncer((value: string) => setPicker({previewed: value, open: true}), {wait: PREVIEW_WAIT_MS})
  const dismissPreview = () => {
    settle.cancel()
    setPicker('open', false)
  }
  const highlighted = (value: string | null) => {
    setPicker('highlighted', value)
    if (value === null) return settle.cancel()
    settle.maybeExecute(value)
  }
  const previewTarget = createMemo(() => buildPreview(findSession(picker.previewed)), null, {equals: isEqual})

  const isPill = () => props.variant === 'pill'
  return (
    <Combobox.Root
      class={isPill() ? 'inline-flex min-w-0 max-w-full' : 'flex min-w-0 max-w-full'}
      collection={collection()}
      loading={searching()}
      translations={{loading: SEARCHING_LABEL}}
      value={valueArr()}
      scrollToIndexFn={(details) => scrollToItem(details.index)}
      onSelect={(details) => select(details.itemValue)}
      inputValue={shownInput().text}
      onInputValueChange={typed}
      onHighlightChange={(details) => highlighted(details.highlightedValue)}
      closeOnSelect={readElsewhere(findSession(picker.highlighted)) === null}
      onOpenChange={(details) => {
        if (details.open) appData.invalidateSessions()
        if (!details.open) dismissPreview()
      }}
      openOnClick
      selectionBehavior="preserve"
      positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 6}}
    >
      <Combobox.Control class="inline-flex min-w-0 max-w-full">
        <Combobox.Trigger
          focusable
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
        <Combobox.Content
          ref={(element) => {
            content = element
          }}
          class="p-1 border border-chat-line-2 rounded-chat-surface-md bg-chat-panel flex-col max-h-90 w-70 hidden shadow-chat-lg z-10 focus-visible:outline-none data-[state=open]:flex data-[state=open]:anim-combo"
        >
          <search role="search" class="mb-1 border-b border-b-chat-line-soft flex flex-col">
            <div class="flex gap-1 items-center">
              <Combobox.Label class="sr-only">Search sessions</Combobox.Label>
              <Combobox.Input
                ref={(element) => {
                  input = element
                }}
                class="text-[0.8125rem] text-chat-text px-2 bg-transparent flex-1 h-8 min-w-0 [border:none] placeholder:text-chat-text-3 focus:outline-none"
                placeholder="Search sessions…"
                onPointerDown={(event) => event.stopPropagation()}
              />
              <Presence
                present={searching()}
                lazyMount
                unmountOnExit
                class="flex shrink-0 size-7 items-center justify-center"
              >
                <Loader.Root size="sm" bare translations={{value: () => SEARCHING_LABEL}}>
                  <Loader.Indicator class="size-4 text-chat-text-3" />
                </Loader.Root>
              </Presence>
              <Combobox.Context>
                {(api) => (
                  <Presence present={api().inputValue !== ''} lazyMount unmountOnExit class="flex shrink-0">
                    <TooltipIconButton
                      tooltip="Clear search"
                      class={ACT}
                      onClick={() => {
                        api().setInputValue('', 'clear-trigger')
                        api().focus()
                      }}
                    >
                      <X class="size-5 block" aria-hidden="true" />
                    </TooltipIconButton>
                  </Presence>
                )}
              </Combobox.Context>
              <TooltipIconButton tooltip="New session" class={ACT} onClick={() => props.onNewSession()}>
                <Plus class="size-5 block" aria-hidden="true" />
              </TooltipIconButton>
            </div>
            <Switch.Root
              class="px-2 min-h-11"
              checked={allProjects()}
              onCheckedChange={(details) => writeSearch({allProjects: details.checked})}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Label class="text-[0.75rem]">All projects</Switch.Label>
              <Switch.HiddenInput />
            </Switch.Root>
          </search>
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
              <Button variant="outline" size="xs" onClick={() => void list.refetch()}>
                Retry
              </Button>
            </div>
          </Show>
          <Show when={list.isSuccess && sessionsLoaded().length === 0 && !list.hasNextPage}>
            <div class="text-[0.75rem] text-chat-text-3 px-2 py-2.5" role="status">
              {search() ? 'No sessions match' : 'No other sessions yet'}
            </div>
          </Show>
          <TruncatedTextGroup>
            <VirtualList
              class="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              rows={rows()}
              readSize={rowSize}
              readKey={rowKey}
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
                      class="text-[0.75rem] text-chat-text-3 px-2 flex gap-2 min-h-11 items-center"
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
                    <Button variant="outline" size="xs" onClick={() => void list.fetchNextPage()}>
                      Retry
                    </Button>
                  </div>
                </Show>
              }
            >
              {(row) => (
                <Show
                  when={typeof row === 'string' ? undefined : row}
                  fallback={
                    <div
                      class="text-[0.6875rem] text-chat-text-3 tracking-[0.02em] font-semibold px-2 pb-0.5 pt-1.5 [text-transform:uppercase]"
                      aria-hidden="true"
                    >
                      {typeof row === 'string' ? row : ''}
                    </div>
                  }
                >
                  {(session) => (
                    <SessionOption
                      session={session()}
                      suffix={harnessSuffix(session())}
                      copied={findResumeCopy(session().id)?.announcement() ?? ''}
                    />
                  )}
                </Show>
              )}
            </VirtualList>
          </TruncatedTextGroup>
        </Combobox.Content>
      </Combobox.Positioner>
      <SessionPreview
        target={previewTarget()}
        open={picker.open}
        onDismiss={dismissPreview}
        anchor={() => content ?? null}
        input={() => input ?? null}
      />
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

function SessionOption(props: {session: PickerSession; suffix: string; copied: string}): JSX.Element {
  const labelId = createUniqueId()
  const excerptId = createUniqueId()
  const excerpt = () => readExcerpt(props.session)
  const elsewhere = () => readElsewhere(props.session)
  const [row, setRow] = createStore<{element: HTMLElement | undefined}>({element: undefined})
  return (
    <Combobox.Item
      ref={(element) => setRow('element', element)}
      item={props.session}
      class="text-chat-text px-2 py-[0.4375rem] rounded-chat-surface-sm flex gap-2 cursor-pointer items-center data-[highlighted]:text-chat-text-hi data-[highlighted]:bg-chat-fill-strong [&_mark]:bg-chat-accent-20 [&_mark]:text-chat-text [&_mark]:rounded-chat-chip [&_mark]:[box-shadow:inset_0_-1px_var(--chat-accent)] [&_mark]:anim-mark"
      aria-labelledby={labelId}
      aria-describedby={excerpt() === null ? undefined : excerptId}
    >
      <span id={labelId} class="sr-only">
        {props.session.title}, Edited <RelativeTime value={new Date(props.session.updatedAt)} />
        <SessionSize sizeBytes={props.session.sizeBytes} />
        {props.session.origin === 'conciv' ? ' · started in conciv' : ' · started externally'}
        {props.suffix}
        {elsewhere() ? `, in ${elsewhere()?.project}, select to copy the command that opens it there` : ''}
        {props.session.running ? `, ${RUNNING_LABEL}` : ''}
      </span>
      <Show when={props.copied}>
        {(copied) => (
          <Tooltip.Root
            open
            positioning={{placement: 'top-end', flip: false, getAnchorElement: () => row.element ?? null}}
          >
            <Tooltip.Positioner>
              <Tooltip.Content>{copied()}</Tooltip.Content>
            </Tooltip.Positioner>
          </Tooltip.Root>
        )}
      </Show>
      <div class="flex flex-1 flex-col gap-px min-w-0">
        <TruncatedText text={props.session.title}>
          <Combobox.ItemText>
            <Highlight text={props.session.title} query={readMatched(props.session)} ignoreCase matchAll exactMatch />
          </Combobox.ItemText>
        </TruncatedText>
        <Show when={excerpt()}>
          {(text) => (
            <div
              id={excerptId}
              class="text-[0.75rem] text-chat-text-2 leading-4 max-h-12 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_2.5rem,transparent_3rem)]"
            >
              <Markdown content={text()} compact highlight={readMatched(props.session)} />
            </div>
          )}
        </Show>
        <span class="text-[0.6875rem] text-chat-text-3 truncate" aria-hidden="true">
          Edited <RelativeTime value={new Date(props.session.updatedAt)} />
          <SessionSize sizeBytes={props.session.sizeBytes} />
          {props.suffix}
          <Show when={elsewhere()}>
            {(other) => (
              <>
                {' · '}
                <TruncatedText class="min-w-0 text-chat-text-2" text={other().project} />
              </>
            )}
          </Show>
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
