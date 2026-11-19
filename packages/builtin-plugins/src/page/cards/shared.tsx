import {z} from 'zod'
import {lowerCase} from 'es-toolkit'
import {For, Show, splitProps, type JSX} from 'solid-js'
import type {ToolProps} from '@conciv/plugin/experimental'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {
  BasicTool,
  Chip,
  ChipRow as ChipRowShell,
  clip,
  displayValue,
  MUTATING_BADGE,
  parseInput,
  parseResultMedia,
  resultText,
  ToolErrorCard,
  type CardChip,
} from '@conciv/ui-kit-chat/tools'
import {pageToolMeta, pageVerbOfTool} from './page-tool-names.js'

export const ELEMENT_TARGET_KEYS = new Set(['selector', 'ref', 'name'])

export const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 text-chat-text-3'

export const LIST_ROW_CLASS =
  'px-2.5 py-1 flex gap-2 items-baseline [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'

const COUNT_FORMAT = new Intl.NumberFormat()
const COUNT_PLURAL = new Intl.PluralRules('en')

export function parseOutput(output: string | undefined): unknown {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

export function readInput<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> | undefined {
  const parsed = schema.safeParse(input)
  return parsed.success ? parsed.data : undefined
}

export function countLabel(count: number, one: string, other: string): string {
  return `${COUNT_FORMAT.format(count)} ${COUNT_PLURAL.select(count) === 'one' ? one : other}`
}

const InputRecord = z.record(z.string(), z.unknown())

export function toolInput(part: ToolCallPart): Record<string, unknown> {
  return parseInput(InputRecord, part) ?? {}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function outputPayload(output: string | undefined): unknown {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

export function outputImageUrl(output: string | undefined): string | undefined {
  if (!output) return undefined
  return parseResultMedia({type: 'tool-result', toolCallId: '', content: output, state: 'complete'}).imageUrl
}

export function outputChips(output: string | undefined): Array<CardChip> {
  const payload = outputPayload(output)
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

export function mutatingBadge(meta: ToolViewMeta | undefined): string | undefined {
  return meta?.mutating === true ? MUTATING_BADGE : undefined
}

export function elementTarget(input: Record<string, unknown>): string | undefined {
  const selector = input.selector
  const ref = input.ref
  const name = input.name
  if (typeof selector === 'string' && selector.length > 0) return selector
  if (typeof ref === 'string' && ref.length > 0) return ref
  if (typeof name === 'string' && name.length > 0) return name
  return undefined
}

const NO_SKIP: ReadonlySet<string> = new Set()

function inputArgs(input: Record<string, unknown>, skip: ReadonlySet<string>): string[] {
  return Object.entries(input)
    .filter(([name, value]) => !skip.has(name) && value !== undefined)
    .map(([name, value]) => `${name}=${clip(displayValue(value))}`)
}

export function pageTitle(tool: string, running: boolean): string {
  const label = pageToolMeta(tool)?.label
  if (label === undefined) return tool
  return running ? label.running : label.done
}

export function PageTool(
  props: ToolProps & {
    subtitle?: string
    skip?: ReadonlySet<string>
    failed?: boolean
    hasContent: boolean
    children?: JSX.Element
  },
): JSX.Element {
  const [local, tool] = splitProps(props, ['subtitle', 'skip', 'failed', 'hasContent', 'children'])
  const running = () => tool.status === 'pending' || tool.status === 'running' || tool.status === 'streaming'
  const args = () => {
    const badge = mutatingBadge(pageToolMeta(tool.tool))
    const values = inputArgs(tool.input, local.skip ?? NO_SKIP)
    return badge === undefined ? values : [...values, badge]
  }
  return (
    <BasicTool
      {...tool}
      status={local.failed === true ? 'error' : tool.status}
      trigger={{title: pageTitle(tool.tool, running()), subtitle: local.subtitle, args: args()}}
      hasContent={!running() && local.hasContent}
    >
      {local.children}
    </BasicTool>
  )
}

export function cardErrorMessage(result: ToolResultPart | undefined): string | undefined {
  if (result?.state !== 'error') return undefined
  const direct = result.error
  if (typeof direct === 'string' && direct.length > 0) return direct
  const text = resultText(result)
  return text.length > 0 ? text : undefined
}

export function PageFailedTool(props: ToolProps): JSX.Element {
  return (
    <ToolErrorCard
      tool={props.tool}
      error={props.error ?? ''}
      title={`Page ${lowerCase(pageVerbOfTool(props.tool))}`}
      defaultOpen={props.defaultOpen}
      open={props.open}
      onOpenChange={props.onOpenChange}
    />
  )
}
