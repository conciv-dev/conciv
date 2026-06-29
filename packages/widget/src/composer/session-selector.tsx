import {createSignal, createEffect, For, Show, onMount, type JSX} from 'solid-js'
import {Combobox} from '@mandarax/ui-kit-system'
import {useListCollection} from '@ark-ui/solid/combobox'
import {Check, ChevronDown, Sparkles, SquarePen, Plus} from 'lucide-solid'
import type {ChatSessionMeta, SessionId} from '@mandarax/protocol/chat-types'
import {defineClient} from '@mandarax/api-client'
import {sessions, status, loadSessions, invalidateSessions, applyTitle} from '../client/session-store-client.js'

// One id-prefix per mounted instance so two selectors under one shadow root never share Ark's
// aria-controls / activedescendant ids (a11y — §6).
let instanceSeq = 0

// Header icon buttons (rename / new): square ghost buttons that fill in on hover.
const ACT =
  'inline-flex items-center justify-center size-7 shrink-0 [border:0] rounded-pw-sm bg-transparent text-pw-text-2 cursor-pointer hover:bg-pw-fill-strong hover:text-pw-text-hi [&[aria-disabled=true]]:opacity-50 [&[aria-disabled=true]]:cursor-not-allowed'
// Loading skeleton row: a shimmering gradient swept by the pw-session-skel keyframes (kept in CSS).
const SKEL = 'h-8 rounded-pw-sm skel-bg [background-size:200%_100%] anim-skel'

// Recency bucket from a ms timestamp, relative to now. Recomputed reactively (not snapshotted).
function bucketOf(updatedAt: number, now: number): 'Today' | 'Yesterday' | 'Earlier' {
  const day = 86_400_000
  const startOfToday = now - (now % day)
  if (updatedAt >= startOfToday) return 'Today'
  if (updatedAt >= startOfToday - day) return 'Yesterday'
  return 'Earlier'
}

// A coarse absolute-ish relative label for the row's aria-label ("Edited 2 hours ago").
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

function metaLabel(s: ChatSessionMeta, now: number): string {
  const origin = s.origin === 'mandarax' ? 'started in mandarax' : 'started externally'
  return `Edited ${relativeTime(s.updatedAt, now)} · ${s.messageCount} messages · ${origin}`
}

// Sessions grouped by recency bucket, preserving the store's newest-first order within each bucket.
function groupsOf(list: ChatSessionMeta[], now: number): {name: string; items: ChatSessionMeta[]}[] {
  const order: ('Today' | 'Yesterday' | 'Earlier')[] = ['Today', 'Yesterday', 'Earlier']
  const byBucket = new Map<string, ChatSessionMeta[]>()
  for (const s of list) {
    const b = bucketOf(s.updatedAt, now)
    const arr = byBucket.get(b) ?? []
    arr.push(s)
    byBucket.set(b, arr)
  }
  return order.filter((b) => byBucket.has(b)).map((name) => ({name, items: byBucket.get(name) ?? []}))
}

