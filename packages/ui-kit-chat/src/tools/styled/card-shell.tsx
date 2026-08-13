import type {JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardProps, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'
import {cardPhase, cardTitle, clip, displayValue, type CardPhase} from '../primitives/tool-presentation.js'
import {toolStatus, type ToolStatus} from '../primitives/tool-status.js'
import {schemaFields} from '../primitives/schema-params.js'
import {toolIconRender} from './tool-icon.js'
import {ToolCard} from './tool-card.js'

export function cardHeader(props: ToolCardProps): {
  meta: () => ToolViewMeta | undefined
  phase: () => CardPhase
  title: () => string
} {
  const meta = () => props.ctx.catalog.meta(props.part.name)
  const phase = () => cardPhase(toolStatus(props.part, props.result))
  const title = () => cardTitle(meta(), phase(), props.part.name)
  return {meta, phase, title}
}

export function detailChips(
  meta: {inputSchema?: unknown} | undefined,
  input: Record<string, unknown>,
  skip: ReadonlySet<string> = new Set(),
): Array<{name: string; value: string}> {
  return schemaFields(meta?.inputSchema)
    .filter((field) => !skip.has(field.name))
    .filter((field) => input[field.name] !== undefined)
    .map((field) => ({name: field.name, value: clip(displayValue(input[field.name]))}))
}

function cardIcon(icon: ToolIconKey | undefined, iconClass: string | undefined): JSX.Element {
  const rendered = <Dynamic component={toolIconRender(icon)} size={14} />
  return iconClass === undefined ? rendered : <span class={iconClass}>{rendered}</span>
}

export function CardShell(props: {
  meta: ToolViewMeta | undefined
  title: string
  subtitle?: string
  metaBadge?: string
  part: ToolCardProps['part']
  result: ToolCardProps['result']
  durationMs?: number
  iconClass?: string
  status?: ToolStatus
  defaultOpen?: boolean
  autoOpen?: boolean
  header?: JSX.Element
  flushHeader?: boolean
  class?: string
  children?: JSX.Element
}): JSX.Element {
  return (
    <ToolCard
      Icon={() => cardIcon(props.meta?.icon, props.iconClass)}
      title={props.title}
      subtitle={props.subtitle}
      titleTooltip={props.meta?.summary}
      meta={props.metaBadge}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      status={props.status}
      defaultOpen={props.defaultOpen}
      autoOpen={props.autoOpen}
      header={props.header}
      flushHeader={props.flushHeader}
      class={props.class}
    >
      {props.children}
    </ToolCard>
  )
}
