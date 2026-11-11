import {splitProps, type JSX} from 'solid-js'

export type StatusDotTone = 'idle' | 'working' | 'accent' | 'success' | 'warn' | 'danger' | 'dim'

const BASE = 'size-1.75 rounded-chat-pill shrink-0 inline-block'

const TONE: Record<StatusDotTone, string> = {
  idle: 'bg-chat-text-3',
  working: 'bg-chat-success shadow-[0_0_0_0.1875rem] shadow-chat-success-18',
  accent: 'bg-chat-accent',
  success: 'bg-chat-success',
  warn: 'bg-chat-warn',
  danger: 'bg-chat-danger',
  dim: 'bg-chat-dim',
}

export function StatusDot(props: {tone: StatusDotTone; pulse?: boolean}): JSX.Element {
  const [local, rest] = splitProps(props, ['tone', 'pulse'])
  return (
    <span
      {...rest}
      aria-hidden="true"
      class={`${BASE}  ${TONE[local.tone]}  ${local.pulse === true ? 'anim-pulse' : ''}`}
    />
  )
}
