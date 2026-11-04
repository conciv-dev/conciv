import {Show, Suspense, createSignal, type JSX} from 'solid-js'
import {createElementSize} from '@solid-primitives/resize-observer'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import {Tooltip, TooltipIconButton} from '@conciv/ui-kit-system'
import {launcherPlacement, type DraggablePosition, type LauncherEdgeTab} from '../lib/draggable-position.js'
import type {TriggerCorner, TriggerEdge} from '../lib/draggable-physics.js'
import {FabRobot} from './fab-robot.js'

const FAB_BASE =
  'group fixed w-max h-13 p-0.75 rounded-chat-pill border border-chat-line bg-chat-panel text-chat-accent text-[1.375rem] cursor-pointer select-none touch-none pointer-events-auto shadow-chat-lg inline-flex items-center font-chat trans-lift anim-fab focus-ring active:[transform:translateY(0)_scale(0.94)]'
const FAB_LIFT =
  '[@media(hover:hover)_and_(pointer:fine)]:hover:[transform:translateY(-0.125rem)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-chat-hover'
const FAB_BUSY = 'conciv-fab-busy absolute -inset-[0.1875rem] rounded-chat-pill pointer-events-none'
const FAB_ATTN = 'border-2 border-chat-accent anim-fab-ring'
const FAB_LOCK =
  'absolute -bottom-px left-8 size-5 inline-flex items-center justify-center text-chat-warn pointer-events-none [transition:transform_240ms_var(--chat-ease-expo)_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:transform_240ms_var(--chat-ease-expo)] group-focus-visible:[transition:transform_240ms_var(--chat-ease-expo)] [@media(hover:none)]:[transition:transform_240ms_var(--chat-ease-expo)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transform:translate(1.0625rem,-1rem)] group-focus-visible:[transform:translate(1.0625rem,-1rem)] [@media(hover:none)]:[transform:translate(1.0625rem,-1rem)]'
const FAB_LOCK_CHROME =
  'absolute inset-0 rounded-chat-pill border border-chat-line bg-chat-panel [transition:opacity_120ms_var(--chat-ease)_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-0 group-focus-visible:opacity-0 [@media(hover:none)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:opacity_120ms_var(--chat-ease)] group-focus-visible:[transition:opacity_120ms_var(--chat-ease)] [@media(hover:none)]:[transition:opacity_120ms_var(--chat-ease)]'
const FAB_LOCK_ICON =
  'relative size-4 [transform:scale(0.75)] [transition:transform_240ms_var(--chat-ease-expo)_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:transform_240ms_var(--chat-ease-expo)] group-focus-visible:[transition:transform_240ms_var(--chat-ease-expo)] [@media(hover:none)]:[transition:transform_240ms_var(--chat-ease-expo)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transform:none] group-focus-visible:[transform:none] [@media(hover:none)]:[transform:none]'
const FAB_UNAUTHORIZED_TRACK =
  'grid grid-cols-[0fr] [transition:grid-template-columns_240ms_var(--chat-ease-expo)_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:grid-template-columns_240ms_var(--chat-ease-expo)] group-focus-visible:[transition:grid-template-columns_240ms_var(--chat-ease-expo)] [@media(hover:none)]:[transition:grid-template-columns_240ms_var(--chat-ease-expo)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr] [@media(hover:none)]:grid-cols-[1fr]'
const FAB_UNAUTHORIZED =
  'min-w-0 overflow-hidden invisible opacity-0 [transition:opacity_120ms_var(--chat-ease),visibility_0s_linear_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:visible group-focus-visible:visible [@media(hover:none)]:visible [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s] group-focus-visible:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s] [@media(hover:none)]:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s]'
const FAB_UNAUTHORIZED_LABEL = 'block text-sm leading-5 font-medium whitespace-nowrap text-chat-warn ps-6.5 pe-2'
const FAB_DRAGGING = 'transition-none z-[2147483647] cursor-grabbing'
const FAB_PREVIEWING = 'opacity-0 pointer-events-none'
const FAB_DOCKED = 'invisible'
const HOT_CORNER =
  'fixed size-28 pointer-events-none z-[2147483646] border-chat-accent bg-chat-accent opacity-32 [transition:opacity_150ms_var(--chat-ease)] starting:opacity-0 motion-reduce:transition-none'
const HOT_CORNER_AT: Record<TriggerCorner, string> = {
  'top-left': 'top-0 left-0 rounded-br-full border-b-2 border-r-2',
  'top-right': 'top-0 right-0 rounded-bl-full border-b-2 border-l-2',
  'bottom-left': 'bottom-0 left-0 rounded-tr-full border-t-2 border-r-2',
  'bottom-right': 'bottom-0 right-0 rounded-tl-full border-t-2 border-l-2',
}
const EDGE_TAB = "fixed z-[2147483647] shadow-chat-lg before:content-[''] before:absolute"
const EDGE_TAB_AT: Record<TriggerEdge, string> = {
  left: 'left-0 w-4.5 h-11 rounded-l-none before:inset-y-0 before:left-0 before:w-11',
  right: 'right-0 w-4.5 h-11 rounded-r-none before:inset-y-0 before:right-0 before:w-11',
  top: 'top-0 w-11 h-4.5 rounded-t-none before:inset-x-0 before:top-0 before:h-11',
  bottom: 'bottom-0 w-11 h-4.5 rounded-b-none before:inset-x-0 before:bottom-0 before:h-11',
}
const EDGE_TAB_PREVIEW = 'opacity-60 pointer-events-none'
const EDGE_TAB_LIVE = 'pointer-events-auto'
const EDGE_CHEVRON: Record<TriggerEdge, string> = {
  left: 'size-3',
  top: 'size-3 rotate-90',
  right: 'size-3 rotate-180',
  bottom: 'size-3 -rotate-90',
}
const EDGE_TOOLTIP_SIDE: Record<TriggerEdge, TriggerEdge> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
}

