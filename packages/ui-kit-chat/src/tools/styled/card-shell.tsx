import {For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {z} from 'zod'
import type {ToolCardProps, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import type {ToolIconKey} from '@conciv/protocol/tool-icon-types'
import {cardPhase, cardTitle, clip, displayValue, type CardPhase} from '../primitives/tool-presentation.js'
import {toolStatus, type ToolStatus} from '../primitives/tool-status.js'
import {parseInput} from '../primitives/tool-util.js'
import {schemaFields} from '../primitives/schema-params.js'
import {toolIconRender} from './tool-icon.js'
import {ToolCard} from './tool-card.js'
import {Chip, ChipRow} from './chip.js'

const InputRecord = z.record(z.string(), z.unknown())

const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 [color:var(--chat-text-3)]'

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

export type CardChip = {name: string; value: string}

export function detailChips(
  meta: {inputSchema?: unknown} | undefined,
  input: Record<string, unknown>,
  skip: ReadonlySet<string> = new Set(),
): Array<CardChip> {
  return schemaFields(meta?.inputSchema)
    .filter((field) => !skip.has(field.name))
    .filter((field) => input[field.name] !== undefined)
    .map((field) => ({name: field.name, value: clip(displayValue(input[field.name]))}))
}

function cardIcon(icon: ToolIconKey | undefined, iconClass: string | undefined): JSX.Element {
  const rendered = <Dynamic component={toolIconRender(icon)} size={14} />
  return iconClass === undefined ? rendered : <span class={iconClass}>{rendered}</span>
}

function shellInput(part: ToolCardProps['part']): Record<string, unknown> {
  return parseInput(InputRecord, part) ?? {}
}

function shellChipSkip(positional: string | undefined, extra: ReadonlySet<string> | undefined): ReadonlySet<string> {
  const skip = new Set(extra ?? [])
  if (positional !== undefined) skip.add(positional)
  return skip
}

function InputChipsRow(props: {
  meta: ToolViewMeta | undefined
  part: ToolCardProps['part']
  chipSkip: ReadonlySet<string> | undefined
  leadChip: CardChip | undefined
}): JSX.Element {
  const skip = () => shellChipSkip(props.meta?.positional, props.chipSkip)
  const chips = (): ReadonlyArray<CardChip> => {
    const detail = detailChips(props.meta, shellInput(props.part), skip())
    const lead = props.leadChip
    return lead === undefined ? detail : [lead, ...detail]
  }
  return (
    <Show when={chips().length > 0} fallback={<p class={QUIET_TEXT_CLASS}>no input</p>}>
      <ChipRow>
        <For each={chips()}>{(chip) => <Chip name={chip.name} value={chip.value} />}</For>
      </ChipRow>
    </Show>
  )
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
  chipSkip?: ReadonlySet<string>
  leadChip?: CardChip
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
      <div class="flex flex-col gap-1.5">
        <InputChipsRow meta={props.meta} part={props.part} chipSkip={props.chipSkip} leadChip={props.leadChip} />
        {props.children}
      </div>
    </ToolCard>
  )
}
