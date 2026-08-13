import {createSignal} from 'solid-js'

export function Panel() {
  const [box, setBox] = createSignal<HTMLDivElement>()
  const handleClick = () => {
    box()?.focus()
  }
  return <div ref={setBox} onClick={handleClick} />
}
