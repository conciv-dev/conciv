import {createResource, createSignal, For, from, onCleanup, Show, type JSX} from 'solid-js'
import type {SharedState} from 'devframe/utils/shared-state'
import LayoutGrid from 'lucide-solid/icons/layout-grid'
import type {DevframeDockEntry} from '@devframes/hub/types'
import type {DevframeClientRuntime} from '@devframes/hub/client'
import {defineExtension} from '@conciv/extension'
import {getHostApi} from '@conciv/extension/host'
import {SESSION_ATTRIBUTE} from '@conciv/extension-terminal/dock'
import {useDevframeRuntime} from '../app/devframe-link.js'

const NAME = 'devframe-docks'

function mountDock(
  container: HTMLDivElement,
  entry: DevframeDockEntry,
  sessionId: string | null,
  runtime: () => DevframeClientRuntime | undefined,
): void {
  if (sessionId) container.setAttribute(SESSION_ATTRIBUTE, sessionId)
  const context = runtime()?.context
  if (!context) return
  void context.renderers.mount(entry, container).then((result) => {
    if (result.status === 'mounted') onCleanup(result.dispose)
    else container.textContent = `No renderer for dock type "${entry.type}"`
  })
}

function DockSurface(props: {entry: DevframeDockEntry; apiBase: string; sessionId: string | null}): JSX.Element {
  const runtime = useDevframeRuntime()
  return (
    <Show
      when={props.entry.type === 'iframe' ? props.entry : null}
      fallback={
        <div
          ref={(container) => mountDock(container, props.entry, props.sessionId, runtime)}
          class="flex-1 min-h-0 p-2"
        />
      }
    >
      {(entry) => (
        <iframe
          class="flex-1 min-h-0 border-0"
          sandbox="allow-scripts allow-same-origin allow-forms"
          src={new URL(entry().url, props.apiBase).href}
          title={entry().title}
        />
      )}
    </Show>
  )
}

function visible(entry: DevframeDockEntry): boolean {
  return (
    entry.when !== 'false' && entry.id !== 'conciv' && (entry.type === 'iframe' || entry.type === 'conciv-terminal')
  )
}

function liveEntries(state: SharedState<DevframeDockEntry[]>): () => DevframeDockEntry[] | undefined {
  return from<DevframeDockEntry[]>((set) => {
    set([...state.value()])
    return state.on('updated', (next: readonly DevframeDockEntry[]) => set([...next]))
  })
}

function DockRail(props: {all: () => DevframeDockEntry[] | undefined}): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const sessionId = host.useSessionId()
  const entries = (): DevframeDockEntry[] => (props.all() ?? []).filter(visible)
  const [selected, setSelected] = createSignal<string | null>(null)
  const current = (): DevframeDockEntry | undefined =>
    entries().find((entry) => entry.id === (selected() ?? entries()[0]?.id))
  return (
    <div class="flex flex-1 min-h-0 flex-col">
      <div class="flex gap-1 p-2 border-b border-chat-line" role="tablist" aria-label="Devframe docks">
        <For each={entries()}>
          {(entry) => (
            <button
              type="button"
              role="tab"
              aria-selected={current()?.id === entry.id}
              class="px-2 py-1 text-xs rounded-chat-surface-sm aria-selected:bg-chat-fill text-chat-text-2"
              onClick={() => setSelected(entry.id)}
            >
              {entry.title}
            </button>
          )}
        </For>
      </div>
      <Show when={current()} keyed>
        {(entry) => <DockSurface entry={entry} apiBase={apiBase()} sessionId={sessionId()} />}
      </Show>
    </div>
  )
}

function DevframeDocksView(): JSX.Element {
  const runtime = useDevframeRuntime()
  const [docks] = createResource(
    () => runtime(),
    (ready) => ready.context.rpc.sharedState.get<DevframeDockEntry[]>('devframe:docks', {initialValue: []}),
  )
  return (
    <Show when={docks()} fallback={<p class="p-3 text-xs text-chat-text-3">Authorize conciv to load docks.</p>}>
      {(state) => <DockRail all={liveEntries(state())} />}
    </Show>
  )
}

export default defineExtension({
  name: NAME,
  views: [{id: 'devframe', label: 'Devframe', icon: LayoutGrid, Component: DevframeDocksView}],
})
