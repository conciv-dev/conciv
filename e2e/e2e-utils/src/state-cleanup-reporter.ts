import {existsSync, readdirSync, rmSync, rmdirSync} from 'node:fs'
import {dirname} from 'node:path'
import type {Reporter} from '@playwright/test/reporter'

function removeFolderIfEmpty(folder: string): void {
  try {
    rmdirSync(folder)
  } catch (error) {
    if (!existsSync(folder) || readdirSync(folder).length > 0) return
    throw error
  }
}

export default function stateCleanupReporter(options: {stateDir: string}): Reporter {
  return {
    printsToStdio: () => false,
    onExit: () => {
      rmSync(options.stateDir, {recursive: true, force: true})
      removeFolderIfEmpty(dirname(options.stateDir))
    },
  }
}
