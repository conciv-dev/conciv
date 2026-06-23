import type {ReactGrabAPI} from 'react-grab'
import type {ExtensionBuilder} from '@mandarax/extension'

// The single window.__MANDARAX__ brand namespace. Extensions (use/queue) and react-grab host
// extensibility (registerPlugin) share it; each writer MERGES its keys, never clobbers the object.
type MandaraxGlobal = {
  use?: (extension: ExtensionBuilder<object>) => void
  queue?: ExtensionBuilder<object>[]
  registerPlugin?: ReactGrabAPI['registerPlugin']
  unregisterPlugin?: ReactGrabAPI['unregisterPlugin']
}

declare global {
  interface Window {
    __MANDARAX__?: MandaraxGlobal
  }
}
