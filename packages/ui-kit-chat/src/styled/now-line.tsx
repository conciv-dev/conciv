import {createMemo, createSignal, For, on, createEffect, Show, splitProps, untrack, type JSX} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {createMediaQuery} from '@solid-primitives/media'
import {Presence} from '@conciv/ui-kit-system'
import {FOCUS} from './classes.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FROZEN_FRAME = '⠿'
const FRAME_MS = 90
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const STOP_LABEL = 'Stop generating'

const ROOT = 'flex items-baseline gap-2 min-w-0 w-full ps-[var(--chat-trace-gutter)] anim-msg'
const GLYPH = 'flex-none inline-block w-[1ch] text-[12px] leading-[1.5] [font-family:var(--chat-mono)] text-chat-accent'
const LINE_BOX = 'relative grid flex-1 min-w-0 overflow-hidden'
const LABEL = '[grid-area:1/1] block truncate text-[12px] leading-[1.5] [font-family:var(--chat-mono)] text-chat-text-2'
const LABEL_MOTION = 'data-[state=open]:anim-word-in data-[state=closed]:anim-word-out'
const STOP = `flex-none self-center px-1.5 py-1 -my-1 rounded-[var(--chat-radius-sm)] cursor-pointer [background:transparent] [border:none] [font-family:var(--chat-mono)] text-[9.5px] font-bold uppercase tracking-[0.12em] leading-none text-chat-text-3 hover:text-chat-danger trans-color-bg ${FOCUS}`

type Line = {id: number; text: string}

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
  const [lines, setLines] = createSignal<Line[]>([{id: 0, text: untrack(() => local.title)}])
  const current = () => lines().at(-1)
  createEffect(
    on(
      () => local.title,
      (next) => {
        const entries = lines()
        const latest = entries.at(-1)
        if (!latest || latest.text === next) return
        const entry = {id: latest.id + 1, text: next}
        const settled = entries.length === 1 && !reducedMotion()
        setLines(settled ? [latest, entry] : [entry])
      },
      {defer: true},
    ),
  )
  const drop = (id: number) => setLines((entries) => entries.filter((entry) => entry.id !== id))
  return (
    <div class={ROOT} role="status">
      <span class={GLYPH} aria-hidden="true">
        {glyph()}
      </span>
      <div class={LINE_BOX}>
        <For each={lines()}>
          {(entry) => (
            <Presence
              present={entry.id === current()?.id}
              lazyMount
              unmountOnExit
              motion={LABEL_MOTION}
              class={LABEL}
              onExitComplete={() => drop(entry.id)}
            >
              {entry.text}
            </Presence>
          )}
        </For>
      </div>
      <Show when={local.onStop}>
        <button type="button" class={STOP} aria-label={STOP_LABEL} onClick={() => local.onStop?.()}>
          Stop
        </button>
      </Show>
    </div>
  )
}
