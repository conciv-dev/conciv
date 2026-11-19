import type {JSX} from 'solid-js'
import type {Ui} from '@conciv/plugin/experimental'
import {TanStackLogo} from './tanstack-logo.js'

const LABEL = 'TanStack inspector active'

export function InspectorChip(props: {readonly ui: Ui}): JSX.Element {
  return (
    <props.ui.Tooltip value={LABEL}>
      <span role="status" aria-label={LABEL} class="inline-flex gap-1.25 whitespace-nowrap items-center">
        <TanStackLogo class="shrink-0 size-3.5 block" aria-hidden="true" />
        {LABEL}
      </span>
    </props.ui.Tooltip>
  )
}
