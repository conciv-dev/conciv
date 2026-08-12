import {type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import SquarePen from 'lucide-solid/icons/square-pen'
import FoldVertical from 'lucide-solid/icons/fold-vertical'
import {Progress} from '@conciv/ui-kit-system'

const DIVIDER =
  "self-stretch flex items-center gap-2.5 my-1.5 mx-0.5 anim-msg before:content-[''] before:flex-1 before:h-px before:bg-pw-line-soft after:content-[''] after:flex-1 after:h-px after:bg-pw-line-soft"
const DIVIDER_LABEL =
  'inline-flex items-center gap-1.25 text-[0.6875rem] font-medium tracking-[0.06em] [text-transform:uppercase]'
const DOT = 'w-1.5 h-1.5 rounded-[50%] bg-pw-text-2'

export function Divider(props: {kind: 'new' | 'compact'; pending?: boolean}): JSX.Element {
  const icon = () => (props.kind === 'new' ? SquarePen : FoldVertical)
  const label = () => (props.kind === 'new' ? 'New session' : props.pending ? 'Compacting…' : 'Context compacted')
  return (
    <div
      class={DIVIDER}
      classList={{'text-pw-accent-link': props.pending, 'text-pw-text-3': !props.pending}}
      role="separator"
      aria-label={label()}
    >
      <span class={DIVIDER_LABEL}>
        <Dynamic
          component={icon()}
          class={`size-3 ${props.pending ? '[transform-origin:center] anim-compact' : ''}`}
          aria-hidden="true"
        />
        {label()}
      </span>
    </div>
  )
}

export function CompactSpinner(): JSX.Element {
  return (
    <div
      class="inline-flex shrink-0 size-8.5 items-center justify-center"
      role="status"
      aria-label="Compacting context…"
    >
      <Progress.Root value={25} class="block [--size:1.375rem] [--thickness:0.15625rem]" aria-hidden="true">
        <Progress.Circle class="[transform-origin:center] anim-compact">
          <Progress.CircleTrack class="stroke-pw-line-2" />
          <Progress.CircleRange class="[stroke-linecap:round] stroke-pw-accent" />
        </Progress.Circle>
      </Progress.Root>
    </div>
  )
}

const SKELETON_BUBBLE = 'rounded-pw-md bg-pw-fill-strong anim-switching h-9'

export function ConversationSkeleton(): JSX.Element {
  return (
    <div
      class="flex flex-col gap-2.5 anim-msg animate-delay-[200ms] animate-fill-mode-backwards"
      role="status"
      aria-label="Loading conversation"
    >
      <div class={`${SKELETON_BUBBLE} w-3/5 self-start`} />
      <div class={`${SKELETON_BUBBLE} w-2/5 self-end`} />
      <div class={`${SKELETON_BUBBLE} w-1/2 self-start`} />
    </div>
  )
}

export function ThinkingBubble(): JSX.Element {
  return (
    <div class="p-2.75 rounded-pw-md bg-pw-fill inline-flex gap-1 items-center self-start anim-msg" aria-hidden="true">
      <span class={`${DOT} anim-dot1`} />
      <span class={`${DOT} anim-dot2`} />
      <span class={`${DOT} anim-dot3`} />
    </div>
  )
}
