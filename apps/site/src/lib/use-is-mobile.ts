import {useMediaQuery} from './use-media-query'

const MOBILE_QUERY = '(hover: none) and (pointer: coarse)'

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}
