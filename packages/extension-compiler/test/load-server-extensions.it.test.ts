import {test, expect, afterAll} from 'vitest'
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadServerExtensions, listExtensionFiles} from '../src/extensions.js'

const here = dirname(fileURLToPath(import.meta.url))
const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, {recursive: true, force: true})
})

function mkRoot(): string {
  const root = mkdtempSync(join(here, 'conciv-ext-'))
  roots.push(root)
  return root
}

const EXT = "import {defineExtension} from '@conciv/extension'\nexport default defineExtension"

function fixture(files: Record<string, string>, dirs: string[] = []): string {
  const root = mkRoot()
  const base = join(root, 'conciv/extensions')
  mkdirSync(base, {recursive: true})
  for (const d of dirs) mkdirSync(join(base, d), {recursive: true})
  for (const [name, body] of Object.entries(files)) writeFileSync(join(base, name), body)
  return root
}

test('listExtensionFiles: sorted basenames, files only, .d.ts and non-matching excluded, [] on missing dir', () => {
  const root = fixture({'b.tsx': '', 'a.ts': '', 'types.d.ts': '', 'notes.md': '', 'bad.ts.bak': ''}, ['nested.ts'])
  expect(listExtensionFiles(root)).toEqual(['a.ts', 'b.tsx'])
  expect(listExtensionFiles(join(root, 'nowhere'))).toEqual([])
})

test('listExtensionFiles: a non-ENOENT fs failure is fatal, not "no extensions"', () => {
  const root = mkRoot()
  mkdirSync(join(root, 'conciv'), {recursive: true})
  writeFileSync(join(root, 'conciv/extensions'), 'not a directory')
  expect(() => listExtensionFiles(root)).toThrow()
})

test('ignores a directory whose name matches the extension pattern', async () => {
  const root = fixture({'a.tsx': `${EXT}({name:'a'})`}, ['nested.ts'])
  const out = await loadServerExtensions(root, [])
  expect(out.map((e) => e.name)).toEqual(['a'])
})

test('ignores .d.ts declaration files', async () => {
  const root = fixture({'a.tsx': `${EXT}({name:'a'})`, 'types.d.ts': 'export type X = 1'})
  const out = await loadServerExtensions(root, [])
  expect(out.map((e) => e.name)).toEqual(['a'])
})

test('a discovered module with no default export is fatal and names the file', async () => {
  const root = fixture({'x.tsx': 'export const notDefault = 1'})
  await expect(loadServerExtensions(root, [])).rejects.toThrow(/x\.tsx/)
})

test('built-in wins over a folder file of the same name', async () => {
  const {defineExtension} = await import('@conciv/extension')
  const builtin = defineExtension({name: 'terminal'})
  const root = fixture({'terminal.tsx': `${EXT}({name:'terminal'})`, 'a.tsx': `${EXT}({name:'a'})`})
  const out = await loadServerExtensions(root, [builtin])
  expect(out.filter((e) => e.name === 'terminal').length).toBe(1)
  expect(out[0]).toBe(builtin)
})

test('the same-name winner is the built-in regardless of folder enumeration order', async () => {
  const {defineExtension} = await import('@conciv/extension')
  const builtin = defineExtension({name: 'z'})
  const root = fixture({'z.tsx': `${EXT}({name:'z'})`, 'a.tsx': `${EXT}({name:'a'})`})
  const out = await loadServerExtensions(root, [builtin])
  expect(out[0]).toBe(builtin)
  expect(out.map((e) => e.name)).toEqual(['z', 'a'])
})
