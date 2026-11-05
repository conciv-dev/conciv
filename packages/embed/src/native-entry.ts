import iosClient, {makeNativeGrabProvider, nativePageBase} from '@conciv/extension-ios/client'
import {createConciv} from './mount.js'

declare global {
  interface Window {
    __concivRebind?: (apiBase: string) => Promise<void>
  }
}

const AGENT_PATH = /^\/t\/([^/]+)\/?$/

const root = document.querySelector<HTMLElement>('[data-conciv-native-root]') ?? document.body

function readLauncher(search: string): 'native' | 'mascot' {
  return new URLSearchParams(search).get('launcher') === 'mascot' ? 'mascot' : 'native'
}

const pageBase = new URL(nativePageBase(window.location))
const agentToken = AGENT_PATH.exec(pageBase.pathname)?.[1]

const handle = createConciv({
  extensions: [iosClient],
  settings: {launcher: readLauncher(window.location.search)},
  apiBase: agentToken === undefined ? pageBase.href.replace(/\/$/, '') : pageBase.origin,
  engineToken: agentToken === undefined ? undefined : () => Promise.resolve(agentToken),
  grabProvider: makeNativeGrabProvider(),
})

window.__concivRebind = handle.rebind

void handle.mount(root)
