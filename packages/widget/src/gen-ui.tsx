import {type FormEvent, type JSX, useState} from 'react'
import type {UiApproval, UiChoices, UiConfirm, UiDiff, UiForm, UiSpec} from '@aidx/protocol/ui-types'

// Agent-generated UI rendered inline in the chat thread. The dev server emits these specs
// as AG-UI CUSTOM events (`aidx-ui`); the widget renders a real component and sends the
// user's answer as the next chat message (the `claude --resume` turn cycle is the
// round-trip — no blocking, no separate result channel). Types come from @aidx/protocol.

function Choices(props: {spec: UiChoices; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div className="pw-genui">
      <p className="pw-genui-q">{props.spec.question}</p>
      <div className="pw-genui-choices">
        {props.spec.options.map((option) => (
          <button key={option} className="pw-genui-choice" onClick={() => props.onAnswer(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function Confirm(props: {spec: UiConfirm; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div className="pw-genui pw-genui-confirm">
      <p className="pw-genui-q">{props.spec.question}</p>
      {props.spec.detail ? <pre className="pw-genui-detail">{props.spec.detail}</pre> : null}
      <div className="pw-genui-actions">
        <button className="pw-genui-primary" onClick={() => props.onAnswer('Yes, go ahead.')}>
          Approve
        </button>
        <button className="pw-genui-ghost" onClick={() => props.onAnswer("No, don't.")}>
          Deny
        </button>
      </div>
    </div>
  )
}

function Approval(props: {spec: UiApproval; onDecide: (approved: boolean) => void}): JSX.Element {
  return (
    <div className="pw-genui pw-genui-approval">
      <p className="pw-genui-q">{props.spec.question}</p>
      {props.spec.detail ? <pre className="pw-genui-detail">{props.spec.detail}</pre> : null}
      <div className="pw-genui-actions">
        <button className="pw-genui-primary" onClick={() => props.onDecide(true)}>
          Approve
        </button>
        <button className="pw-genui-ghost" onClick={() => props.onDecide(false)}>
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
    <div className="pw-genui pw-genui-diff">
      <div className="pw-genui-diff-file">{props.spec.file}</div>
      <div className="pw-genui-diff-body">
        {splitLines(props.spec.before).map((line, i) => (
          <div key={`del-${i}`} className="pw-genui-diff-del">
            - {line}
          </div>
        ))}
        {splitLines(props.spec.after).map((line, i) => (
          <div key={`add-${i}`} className="pw-genui-diff-add">
            + {line}
          </div>
        ))}
      </div>
      <div className="pw-genui-actions">
        <button className="pw-genui-primary" onClick={() => props.onAnswer(`Apply the change to ${props.spec.file}.`)}>
          Apply
        </button>
        <button className="pw-genui-ghost" onClick={() => props.onAnswer('Reject that change.')}>
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
  const [values, setValues] = useState<Record<string, string>>({})
  const set = (name: string, value: string) => setValues((prev) => ({...prev, [name]: value}))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const summary = props.spec.fields.map((f) => `${f.label}: ${fieldValue(values, f)}`).join(', ')
    props.onAnswer(summary)
  }
  return (
    <form className="pw-genui pw-genui-form" onSubmit={submit}>
      {props.spec.title ? <p className="pw-genui-q">{props.spec.title}</p> : null}
      {props.spec.fields.map((field) => (
        <label key={field.name} className="pw-genui-field">
          <span className="pw-genui-label">{field.label}</span>
          {field.type === 'select' ? (
            <select
              className="pw-genui-input"
              value={fieldValue(values, field)}
              onChange={(e) => set(field.name, e.currentTarget.value)}
            >
              {(field.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="pw-genui-input"
              type="text"
              value={values[field.name] ?? ''}
              onChange={(e) => set(field.name, e.currentTarget.value)}
            />
          )}
        </label>
      ))}
      <div className="pw-genui-actions">
        <button type="submit" className="pw-genui-primary">
          Submit
        </button>
      </div>
    </form>
  )
}

// Dispatch a spec to its component. onAnswer sends the user's response as the next message;
// onDecide answers the risky-Bash gate's blocking allow/deny. Each branch narrows the
// discriminated union by `kind`, so the child receives a precisely-typed spec — no casts.
// The `vitest` kind renders nothing here (its card lives in the transcript, see chat-shell).
export function GenUi(props: {
  spec: UiSpec
  onAnswer: (text: string) => void
  onDecide: (approved: boolean) => void
}): JSX.Element | null {
  const spec = props.spec
  if (spec.kind === 'approval') return <Approval spec={spec} onDecide={props.onDecide} />
  if (spec.kind === 'choices') return <Choices spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'confirm') return <Confirm spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'diff') return <Diff spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'form') return <Form spec={spec} onAnswer={props.onAnswer} />
  return null
}
