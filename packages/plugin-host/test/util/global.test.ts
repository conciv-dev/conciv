import {describe, expect, test} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {Context, Effect, Layer} from 'effect'
import {Flock} from '../../src/util/flock.js'
import {Global} from '../../src/util/global.js'

describe('global', () => {
  test('building layerWith creates service directories and preserves the given roots', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-global-layer-'))
    const directories = {
      cache: path.join(root, 'cache'),
      state: path.join(root, 'state'),
    }

    const context = await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith(directories))))

    Object.values(directories).forEach((directory) => expect(fs.statSync(directory).isDirectory()).toBe(true))
    expect(Context.get(context, Global.Service).state).toBe(directories.state)
    expect(Context.get(context, Global.Service).cache).toBe(directories.cache)
    fs.rmSync(root, {recursive: true, force: true})
  })

  test('building layerWith points Flock locks without a directory at the state root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-global-flock-'))
    const directories = {
      cache: path.join(root, 'cache'),
      state: path.join(root, 'state'),
    }

    await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith(directories))))
    const held = await Flock.withLock('global-state', () => fs.promises.readdir(path.join(directories.state, 'locks')))

    expect(held).toHaveLength(1)
    fs.rmSync(root, {recursive: true, force: true})
  })
})
