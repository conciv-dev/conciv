import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execa} from 'execa'
import {expect, test} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {assertTestsWithinBudget} from '../../src/test-budget.ts'

test('a package over its budget fails with its count and budget, at budget passes, under budget asks to lower it', async () => {
  const spec = `import {makeMethods} from '@effect/vitest'
import {describe, expect, it, test} from 'vitest'
// test('a comment never counts', () => {})
const note = "it('a string never counts', () => {})"
const withUser = test.extend({user: async ({}, use) => use('ada')})
const effectWithUser = makeMethods(it.extend({user: async ({}, use) => use('ada')}))
describe('cases', () => {
  test('plain', () => expect(note).toBeTruthy())
  it('it form', () => {})
  test.concurrent('concurrent', () => {})
  test.skip('skipped', () => {})
  it.only('only', () => {})
  test.each([1, 2])('each %i', () => {})
  test.skipIf(false)('skip if', () => {})
  withUser('extended', () => {})
  it.effect('effect', () => {})
  it.live('live', () => {})
  it.scoped('scoped', () => {})
  it.live.each([1, 2])('live each %i', () => {})
  effectWithUser.live('effect extended', () => {})
  test.describe('a playwright group is not a case', () => {})
  test.use({})
})
`
  const scaffoldWorkspace = async (budget: Record<string, number>) => {
    const root = tempDir('test-budget-')
    const source = join(root, 'packages', 'a', 'src')
    await mkdir(join(source, 'fixtures'), {recursive: true})
    await Promise.all([
      writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n'),
      writeFile(join(root, 'package.json'), JSON.stringify({name: 'root', private: true})),
      writeFile(join(root, 'packages', 'a', 'package.json'), JSON.stringify({name: '@conciv/a'})),
      writeFile(join(source, 'a.test.ts'), spec),
      writeFile(join(source, 'fixtures', 'demo.test.ts'), "test('a fixture', () => {})\n"),
      writeFile(join(root, 'test-budget.json'), JSON.stringify(budget)),
    ])
    await execa('git', ['init', '--quiet'], {cwd: root})
    await execa('git', ['add', '--all'], {cwd: root})
    return root
  }

  await expect(assertTestsWithinBudget(await scaffoldWorkspace({'@conciv/a': 12}))).rejects.toThrow(
    '@conciv/a: 13 tests, budget 12\n\nThe budget is a review gate, not a counter to bump.',
  )
  await expect(assertTestsWithinBudget(await scaffoldWorkspace({'@conciv/a': 13}))).resolves.toEqual([])
  await expect(assertTestsWithinBudget(await scaffoldWorkspace({'@conciv/a': 14}))).resolves.toEqual([
    '@conciv/a: 13 tests, budget 14: lower it to 13 in test-budget.json',
  ])
})
