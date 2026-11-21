import {mkdirSync, symlinkSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {isHomeFolderRefused, openHomeDb} from './home-db.js'

describe('home folder', () => {
  it('a symlink or a file is refused', async () => {
    const root = tempDir('home-')
    const folder = join(root, 'folder')
    const link = join(root, 'link')
    const file = join(root, 'file')
    mkdirSync(folder)
    symlinkSync(folder, link)
    writeFileSync(file, '')

    const throughLink = Promise.try(() => openHomeDb(link))
    const onFile = Promise.try(() => openHomeDb(file))

    await expect(throughLink).rejects.toThrow(`conciv refuses the home folder ${link}: it is a symbolic link`)
    await expect(throughLink).rejects.toSatisfy(isHomeFolderRefused)
    await expect(onFile).rejects.toThrow(`conciv refuses the home folder ${file}: it is not a directory`)
    await expect(onFile).rejects.toSatisfy(isHomeFolderRefused)
  })
})
