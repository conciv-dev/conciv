import type {ReactGrabAPI} from 'react-grab'

type ConcivGlobal = {
  registerPlugin?: ReactGrabAPI['registerPlugin']
  unregisterPlugin?: ReactGrabAPI['unregisterPlugin']
}

declare global {
  interface Window {
    __CONCIV__?: ConcivGlobal
  }
}
