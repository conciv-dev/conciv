import {For, Show, type JSX} from 'solid-js'
import {Check, Sparkles, X} from 'lucide-solid'
import type {DoneCard as DoneData} from '@opendui/aidx-protocol/done-types'

// The structured "done" card: renders the agent-authored roll-up (summary + files/page/tests). The
// prose `message` is rendered by the widget's normal text part, so this card shows only the
// structured fields. Plan D produces `data` via the harness structured-output path.
export function DoneCard(props: {data: DoneData}): JSX.Element {
  const files = () => props.data.filesChanged
  const actions = () => props.data.pageActions
  return (
    <div class="pw-done">
      <div class="pw-done-head">
        <span class="pw-done-ic" aria-hidden="true">
          <Sparkles size={14} />
        </span>
        <span class="pw-done-summary">{props.data.summary}</span>
      </div>
      <Show when={files().length}>
        <div class="pw-done-section">
          <span class="pw-done-label">Files</span>
          <ul class="pw-done-list">
            <For each={files()}>{(file) => <li>{file}</li>}</For>
          </ul>
        </div>
      </Show>
      <Show when={actions().length}>
        <div class="pw-done-section">
          <span class="pw-done-label">Page</span>
          <ul class="pw-done-list">
            <For each={actions()}>{(action) => <li>{action}</li>}</For>
          </ul>
        </div>
      </Show>
      <div class="pw-done-section">
        <span class={`pw-done-tests pw-done-tests--${props.data.testsPassed ? 'pass' : 'fail'}`}>
          <Show when={props.data.testsPassed} fallback={<X size={13} />}>
            <Check size={13} />
          </Show>
          {props.data.testsPassed ? 'tests passed' : 'tests failed'}
        </span>
      </div>
    </div>
  )
}