export function SessionSelector(props: {
  variant: 'pill' | 'bar'
  apiBase: string
  // The active session id, and a callback to make a (resolved) session active. The selector owns the
  // resolve (adopting an external row id) + rename; the surface owns what "active" means.
  activeId: () => SessionId | null
  onActivate: (id: SessionId) => void
  lockedElsewhere: (id: string) => boolean
  announce: (msg: string, assertive?: boolean) => void
}): JSX.Element {
  const idPrefix = `pw-session-${++instanceSeq}`
  // Header-less: resolve takes the id in its body, rename takes the sessionId in its body.
  const api = defineClient({apiBase: props.apiBase})
  const activeId = () => props.activeId()
  // Narrowed to a plain string[] for Ark's controlled value (drops null without a cast).
  const valueArr = (): string[] => {
    const id = activeId()
    return id ? [id] : []
  }
  const [query, setQuery] = createSignal('')
  const [now, setNow] = createSignal(0)
  const {collection, filter, set} = useListCollection<ChatSessionMeta>({
    initialItems: [],
    itemToValue: (s) => s.id,
    itemToString: (s) => s.title,
    filter: (_text, q, item) => `${item.title} ${item.id}`.toLowerCase().includes(q.toLowerCase()),
  })
  // VERIFIED (@ark-ui/solid 5.37.1): initialItems is read once; the only reactive update path is
  // set(). set() also clears the filter text, so re-apply our query after. Don't recreate the hook.
  createEffect(() => {
    set(sessions())
    if (query()) filter(query())
  })
  onMount(() => {
    setNow(Date.now())
    void loadSessions(props.apiBase)
  })

  const activeRow = () => sessions().find((s) => s.id === activeId()) ?? null
  const triggerLabel = () => activeRow()?.title || 'New session'
  const canRename = () => activeRow() !== null

  // Inline rename state (header, not a row). Commit-once dedupes Enter+blur.
  const [renaming, setRenaming] = createSignal(false)
  const [draft, setDraft] = createSignal('')
  const [renameBusy, setRenameBusy] = createSignal(false)
  let searchEl: HTMLInputElement | undefined
  // After a rename ends, land focus back in the search box (not the pencil) — otherwise clicking the
  // search toggles Ark's openOnClick and closes the still-open popover, so it reads as "can't click".
  const focusSearch = () => requestAnimationFrame(() => searchEl?.focus())
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
    const id = props.activeId() // the active row is always our id
    const next = draft().trim()
    if (!row || !id || !next || next === row.title) {
      focusSearch()
      return
    }
    const prev = row.title
    applyTitle(id, next) // optimistic
    setRenameBusy(true)
    void api
      .rename({sessionId: id, title: next})
      .then((r) => {
        applyTitle(id, r.title)
        props.announce(`Renamed to ${r.title}`)
      })
      .catch(() => {
        applyTitle(id, prev) // rollback
        props.announce('Rename failed, reverted', true)
      })
      .finally(() => {
        setRenameBusy(false)
        void invalidateSessions(props.apiBase)
      })
    focusSearch()
  }

  // Switch / open an external row: resolve its id to ours (adopting an external transcript), then
  // hand it to the surface. resolve is the only call that may carry a non-ours row id.
  const select = (id: string) => {
    if (!id || id === activeId()) return
    const title = sessions().find((s) => s.id === id)?.title ?? id
    void api.resolve({id}).then(({sessionId}) => {
      props.onActivate(sessionId)
      props.announce(`Switched to ${title}`)
      void invalidateSessions(props.apiBase)
    })
  }

  // New session: resolve with no id → a fresh mandarax_ record, then make it active.
  const newSession = () => {
    void api.resolve().then(({sessionId}) => {
      props.onActivate(sessionId)
      props.announce('Started a new session')
      void invalidateSessions(props.apiBase)
    })
  }

  const isPill = props.variant === 'pill'
  return (
    <Combobox.Root
      ids={{root: idPrefix}}
      class={isPill ? 'inline-flex min-w-0 max-w-full' : ''}
      collection={collection()}
      value={valueArr()}
      inputValue={query()}
      onValueChange={(d) => {
        const id = d.value[0]
        if (id) select(id)
        setQuery('')
        filter('')
      }}
      onInputValueChange={(d) => {
        setQuery(d.inputValue)
        filter(d.inputValue)
      }}
      onOpenChange={(d) => {
        if (d.open) {
          setNow(Date.now())
          setQuery('')
          filter('')
          void loadSessions(props.apiBase)
        }
      }}
      openOnClick
      selectionBehavior="clear"
      positioning={{
        strategy: 'fixed',
        placement: props.variant === 'pill' ? 'bottom-start' : 'bottom-start',
        gutter: 6,
      }}
    >
      <Combobox.Control class="inline-flex min-w-0">
        <Combobox.Trigger
          class={`group text-[0.75rem] text-pw-text-2 border border-transparent rounded-pw-pill bg-transparent inline-flex gap-1.5 h-7 min-w-0 cursor-pointer trans-cbb items-center hover:text-pw-text-hi [&[aria-disabled=true]]:opacity-[0.55] [&[aria-disabled=true]]:cursor-not-allowed ${
            isPill
              ? 'max-w-64 py-0 pr-1.5 pl-2 hover:border-pw-line hover:bg-pw-fill-soft data-[state=open]:border-pw-line data-[state=open]:bg-pw-fill-soft data-[state=open]:text-pw-text-hi'
              : 'p-0 font-pw-mono'
          }`}
          data-empty={canRename() ? undefined : ''}
          aria-label={`Session: ${triggerLabel()}`}
        >
          {/* Leading marker: a status dot for a live session, an accent spark for a fresh one. */}
          <Show when={canRename()} fallback={<Sparkles class="text-pw-accent shrink-0 size-3.25" aria-hidden="true" />}>
            <span class="rounded-[50%] bg-pw-accent shrink-0 size-1.75" aria-hidden="true" />
          </Show>
          <span class="min-w-0 truncate group-data-[empty]:text-pw-text-2">{triggerLabel()}</span>
          <ChevronDown
            class="opacity-45 shrink-0 size-3.25 [transition:rotate_160ms_var(--pw-ease),opacity_120ms_var(--pw-ease)] group-data-[state=open]:opacity-90 group-hover:opacity-90 group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content class="p-1 border border-pw-line-2 rounded-pw-md bg-pw-panel flex-col max-h-90 w-70 hidden shadow-pw-lg z-10 focus-visible:outline-none data-[state=open]:flex data-[state=open]:anim-combo">
          {/* Header: search + rename + new + retry. Always in Tab order, OUTSIDE the listbox. */}
          <div class="mb-1 border-b border-b-pw-line-soft flex gap-1 items-center">
            <Show
              when={!renaming()}
              fallback={
                <input
                  class="text-[0.8125rem] text-pw-text px-2 bg-transparent flex-1 h-8 min-w-0 [border:none] focus:outline-none"
                  aria-label="Rename session"
                  aria-busy={renameBusy()}
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
                class="text-[0.8125rem] text-pw-text px-2 bg-transparent flex-1 h-8 min-w-0 [border:none] placeholder:text-pw-text-3 focus:outline-none"
                placeholder="Search sessions…"
                ref={(el) => (searchEl = el)}
              />
              <button
                type="button"
                class={ACT}
                aria-label="Rename current session"
                aria-disabled={!canRename()}
                onClick={() => canRename() && startRename()}
              >
                <SquarePen class="size-5 block" aria-hidden="true" />
              </button>
              <button type="button" class={ACT} aria-label="New session" onClick={() => newSession()}>
                <Plus class="size-5 block" aria-hidden="true" />
              </button>
            </Show>
          </div>
          <div class="flex-1 overflow-y-auto">
            <Show when={status() === 'loading' && sessions().length === 0}>
              <div class="px-1 py-1.5 flex flex-col gap-1.5" role="status" aria-busy="true">
                <div class={SKEL} />
                <div class={SKEL} />
                <div class={SKEL} />
                <span class="sr-only">Loading sessions…</span>
              </div>
            </Show>
            <Show when={status() === 'error'}>
              <div
                class="text-[0.75rem] text-pw-text-3 px-2 py-2.5 flex gap-2 items-center justify-between"
                role="status"
              >
                <span>Couldn't load sessions</span>
                <button
                  type="button"
                  class="text-[0.6875rem] text-pw-text px-2 py-0.5 border border-pw-line rounded-pw-sm bg-transparent cursor-pointer"
                  onClick={() => void invalidateSessions(props.apiBase)}
                >
                  Retry
                </button>
              </div>
            </Show>
            <Show when={status() === 'ready' && collection().items.length === 0}>
              <div class="text-[0.75rem] text-pw-text-3 px-2 py-2.5" role="status">
                {query() ? 'No sessions match' : 'No other sessions yet'}
              </div>
            </Show>
            <For each={groupsOf(collection().items, now())}>
              {(group) => (
                <Combobox.ItemGroup>
                  <Combobox.ItemGroupLabel class="text-[0.6875rem] text-pw-text-3 tracking-[0.02em] font-semibold px-2 pb-0.5 pt-1.5 [text-transform:uppercase]">
                    {group.name}
                  </Combobox.ItemGroupLabel>
                  <For each={group.items}>
                    {(s) => (
                      <Combobox.Item
                        item={s}
                        class="text-pw-text px-2 py-[0.4375rem] rounded-pw-sm flex gap-2 cursor-pointer items-center data-[highlighted]:text-pw-text-hi data-[highlighted]:bg-pw-fill-strong"
                        aria-label={`${s.title} — ${metaLabel(s, now())}`}
                      >
                        <div class="flex flex-1 flex-col gap-px min-w-0">
                          <span class="truncate" title={s.title}>
                            <Combobox.ItemText>{s.title}</Combobox.ItemText>
                          </span>
                          <span class="text-[0.6875rem] text-pw-text-3 truncate" aria-hidden="true">
                            Edited {relativeTime(s.updatedAt, now())} · {s.messageCount} messages
                          </span>
                        </div>
                        <Show when={s.origin === 'mandarax'}>
                          <Sparkles class="text-pw-accent opacity-80 shrink-0 size-3.25" aria-hidden="true" />
                        </Show>
                        <Show when={props.lockedElsewhere(s.id)}>
                          <span
                            class="rounded-[50%] bg-pw-success shrink-0 size-1.75 anim-pulse"
                            aria-hidden="true"
                            title="Running in another pane"
                          />
                        </Show>
                        <Combobox.ItemIndicator class="text-pw-accent ml-auto hidden data-[state=checked]:inline-flex">
                          <Check class="size-5 block" aria-hidden="true" />
                        </Combobox.ItemIndicator>
                      </Combobox.Item>
                    )}
                  </For>
                </Combobox.ItemGroup>
              )}
            </For>
          </div>
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  )
}
