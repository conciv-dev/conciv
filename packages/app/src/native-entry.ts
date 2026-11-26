import {Effect, Exit, Scope} from 'effect'
import {builtins} from '@conciv/plugin-ios/builtins'
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

function composeNative(plugins: typeof native.builtins): PluginEntry[] {
  return plugins.map(({id, plugin: {setup, ...declarations}}): PluginEntry => [
    {...declarations, id, windowEntry: setup && (async () => ({default: setup}))},
    {},
  ])
}

const scope = Effect.runSync(Scope.make())
const native = Effect.runSync(builtins.pipe(Scope.provide(scope)))

const handle = createConciv({
  plugins: composeNative(native.builtins),
  settings: {launcher: readLauncher(window.location.search)},
  ...engineAddress(native.apiBase),
  grabProvider: native.grabProvider,
})

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return
  handle.unmount()
  void Effect.runPromise(Scope.close(scope, Exit.void))
})

void handle.mount(root)
