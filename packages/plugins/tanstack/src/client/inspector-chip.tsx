import type {JSX} from 'solid-js'
import type {Ui} from '@conciv/plugin/experimental'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../client-sentinel.js'
import {TanStackLogo} from './tanstack-logo.js'

export function InspectorChip(props: {readonly ui: Ui}): JSX.Element {
  return (
    <props.ui.Tooltip value={CONCIV_TANSTACK_CLIENT_LABEL}>
      <span
        role="status"
        aria-label={CONCIV_TANSTACK_CLIENT_LABEL}
        class="inline-flex gap-1.25 whitespace-nowrap items-center"
      >
        <TanStackLogo class="shrink-0 size-3.5 block" aria-hidden="true" />
        {CONCIV_TANSTACK_CLIENT_LABEL}
      </span>
    </props.ui.Tooltip>
  )
}
