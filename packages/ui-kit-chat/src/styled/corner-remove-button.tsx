import type {JSX} from 'solid-js'
import X from 'lucide-solid/icons/x'
import {REMOVE} from './classes.js'

export function CornerRemoveButton(props: {label: string; onRemove: () => void}): JSX.Element {
  return (
    <button type="button" class={REMOVE} aria-label={props.label} onClick={() => props.onRemove()}>
      <svg viewBox="0 0 16 16" class="text-chat-text-3 size-full inset-0 absolute overflow-visible" aria-hidden="true">
        <circle cx="8" cy="8" r="9" class="fill-white" />
        <circle cx="8" cy="8" r="8" fill="currentColor" />
      </svg>
      <X size={16} viewBox="-4 -4 32 32" class="inset-0 absolute" aria-hidden="true" />
    </button>
  )
}
