import {createSignal} from 'solid-js'
import {createStickToBottom} from '@conciv/solid-stick-to-bottom'

export function Panel() {
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  createStickToBottom(scroller, {})
  return <div ref={setScroller} />
}
