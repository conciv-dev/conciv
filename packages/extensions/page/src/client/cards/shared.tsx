import {z} from 'zod'
import {For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {
  Chip,
  ChipRow as ChipRowShell,
  cardPhase,
  cardTitle,
  clip,
  displayValue,
  MUTATING_BADGE,
  parseInput,
  parseResultPayload,
  resultText,
  schemaFields,
  toolIconRender,
  toolStatus,
  ToolCard,
  type CardPhase,
} from '@conciv/ui-kit-chat/tools'
import type {ToolCardProps, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'

const ELEMENT_TARGET_KEYS = new Set(['selector', 'ref', 'name'])

export const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 [color:var(--chat-text-3)]'

export const LIST_ROW_CLASS =
  'px-2.5 py-1 flex gap-2 items-baseline [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function resultChips(result: ToolCardProps['result']): Array<{name: string; value: string}> {
  const payload = parseResultPayload(result)
  if (!isPlainRecord(payload)) return []
  return Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({name, value: clip(displayValue(value))}))
}

export function ChipRow(props: {element?: string; chips: ReadonlyArray<{name: string; value: string}>}): JSX.Element {
  return (
    <Show when={props.element !== undefined || props.chips.length > 0}>
      <ChipRowShell>
        <Show when={props.element}>{(value) => <Chip name="element" value={value()} />}</Show>
        <For each={props.chips}>{(chip) => <Chip name={chip.name} value={chip.value} />}</For>
      </ChipRowShell>
    </Show>
  )
}

export function cardPayload(result: ToolCardProps['result']): unknown {
  return parseResultPayload(result)
}

export function mutatingBadge(meta: ToolViewMeta | undefined): string | undefined {
  return meta?.mutating === true ? MUTATING_BADGE : undefined
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
