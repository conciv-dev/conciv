import {Outlet, createFileRoute} from '@tanstack/solid-router'
import {FocusTrap, createResizable} from '@conciv/ui-kit-system'
import {Show, createEffect, createSignal, type JSX} from 'solid-js'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import {useEnvironment, useFabPosition, useLayers, useSuppressed} from '../app/context.js'
import {makePanelComposerFocus, PanelComposerFocusContext} from '../app/panel-focus.js'
import {usePanelChrome} from '../app/panel-chrome.js'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../lib/media-query.js'
import {hostPageHasFocus} from '../lib/host-focus.js'
import {NoticeContextProvider, NoticeSurface} from '../shell/notice-context.js'
import {EngineStaleNotice, EngineUnreachableNotice} from '../shell/engine-notice.js'

const PANEL_POS: Record<TriggerPosition, string> = {
  'top-left': 'top-21 left-5 [transform-origin:top_left]',
  'top-right': 'top-21 right-5 [transform-origin:top_right]',
  'middle-left': 'top-21 left-5 [transform-origin:top_left]',
  'middle-right': 'top-21 right-5 [transform-origin:top_right]',
  'bottom-left': 'bottom-21 left-5 [transform-origin:bottom_left]',
  'bottom-right': 'bottom-21 right-5 [transform-origin:bottom_right]',
}
const PANEL_BASE =
  'fixed flex flex-col text-pw-text font-normal text-[0.875rem] leading-[1.45] font-pw overflow-hidden [container-type:size]'
const PANEL_CARD =
  'bg-pw-glass w-120 max-w-[calc(100vw-2.5rem)] h-140 max-h-[calc(100vh-7.5rem)] border border-pw-line-soft rounded-pw-lg shadow-pw-lg'
const PANEL_SHEET = 'bg-pw-panel inset-0 w-full h-full rounded-none pad-safe'
const PANEL_OPEN =
  'pointer-events-auto visible trans-pop-in opacity-100 [transform:none] starting:opacity-0 starting:[transform:translateY(8px)_scale(0.98)]'
const PANEL_CLOSING = 'pointer-events-none invisible trans-pop-out opacity-0 [transform:translateY(8px)_scale(0.98)]'

const PANEL_MIN_HEIGHT = 400

const RESIZE = 'absolute z-[3] focus-visible:outline-none focus-visible:bg-pw-accent-20 focus-visible:ring-inset-accent'
const RESIZE_Y = 'left-0 right-0 h-2 cursor-ns-resize'
const RESIZE_X = 'top-0 bottom-0 w-2 cursor-ew-resize'

export const Route = createFileRoute('/panel')({component: PanelLayout})

function PanelLayout(): JSX.Element {
  const fabPosition = useFabPosition()
  const layers = useLayers()
  const suppressed = useSuppressed()
  const panelChrome = usePanelChrome()
  const environment = useEnvironment()
  const search = Route.useSearch()
  const position = fabPosition
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const anchoredBottom = () => position().startsWith('bottom')
  const anchoredRight = () => position().endsWith('right')
  const close = () => panelChrome.close()
  const open = () => search().open ?? false

  const [mounted, setMounted] = createSignal(false)
  createEffect(() => {
    if (open()) setMounted(true)
  })

  const composerFocus = makePanelComposerFocus()
  const keepTrapFromFocusing = (): false => false
  createEffect(() => {
    if (!open()) return
    if (hostPageHasFocus(environment.rootNode)) return
    composerFocus.handle()?.focus()
  })

  const resizeY = createResizable({
    initial: 560,
    min: PANEL_MIN_HEIGHT,
    collapseAt: 140,
    storageKey: 'conciv-modal-height',
    grow: () => (anchoredBottom() ? 'up' : 'down'),
    onCollapse: close,
  })
  const resizeX = createResizable({
    initial: 480,
    min: 448,
    storageKey: 'conciv-modal-width',
    grow: () => (anchoredRight() ? 'left' : 'right'),
  })

  return (
    <Show when={mounted()}>
      <NoticeContextProvider>
        <PanelComposerFocusContext.Provider value={composerFocus}>
          <FocusTrap
            disabled={!open() || layers.anyOpen()}
            initialFocus={keepTrapFromFocusing}
            returnFocusOnDeactivate={false}
          >
            <section
              class={`${PANEL_BASE} ${phone() ? PANEL_SHEET : `${PANEL_CARD} ${PANEL_POS[position()]}`} ${open() ? PANEL_OPEN : PANEL_CLOSING}`}
              data-pw-panel
              data-pw-suppressed={suppressed()}
              style={phone() ? undefined : {height: `${resizeY.size()}px`, width: `${resizeX.size()}px`}}
              role="dialog"
              aria-label="conciv chat agent"
              id="pw-chat-panel"
            >
              <NoticeSurface />
              <EngineStaleNotice />
              <EngineUnreachableNotice />
              <Show when={!phone()}>
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
                  aria-valuemin={300}
                  aria-valuenow={Math.round(resizeX.size())}
                  tabindex={0}
                  onPointerDown={resizeX.onPointerDown}
                  onKeyDown={resizeX.onKeyDown}
                />
              </Show>
              <Outlet />
            </section>
          </FocusTrap>
        </PanelComposerFocusContext.Provider>
      </NoticeContextProvider>
    </Show>
  )
}
