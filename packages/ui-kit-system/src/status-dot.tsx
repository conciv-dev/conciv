import {splitProps, type JSX} from 'solid-js'

export type StatusDotTone = 'idle' | 'working' | 'accent' | 'success' | 'danger'

const BASE = 'size-1.75 rounded-pw-pill shrink-0 inline-block'

const TONE: Record<StatusDotTone, string> = {
  idle: 'bg-pw-text-3',
  working: 'bg-pw-success shadow-[0_0_0_0.1875rem_var(--pw-success-15)]',
  accent: 'bg-pw-accent',
  success: 'bg-pw-success',
  danger: 'bg-pw-danger',
}

export function StatusDot(props: {tone: StatusDotTone; pulse?: boolean}): JSX.Element {
  const [local] = splitProps(props, ['tone', 'pulse'])
  return <span aria-hidden="true" class={`${BASE} ${TONE[local.tone]} ${local.pulse === true ? 'anim-pulse' : ''}`} />
}
