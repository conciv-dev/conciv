import {For, Show, type JSX} from 'solid-js'

// The reflection card restyles the agent's free-form thinking like page-agent's card (accent rail).
// If the model happens to emit recognizable labeled lines (goal:/next:/observation:/memory:), parse
// them into glyph rows; otherwise render the text as-is. Best-effort: no agent behavior change.

type Row = {glyph: string; text: string}
const LABELS: Record<string, string> = {goal: '🎯', next: '🎯', observation: '🔍', memory: '💾'}

function parseRows(content: string): Row[] | null {
  const lines = content.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return null
  const rows: Row[] = []
  for (const line of lines) {
    const match = line.match(/^\s*(goal|next|observation|memory)\s*:\s*(.+)$/i)
    const label = match?.[1]
    const text = match?.[2]
    if (!label || !text) return null
    rows.push({glyph: LABELS[label.toLowerCase()] ?? '•', text: text.trim()})
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
                {row.glyph}
              </span>
              <span>{row.text}</span>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
