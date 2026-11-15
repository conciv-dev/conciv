import {mkdtempSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll} from 'vitest'

const testFileRoot = mkdtempSync(join(tmpdir(), 'conciv-test-'))

afterAll(() => rm(testFileRoot, {recursive: true, force: true, maxRetries: 10}))

export function tempDir(prefix: string): string {
  return mkdtempSync(join(testFileRoot, prefix))
}
