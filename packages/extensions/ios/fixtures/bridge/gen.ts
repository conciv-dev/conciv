import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {bridgeFixtures, nativeEncodeFixtures} from './bridge.fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))

const swiftFixtureDir = join(here, '../../../../../native/swift/ConcivWidget/Tests/ConcivWidgetTests/Fixtures/bridge')

type Tree = {valid: string; invalid: string; unknownKey: string}

function makeTree(root: string): Tree {
  const tree: Tree = {valid: root, invalid: join(root, 'invalid'), unknownKey: join(root, 'unknown-key')}
  rmSync(tree.invalid, {recursive: true, force: true})
  rmSync(tree.unknownKey, {recursive: true, force: true})
  mkdirSync(tree.valid, {recursive: true})
  mkdirSync(tree.invalid, {recursive: true})
  mkdirSync(tree.unknownKey, {recursive: true})
  return tree
}

function write(dir: string, file: string, value: unknown): void {
  writeFileSync(join(dir, `${file}.json`), `${JSON.stringify(value, null, 2)}\n`)
}

function emit(tree: Tree): void {
  for (const fixture of bridgeFixtures) {
    write(tree.valid, fixture.file, fixture.valid)
    write(tree.invalid, fixture.file, fixture.invalid)
    write(tree.unknownKey, fixture.file, fixture.unknownKey)
  }
}

function makeEncodeDir(root: string): string {
  const dir = join(root, 'encode')
  rmSync(dir, {recursive: true, force: true})
  mkdirSync(dir, {recursive: true})
  return dir
}

function emitEncode(dir: string): void {
  for (const fixture of nativeEncodeFixtures) write(dir, fixture.file, fixture.json)
}

const canonical = makeTree(here)
emit(canonical)
emitEncode(makeEncodeDir(here))

const swiftCopy = makeTree(swiftFixtureDir)
emit(swiftCopy)
emitEncode(makeEncodeDir(swiftFixtureDir))

process.stdout.write(
  `wrote ${bridgeFixtures.length} bridge fixture triples + ${nativeEncodeFixtures.length} native encode fixtures to canonical + swift committed copy\n`,
)
