import {Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {ToolFallback} from '../tool-fallback.js'
import {ToolDurationProvider} from '../../primitives/tools/tool-duration.js'
import {MetaToolCard} from './meta-tool-card.js'
import {PermissionCard} from './permission-card.js'

export type ToolCallCardProps = ToolCardProps & {
  tools?: () => ToolCardEntry[]

  fallback?: ToolUIComponent
}

export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const matched = () => props.tools?.().find((entry) => entry.names.includes(props.part.name))
  const declared = () => props.ctx.catalog.meta(props.part.name)
  const render = (): ToolUIComponent => {
    const card = matched()?.render
    if (card) return card
    if (declared()) return MetaToolCard
    return props.fallback ?? ToolFallback
  }
  const ownsApproval = () => matched() !== undefined || declared() !== undefined
  const duration = (): number | undefined => props.durationMs
  return (
    <ToolDurationProvider value={duration}>
      <Dynamic
        component={render()}
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        durationMs={props.durationMs}
      />
      <Show when={ownsApproval()}>
        <PermissionCard part={props.part} result={props.result} ctx={props.ctx} />
      </Show>
    </ToolDurationProvider>
  )
}
