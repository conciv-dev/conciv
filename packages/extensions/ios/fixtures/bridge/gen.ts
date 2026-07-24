import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {bridgeFixtures} from './bridge.fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const validDir = here
const invalidDir = join(here, 'invalid')
const unknownKeyDir = join(here, 'unknown-key')

rmSync(invalidDir, {recursive: true, force: true})
rmSync(unknownKeyDir, {recursive: true, force: true})
mkdirSync(invalidDir, {recursive: true})
mkdirSync(unknownKeyDir, {recursive: true})

function write(dir: string, file: string, value: unknown): void {
  writeFileSync(join(dir, `${file}.json`), `${JSON.stringify(value, null, 2)}\n`)
}

for (const fixture of bridgeFixtures) {
  write(validDir, fixture.file, fixture.valid)
  write(invalidDir, fixture.file, fixture.invalid)
  write(unknownKeyDir, fixture.file, fixture.unknownKey)
}

process.stdout.write(`wrote ${bridgeFixtures.length} bridge fixture triples\n`)
