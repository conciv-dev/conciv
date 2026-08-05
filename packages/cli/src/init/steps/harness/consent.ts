import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {HarnessId} from '../../harness-detect.js'

export function consentFile(cwd: string): string {
  return join(cwd, '.conciv', 'harnesses.json')
}

export function writeConsent(cwd: string, ids: HarnessId[]): void {
  mkdirSync(join(cwd, '.conciv'), {recursive: true})
  writeFileSync(consentFile(cwd), `${JSON.stringify({harnesses: ids}, null, 2)}\n`)
}
