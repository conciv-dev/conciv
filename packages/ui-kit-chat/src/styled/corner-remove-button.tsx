import type {JSX} from 'solid-js'
import X from 'lucide-solid/icons/x'
import {REMOVE} from './classes.js'

export function CornerRemoveButton(props: {label: string; onRemove: () => void}): JSX.Element {
  return (
    <button type="button" class={REMOVE} aria-label={props.label} onClick={() => props.onRemove()}>
      <X size={12} aria-hidden="true" />
    </button>
  )
}
