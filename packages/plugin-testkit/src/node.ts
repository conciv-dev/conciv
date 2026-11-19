import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test as base} from 'vitest'
import {bootCoreKit, type CoreKit} from './core-kit.js'

type EngineOptions = Parameters<typeof bootCoreKit>[0]

type NodeFixtures = {
  $test: {tmp: string}
  $file: {engine: CoreKit}
}

export const test = base
  .extend('engineOptions', {scope: 'file'}, (): EngineOptions => ({id: 'engine'}))
  .extend<NodeFixtures>({
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    tmp: async ({}, use) => {
      const folder = await mkdtemp(join(tmpdir(), 'conciv-tmp-'))
      await use(folder)
      await rm(folder, {recursive: true, force: true, maxRetries: 10})
    },
    engine: [
      async ({engineOptions}, use) => {
        const kit = await bootCoreKit(engineOptions)
        await use(kit)
        await kit.cleanup()
      },
      {scope: 'file'},
    ],
  })
