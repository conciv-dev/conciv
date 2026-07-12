import {Outlet, createFileRoute, useRouter} from '@tanstack/solid-router'
import {FocusTrap} from '@conciv/ui-kit-system'
import {Show, type JSX} from 'solid-js'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import {useFabPosition, useLayers, useSuppressed} from '../app/context.js'
import {createResizable} from '../lib/resize.js'
import {setShutter} from '../lib/shutter.js'

const PANEL_POS: Record<TriggerPosition, string> = {
  'top-left': 'top-21 left-5 [transform-origin:top_left]',
  'top-right': 'top-21 right-5 [transform-origin:top_right]',
  'middle-left': 'top-21 left-5 [transform-origin:top_left]',
  'middle-right': 'top-21 right-5 [transform-origin:top_right]',
  'bottom-left': 'bottom-21 left-5 [transform-origin:bottom_left]',
  'bottom-right': 'bottom-21 right-5 [transform-origin:bottom_right]',
}
const PANEL_BASE =
  'fixed w-120 max-w-[calc(100vw-2.5rem)] h-140 max-h-[calc(100vh-7.5rem)] flex flex-col bg-pw-glass border border-pw-line-soft rounded-pw-lg shadow-pw-lg text-pw-text font-normal text-[0.875rem] leading-[1.45] font-pw overflow-hidden'
const PANEL_OPEN = 'opacity-100 [transform:none] pointer-events-auto visible trans-pop-in'

const RESIZE = 'absolute z-[3] focus-visible:outline-none focus-visible:bg-pw-accent-20 focus-visible:ring-inset-accent'
const RESIZE_Y = 'left-0 right-0 h-2 cursor-ns-resize'
const RESIZE_X = 'top-0 bottom-0 w-2 cursor-ew-resize'

export const Route = createFileRoute('/panel')({component: PanelLayout})

function PanelLayout(): JSX.Element {
  const fabPosition = useFabPosition()
  const layers = useLayers()
  const suppressed = useSuppressed()
  const router = useRouter()
  const search = Route.useSearch()
  const position = fabPosition
  const anchoredBottom = () => position().startsWith('bottom')
  const anchoredRight = () => position().endsWith('right')
  const close = () => setShutter(router, false)

  const resizeY = createResizable({
    initial: 560,
    min: 240,
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
    <Show when={search().open}>
      <FocusTrap disabled={layers.anyOpen()}>
        <section
          class={`${PANEL_BASE} ${PANEL_POS[position()]} ${PANEL_OPEN}`}
          data-pw-panel
          data-pw-suppressed={suppressed()}
          style={{height: `${resizeY.size()}px`, width: `${resizeX.size()}px`}}
          role="dialog"
          aria-label="conciv chat agent"
          id="pw-chat-panel"
        >
          <div
            class={`${RESIZE}  ${RESIZE_Y}  ${anchoredBottom() ? 'top-0' : 'bottom-0'}`}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize chat height"
            aria-valuemin={240}
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
          <Outlet />
        </section>
      </FocusTrap>
    </Show>
  )
}
