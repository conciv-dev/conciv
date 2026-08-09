import {z} from 'zod'
import type {JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {
  cardPhase,
  cardTitle,
  clip,
  displayValue,
  parseInput,
  parseResultPayload,
  resultText,
  schemaFields,
  toolIconRender,
  toolStatus,
  ToolCard,
  type CardPhase,
} from '@conciv/ui-kit-chat'
import type {ToolCardProps, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'

const ELEMENT_TARGET_KEYS = new Set(['selector', 'ref', 'name'])

const InputRecord = z.record(z.string(), z.unknown())

export function toolInput(part: ToolCardProps['part']): Record<string, unknown> {
  return parseInput(InputRecord, part) ?? {}
}

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
  skip: ReadonlySet<string> = ELEMENT_TARGET_KEYS,
): Array<{name: string; value: string}> {
  return schemaFields(meta?.inputSchema)
    .filter((field) => !skip.has(field.name))
    .filter((field) => input[field.name] !== undefined)
    .map((field) => ({name: field.name, value: clip(displayValue(input[field.name]))}))
}

export function resultChips(result: ToolCardProps['result']): Array<{name: string; value: string}> {
  const payload = parseResultPayload(result)
  if (payload === undefined || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return []
  return Object.entries(payload as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({name, value: clip(displayValue(value))}))
}

export function elementTargetValue(input: Record<string, unknown>): string | undefined {
  const selector = input.selector
  const ref = input.ref
  const name = input.name
  if (typeof selector === 'string' && selector.length > 0) return selector
  if (typeof ref === 'string' && ref.length > 0) return ref
  if (typeof name === 'string' && name.length > 0) return name
  return undefined
}

export function cardErrorMessage(result: ToolCardProps['result']): string | undefined {
  if (result?.state !== 'error') return undefined
  const direct = result.error
  if (typeof direct === 'string' && direct.length > 0) return direct
  const text = resultText(result)
  return text.length > 0 ? text : undefined
}

function cardIcon(icon: ToolIconKey | undefined): JSX.Element {
  return <Dynamic component={toolIconRender(icon)} size={14} />
}

export function CardShell(props: {
  meta: ToolViewMeta | undefined
  title: string
  metaBadge?: string
  part: ToolCardProps['part']
  result: ToolCardProps['result']
  durationMs: ToolCardProps['durationMs']
  children: JSX.Element
}): JSX.Element {
  return (
    <ToolCard
      Icon={() => cardIcon(props.meta?.icon)}
      title={props.title}
      titleTooltip={props.meta?.summary}
      meta={props.metaBadge}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      {props.children}
    </ToolCard>
  )
}
