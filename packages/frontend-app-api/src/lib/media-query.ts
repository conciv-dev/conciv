import {createSignal, type Accessor} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'

export const PHONE_MEDIA_QUERY = '(max-width: 520px)'

export function createMediaQuery(query: string): Accessor<boolean> {
  const list = window.matchMedia(query)
  const [matches, setMatches] = createSignal(list.matches)
  makeEventListener(list, 'change', () => setMatches(list.matches))
  return matches
}
