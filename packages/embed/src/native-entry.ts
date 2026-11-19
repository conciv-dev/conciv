import {makeNativeGrabProvider, nativePageBase} from '@conciv/extension-ios/client'
import {engineAddress} from './agent-base.js'
import {createConciv} from './mount.js'

const root = document.querySelector<HTMLElement>('[data-conciv-native-root]') ?? document.body

function readLauncher(search: string): 'native' | 'mascot' {
  return new URLSearchParams(search).get('launcher') === 'mascot' ? 'mascot' : 'native'
}

const handle = createConciv({
  settings: {launcher: readLauncher(window.location.search)},
  ...engineAddress(nativePageBase(window.location)),
  grabProvider: makeNativeGrabProvider(),
})

void handle.mount(root)
