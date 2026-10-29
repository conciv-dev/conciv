import {createSignal} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

export function Panel() {
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  createResizeObserver(scroller, () => {})
  return <div ref={setScroller} />
}
