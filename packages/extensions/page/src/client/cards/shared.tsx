import {z} from 'zod'
import {For, Show, type JSX} from 'solid-js'
import {
  Chip,
  ChipRow as ChipRowShell,
  clip,
  displayValue,
  MUTATING_BADGE,
  parseInput,
  parseResultPayload,
  resultText,
  type CardChip,
} from '@conciv/ui-kit-chat/tools'
import type {ToolCardProps, ToolViewMeta} from '@conciv/protocol/tool-view-types'

export const ELEMENT_TARGET_KEYS = new Set(['selector', 'ref', 'name'])

export const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 [color:var(--chat-text-3)]'

export const LIST_ROW_CLASS =
  'px-2.5 py-1 flex gap-2 items-baseline [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'

const InputRecord = z.record(z.string(), z.unknown())

export function toolInput(part: ToolCardProps['part']): Record<string, unknown> {
  return parseInput(InputRecord, part) ?? {}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function resultChips(result: ToolCardProps['result']): Array<CardChip> {
  const payload = parseResultPayload(result)
  if (!isPlainRecord(payload)) return []
  return Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({name, value: clip(displayValue(value))}))
}

export function ChipRow(props: {chips: ReadonlyArray<CardChip>}): JSX.Element {
  return (
    <Show when={props.chips.length > 0}>
      <ChipRowShell>
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

function elementTargetValue(input: Record<string, unknown>): string | undefined {
  const selector = input.selector
  const ref = input.ref
  const name = input.name
  if (typeof selector === 'string' && selector.length > 0) return selector
  if (typeof ref === 'string' && ref.length > 0) return ref
  if (typeof name === 'string' && name.length > 0) return name
  return undefined
}

export function elementChip(part: ToolCardProps['part']): CardChip | undefined {
  const value = elementTargetValue(toolInput(part))
  return value === undefined ? undefined : {name: 'element', value}
}

export function cardErrorMessage(result: ToolCardProps['result']): string | undefined {
  if (result?.state !== 'error') return undefined
  const direct = result.error
  if (typeof direct === 'string' && direct.length > 0) return direct
  const text = resultText(result)
  return text.length > 0 ? text : undefined
}
