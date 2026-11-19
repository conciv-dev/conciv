import {Effect, Exit, Scope} from 'effect'
import {compose} from '@conciv/plugin/experimental/host'
import {makeNativeService, nativePageBase, type NativeService} from '@conciv/plugin-ios/client'
import {createConciv, type PluginEntry} from './mount.js'

const AGENT_PATH = /^\/t\/([^/]+)\/?$/

type EngineAddress = {apiBase: string; engineToken?: () => Promise<string>}

function engineAddress(base: string): EngineAddress {
  const url = new URL(base)
  const agentToken = AGENT_PATH.exec(url.pathname)?.[1]
  if (agentToken === undefined) return {apiBase: url.href.replace(/\/$/, '')}
  return {apiBase: url.origin, engineToken: () => Promise.resolve(agentToken)}
}

const root = document.querySelector<HTMLElement>('[data-conciv-native-root]') ?? document.body

function readLauncher(search: string): 'native' | 'mascot' {
  return new URLSearchParams(search).get('launcher') === 'mascot' ? 'mascot' : 'native'
}

function composeNative(native: NativeService | undefined): PluginEntry[] {
  if (!native) return []
  return compose({ios: {windowEntry: async () => ({default: native.setup})}}).map((entry): PluginEntry => [entry, {}])
}

const scope = Effect.runSync(Scope.make())
const native = Effect.runSync(makeNativeService.pipe(Scope.provide(scope)))

const handle = createConciv({
  plugins: composeNative(native),
  settings: {launcher: readLauncher(window.location.search)},
  ...engineAddress(nativePageBase(window.location)),
  grabProvider: native?.grabProvider,
})

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return
  handle.unmount()
  void Effect.runPromise(Scope.close(scope, Exit.void))
})

void handle.mount(root)
