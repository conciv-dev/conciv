import {createEffect, createSignal, For, on, splitProps, untrack, type JSX} from 'solid-js'
import {createMediaQuery} from '@solid-primitives/media'
import {Presence} from '@conciv/ui-kit-system'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const BOX = 'relative grid overflow-hidden'
const CELL = '[grid-area:1/1] block min-w-0 truncate tabular-nums'
const CELL_MOTION = 'data-[state=open]:anim-word-in data-[state=closed]:anim-word-out'

type Line = {id: number; text: string}

export function MorphLabel(props: {text: string; class?: string; boxClass?: string}): JSX.Element {
  const [local] = splitProps(props, ['text', 'class', 'boxClass'])
  const reducedMotion = createMediaQuery(REDUCED_MOTION)
  const [lines, setLines] = createSignal<Line[]>([{id: 0, text: untrack(() => local.text)}])
  const current = () => lines().at(-1)
  createEffect(
    on(
      () => local.text,
      (next) => {
        const entries = lines()
        const latest = entries.at(-1)
        if (!latest || latest.text === next) return
        const entry = {id: latest.id + 1, text: next}
        setLines(entries.length === 1 && !reducedMotion() ? [latest, entry] : [entry])
      },
      {defer: true},
    ),
  )
  const drop = (id: number) => setLines((entries) => entries.filter((entry) => entry.id !== id))
  return (
    <span class={`${BOX}  ${local.boxClass ?? ''}`}>
      <For each={lines()}>
        {(entry) => (
          <Presence
            present={entry.id === current()?.id}
            lazyMount
            unmountOnExit
            motion={CELL_MOTION}
            class={`${CELL}  ${local.class ?? ''}`}
            onExitComplete={() => drop(entry.id)}
          >
            {entry.text}
          </Presence>
        )}
      </For>
    </span>
  )
}
