import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {test} from '../../test/engine-test.js'
import {settingsOnDisk} from './settings-storage.js'

describe('settings', () => {
  test.each(['shortcuts/keys', 'shortcuts:keys'])('the engine refuses the namespace %s', async (namespace) => {
    const engine = await createEngine()

    await expect(engine.setting({scope: 'project', namespace, key: 'send', value: 'Enter'})).rejects.toThrow()
  })

  test('a value set in each scope is read back after the storage opens again', async ({settingsStorage}) => {
    const root = tempDir('settings-')
    const folders = {global: join(root, 'home'), project: join(root, 'project')}
    const first = settingsStorage(settingsOnDisk(folders))
    await (await first.file('global', 'theme')).set('mode', 'dark')
    await (await first.file('project', 'shortcuts')).set('send', 'Enter')
    await first.close()

    const second = settingsStorage(settingsOnDisk(folders))

    expect((await (await second.file('global', 'theme')).read()).value).toEqual({mode: 'dark'})
    expect((await (await second.file('project', 'shortcuts')).read()).value).toEqual({send: 'Enter'})
  })
})
