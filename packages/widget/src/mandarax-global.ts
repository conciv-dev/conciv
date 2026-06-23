import type {ReactGrabAPI} from 'react-grab'

// The window.__MANDARAX__ brand namespace for react-grab host extensibility (registerPlugin).
// Extensions no longer ride this — they flow as plain imports into mountWidget.
type MandaraxGlobal = {
  registerPlugin?: ReactGrabAPI['registerPlugin']
  unregisterPlugin?: ReactGrabAPI['unregisterPlugin']
}

declare global {
  interface Window {
    __MANDARAX__?: MandaraxGlobal
  }
}
