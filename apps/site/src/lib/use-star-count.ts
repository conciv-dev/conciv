import {useSyncExternalStore} from 'react'
import {getServerStarCountSnapshot, getStarCountSnapshot, subscribeStarCount} from './star-count-store'

export function useStarCount(): number | null {
  return useSyncExternalStore(subscribeStarCount, getStarCountSnapshot, getServerStarCountSnapshot)
}
