import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, test} from 'vitest'
import {engineOrigin} from '../src/engine-origin.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
})

function projectWith(serverJson: string | null): {root: string; nested: string} {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-origin-'))
  roots.push(root)
  const nested = join(root, 'src', 'deep')
  mkdirSync(nested, {recursive: true})
  if (serverJson !== null) {
    mkdirSync(join(root, '.conciv'))
    writeFileSync(join(root, '.conciv', 'server.json'), serverJson)
  }
  return {root, nested}
}

test('finds the engine port in .conciv/server.json walking up from a nested cwd', () => {
  const project = projectWith(JSON.stringify({port: 41234}))
  expect(engineOrigin(project.nested, {})).toBe('http://127.0.0.1:41234')
  expect(engineOrigin(project.root, {})).toBe('http://127.0.0.1:41234')
})

test('CONCIV_PORT wins over .conciv/server.json', () => {
  const project = projectWith(JSON.stringify({port: 41234}))
  expect(engineOrigin(project.nested, {CONCIV_PORT: '45678'})).toBe('http://127.0.0.1:45678')
})

test('falls back to 5173 with no server.json anywhere up the tree', () => {
  const project = projectWith(null)
  expect(engineOrigin(project.nested, {})).toBe('http://127.0.0.1:5173')
})

test('a malformed server.json falls through to 5173 instead of throwing', () => {
  const project = projectWith('{"port": "not a number"')
  expect(engineOrigin(project.nested, {})).toBe('http://127.0.0.1:5173')
})
