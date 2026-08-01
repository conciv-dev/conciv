import {test, expect} from 'vitest'
import {dedupeExtensions} from '../src/dedupe-extensions.js'
import {isExtension} from '../src/extension-guard.js'

test('isExtension requires an object with a non-empty string name', () => {
  expect(isExtension({name: 'a'})).toBe(true)
  expect(isExtension({name: ''})).toBe(false)
  expect(isExtension({})).toBe(false)
  expect(isExtension(null)).toBe(false)
  expect(isExtension(() => {})).toBe(false)
})

test('built-ins win over folder on name collision; deterministic order; provenance in dropped', () => {
  const r = dedupeExtensions([
    {extension: {name: 'terminal'}, source: 'builtin:0'},
    {extension: {name: 'tanstack'}, source: '/app/conciv/extensions/tanstack.tsx'},
    {extension: {name: 'terminal'}, source: '/app/conciv/extensions/terminal.tsx'},
    {extension: {name: ''}, source: '/app/conciv/extensions/broken.tsx'},
    {extension: 42, source: '/app/conciv/extensions/notext.tsx'},
  ])
  expect(r.extensions.map((e) => e.name)).toEqual(['terminal', 'tanstack'])
  expect(r.dropped).toEqual([
    {source: '/app/conciv/extensions/terminal.tsx', reason: 'duplicate-name:terminal'},
    {source: '/app/conciv/extensions/broken.tsx', reason: 'invalid-extension'},
    {source: '/app/conciv/extensions/notext.tsx', reason: 'invalid-extension'},
  ])
})

test('toSortedEntries sorts glob keys, reads default, drops .d.ts (client ordering)', async () => {
  const {toSortedEntries} = await import('../src/dedupe-extensions.js')
  const entries = toSortedEntries({
    '/conciv/extensions/z.tsx': {default: {name: 'z'}},
    '/conciv/extensions/a.tsx': {default: {name: 'a'}},
    '/conciv/extensions/types.d.ts': {default: {name: 'skip'}},
  })
  expect(entries.map((e) => e.source)).toEqual(['/conciv/extensions/a.tsx', '/conciv/extensions/z.tsx'])
  const picked = dedupeExtensions(entries)
  expect(picked.extensions.map((e) => e.name)).toEqual(['a', 'z'])
})
