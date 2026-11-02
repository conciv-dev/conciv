import {For, Show, createMemo, type JSX} from 'solid-js'
import type {DevframeDockEntry, DevframeViewIframe} from '@devframes/hub/types'
import {useApiBase} from '../app/context.js'
import {useHubShell, type HubShell} from '../app/devframe-overlays.js'
import {resolveHubBase} from '../lib/api-base.js'
import {viewTabPanelAttributes} from '../pane/view-tab-ids.js'

const DOCK_VIEW_PREFIX = 'dock:'

const DOCK_PANEL = 'flex flex-1 flex-col min-h-0'
const DOCK_FRAME = 'flex-1 min-h-0 w-full border-0 block [background:var(--chat-bg)]'

export function dockViewId(dockId: string): string {
  return `${DOCK_VIEW_PREFIX}${dockId}`
}

export function dockIdOfView(view: string): string | undefined {
  return view.startsWith(DOCK_VIEW_PREFIX) ? view.slice(DOCK_VIEW_PREFIX.length) : undefined
}

function isShownDock(entry: DevframeDockEntry): entry is DevframeViewIframe {
  return entry.type === 'iframe' && entry.when !== 'false'
}

function hubOnPageOrigin(apiBase: string): boolean {
  return resolveHubBase(new URL(apiBase, window.location.href).origin) === window.location.origin
}

export type ShownDocks = {shell: HubShell; docks: () => DevframeViewIframe[]}

export function createShownDocks(): ShownDocks {
  const shell = useHubShell()
  const apiBase = useApiBase()
  const docks = createMemo(() => (hubOnPageOrigin(apiBase()) ? shell.docks().filter(isShownDock) : []))
  return {shell, docks}
}

function DockPanel(props: {
  entry: DevframeViewIframe
  active: boolean
  slideClass: string
  onSlideEnd: () => void
}): JSX.Element {
  const src = createMemo(() => new URL(props.entry.url, window.location.origin).href)
  return (
    <div
      {...viewTabPanelAttributes(dockViewId(props.entry.id))}
      class={props.active ? `${DOCK_PANEL} ${props.slideClass}` : 'hidden'}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) props.onSlideEnd()
      }}
    >
      <iframe class={DOCK_FRAME} src={src()} title={props.entry.title} />
    </div>
  )
}

export function DockLayer(props: {
  docks: readonly DevframeViewIframe[]
  active: string | undefined
  slideClass: string
  onSlideEnd: () => void
}): JSX.Element {
  const isLive = (id: string): boolean => props.docks.some((entry) => entry.id === id)
  const opened = createMemo<string[]>((previous) => {
    const kept = previous.filter(isLive)
    const active = props.active
    if (active === undefined || kept.includes(active) || !isLive(active)) return kept
    return [...kept, active]
  }, [])
  return (
    <For each={opened()}>
      {(id) => (
        <Show when={props.docks.find((entry) => entry.id === id)}>
          {(entry) => (
            <DockPanel
              entry={entry()}
              active={props.active === id}
              slideClass={props.slideClass}
              onSlideEnd={props.onSlideEnd}
            />
          )}
        </Show>
      )}
    </For>
  )
}