function fabClass(fab: DraggablePosition): string {
  const dragging = fab.dragging() ? ` ${FAB_DRAGGING}` : ''
  const previewing = fab.previewing() ? ` ${FAB_PREVIEWING}` : ''
  const docked = fab.docked() ? ` ${FAB_DOCKED}` : ''
  return `${FAB_BASE} ${FAB_LIFT}${dragging}${previewing}${docked}`
}

function tooltipPlacement(position: TriggerCorner): 'left' | 'right' {
  return position.endsWith('-left') ? 'right' : 'left'
}

function edgeTabStyle(tab: LauncherEdgeTab): JSX.CSSProperties {
  return tab.edge === 'left' || tab.edge === 'right' ? {top: tab.along} : {left: tab.along}
}

function EdgeTab(props: {tab: LauncherEdgeTab; suppressed: () => '' | undefined; onRestore: () => void}): JSX.Element {
  return (
    <TooltipIconButton
      tooltip="Show conciv launcher"
      variant="solid"
      side={EDGE_TOOLTIP_SIDE[props.tab.edge]}
      class={`${EDGE_TAB} ${EDGE_TAB_AT[props.tab.edge]} ${props.tab.preview ? EDGE_TAB_PREVIEW : EDGE_TAB_LIVE}`}
      style={edgeTabStyle(props.tab)}
      aria-hidden={props.tab.preview ? true : undefined}
      tabIndex={props.tab.preview ? -1 : undefined}
      data-conciv-fab
      data-conciv-suppressed={props.suppressed()}
      onClick={() => {
        if (!props.tab.preview) props.onRestore()
      }}
    >
      <ChevronRight class={EDGE_CHEVRON[props.tab.edge]} aria-hidden="true" />
    </TooltipIconButton>
  )
}

function fabLabel(open: boolean, locked: boolean): string {
  if (locked) return 'Unauthorized. Authorize conciv'
  return open ? 'Minimize conciv chat' : 'Open conciv chat'
}

export function ShellFab(props: {
  ref: (el: HTMLButtonElement) => void
  open: () => boolean
  working: () => boolean
  suppressed: () => '' | undefined
  fab: DraggablePosition
  locked: () => boolean
  onToggle: () => void
}): JSX.Element {
  const [launcher, setLauncher] = createSignal<HTMLButtonElement>()
  const launcherSize = createElementSize(launcher)
  const restore = () => {
    props.fab.restore()
    launcher()?.focus()
  }
  return (
    <>
      <Show when={props.fab.hotCorner()}>
        {(corner) => <div class={`${HOT_CORNER} ${HOT_CORNER_AT[corner()]}`} aria-hidden="true" />}
      </Show>
      <Show when={props.fab.edgeTab()}>
        {(tab) => <EdgeTab tab={tab()} suppressed={props.suppressed} onRestore={restore} />}
      </Show>
      <Tooltip.Root
        disabled={props.locked()}
        positioning={{strategy: 'fixed', placement: tooltipPlacement(props.fab.position()), gutter: 8}}
      >
        <Tooltip.Trigger
          type="button"
          ref={(element) => {
            setLauncher(element)
            props.ref(element)
          }}
          class={fabClass(props.fab)}
          data-conciv-fab
          data-conciv-suppressed={props.suppressed()}
          style={launcherPlacement(props.fab.anchor(), launcherSize.width)}
          aria-label={fabLabel(props.open(), props.locked())}
          aria-busy={props.working()}
          aria-haspopup={props.locked() ? 'dialog' : undefined}
          aria-expanded={props.locked() ? undefined : props.open()}
          aria-controls={props.locked() ? undefined : 'conciv-chat-panel'}
          onPointerDown={(event) => props.fab.onPointerDown(event)}
          onKeyDown={(event) => props.fab.onKeyDown(event)}
          onClick={() => {
            if (!props.fab.consumeClick()) props.onToggle()
          }}
        >
          <Suspense>
            <Show when={props.working()}>
              <span class={props.open() ? FAB_BUSY : `${FAB_BUSY} ${FAB_ATTN}`} aria-hidden="true" />
            </Show>
          </Suspense>
          <FabRobot open={props.open} working={props.working} />
          <Show when={props.locked()}>
            <span class={FAB_UNAUTHORIZED_TRACK}>
              <span class={FAB_UNAUTHORIZED}>
                <span class={FAB_UNAUTHORIZED_LABEL}>Unauthorized</span>
              </span>
            </span>
            <span class={FAB_LOCK} aria-hidden="true">
              <span class={FAB_LOCK_CHROME} />
              <TriangleAlert class={FAB_LOCK_ICON} />
            </span>
          </Show>
        </Tooltip.Trigger>
        <Tooltip.Positioner>
          <Tooltip.Content>{fabLabel(props.open(), false)}</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
    </>
  )
}
