import {For, Show, type JSX} from 'solid-js'
import {Check, Sparkles, X} from 'lucide-solid'
import type {DoneCard as DoneData} from '@mandarax/protocol/done-types'

// The structured "done" card: the agent-authored roll-up (summary + files/page/tests). The prose
// `message` is rendered by the normal text part, so this card shows only the structured fields.
// Neutral-token styled (references only --chat-*).
const LABEL =
  'block text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] uppercase tracking-[0.04em] mb-0.75'
const LIST =
  'list-none m-0 p-0 [font-family:var(--chat-mono)] text-[length:var(--chat-text-sm)] text-[color:var(--chat-text-2)]'
const LIST_ITEM = 'py-px [overflow-wrap:anywhere]'

export function DoneCard(props: {data: DoneData}): JSX.Element {
  const files = () => props.data.filesChanged
  const actions = () => props.data.pageActions
  return (
    <div class="text-[color:var(--chat-text)] text-[length:var(--chat-text-md)] my-1.5 px-3 py-2.5 rounded-[var(--chat-radius-md)] [background:var(--chat-fill)] [border:1px_solid_var(--chat-accent)] [font-family:var(--chat-font)]">
      <div class="flex gap-2 items-start">
        <span class="text-[color:var(--chat-accent)] inline-flex h-4.75 items-center" aria-hidden="true">
          <Sparkles size={14} />
        </span>
        <span class="text-[color:var(--chat-text-hi)] font-medium">{props.data.summary}</span>
      </div>
      <Show when={files().length}>
        <div class="mt-2">
          <span class={LABEL}>Files</span>
          <ul class={LIST}>
            <For each={files()}>{(file) => <li class={LIST_ITEM}>{file}</li>}</For>
          </ul>
        </div>
      </Show>
      <Show when={actions().length}>
        <div class="mt-2">
          <span class={LABEL}>Page</span>
          <ul class={LIST}>
            <For each={actions()}>{(action) => <li class={LIST_ITEM}>{action}</li>}</For>
          </ul>
        </div>
      </Show>
      <div class="mt-2">
        <span
          class={`inline-flex gap-1.25 items-center ${props.data.testsPassed ? 'text-[color:var(--chat-success)]' : 'text-[color:var(--chat-danger)]'}`}
        >
          <Show when={props.data.testsPassed} fallback={<X size={13} aria-hidden="true" />}>
            <Check size={13} aria-hidden="true" />
          </Show>
          {props.data.testsPassed ? 'tests passed' : 'tests failed'}
        </span>
      </div>
    </div>
  )
}
