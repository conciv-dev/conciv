import type {JSX} from 'solid-js'
import X from 'lucide-solid/icons/x'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {REMOVE, REMOVE_WRAPPER} from './classes.js'

export function CornerRemoveButton(props: {label: string; onRemove: () => void}): JSX.Element {
  return (
    <TooltipIconButtonSlot tooltip={props.label} wrapperClass={REMOVE_WRAPPER}>
      {(buttonProps) => (
        <button {...buttonProps()} class={REMOVE} onClick={() => props.onRemove()}>
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </TooltipIconButtonSlot>
  )
}
