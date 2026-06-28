import {createMemo, Show, type JSX} from 'solid-js'
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
  running: '[background:var(--chat-accent)] [animation:pw-think-shimmer_1.2s_linear_infinite]',
  complete: '[background:var(--chat-success)]',
  error: '[background:var(--chat-danger)]',
  approval: '[background:var(--chat-accent)]',
}

const PRE =
  'mt-1.5 mx-0 py-1.5 px-2 [background:var(--chat-sunken)] rounded-[var(--chat-radius-sm)] overflow-x-auto whitespace-pre-wrap [word-break:break-word] [font-family:var(--chat-mono)] leading-[1.4]'

// The generic tool card: collapsed by default (D2), auto-expands on an approval request. Full-width
// inside the assistant turn (min-w-0 via CollapsibleCard) so expanding grows height, not turn edges
// (D1). Args + result render as styled <pre> (no JsonTreeView — parity, §7).
export function ToolFallback(props: ToolCardProps): JSX.Element {
  const status = createMemo(() => toolStatus(props.part, props.result))
  const args = createMemo(() => parseArgs(props.part))
  const result = createMemo(() => resultText(props.result))
  return (
    <CollapsibleCard
      defaultOpen={status() === 'approval'}
      header={
        <>
          <span class={`rounded-[var(--chat-radius-pill)] shrink-0 size-2 ${DOT[status()]}`} aria-hidden="true" />
          <span class="text-[color:var(--chat-text)] [font-family:var(--chat-mono)]">{props.part.name}</span>
          <span class="text-[color:var(--chat-text-3)] ml-auto">{status()}</span>
        </>
      }
    >
      <pre class={PRE}>{args()}</pre>
      <Show when={result()}>
        <pre class={`${PRE} text-[color:var(--chat-text)]`}>{result()}</pre>
      </Show>
    </CollapsibleCard>
  )
}
