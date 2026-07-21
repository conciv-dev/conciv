import {useCallback, useSyncExternalStore} from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia === 'undefined') return () => {}
      const mq = matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = () => typeof matchMedia !== 'undefined' && matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
