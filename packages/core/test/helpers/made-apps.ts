import {afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {MadeApp} from '../../src/app.js'

export type MadeApps = {keep: (made: MadeApp) => MadeApp; tmp: (prefix: string) => string}

export function useMadeApps(): MadeApps {
  const state = {apps: [] as MadeApp[], dirs: [] as string[]}
  afterEach(async () => {
    for (const made of state.apps.splice(0)) await made.dispose()
    for (const dir of state.dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })
  return {
    keep: (made) => {
      state.apps.push(made)
      return made
    },
    tmp: (prefix) => {
      const dir = mkdtempSync(join(tmpdir(), prefix))
      state.dirs.push(dir)
      return dir
    },
  }
}
