export {ORIGIN} from '@mandarax/protocol/sync-types'
export type {Origin} from '@mandarax/protocol/sync-types'

export const roomId = (previewId: string, sessionId: string): string => `${previewId}:${sessionId}`

export const ELEMENTS_KEY = 'elements'

export const PINS_KEY = 'pins'

export const PENDING_KEY = 'pending'

export type PinGeometry = {
  cid: string
  x: number
  y: number
  elementId: string | null
  pinState: 'locked' | 'offset'
}
