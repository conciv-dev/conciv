import {useSyncExternalStore} from 'react'
import {
  getServerStarCountSnapshot,
  getStarCountSnapshot,
  subscribeStarCount,
  type StarCountState,
} from './star-count-store'

export function useStarCount(): StarCountState {
  return useSyncExternalStore(subscribeStarCount, getStarCountSnapshot, getServerStarCountSnapshot)
}
