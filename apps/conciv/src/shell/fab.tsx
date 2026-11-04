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
  'group fixed h-13 min-w-13 px-0.75 rounded-chat-pill border border-chat-line bg-chat-panel text-chat-accent text-[1.375rem] cursor-pointer pointer-events-auto shadow-chat-lg inline-flex items-center justify-center font-chat trans-lift anim-fab focus-ring [@media(hover:hover)_and_(pointer:fine)]:hover:[transform:translateY(-0.125rem)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-chat-hover active:[transform:translateY(0)_scale(0.94)]'
const FAB_BUSY = 'conciv-fab-busy absolute -inset-[0.1875rem] rounded-chat-pill pointer-events-none'
const FAB_ATTN = 'border-2 border-chat-accent anim-fab-ring'
const FAB_LOCK =
  'absolute -bottom-0.5 -end-0.5 size-5 rounded-chat-pill border border-chat-line bg-chat-panel text-chat-warn inline-flex items-center justify-center pointer-events-none [transition:opacity_120ms_var(--chat-ease)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-0 group-focus-visible:opacity-0 [@media(hover:none)]:opacity-0'
const FAB_UNAUTHORIZED_TRACK =
  'grid grid-cols-[0fr] [transition:grid-template-columns_240ms_var(--chat-ease-expo)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr] [@media(hover:none)]:grid-cols-[1fr]'
const FAB_UNAUTHORIZED =
  'min-w-0 overflow-hidden invisible opacity-0 [transition:opacity_120ms_var(--chat-ease),visibility_0s_linear_120ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover:visible group-focus-visible:visible [@media(hover:none)]:visible [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s] group-focus-visible:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s] [@media(hover:none)]:[transition:opacity_200ms_var(--chat-ease)_120ms,visibility_0s]'
const FAB_UNAUTHORIZED_LABEL =
  'inline-flex items-center gap-1 px-2 text-sm font-medium whitespace-nowrap text-chat-warn'
const FAB_DRAGGING = 'transition-none z-[2147483647] cursor-grabbing'

function fabClass(position: TriggerPosition, dragging: boolean): string {
  const direction = position.endsWith('-right') ? ' flex-row-reverse' : ''
  return `${FAB_BASE} ${FAB_POS[position]}${direction}${dragging ? ` ${FAB_DRAGGING}` : ''}`
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
        class={fabClass(props.fab.position(), props.fab.dragging())}
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
          <span class={FAB_LOCK} aria-hidden="true">
            <TriangleAlert class="size-3" />
          </span>
          <span class={FAB_UNAUTHORIZED_TRACK}>
            <span class={FAB_UNAUTHORIZED}>
              <span class={FAB_UNAUTHORIZED_LABEL}>
                <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
                Unauthorized
              </span>
            </span>
          </span>
        </Show>
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content>{fabLabel(props.open(), false)}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
