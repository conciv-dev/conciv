import iosClient, {makeNativeGrabProvider} from '@conciv/extension-ios/client'
import {createConciv} from './mount.js'

declare global {
  interface Window {
    __concivRebind?: (apiBase: string) => Promise<void>
  }
}

const root = document.querySelector<HTMLElement>('[data-conciv-native-root]') ?? document.body

const handle = createConciv({
  extensions: [iosClient],
  settings: {launcher: 'native'},
  apiBase: window.location.origin,
  grabProvider: makeNativeGrabProvider(),
})

window.__concivRebind = handle.rebind

void handle.mount(root)
