import {splitProps, type JSX} from 'solid-js'
import type {ToolResultPart} from '@conciv/protocol/chat-message-types'
import {DANGER_TEXT_CLASS, OUTCOME_LABEL} from '../primitives/tool-presentation.js'

const LABEL_CLASS =
  'uppercase text-[length:var(--chat-text-micro)] leading-none tracking-[0.13em] [font-family:var(--chat-mono)] m-0'
const OUTCOME_TEXT_CLASS =
  'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)] whitespace-pre-wrap [overflow-wrap:anywhere] text-chat-text-2 [font-family:var(--chat-mono)] m-0'
const WRAPPER_CLASS = 'flex flex-col gap-1.5 min-w-0'

export function ErrorBlock(props: {
  message: string
  label?: string
  outcome?: ToolResultPart['outcome']
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['message', 'label', 'outcome', 'class'])
  const wrapperClass = (): string => `${WRAPPER_CLASS} ${local.class ?? ''}`
  const labelClass = (): string =>
    `${LABEL_CLASS} ${local.outcome === undefined ? 'text-chat-danger' : 'text-chat-warn'}`
  return (
    <div class={wrapperClass()}>
      <p class={labelClass()}>{local.label ?? OUTCOME_LABEL[local.outcome ?? 'error']}</p>
      <p class={local.outcome === undefined ? DANGER_TEXT_CLASS : OUTCOME_TEXT_CLASS}>{local.message}</p>
    </div>
  )
}
