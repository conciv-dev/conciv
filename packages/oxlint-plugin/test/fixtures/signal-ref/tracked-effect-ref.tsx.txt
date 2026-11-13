import {createEffect, createSignal} from 'solid-js'

export function Panel() {
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  createEffect(() => {
    const element = scroller()
    if (!element) return
    element.scrollTop = element.scrollHeight
  })
  return <div ref={setScroller} />
}
