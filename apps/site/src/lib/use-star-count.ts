import {getRouteApi} from '@tanstack/react-router'
import {useSyncExternalStore} from 'react'
import {getRefreshedStarCount, getServerRefreshedStarCount, subscribeStarCount} from './star-count-store'

const rootRoute = getRouteApi('__root__')

export function useStarCount(): number | null {
  const {stars} = rootRoute.useLoaderData()
  const refreshed = useSyncExternalStore(subscribeStarCount, getRefreshedStarCount, getServerRefreshedStarCount)
  return refreshed ?? stars
}
