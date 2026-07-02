import {Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {ToolFallback} from '../tool-fallback.js'
import {ToolDurationProvider} from '../../primitives/tools/tool-duration.js'
import {PermissionCard} from './permission-card.js'

export type ToolCallCardProps = ToolCardProps & {
  tools?: () => ToolCardEntry[]

  fallback?: ToolUIComponent
}

export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const matched = () => props.tools?.().find((entry) => entry.names.includes(props.part.name))
  const render = (): ToolUIComponent => matched()?.render ?? props.fallback ?? ToolFallback
  return (
    <ToolDurationProvider value={() => props.durationMs}>
      <Dynamic
        component={render()}
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        durationMs={props.durationMs}
      />
      <Show when={matched()}>
        <PermissionCard part={props.part} result={props.result} ctx={props.ctx} />
      </Show>
    </ToolDurationProvider>
  )
}
