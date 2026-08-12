import type {JSX} from 'solid-js'
import Waypoints from 'lucide-solid/icons/waypoints'
import {Tooltip} from '@conciv/ui-kit-system'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../client-sentinel.js'

export function InspectorChip(): JSX.Element {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <span
            {...triggerProps()}
            role="status"
            aria-label={CONCIV_TANSTACK_CLIENT_LABEL}
            class="text-pw-text-2 inline-flex shrink-0 size-8.5 items-center justify-center"
          >
            <Waypoints class="size-5 block" aria-hidden="true" />
          </span>
        )}
      />
      <Tooltip.Positioner>
        <Tooltip.Content>{CONCIV_TANSTACK_CLIENT_LABEL}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
