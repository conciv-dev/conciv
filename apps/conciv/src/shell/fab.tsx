import {Show, Suspense, type JSX} from 'solid-js'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {Tooltip} from '@conciv/ui-kit-system'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import type {DraggablePosition} from '../lib/draggable-position.js'
import {FabRobot} from './fab-robot.js'

const FAB_POS: Record<TriggerPosition, string> = {
  'top-left': 'top-5 left-5',
  'top-right': 'top-5 right-5',
  'middle-left': 'top-[calc(50%-1.625rem)] left-5',
  'middle-right': 'top-[calc(50%-1.625rem)] right-5',
  'bottom-left': 'bottom-5 left-5',
  'bottom-right': 'bottom-5 right-5',
}

const FAB_BASE =
  'group fixed h-13 p-0.75 rounded-chat-pill border border-chat-line bg-chat-panel text-chat-accent text-[1.375rem] cursor-pointer pointer-events-auto shadow-chat-lg inline-flex items-center font-chat trans-lift anim-fab focus-ring active:[transform:translateY(0)_scale(0.94)]'
const FAB_LIFT =
  '[@media(hover:hover)_and_(pointer:fine)]:hover:[transform:translateY(-0.125rem)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-chat-hover'
const FAB_BUSY = 'conciv-fab-busy absolute -inset-[0.1875rem] rounded-chat-pill pointer-events-none'
const FAB_ATTN = 'border-2 border-chat-accent anim-fab-ring'
const FAB_LOCK =
  'absolute -bottom-px size-5 inline-flex items-center justify-center text-chat-warn pointer-events-none [transition:transform_240ms_var(--chat-ease-expo)]'
const FAB_LOCK_TOWARD_END =
  'left-8 [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transform:translate(1.0625rem,-1rem)] group-focus-visible:[transform:translate(1.0625rem,-1rem)] [@media(hover:none)]:[transform:translate(1.0625rem,-1rem)]'
const FAB_LOCK_TOWARD_START =
  '-left-0.5 [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transform:translate(0.6875rem,-1rem)] group-focus-visible:[transform:translate(0.6875rem,-1rem)] [@media(hover:none)]:[transform:translate(0.6875rem,-1rem)]'
const FAB_LOCK_CHROME =
  'absolute inset-0 rounded-chat-pill border border-chat-line bg-chat-panel [transition:opacity_120ms_var(--chat-ease)_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-0 group-focus-visible:opacity-0 [@media(hover:none)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:opacity_120ms_var(--chat-ease)] group-focus-visible:[transition:opacity_120ms_var(--chat-ease)] [@media(hover:none)]:[transition:opacity_120ms_var(--chat-ease)]'
const FAB_LOCK_ICON =
  'relative size-4 [transform:scale(0.75)] [transition:transform_240ms_var(--chat-ease-expo)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transform:none] group-focus-visible:[transform:none] [@media(hover:none)]:[transform:none]'
const FAB_UNAUTHORIZED_TRACK =
  'grid grid-cols-[0fr] [transition:grid-template-columns_240ms_var(--chat-ease-expo)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr] [@media(hover:none)]:grid-cols-[1fr]'
const FAB_UNAUTHORIZED =
  'min-w-0 overflow-hidden invisible opacity-0 [transition:opacity_120ms_var(--chat-ease),visibility_0s_linear_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:visible group-focus-visible:visible [@media(hover:none)]:visible [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s] group-focus-visible:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s] [@media(hover:none)]:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s]'
const FAB_UNAUTHORIZED_LABEL = 'block text-sm leading-5 font-medium whitespace-nowrap text-chat-warn'
const FAB_UNAUTHORIZED_TOWARD_END = 'ps-6.5 pe-2'
const FAB_UNAUTHORIZED_TOWARD_START = 'ps-7.5 pe-1'
const FAB_DRAGGING = 'transition-none z-[2147483647] cursor-grabbing'

function growsTowardStart(position: TriggerPosition): boolean {
  return position.endsWith('-right')
}

function fabClass(position: TriggerPosition, dragging: boolean, locked: boolean): string {
  const direction = growsTowardStart(position) ? ' flex-row-reverse' : ''
  const lift = locked ? '' : ` ${FAB_LIFT}`
  return `${FAB_BASE} ${FAB_POS[position]}${direction}${lift}${dragging ? ` ${FAB_DRAGGING}` : ''}`
}

function lockClass(position: TriggerPosition): string {
  return `${FAB_LOCK} ${growsTowardStart(position) ? FAB_LOCK_TOWARD_START : FAB_LOCK_TOWARD_END}`
}

function unauthorizedLabelClass(position: TriggerPosition): string {
  return `${FAB_UNAUTHORIZED_LABEL} ${growsTowardStart(position) ? FAB_UNAUTHORIZED_TOWARD_START : FAB_UNAUTHORIZED_TOWARD_END}`
}

function tooltipPlacement(position: TriggerPosition): 'left' | 'right' {
  return position.endsWith('-left') ? 'right' : 'left'
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
  return (
    <Tooltip.Root
      disabled={props.locked()}
      positioning={{strategy: 'fixed', placement: tooltipPlacement(props.fab.position()), gutter: 8}}
    >
      <Tooltip.Trigger
        type="button"
        ref={props.ref}
        class={fabClass(props.fab.position(), props.fab.dragging(), props.locked())}
        data-conciv-fab
        data-conciv-suppressed={props.suppressed()}
        style={props.fab.dragStyle()}
        aria-label={fabLabel(props.open(), props.locked())}
        aria-busy={props.working()}
        aria-haspopup={props.locked() ? 'dialog' : undefined}
        aria-expanded={props.locked() ? undefined : props.open()}
        aria-controls={props.locked() ? undefined : 'conciv-chat-panel'}
        onPointerDown={(event) => props.fab.onPointerDown(event)}
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
              <span class={unauthorizedLabelClass(props.fab.position())}>Unauthorized</span>
            </span>
          </span>
          <span class={lockClass(props.fab.position())} aria-hidden="true">
            <span class={FAB_LOCK_CHROME} />
            <TriangleAlert class={FAB_LOCK_ICON} />
          </span>
        </Show>
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content>{fabLabel(props.open(), false)}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
