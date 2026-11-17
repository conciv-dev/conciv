import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {concivStateDir, createConcivStateDir} from '@conciv/protocol/state-types'
import type {HarnessId} from '../../harness-detect.js'

function consentFile(cwd: string): string {
  return join(concivStateDir(cwd), 'harnesses.json')
}

export function consentFiles(cwd: string): string[] {
  return [join(concivStateDir(cwd), '.gitignore'), consentFile(cwd)]
}

export function writeConsent(cwd: string, ids: HarnessId[]): void {
  createConcivStateDir(concivStateDir(cwd))
  writeFileSync(consentFile(cwd), `${JSON.stringify({harnesses: ids}, null, 2)}\n`)
}
