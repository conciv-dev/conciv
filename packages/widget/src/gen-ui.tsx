import {createSignal, For, Show, type JSX} from 'solid-js'
import type {UiChoices, UiConfirm, UiDiff, UiForm, UiSpec} from '@opendui/aidx-protocol/ui-types'

// Agent-generated UI rendered inline in the chat thread; the user's answer becomes the next
// chat message (the resume turn cycle is the round-trip). Types come from @opendui/aidx-protocol.

function Choices(props: {spec: UiChoices; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div class="pw-genui">
      <p class="pw-genui-q">{props.spec.question}</p>
      <div class="pw-genui-choices">
        <For each={props.spec.options}>
          {(option) => (
            <button class="pw-genui-choice" onClick={() => props.onAnswer(option)}>
              {option}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

function Confirm(props: {spec: UiConfirm; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div class="pw-genui pw-genui-confirm">
      <p class="pw-genui-q">{props.spec.question}</p>
      <Show when={props.spec.detail}>{(detail) => <pre class="pw-genui-detail">{detail()}</pre>}</Show>
      <div class="pw-genui-actions">
        <button class="pw-genui-primary" onClick={() => props.onAnswer('Yes, go ahead.')}>
          Approve
        </button>
        <button class="pw-genui-ghost" onClick={() => props.onAnswer("No, don't.")}>
          Deny
        </button>
      </div>
    </div>
  )
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split('\n')
}

function Diff(props: {spec: UiDiff; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div class="pw-genui pw-genui-diff">
      <div class="pw-genui-diff-file">{props.spec.file}</div>
      <div class="pw-genui-diff-body">
        <For each={splitLines(props.spec.before)}>{(line) => <div class="pw-genui-diff-del">- {line}</div>}</For>
        <For each={splitLines(props.spec.after)}>{(line) => <div class="pw-genui-diff-add">+ {line}</div>}</For>
      </div>
      <div class="pw-genui-actions">
        <button class="pw-genui-primary" onClick={() => props.onAnswer(`Apply the change to ${props.spec.file}.`)}>
          Apply
        </button>
        <button class="pw-genui-ghost" onClick={() => props.onAnswer('Reject that change.')}>
          Reject
        </button>
      </div>
    </div>
  )
}

function fieldValue(values: Record<string, string>, field: UiForm['fields'][number]): string {
  const current = values[field.name]
  if (current !== undefined) return current
  if (field.type === 'select') return field.options?.[0] ?? ''
  return ''
}

function Form(props: {spec: UiForm; onAnswer: (text: string) => void}): JSX.Element {
  const [values, setValues] = createSignal<Record<string, string>>({})
  const set = (name: string, value: string) => setValues((prev) => ({...prev, [name]: value}))
  const submit = (e: Event) => {
    e.preventDefault()
    const summary = props.spec.fields.map((f) => `${f.label}: ${fieldValue(values(), f)}`).join(', ')
    props.onAnswer(summary)
  }
  return (
    <form class="pw-genui pw-genui-form" onSubmit={submit}>
      <Show when={props.spec.title}>{(title) => <p class="pw-genui-q">{title()}</p>}</Show>
      <For each={props.spec.fields}>
        {(field) => (
          <label class="pw-genui-field">
            <span class="pw-genui-label">{field.label}</span>
            <Show
              when={field.type === 'select'}
              fallback={
                <input
                  class="pw-genui-input"
                  type="text"
                  value={values()[field.name] ?? ''}
                  onInput={(e) => set(field.name, e.currentTarget.value)}
                />
              }
            >
              <select
                class="pw-genui-input"
                value={fieldValue(values(), field)}
                onChange={(e) => set(field.name, e.currentTarget.value)}
              >
                <For each={field.options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
              </select>
            </Show>
          </label>
        )}
      </For>
      <div class="pw-genui-actions">
        <button type="submit" class="pw-genui-primary">
          Submit
        </button>
      </div>
    </form>
  )
}

// Dispatch a spec to its component; the if-chain narrows the discriminated union by `kind`.
export function GenUi(props: {spec: UiSpec; onAnswer: (text: string) => void}): JSX.Element | null {
  const spec = props.spec
  if (spec.kind === 'choices') return <Choices spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'confirm') return <Confirm spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'diff') return <Diff spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'form') return <Form spec={spec} onAnswer={props.onAnswer} />
  return null
}
