import {For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ArrowRight, Database, Search, Target, type LucideIcon} from 'lucide-solid'

// The reflection card restyles the agent's free-form thinking like page-agent's card (accent rail).
// If the model happens to emit recognizable labeled lines (goal:/next:/observation:/memory:), parse
// them into glyph rows; otherwise render the text as-is. Best-effort: no agent behavior change.

type Label = 'goal' | 'next' | 'observation' | 'memory'
type Row = {label: Label; text: string}

// Each labeled line gets a lucide icon (not an emoji — tints to currentColor, consistent with cards).
const ICONS: Record<Label, LucideIcon> = {goal: Target, next: ArrowRight, observation: Search, memory: Database}

function isLabel(value: string): value is Label {
  return value === 'goal' || value === 'next' || value === 'observation' || value === 'memory'
}

function parseRows(content: string): Row[] | null {
  const lines = content.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return null
  const rows: Row[] = []
  for (const line of lines) {
    const match = line.match(/^\s*(goal|next|observation|memory)\s*:\s*(.+)$/i)
    const raw = match?.[1]?.toLowerCase()
    const text = match?.[2]
    if (!raw || !text || !isLabel(raw)) return null
    rows.push({label: raw, text: text.trim()})
  }
  return rows.length ? rows : null
}

export function ReflectionCard(props: {content: string}): JSX.Element {
  const rows = () => parseRows(props.content)
  return (
    <div class="pw-reflect">
      <Show when={rows()} fallback={<div class="pw-reflect-text">{props.content}</div>}>
        <For each={rows()}>
          {(row) => (
            <div class="pw-reflect-row">
              <span class="pw-reflect-glyph" aria-hidden="true">
                <Dynamic component={ICONS[row.label]} size={13} />
              </span>
              <span class="pw-sr-only">{row.label}: </span>
              <span>{row.text}</span>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
