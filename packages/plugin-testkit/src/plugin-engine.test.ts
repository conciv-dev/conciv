import {describe, expect} from 'vitest'
import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin-host'
import {testEffect} from './effect.js'
import {PluginEngine} from './plugin-engine.js'

describe('the engine half of a plugin, in memory', () => {
  const it = testEffect(PluginEngine.layer({plugins: ['conciv-engine-tool']}))

  it.live('a plugin from the config list is active, its tool answers in a session, and an unknown rpc fails', () =>
    Effect.gen(function* () {
      const session = yield* PluginEngine.session({title: 'Echo'})

      expect(yield* session.tool('echo').call({text: 'hello'})).toEqual({text: 'hello'})
      expect(yield* session.tool('missing').failure()).toEqual({
        tool: 'missing',
        message: 'No tool named "missing" is currently available. Please use a tool from the available tool list.',
      })
      const plugins = yield* Plugin.Service.use((registry) => registry.list())
      expect(plugins.find((plugin) => plugin.id === 'engine-tool')?.state).toEqual({status: 'active'})
      expect(yield* PluginEngine.failure('nobody', 'call')).toMatchObject({type: expect.any(String)})
    }),
  )
})
