import {describe, expect, test} from 'vitest'
import fs from 'fs'
import path from 'path'
import {Context, Effect, Layer} from 'effect'
import {Flock} from '../../src/util/flock.js'
import {Global} from '../../src/util/global.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'

describe('global', () => {
  test('building layerWith creates service directories and preserves the given roots', async () => {
    const root = tempDir('conciv-global-layer-')
    const directories = {
      cache: path.join(root, 'cache'),
      config: path.join(root, 'config'),
      state: path.join(root, 'state'),
      log: path.join(root, 'log'),
    }

    const context = await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith(directories))))

    Object.values(directories).forEach((directory) => expect(fs.statSync(directory).isDirectory()).toBe(true))
    expect(Context.get(context, Global.Service).state).toBe(directories.state)
    expect(Context.get(context, Global.Service).cache).toBe(directories.cache)
    expect(Context.get(context, Global.Service).config).toBe(directories.config)
    expect(Context.get(context, Global.Service).log).toBe(directories.log)
  })

  test('building layerWith points Flock locks without a directory at the state root', async () => {
    const root = tempDir('conciv-global-flock-')
    const directories = {
      cache: path.join(root, 'cache'),
      config: path.join(root, 'config'),
      state: path.join(root, 'state'),
      log: path.join(root, 'log'),
    }

    await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith(directories))))
    const held = await Flock.withLock('global-state', () => fs.promises.readdir(path.join(directories.state, 'locks')))

    expect(held).toHaveLength(1)
  })
})
