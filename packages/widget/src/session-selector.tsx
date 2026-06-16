import {createSignal, createEffect, For, Show, onMount, type JSX} from 'solid-js'
import {Combobox, useListCollection} from '@ark-ui/solid/combobox'
import {Check, ChevronDown, Sparkles, SquarePen, Plus} from 'lucide-solid'
import type {ChatSessionMeta, SessionId} from '@aidx/protocol/chat-types'
import {defineClient} from './session-client.js'
import {sessions, status, loadSessions, invalidateSessions, applyTitle} from './session-store-client.js'

// One id-prefix per mounted instance so two selectors under one shadow root never share Ark's
// aria-controls / activedescendant ids (a11y — §6).
let instanceSeq = 0

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
  const origin = s.origin === 'aidx' ? 'started in aidx' : 'started externally'
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

  // New session: resolve with no id → a fresh aidx_ record, then make it active.
  const newSession = () => {
    void api.resolve().then(({sessionId}) => {
      props.onActivate(sessionId)
      props.announce('Started a new session')
      void invalidateSessions(props.apiBase)
    })
  }

  return (
    <Combobox.Root
      ids={{root: idPrefix}}
      class={props.variant === 'pill' ? 'pw-session pw-session-pill' : 'pw-session pw-session-bar'}
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
      <Combobox.Control class="pw-session-control">
        <Combobox.Trigger
          class="pw-session-trigger"
          data-empty={canRename() ? undefined : ''}
          aria-label={`Session: ${triggerLabel()}`}
        >
          {/* Leading marker: a status dot for a live session, an accent spark for a fresh one. */}
          <Show when={canRename()} fallback={<Sparkles class="pw-session-spark" aria-hidden="true" />}>
            <span class="pw-session-dot" aria-hidden="true" />
          </Show>
          <span class="pw-session-current">{triggerLabel()}</span>
          <ChevronDown class="pw-session-caret" aria-hidden="true" />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content class="pw-session-content pw-combo-content">
          {/* Header: search + rename + new + retry. Always in Tab order, OUTSIDE the listbox. */}
          <div class="pw-session-head">
            <Show
              when={!renaming()}
              fallback={
                <input
                  class="pw-session-rename"
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
              <Combobox.Input class="pw-session-search" placeholder="Search sessions…" ref={(el) => (searchEl = el)} />
              <button
                type="button"
                class="pw-session-act"
                aria-label="Rename current session"
                aria-disabled={!canRename()}
                onClick={() => canRename() && startRename()}
              >
                <SquarePen class="pw-icon" aria-hidden="true" />
              </button>
              <button type="button" class="pw-session-act" aria-label="New session" onClick={() => newSession()}>
                <Plus class="pw-icon" aria-hidden="true" />
              </button>
            </Show>
          </div>
          <div class="pw-session-list">
            <Show when={status() === 'loading' && sessions().length === 0}>
              <div class="pw-session-loading" role="status" aria-busy="true">
                <div class="pw-session-skel" />
                <div class="pw-session-skel" />
                <div class="pw-session-skel" />
                <span class="pw-sr-only">Loading sessions…</span>
              </div>
            </Show>
            <Show when={status() === 'error'}>
              <div class="pw-session-error" role="status">
                <span>Couldn't load sessions</span>
                <button type="button" class="pw-session-retry" onClick={() => void invalidateSessions(props.apiBase)}>
                  Retry
                </button>
              </div>
            </Show>
            <Show when={status() === 'ready' && collection().items.length === 0}>
              <div class="pw-session-empty" role="status">
                {query() ? 'No sessions match' : 'No other sessions yet'}
              </div>
            </Show>
            <For each={groupsOf(collection().items, now())}>
              {(group) => (
                <Combobox.ItemGroup class="pw-session-group">
                  <Combobox.ItemGroupLabel class="pw-session-group-label">{group.name}</Combobox.ItemGroupLabel>
                  <For each={group.items}>
                    {(s) => (
                      <Combobox.Item
                        item={s}
                        class="pw-session-item"
                        aria-label={`${s.title} — ${metaLabel(s, now())}`}
                      >
                        <div class="pw-session-item-main">
                          <span class="pw-session-item-title" title={s.title}>
                            <Combobox.ItemText>{s.title}</Combobox.ItemText>
                          </span>
                          <span class="pw-session-item-meta" aria-hidden="true">
                            Edited {relativeTime(s.updatedAt, now())} · {s.messageCount} messages
                          </span>
                        </div>
                        <Show when={s.origin === 'aidx'}>
                          <Sparkles class="pw-session-origin" aria-hidden="true" />
                        </Show>
                        <Show when={props.lockedElsewhere(s.id)}>
                          <span class="pw-session-running" aria-hidden="true" title="Running in another pane" />
                        </Show>
                        <Combobox.ItemIndicator class="pw-session-check">
                          <Check class="pw-icon" aria-hidden="true" />
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
