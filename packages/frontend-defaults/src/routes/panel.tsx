import {Outlet, createFileRoute, useLocation} from '@tanstack/solid-router'
import {FocusTrap, createResizable} from '@conciv/ui-kit-system'
import {Show, createEffect, createMemo, createSignal, on, type JSX, type ParentProps} from 'solid-js'
import {createActiveElement} from '@solid-primitives/active-element'
import {panelPlacement} from '../lib/draggable-position.js'
import {useEnvironment, useFabAnchor, useLayers, usePanelWidthCap, useSettings, useSuppressed} from '../app/context.js'
import {makePanelComposerFocus, PanelComposerFocusContext} from '../app/panel-focus.js'
import {usePanelChrome} from '../app/panel-chrome.js'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '@internal/frontend-app-api/lib/media-query'
import {hostPageHasFocus} from '../lib/host-focus.js'
import {PLUGIN_OVERLAY_ATTR} from '@conciv/types/ui-types'
import {NoticeSurface} from '../shell/notice-context.js'
import {
  EngineLockedNotice,
  EngineOutdatedNotice,
  EngineStaleNotice,
  EngineUnreachableNotice,
} from '../shell/engine-notice.js'
import {Contribution} from '@internal/frontend-app-api/plugin/render'
import {usePluginServers} from '@internal/frontend-app-api/plugin/servers'

function PluginServerCover(props: ParentProps) {
  const servers = usePluginServers()

  const covered = createMemo(() => {
    const source = servers.routed()

    if (!source?.entry.cover || source.entry.state === 'ready') return

    return source.key
  })

  return (
    <div class="flex flex-1 flex-col min-h-0 min-w-0 relative">
      <div
        class="flex flex-1 flex-col min-h-0 min-w-0"
        classList={{invisible: !!covered()}}
        inert={!!covered()}
        aria-hidden={covered() ? true : undefined}
      >
        {props.children}
      </div>
      <Show when={covered()} keyed>
        {(key) => {
          const source = servers.entry(key)
          const cover = source?.entry.cover

          if (!source || !cover) return null

          return (
            <div class="inset-0 absolute">
              <Contribution plugin={source.plugin}>{() => cover({tab: undefined})}</Contribution>
            </div>
          )
        }}
      </Show>
    </div>
  )
}

const PANEL_HEIGHT_INSET_REM = 7.5
const PANEL_DEFAULT_HEIGHT_PX = 750

function panelHeightCap(viewportHeightPx: number, fontSizePx: number): number {
  return viewportHeightPx - PANEL_HEIGHT_INSET_REM * fontSizePx
}

function defaultPanelHeight(viewportHeightPx: number, fontSizePx: number): number {
  return Math.min(PANEL_DEFAULT_HEIGHT_PX, viewportHeightPx * 0.9, panelHeightCap(viewportHeightPx, fontSizePx))
}

const PANEL_BASE =
  'fixed flex flex-col text-chat-text font-normal text-[0.875rem] leading-[1.45] font-chat overflow-hidden [container-type:size]'
const PANEL_CARD =
  '[background:var(--chat-bg)] w-125 h-[min(750px,90vh)] [border:1px_solid_var(--chat-line)] [border-radius:var(--chat-radius-lg)] shadow-chat-lg'
const PANEL_SHEET = '[background:var(--chat-bg)] inset-0 w-full h-full rounded-none pad-safe'
const PANEL_TICK_TOP =
  'absolute inset-inline-0 top-0 h-1.25 pointer-events-none [background-image:repeating-linear-gradient(90deg,var(--chat-perforation)_0_1px,transparent_1px_12px)]'
const PANEL_TICK_LEFT =
  'absolute inset-block-0 left-0 w-1 -z-1 pointer-events-none [background-image:repeating-linear-gradient(180deg,var(--chat-perforation)_0_1px,transparent_1px_12px)]'
const PANEL_OPEN =
  'pointer-events-auto visible trans-pop-in opacity-100 [transform:none] starting:opacity-0 starting:[transform:translateY(8px)_scale(0.98)]'
const PANEL_CLOSING = 'pointer-events-none invisible trans-pop-out opacity-0 [transform:translateY(8px)_scale(0.98)]'

const PANEL_MIN_HEIGHT = 400
const PANEL_MIN_WIDTH = 448
const PANEL_DEFAULT_WIDTH = 500

function rootFontSizePx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

const RESIZE =
  'absolute z-[3] focus-visible:outline-none focus-visible:bg-chat-accent-20 focus-visible:ring-inset-accent'
const RESIZE_Y = 'left-0 right-0 h-2 cursor-ns-resize'
const RESIZE_X = 'top-0 bottom-0 w-2 cursor-ew-resize'

export const Route = createFileRoute('/panel')({codeSplitGroupings: [], component: PanelLayout})

