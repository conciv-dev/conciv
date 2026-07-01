import type {ReactGrabAPI} from 'react-grab'

// The window.__CONCIV__ brand namespace for react-grab host extensibility (registerPlugin).
// Extensions no longer ride this — they flow as plain imports into mountWidget.
type ConcivGlobal = {
  registerPlugin?: ReactGrabAPI['registerPlugin']
  unregisterPlugin?: ReactGrabAPI['unregisterPlugin']
}

declare global {
  interface Window {
    __CONCIV__?: ConcivGlobal
  }
}
