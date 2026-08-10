import {type JSX} from 'solid-js'

const SKEL = 'skel-bg [background-size:200%_100%] anim-skel'

export function SessionPillPending(props: {variant: 'pill' | 'bar'}): JSX.Element {
  return (
    <div class="inline-flex min-w-0 items-center" role="status">
      <div
        class={`${SKEL} h-7 ${props.variant === 'pill' ? 'w-32 rounded-pw-pill' : 'w-24 rounded-pw-sm'}`}
        aria-hidden="true"
      />
      <span class="sr-only">Loading sessions…</span>
    </div>
  )
}

export function UsagePending(): JSX.Element {
  return (
    <div class="inline-flex items-center px-1.5 py-0.5" role="status">
      <div class={`${SKEL} h-4 w-10 rounded-pw-sm`} aria-hidden="true" />
      <span class="sr-only">Loading context usage…</span>
    </div>
  )
}

export function ViewTabsPending(): JSX.Element {
  return (
    <div class="px-2.5 flex gap-2 items-center" role="status">
      <div class={`${SKEL} h-8 w-16 rounded-pw-sm`} aria-hidden="true" />
      <div class={`${SKEL} h-8 w-20 rounded-pw-sm`} aria-hidden="true" />
      <span class="sr-only">Loading views…</span>
    </div>
  )
}

export function ComposerActionsPending(): JSX.Element {
  return (
    <div class="flex gap-1 items-center" role="status">
      <div class={`${SKEL} size-8.5 rounded-pw-pill`} aria-hidden="true" />
      <div class={`${SKEL} size-8.5 rounded-pw-pill`} aria-hidden="true" />
      <div class={`${SKEL} size-8.5 rounded-pw-pill`} aria-hidden="true" />
      <span class="sr-only">Loading composer actions…</span>
    </div>
  )
}
