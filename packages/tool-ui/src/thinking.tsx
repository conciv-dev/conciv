import {For, Show, createSignal, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Collapsible} from '@ark-ui/solid/collapsible'
import {ArrowRight, Brain, ChevronDown, Database, Search, Target, type LucideIcon} from 'lucide-solid'
import {formatDuration} from './util.js'

const LABEL_ICONS = {goal: Target, next: ArrowRight, observation: Search, memory: Database} satisfies Record<
  string,
  LucideIcon
>
type Label = keyof typeof LABEL_ICONS
type Row = {label: Label; text: string}

const ROW = /^\s*(goal|next|observation|memory)\s*:\s*(.+)$/i

const isLabel = (value: string | undefined): value is Label => value !== undefined && value in LABEL_ICONS

function parseRows(content: string): Row[] | null {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const rows = lines.flatMap((line): Row[] => {
    const match = ROW.exec(line)
    const label = match?.[1]?.toLowerCase()
    const text = match?.[2]?.trim()
    return isLabel(label) && text ? [{label, text}] : []
  })
  return rows.length > 0 && rows.length === lines.length ? rows : null
}

function triggerLabel(streaming: boolean | undefined, durationMs: number | undefined): string {
  if (streaming) return 'Thinking…'
  const elapsed = formatDuration(durationMs)
  return elapsed ? `Thought for ${elapsed}` : 'Thought process'
}

export function ChainOfThought(props: {streaming?: boolean; durationMs?: number; children: JSX.Element}): JSX.Element {
  const [pinned, setPinned] = createSignal<boolean>()
  const open = () => pinned() ?? Boolean(props.streaming)
  return (
    <Collapsible.Root open={open()} onOpenChange={(details) => setPinned(details.open)} class="pw-think">
      <Collapsible.Trigger class="pw-think-head">
        <span class="pw-think-ic" aria-hidden="true">
          <Brain size={14} />
        </span>
        <span class="pw-think-label" classList={{'pw-think-label--live': props.streaming}}>
          {triggerLabel(props.streaming, props.durationMs)}
        </span>
        <ChevronDown class="pw-think-chevron" size={14} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content class="pw-think-content">
        <div class="pw-think-body">{props.children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

export function Reasoning(props: {content: string}): JSX.Element {
  const rows = () => parseRows(props.content)
  return (
    <div class="pw-reason">
      <Show when={rows()} fallback={<div class="pw-reflect-text">{props.content}</div>}>
        {(parsed) => (
          <For each={parsed()}>
            {(row) => (
              <div class="pw-reflect-row">
                <span class="pw-reflect-glyph" aria-hidden="true">
                  <Dynamic component={LABEL_ICONS[row.label]} size={13} />
                </span>
                <span class="pw-sr-only">{row.label}: </span>
                <span>{row.text}</span>
              </div>
            )}
          </For>
        )}
      </Show>
    </div>
  )
}
