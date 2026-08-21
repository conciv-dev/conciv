import {createMemo, createSignal, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {createTimer} from '@solid-primitives/timer'
import SquarePen from 'lucide-solid/icons/square-pen'
import FoldVertical from 'lucide-solid/icons/fold-vertical'
import {Progress} from '@conciv/ui-kit-system'
import {createMediaQuery} from '../lib/media-query.js'

const DIVIDER =
  "self-stretch flex items-center gap-2.5 my-1.5 mx-0.5 anim-msg before:content-[''] before:flex-1 before:h-px before:bg-chat-line-soft after:content-[''] after:flex-1 after:h-px after:bg-chat-line-soft"
const DIVIDER_LABEL =
  'inline-flex items-center gap-1.25 text-[0.6875rem] font-medium tracking-[0.06em] [text-transform:uppercase]'
const DOT = 'w-1.5 h-1.5 rounded-chat-pill bg-chat-text-2'

export function Divider(props: {kind: 'new' | 'compact'; pending?: boolean}): JSX.Element {
  const icon = () => (props.kind === 'new' ? SquarePen : FoldVertical)
  const label = () => (props.kind === 'new' ? 'New session' : props.pending ? 'Compacting…' : 'Context compacted')
  return (
    <div
      class={DIVIDER}
      classList={{'text-chat-accent-link': props.pending, 'text-chat-text-3': !props.pending}}
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
          <Progress.CircleTrack class="stroke-chat-line-2" />
          <Progress.CircleRange class="[stroke-linecap:round] stroke-chat-accent" />
        </Progress.Circle>
      </Progress.Root>
    </div>
  )
}

const SKELETON_BUBBLE = 'rounded-chat-surface-md bg-chat-fill-strong anim-switching h-9'

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
    <div
      class="p-2.75 rounded-chat-surface-md bg-chat-fill inline-flex gap-1 items-center self-start anim-msg"
      aria-hidden="true"
    >
      <span class={`${DOT} anim-dot1`} />
      <span class={`${DOT} anim-dot2`} />
      <span class={`${DOT} anim-dot3`} />
    </div>
  )
}

const THINKING_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const THINKING_SPINNER_REDUCED_FRAME = '⠿'
const THINKING_SPINNER_FRAME_MS = 90

const THINKING_SPINNER_ROOT = 'inline-flex items-baseline gap-2 self-start ps-[var(--chat-trace-gutter)] anim-msg'
const THINKING_SPINNER_GLYPH = 'inline-block w-[1ch] [font-family:var(--chat-mono)] text-[12px] text-chat-accent'
const THINKING_SPINNER_LABEL = '[font-family:var(--chat-mono)] text-[12px] text-chat-text-3'

export function ThinkingSpinner(): JSX.Element {
  const prefersReducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)')
  const [frameIndex, setFrameIndex] = createSignal(0)
  createTimer(
    () => setFrameIndex((index) => (index + 1) % THINKING_SPINNER_FRAMES.length),
    () => (prefersReducedMotion() ? false : THINKING_SPINNER_FRAME_MS),
    setInterval,
  )
  const glyph = createMemo(() =>
    prefersReducedMotion()
      ? THINKING_SPINNER_REDUCED_FRAME
      : (THINKING_SPINNER_FRAMES[frameIndex()] ?? THINKING_SPINNER_FRAMES[0]),
  )
  return (
    <div class={THINKING_SPINNER_ROOT} role="status" aria-label="Assistant is thinking">
      <span class={THINKING_SPINNER_GLYPH} aria-hidden="true">
        {glyph()}
      </span>
      <span class={THINKING_SPINNER_LABEL} aria-hidden="true">
        thinking
      </span>
    </div>
  )
}
