import type {JSX} from 'solid-js'
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
  'fixed size-13 rounded-pw-pill border border-pw-line bg-pw-panel text-pw-accent text-[1.375rem] cursor-pointer pointer-events-auto shadow-pw-lg inline-flex items-center justify-center trans-lift anim-fab hover:[transform:translateY(-0.125rem)] hover:shadow-pw-hover active:[transform:translateY(0)_scale(0.94)]'
const FAB_ATTN =
  "after:content-[''] after:absolute after:-inset-[0.1875rem] after:rounded-pw-pill after:border-2 after:border-pw-accent after:anim-fab-ring"
const FAB_DRAGGING = 'transition-none z-[2147483647] cursor-grabbing'

function fabClass(pulsing: boolean, position: TriggerPosition, dragging: boolean): string {
  return `${FAB_BASE} ${FAB_POS[position]}${pulsing ? ` ${FAB_ATTN}` : ''}${dragging ? ` ${FAB_DRAGGING}` : ''}`
}

function fabLabel(open: boolean): string {
  return open ? 'Minimize conciv chat' : 'Open conciv chat'
}

export function ShellFab(props: {
  ref: (el: HTMLButtonElement) => void
  open: () => boolean
  working: () => boolean
  suppressed: () => '' | undefined
  fab: DraggablePosition
  onToggle: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      ref={props.ref}
      class={fabClass(!props.open() && props.working(), props.fab.position(), props.fab.dragging())}
      data-pw-fab
      data-pw-suppressed={props.suppressed()}
      style={props.fab.dragStyle()}
      aria-label={fabLabel(props.open())}
      aria-expanded={props.open()}
      aria-controls="pw-chat-panel"
      onPointerDown={props.fab.onPointerDown}
      onClick={() => {
        if (!props.fab.consumeClick()) props.onToggle()
      }}
    >
      <FabRobot open={props.open} working={props.working} />
    </button>
  )
}