function PanelLayout(): JSX.Element {
  const fabAnchor = useFabAnchor()
  const panelWidthCap = usePanelWidthCap()
  const layers = useLayers()
  const suppressed = useSuppressed()
  const panelChrome = usePanelChrome()
  const environment = useEnvironment()
  const open = Route.useSearch({select: (search) => search.open ?? false})
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const settings = useSettings()
  const docked = settings.surface === 'dock'
  const sheet = () => phone() || docked
  const anchoredBottom = () => fabAnchor().corner.startsWith('bottom')
  const anchoredRight = () => fabAnchor().corner.endsWith('right')
  const close = () => panelChrome.close()

  const [mounted, setMounted] = createSignal(false)
  createEffect(() => {
    if (open()) setMounted(true)
  })

  const composerFocus = makePanelComposerFocus()
  const keepTrapFromFocusing = (): false => false
  const focusedOverlay = (): Element | null => document.activeElement?.closest(`[${PLUGIN_OVERLAY_ATTR}]`) ?? null
  const overlaysKeepFocus = [focusedOverlay]
  const activeElement = createActiveElement()
  const hostHoldsFocus = createMemo(() => activeElement() !== null && hostPageHasFocus(environment.rootNode))
  const restoringFocus = useLocation({select: (location) => location.state.restoreFocus !== undefined})
  createEffect(
    on([open, restoringFocus, composerFocus.handle], ([isOpen, restoring, handle]) => {
      if (!isOpen || restoring) return
      if (hostPageHasFocus(environment.rootNode)) return
      handle?.focus()
    }),
  )

  const resizeY = createResizable({
    initial: defaultPanelHeight(window.innerHeight, rootFontSizePx()),
    min: PANEL_MIN_HEIGHT,
    max: () => panelHeightCap(window.innerHeight, rootFontSizePx()),
    collapseAt: 140,
    storageKey: 'conciv-modal-height',
    grow: () => (anchoredBottom() ? 'up' : 'down'),
    onCollapse: close,
  })
  const resizeX = createResizable({
    initial: PANEL_DEFAULT_WIDTH,
    min: PANEL_MIN_WIDTH,
    max: panelWidthCap,
    storageKey: 'conciv-modal-width',
    grow: () => (anchoredRight() ? 'left' : 'right'),
  })

  return (
    <Show when={mounted()}>
      <PanelComposerFocusContext.Provider value={composerFocus}>
        <FocusTrap
          disabled={docked || !open() || layers.anyOpen() || hostHoldsFocus()}
          initialFocus={keepTrapFromFocusing}
          returnFocusOnDeactivate={false}
          persistentElements={overlaysKeepFocus}
        >
          <section
            class={`${PANEL_BASE} ${sheet() ? PANEL_SHEET : PANEL_CARD} ${open() ? PANEL_OPEN : PANEL_CLOSING}`}
            data-conciv-panel
            data-conciv-suppressed={suppressed()}
            inert={suppressed() !== undefined}
            aria-hidden={suppressed() === undefined ? undefined : true}
            style={
              sheet()
                ? undefined
                : {...panelPlacement(fabAnchor()), height: `${resizeY.size()}px`, width: `${resizeX.size()}px`}
            }
            ref={panelChrome.frame}
            role="dialog"
            aria-label="conciv chat agent"
            id="conciv-chat-panel"
          >
            <EngineLockedNotice />
            <EngineOutdatedNotice />
            <NoticeSurface />
            <EngineStaleNotice />
            <EngineUnreachableNotice />
            <Show when={!sheet()}>
              <div class={PANEL_TICK_TOP} aria-hidden="true" />
              <div class={PANEL_TICK_LEFT} aria-hidden="true" />
              <div
                class={`${RESIZE}  ${RESIZE_Y}  ${anchoredBottom() ? 'top-0' : 'bottom-0'}`}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize chat height"
                aria-valuemin={PANEL_MIN_HEIGHT}
                aria-valuenow={Math.round(resizeY.size())}
                tabindex={0}
                onPointerDown={resizeY.onPointerDown}
                onKeyDown={resizeY.onKeyDown}
              />
              <div
                class={`${RESIZE}  ${RESIZE_X}  ${anchoredRight() ? 'left-0' : 'right-0'}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize chat width"
                aria-valuemin={PANEL_MIN_WIDTH}
                aria-valuemax={Math.round(panelWidthCap())}
                aria-valuenow={Math.round(resizeX.size())}
                tabindex={0}
                onPointerDown={resizeX.onPointerDown}
                onKeyDown={resizeX.onKeyDown}
              />
            </Show>
            <PluginServerCover>
              <Outlet />
            </PluginServerCover>
          </section>
        </FocusTrap>
      </PanelComposerFocusContext.Provider>
    </Show>
  )
}
