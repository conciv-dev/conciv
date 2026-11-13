import {createSignal} from 'solid-js'

export function Panel() {
  const [box, setBox] = createSignal<HTMLDivElement>()
  return <div ref={setBox} onClick={() => box()?.focus()} />
}
