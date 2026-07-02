import {type JSX} from 'solid-js'
import {ChevronLeft, ChevronRight} from 'lucide-solid'
import {BranchPicker as BranchPickerPrimitive} from '../primitives/branch-picker/branch-picker.js'
import {TooltipIconButton} from './tooltip-icon-button.js'

export function BranchPicker(props: {class?: string}): JSX.Element {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      class={`text-[0.6875rem] inline-flex gap-0.5 [color:var(--chat-text-3)] items-center ${props.class ?? ''}`}
    >
      <BranchPickerPrimitive.Previous
        render={(buttonProps) => (
          <TooltipIconButton {...buttonProps} tooltip="Previous" class="size-6">
            <ChevronLeft size={14} />
          </TooltipIconButton>
        )}
      />
      <span class="font-medium tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next
        render={(buttonProps) => (
          <TooltipIconButton {...buttonProps} tooltip="Next" class="size-6">
            <ChevronRight size={14} />
          </TooltipIconButton>
        )}
      />
    </BranchPickerPrimitive.Root>
  )
}
