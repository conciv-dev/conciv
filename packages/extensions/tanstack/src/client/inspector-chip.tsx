import type {JSX} from 'solid-js'
import {Tooltip} from '@conciv/ui-kit-system'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../client-sentinel.js'
import {TanStackLogo} from './tanstack-logo.js'

export function InspectorChip(): JSX.Element {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <span
            {...triggerProps()}
            role="status"
            aria-label={CONCIV_TANSTACK_CLIENT_LABEL}
            class="inline-flex items-center gap-[5px] whitespace-nowrap"
          >
            <TanStackLogo class="size-3.5 block shrink-0" aria-hidden="true" />
            {CONCIV_TANSTACK_CLIENT_LABEL}
          </span>
        )}
      />
      <Tooltip.Positioner>
        <Tooltip.Content>{CONCIV_TANSTACK_CLIENT_LABEL}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
