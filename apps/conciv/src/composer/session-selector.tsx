import {createSignal, createEffect, For, Show, onMount, type JSX} from 'solid-js'
import {Combobox, TooltipIconButton} from '@conciv/ui-kit-system'
import {useListCollection} from '@ark-ui/solid/combobox'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {Check, ChevronDown, Sparkles, SquarePen, Plus} from 'lucide-solid'
import type {SessionMeta} from '@conciv/contract'
import {useAnnounce, useAppData, useRpc} from '../app/context.js'

let instanceSeq = 0

const ACT =
  'inline-flex items-center justify-center size-7 shrink-0 [border:0] rounded-pw-sm bg-transparent text-pw-text-2 cursor-pointer hover:bg-pw-fill-strong hover:text-pw-text-hi [&[aria-disabled=true]]:opacity-50 [&[aria-disabled=true]]:cursor-not-allowed'

const SKEL = 'h-8 rounded-pw-sm skel-bg [background-size:200%_100%] anim-skel'

function bucketOf(updatedAt: number, now: number): 'Today' | 'Yesterday' | 'Earlier' {
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

function metaLabel(s: SessionMeta, now: number): string {
  const origin = s.origin === 'conciv' ? 'started in conciv' : 'started externally'
  return `Edited ${relativeTime(s.updatedAt, now)} · ${s.messageCount} messages · ${origin}`
}

function groupsOf(list: SessionMeta[], now: number): {name: string; items: SessionMeta[]}[] {
  const order: ('Today' | 'Yesterday' | 'Earlier')[] = ['Today', 'Yesterday', 'Earlier']
  const byBucket = new Map<string, SessionMeta[]>()
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
  activeId: () => string | null
  onActivate: (id: string) => void
  onNewSession: () => void
}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const idPrefix = `pw-session-${++instanceSeq}`

  const list = useQuery(() => appData.utils.sessions.list.queryOptions())
  const rows = (): SessionMeta[] => list.data ?? []
  const lockedElsewhere = (id: string) => (rows().find((s) => s.id === id)?.running ?? false) && id !== props.activeId()
  const activeId = () => props.activeId()

  const valueArr = (): string[] => {
    const id = activeId()
    return id ? [id] : []
  }
  const [query, setQuery] = createSignal('')
  const [now, setNow] = createSignal(0)
  const {collection, filter, set} = useListCollection<SessionMeta>({
    initialItems: [],
    itemToValue: (s) => s.id,
    itemToString: (s) => s.title,
    filter: (_text, q, item) => `${item.title} ${item.id}`.toLowerCase().includes(q.toLowerCase()),
  })

  createEffect(() => {
    set(rows())
    if (query()) filter(query())
  })
  onMount(() => setNow(Date.now()))

  const activeRow = () => rows().find((s) => s.id === activeId()) ?? null
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
    const title = rows().find((s) => s.id === id)?.title ?? id
    props.onActivate(id)
    announce(`Switched to ${title}`)
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
          appData.invalidateSessions()
        }
      }}
      openOnClick
      selectionBehavior="clear"
      positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 6}}
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
          <div class="mb-1 border-b border-b-pw-line-soft flex gap-1 items-center">
            <Show
              when={!renaming()}
              fallback={
                <input
                  class="text-[0.8125rem] text-pw-text px-2 bg-transparent flex-1 h-8 min-w-0 [border:none] focus:outline-none"
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
                class="text-[0.8125rem] text-pw-text px-2 bg-transparent flex-1 h-8 min-w-0 [border:none] placeholder:text-pw-text-3 focus:outline-none"
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
          <div class="flex-1 overflow-y-auto">
            <Show when={list.isLoading && rows().length === 0}>
              <div class="px-1 py-1.5 flex flex-col gap-1.5" role="status" aria-busy="true">
                <div class={SKEL} />
                <div class={SKEL} />
                <div class={SKEL} />
                <span class="sr-only">Loading sessions…</span>
              </div>
            </Show>
            <Show when={list.isError}>
              <div
                class="text-[0.75rem] text-pw-text-3 px-2 py-2.5 flex gap-2 items-center justify-between"
                role="status"
              >
                <span>Couldn't load sessions</span>
                <button
                  type="button"
                  class="text-[0.6875rem] text-pw-text px-2 py-0.5 border border-pw-line rounded-pw-sm bg-transparent cursor-pointer"
                  onClick={() => void list.refetch()}
                >
                  Retry
                </button>
              </div>
            </Show>
            <Show when={list.isSuccess && collection().items.length === 0}>
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
                        <Show when={s.origin === 'conciv'}>
                          <Sparkles class="text-pw-accent opacity-80 shrink-0 size-3.25" aria-hidden="true" />
                        </Show>
                        <Show when={lockedElsewhere(s.id)}>
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
