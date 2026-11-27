import {log} from 'evlog'
import {Effect, Exit, Scope} from 'effect'
import {builtins} from '@conciv/plugin-ios/builtins'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM} from '@conciv/types/rpc-types'
import {createConciv, type PluginEntry} from './mount.js'

type EngineAddress = {apiBase: string; engineToken?: () => Promise<string>}

function engineAddress(apiBase: string, search: string): EngineAddress {
  const token = new URLSearchParams(search).get(CONCIV_AUTH_TOKEN_QUERY_PARAM)
  if (!token) return {apiBase}
  return {apiBase, engineToken: () => Promise.resolve(token)}
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
  ...engineAddress(native.apiBase, window.location.search),
  grabProvider: native.grabProvider,
})

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return
  handle.unmount()
  void Effect.runPromise(Scope.close(scope, Exit.void))
})

handle
  .mount(root)
  .catch((error: unknown) => log.error({action: 'widget', message: 'the widget failed to start', error}))
