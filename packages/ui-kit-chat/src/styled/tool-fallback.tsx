import {createMemo, Show, type JSX} from 'solid-js'
import {SolidCodeBlock, type FileOptions} from '@mandarax/solid-diffs'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {CollapsibleCard} from './collapsible-card.js'

type ToolStatus = 'running' | 'complete' | 'error' | 'approval'

// parseInput reads part.arguments — tanstack never sets the public part.input ([[tanstack-part-input-empty]]).
function parseArgs(part: ToolCallPart): string {
  try {
    return JSON.stringify(JSON.parse(part.arguments || '{}'), null, 2)
  } catch {
    return part.arguments || ''
  }
}

function resultText(result: ToolResultPart | undefined): string {
  if (!result) return ''
  if (typeof result.content === 'string') return result.content
  return JSON.stringify(result.content, null, 2)
}

function toolStatus(part: ToolCallPart, result: ToolResultPart | undefined): ToolStatus {
  if (part.state === 'approval-requested') return 'approval'
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete' || part.state === 'complete' || part.output !== undefined) return 'complete'
  return 'running'
}

const DOT: Record<ToolStatus, string> = {
  running: '[background:var(--chat-accent)] anim-pulse motion-reduce:[animation:none]',
  complete: '[background:var(--chat-success)]',
  error: '[background:var(--chat-danger)]',
  approval: '[background:var(--chat-accent)]',
}

const LABEL: Record<ToolStatus, string> = {
  running: 'Running',
  complete: 'Done',
  error: 'Failed',
  approval: 'Needs approval',
}

// Render args/results through our shared @pierre/diffs code block (shiki-highlighted). Dual theme +
// themeType:'system' so Pierre resolves the color via CSS `color-scheme` (set per chat theme in
// tokens.css) — light code on the light theme, dark on dark/mandarax. Capped height so a huge payload
// can't blow the thread.
const CODE_OPTIONS: FileOptions<undefined> = {theme: {light: 'github-light', dark: 'github-dark'}, themeType: 'system'}
const CODE_CLASS =
  'text-[length:var(--chat-text-xs)] rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] max-h-80 max-w-full block overflow-auto'

// The generic tool card: collapsed by default (D2), auto-expands on an approval request. Full-width
// inside the assistant turn (min-w-0 via CollapsibleCard) so expanding grows height, not turn edges
// (D1). Args + result render through our shared @pierre/diffs code block (shiki-highlighted).
export function ToolFallback(props: ToolCardProps): JSX.Element {
  const status = createMemo(() => toolStatus(props.part, props.result))
  const args = createMemo(() => parseArgs(props.part))
  const result = createMemo(() => resultText(props.result))
  // A string result is plain text; anything else was JSON-stringified — name drives shiki's language.
  const resultName = () => (typeof props.result?.content === 'string' ? 'result.txt' : 'result.json')
  return (
    <CollapsibleCard
      defaultOpen={status() === 'approval'}
      header={
        <>
          <span class={`rounded-[var(--chat-radius-pill)] shrink-0 size-2 ${DOT[status()]}`} aria-hidden="true" />
          <span class="text-[color:var(--chat-text)] [font-family:var(--chat-mono)]">{props.part.name}</span>
          <span class="text-[color:var(--chat-text-3)] ml-auto">{LABEL[status()]}</span>
        </>
      }
    >
      <div class="flex flex-col gap-1.5">
        <SolidCodeBlock class={CODE_CLASS} options={CODE_OPTIONS} file={{name: 'arguments.json', contents: args()}} />
        <Show when={result()}>
          <SolidCodeBlock class={CODE_CLASS} options={CODE_OPTIONS} file={{name: resultName(), contents: result()}} />
        </Show>
      </div>
    </CollapsibleCard>
  )
}
