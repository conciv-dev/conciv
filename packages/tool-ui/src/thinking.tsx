import {For, Show, createSignal, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Collapsible} from '@mandarax/ui-kit-system'
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
    <Collapsible.Root open={open()} onOpenChange={(details) => setPinned(details.open)} class="font-pw my-1.5">
      <Collapsible.Trigger class="text-pw-text-3 px-0 py-0.5 text-left bg-transparent flex gap-1.75 w-full cursor-pointer [border:0] [font:inherit] items-center">
        <span class="text-pw-text-3 inline-flex flex-none" aria-hidden="true">
          <Brain size={14} />
        </span>
        <span
          class="text-[0.78125rem] flex-auto min-w-0"
          classList={{
            '[background:linear-gradient(90deg,var(--pw-dim)_0%,var(--pw-text-hi)_50%,var(--pw-dim)_100%)] [background-size:200%_100%] bg-clip-text text-transparent anim-think-shimmer motion-reduce:animate-none motion-reduce:text-pw-text-2':
              props.streaming,
          }}
        >
          {triggerLabel(props.streaming, props.durationMs)}
        </span>
        <ChevronDown
          class="text-pw-text-3 flex-none trans-tf160 [[data-state=closed]_&]:[transform:rotate(-90deg)]"
          size={14}
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class="text-[0.8125rem] text-pw-text-2 mt-1.25 pb-0.5 pl-2.75 pt-1 border-l border-l-pw-line-soft">
          {props.children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

export function Reasoning(props: {content: string}): JSX.Element {
  const rows = () => parseRows(props.content)
  return (
    <div>
      <Show when={rows()} fallback={<div class="whitespace-pre-wrap">{props.content}</div>}>
        {(parsed) => (
          <For each={parsed()}>
            {(row) => (
              <div class="py-0.5 flex gap-2 items-start">
                <span class="text-pw-accent-link inline-flex flex-none h-4.75 items-center" aria-hidden="true">
                  <Dynamic component={LABEL_ICONS[row.label]} size={13} />
                </span>
                <span class="sr-only">{row.label}: </span>
                <span>{row.text}</span>
              </div>
            )}
          </For>
        )}
      </Show>
    </div>
  )
}
