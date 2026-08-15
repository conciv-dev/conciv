import {useMediaQuery} from './use-media-query'

const MOBILE_QUERY = '(hover: none) and (pointer: coarse)'

export function useIsMobile(): boolean | undefined {
  return useMediaQuery(MOBILE_QUERY)
}
