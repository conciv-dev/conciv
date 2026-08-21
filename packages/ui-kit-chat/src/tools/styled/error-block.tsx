import {splitProps, type JSX} from 'solid-js'
import {DANGER_TEXT_CLASS} from '../primitives/tool-presentation.js'

const LABEL_CLASS =
  'text-chat-danger uppercase text-[length:var(--chat-text-micro)] leading-none tracking-[0.13em] [font-family:var(--chat-mono)] m-0'
const WRAPPER_CLASS = 'flex flex-col gap-1.5 min-w-0'

export function ErrorBlock(props: {message: string; label?: string; class?: string}): JSX.Element {
  const [local] = splitProps(props, ['message', 'label', 'class'])
  const wrapperClass = (): string => `${WRAPPER_CLASS} ${local.class ?? ''}`
  return (
    <div class={wrapperClass()}>
      <p class={LABEL_CLASS}>{local.label ?? 'Error'}</p>
      <p class={DANGER_TEXT_CLASS}>{local.message}</p>
    </div>
  )
}
