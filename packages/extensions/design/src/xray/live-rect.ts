import {createSignal, type Accessor} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import type {Box} from '../shared/defs.js'

export function createLiveRect(input: {selector: Accessor<string>; stored: Accessor<Box>}): Accessor<Placed> {
  const read = (): Placed => placeOf({selector: input.selector(), stored: input.stored()})
  const [placed, setPlaced] = createSignal<Placed>(read())
  const measure = (): void => {
    setPlaced(read())
  }
  createResizeObserver(() => [document.documentElement, placed().element], measure)
  makeEventListener(window, 'scroll', measure, {capture: true, passive: true})
  makeEventListener(window, 'resize', measure)
  return placed
}

type Placed = {box: Box; rendered: boolean; element: Element | null}

function placeOf(input: {selector: string; stored: Box}): Placed {
  const element = document.querySelector(input.selector)
  if (element === null) return {box: input.stored, rendered: false, element}
  const rect = element.getBoundingClientRect()
  return {box: {x: rect.x, y: rect.y, w: rect.width, h: rect.height}, rendered: true, element}
}
