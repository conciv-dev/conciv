import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {settingsOnDisk} from '../../src/engine/settings/settings-storage.js'
import {test} from '../utils/engine-parts.js'

describe('settings', () => {
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
