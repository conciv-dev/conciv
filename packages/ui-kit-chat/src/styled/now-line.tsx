import {createMemo, createSignal, Show, splitProps, type JSX} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {createMediaQuery} from '@solid-primitives/media'
import {FOCUS} from './classes.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FROZEN_FRAME = '⠿'
const FRAME_MS = 90
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const STOP_LABEL = 'Stop generating'

const ROOT = 'flex items-baseline gap-2 min-w-0 w-full ps-[var(--chat-trace-gutter)] anim-msg'
const GLYPH = 'flex-none inline-block w-[1ch] text-[12px] leading-[1.5] [font-family:var(--chat-mono)] text-chat-accent'
const LABEL_WRAP = 'relative flex-1 min-w-0 overflow-hidden'
const LABEL = 'block truncate text-[12px] leading-[1.5] [font-family:var(--chat-mono)] text-chat-text-2'
const LABEL_IN = `${LABEL} anim-word-in`
const LABEL_OUT = `${LABEL} absolute [inset-block-start:0] [inset-inline-start:0] [inset-inline-end:0] pointer-events-none anim-word-out`
const STOP = `flex-none self-center px-1.5 py-1 -my-1 rounded-[var(--chat-radius-sm)] cursor-pointer [background:transparent] [border:none] [font-family:var(--chat-mono)] text-[9.5px] font-bold uppercase tracking-[0.12em] leading-none text-chat-text-3 hover:text-chat-danger trans-color-bg ${FOCUS}`

type Swap = {shown: string; leaving: string | null}

export function NowLine(props: {title: string; onStop?: () => void}): JSX.Element {
  const [local] = splitProps(props, ['title', 'onStop'])
  const reducedMotion = createMediaQuery(REDUCED_MOTION)
  const [frameIndex, setFrameIndex] = createSignal(0)
  createTimer(
    () => setFrameIndex((index) => (index + 1) % FRAMES.length),
    () => (reducedMotion() ? false : FRAME_MS),
    setInterval,
  )
  const glyph = createMemo(() => (reducedMotion() ? FROZEN_FRAME : (FRAMES[frameIndex()] ?? FROZEN_FRAME)))
  const swap = createMemo<Swap>(
    (previous) => {
      const next = local.title
      if (next === previous.shown) return previous
      const leaves = previous.shown.length > 0 && !reducedMotion()
      return {shown: next, leaving: leaves ? previous.shown : null}
    },
    {shown: '', leaving: null},
  )
  return (
    <div class={ROOT} role="status">
      <span class={GLYPH} aria-hidden="true">
        {glyph()}
      </span>
      <span class={LABEL_WRAP}>
        <Show keyed when={swap()}>
          {(state) => (
            <>
              <Show when={state.leaving}>
                {(leaving) => (
                  <span class={LABEL_OUT} aria-hidden="true">
                    {leaving()}
                  </span>
                )}
              </Show>
              <span class={LABEL_IN}>{state.shown}</span>
            </>
          )}
        </Show>
      </span>
      <Show when={local.onStop}>
        <button type="button" class={STOP} aria-label={STOP_LABEL} onClick={() => local.onStop?.()}>
          Stop
        </button>
      </Show>
    </div>
  )
}
