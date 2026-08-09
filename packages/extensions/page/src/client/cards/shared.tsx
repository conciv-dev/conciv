import {z} from 'zod'
import {For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ChevronRight} from 'lucide-solid'
import {JsonTreeView} from '@conciv/ui-kit-system'
import {
  Chip,
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

const JSON_TREE_ROOT =
  '[font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] max-h-[13.75rem] w-full rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] overflow-auto p-1.5'

const CHIP_ROW = 'm-0 p-0 flex flex-wrap gap-1.5'

export const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 [color:var(--chat-text-3)]'

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

export function ChipRow(props: {element?: string; chips: ReadonlyArray<{name: string; value: string}>}): JSX.Element {
  return (
    <Show when={props.element !== undefined || props.chips.length > 0}>
      <dl class={CHIP_ROW}>
        <Show when={props.element}>{(value) => <Chip name="element" value={value()} />}</Show>
        <For each={props.chips}>{(chip) => <Chip name={chip.name} value={chip.value} />}</For>
      </dl>
    </Show>
  )
}

export function cardPayload(result: ToolCardProps['result']): unknown {
  return parseResultPayload(result)
}

export function JsonTree(props: {data: unknown}): JSX.Element {
  return (
    <JsonTreeView.Root
      data={props.data}
      defaultExpandedDepth={1}
      collapseStringsAfterLength={60}
      maxPreviewItems={5}
      groupArraysAfterLength={20}
      class={JSON_TREE_ROOT}
    >
      <JsonTreeView.Tree class="json-tree" arrow={<ChevronRight size={12} aria-hidden="true" />} />
    </JsonTreeView.Root>
  )
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
