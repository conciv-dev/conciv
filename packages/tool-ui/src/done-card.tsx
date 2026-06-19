import {For, Show, type JSX} from 'solid-js'
import {Check, Sparkles, X} from 'lucide-solid'
import type {DoneCard as DoneData} from '@mandarax/protocol/done-types'

// The structured "done" card: renders the agent-authored roll-up (summary + files/page/tests). The
// prose `message` is rendered by the widget's normal text part, so this card shows only the
// structured fields. Plan D produces `data` via the harness structured-output path.
// Uppercase section label + monospace item list (Files / Page rolls).
const LABEL = 'block text-pw-text-3 text-[0.6875rem] uppercase tracking-[0.04em] mb-0.75'
const LIST = 'list-none m-0 p-0 font-pw-mono text-[0.75rem] text-pw-text-2'
const LIST_ITEM = 'py-px [overflow-wrap:anywhere]'

export function DoneCard(props: {data: DoneData}): JSX.Element {
  const files = () => props.data.filesChanged
  const actions = () => props.data.pageActions
  return (
    <div class="text-[0.8125rem] text-pw-text font-pw my-1.5 px-3 py-2.5 border border-pw-accent-line rounded-pw-md bg-pw-accent-08">
      <div class="flex gap-2 items-start">
        <span class="text-pw-accent inline-flex h-4.75 items-center" aria-hidden="true">
          <Sparkles size={14} />
        </span>
        <span class="text-pw-text-hi font-medium">{props.data.summary}</span>
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
          class={`inline-flex gap-1.25 items-center ${props.data.testsPassed ? 'text-pw-success' : 'text-pw-danger'}`}
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
