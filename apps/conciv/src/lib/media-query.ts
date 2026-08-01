import {createSignal, onCleanup, type Accessor} from 'solid-js'

export const PHONE_MEDIA_QUERY = '(max-width: 520px)'

export function createMediaQuery(query: string): Accessor<boolean> {
  const list = window.matchMedia(query)
  const [matches, setMatches] = createSignal(list.matches)
  const update = () => setMatches(list.matches)
  list.addEventListener('change', update)
  onCleanup(() => list.removeEventListener('change', update))
  return matches
}
