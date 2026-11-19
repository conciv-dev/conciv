import {compose} from '@conciv/plugin/experimental/host'
import {makeNativeGrabProvider, nativePageBase, setup} from '@conciv/plugin-ios/client'
import {engineAddress} from './agent-base.js'
import {createConciv, type PluginEntry} from './mount.js'

const root = document.querySelector<HTMLElement>('[data-conciv-native-root]') ?? document.body

function readLauncher(search: string): 'native' | 'mascot' {
  return new URLSearchParams(search).get('launcher') === 'mascot' ? 'mascot' : 'native'
}

const handle = createConciv({
  plugins: compose({ios: {windowEntry: async () => ({default: setup})}}).map((entry): PluginEntry => [entry, {}]),
  settings: {launcher: readLauncher(window.location.search)},
  ...engineAddress(nativePageBase(window.location)),
  grabProvider: makeNativeGrabProvider(),
})

void handle.mount(root)
