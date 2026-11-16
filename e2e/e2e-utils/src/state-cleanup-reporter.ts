import {existsSync, readdirSync} from 'node:fs'
import {rm, rmdir} from 'node:fs/promises'
import {dirname} from 'node:path'
import type {Reporter} from '@playwright/test/reporter'

async function removeFolderIfEmpty(folder: string): Promise<void> {
  try {
    await rmdir(folder)
  } catch (error) {
    if (!existsSync(folder) || readdirSync(folder).length > 0) return
    throw error
  }
}

export default function stateCleanupReporter(options: {stateDir: string}): Reporter {
  return {
    printsToStdio: () => false,
    onExit: async () => {
      await rm(options.stateDir, {recursive: true, force: true})
      await removeFolderIfEmpty(dirname(options.stateDir))
    },
  }
}
