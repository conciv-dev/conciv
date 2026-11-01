import {createSignal, For, onCleanup, onMount, Show, type JSX} from 'solid-js'
import type {} from '@devframes/plugin-messages/rpc'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {DevframeClientRuntime} from '@devframes/hub/client'
import type {DevframeCommandEntry} from '@devframes/hub/types'

type Toast = {id: string; message: string; description?: string; level: string}

const TOAST_MS = 5000
const LEVEL_TONE: Record<string, string> = {
  error: 'border-chat-danger-line',
  warn: 'border-chat-warning-line',
  success: 'border-chat-success-line',
}

type FeedEntry = {id: string; message: string; description?: string; level: string; notify?: boolean}
type FeedDelta = {entries: FeedEntry[]; version: number; full: boolean}

function DevframeToasts(props: {runtime: DevframeClientRuntime}): JSX.Element {
  const [toasts, setToasts] = createSignal<Toast[]>([])
  const seen = new Set<string>()
  const state: {version: number | null; primed: boolean} = {version: null, primed: false}
  const dismiss = (id: string): void => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }
  const refresh = async (): Promise<void> => {
    const rpc = props.runtime.context.rpc
    const delta = (await rpc.call('devframes:plugin:messages:list', state.version)) as FeedDelta
    const fresh = delta.entries.filter((entry) => entry.notify && !seen.has(entry.id))
    delta.entries.forEach((entry) => seen.add(entry.id))
    state.version = delta.version
    if (!state.primed) {
      state.primed = true
      return
    }
    setToasts((list) => [...list, ...fresh.map((entry) => ({...entry}))])
    fresh.forEach((entry) => setTimeout(() => dismiss(entry.id), TOAST_MS))
  }
  onMount(() => {
    props.runtime.context.rpc.client.register(
      {name: 'devframe:messages:updated', type: 'action', handler: () => void refresh().catch(() => {})},
      true,
    )
    void refresh().catch(() => {})
  })
  return (
    <div class="pointer-events-none fixed bottom-24 left-6 z-20 flex w-80 flex-col gap-2 font-chat" aria-live="polite">
      <For each={toasts()}>
        {(toast) => (
          <div
            class={`pointer-events-auto flex flex-col gap-0.5 px-3 py-2 text-chat-text [background:var(--chat-bg)] border ${LEVEL_TONE[toast.level] ?? 'border-chat-line'} [border-radius:var(--chat-radius)] shadow-chat-lg`}
            role="status"
          >
            <span class="text-[0.8125rem] font-medium">{toast.message}</span>
            <Show when={toast.description}>
              <span class="text-[0.75rem] text-chat-text-2 line-clamp-3">{toast.description}</span>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

function CommandPalette(props: {runtime: DevframeClientRuntime; onClose: () => void}): JSX.Element {
  const [query, setQuery] = createSignal('')
  const [active, setActive] = createSignal(0)
  const matches = (): DevframeCommandEntry[] =>
    props.runtime.context.commands.paletteCommands.filter((command) =>
      command.title.toLowerCase().includes(query().toLowerCase()),
    )
  const run = (command: DevframeCommandEntry | undefined): void => {
    if (!command) return
    props.onClose()
    void props.runtime.context.commands.execute(command.id)
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') props.onClose()
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, matches().length - 1))
    if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
    if (event.key === 'Enter') run(matches()[active()])
  }
  return (
    <div
      class="pointer-events-auto fixed inset-0 z-30 flex items-start justify-center pt-[15vh] bg-black/30"
      onClick={() => props.onClose()}
    >
      <div
        class="flex w-[28rem] flex-col overflow-hidden font-chat text-chat-text [background:var(--chat-bg)] border border-chat-line [border-radius:var(--chat-radius-lg)] shadow-chat-lg"
        role="dialog"
        aria-label="Devframe commands"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={(element) => queueMicrotask(() => element.focus())}
          class="px-4 py-3 text-[0.875rem] bg-transparent border-b border-chat-line outline-none"
          placeholder="Run a command…"
          aria-label="Search commands"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <ul class="max-h-80 overflow-y-auto p-1" role="listbox">
          <For each={matches()} fallback={<li class="px-3 py-2 text-xs text-chat-text-3">No commands</li>}>
            {(command, index) => (
              <li
                role="option"
                aria-selected={active() === index()}
                class="flex flex-col px-3 py-2 cursor-pointer [border-radius:var(--chat-radius)] aria-selected:bg-chat-fill"
                onMouseEnter={() => setActive(index())}
                onClick={() => run(command)}
              >
                <span class="text-[0.8125rem]">{command.title}</span>
                <Show when={command.description}>
                  <span class="text-[0.75rem] text-chat-text-3">{command.description}</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  )
}

export function DevframeOverlays(props: {runtime: DevframeClientRuntime}): JSX.Element {
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  makeEventListener(
    window,
    'keydown',
    (event) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setPaletteOpen((open) => !open)
    },
    {capture: true},
  )
  onCleanup(() => setPaletteOpen(false))
  return (
    <>
      <DevframeToasts runtime={props.runtime} />
      <Show when={paletteOpen()}>
        <CommandPalette runtime={props.runtime} onClose={() => setPaletteOpen(false)} />
      </Show>
    </>
  )
}
