import {execFile} from 'node:child_process'
import {mkdirSync, statSync, symlinkSync, writeFileSync} from 'node:fs'
import {join, parse} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {promisify} from 'node:util'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {isHomeFolderRefused, listEngines, prepareHome, registerEngine, withHomeDb} from './home-db.js'

describe('home folder', () => {
  it('a symlink, a file or a folder another user owns is refused', async () => {
    const root = tempDir('home-')
    const folder = join(root, 'folder')
    const link = join(root, 'link')
    const file = join(root, 'file')
    mkdirSync(folder)
    symlinkSync(folder, link)
    writeFileSync(file, '')

    const rootOwned = parse(root).root

    const throughLink = prepareHome(link)
    await expect(throughLink).rejects.toThrow(`conciv refuses the home folder ${link}: it is a symbolic link`)
    await expect(throughLink).rejects.toSatisfy(isHomeFolderRefused)
    const onFile = prepareHome(file)
    await expect(onFile).rejects.toThrow(`conciv refuses the home folder ${file}: it is not a directory`)
    await expect(onFile).rejects.toSatisfy(isHomeFolderRefused)
    const onRootOwned = prepareHome(rootOwned)
    await expect(onRootOwned).rejects.toThrow(`conciv refuses the home folder ${rootOwned}: it is owned by uid 0`)
    await expect(onRootOwned).rejects.toSatisfy(isHomeFolderRefused)
  })

  it('a new home folder is made private, with its database and lock files readable by the owner only', async () => {
    const home = join(tempDir('home-'), 'conciv')

    const prepared = await prepareHome(home)
    withHomeDb(prepared, (db) => registerEngine(db, {id: 'engine-1', pid: 1, root: '/workspace', apiBase: 'x'}))

    expect(statSync(home).mode & 0o777).toBe(0o700)
    expect(statSync(join(home, 'home.db')).mode & 0o777).toBe(0o600)
    expect(statSync(join(home, 'home.lock')).mode & 0o777).toBe(0o600)
    expect(withHomeDb(prepared, listEngines)).toEqual([{id: 'engine-1', pid: 1, root: '/workspace', apiBase: 'x'}])
  })

  it('preparing the home again keeps the migration lock an open connection holds', async () => {
    const prepared = await prepareHome(join(tempDir('home-'), 'conciv'))
    const lockFile = join(prepared, 'home.lock')
    const lockFromAnotherProcess = [
      "const {DatabaseSync} = require('node:sqlite')",
      'const db = new DatabaseSync(process.argv[1], {timeout: 0})',
      "try { db.exec('BEGIN EXCLUSIVE'); process.stdout.write('taken') } catch (error) { process.stdout.write(error.message) }",
    ].join('\n')
    const takeLockFromAnotherProcess = async () =>
      (await promisify(execFile)(process.execPath, ['-e', lockFromAnotherProcess, lockFile])).stdout
    const held = new DatabaseSync(lockFile)
    try {
      held.exec('BEGIN EXCLUSIVE')
      expect(await takeLockFromAnotherProcess()).toBe('database is locked')

      await prepareHome(prepared)

      expect(await takeLockFromAnotherProcess()).toBe('database is locked')
    } finally {
      held.close()
    }
  })
})
