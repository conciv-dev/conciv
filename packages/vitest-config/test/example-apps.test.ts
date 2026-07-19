import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'
import {describeExampleAppViolations, findExampleAppTestSetup, EXAMPLES_DIR} from '../src/example-apps.ts'

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

function fixture(app: string, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'example-apps-'))
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, EXAMPLES_DIR, app, path)
    mkdirSync(dirname(full), {recursive: true})
    writeFileSync(full, contents)
  }
  return root
}

test('the real example apps carry no test setup', () => {
  const violations = findExampleAppTestSetup(repoRoot)
  expect(violations, violations.length === 0 ? '' : describeExampleAppViolations(violations)).toEqual([])
})

test('flags a test directory', () => {
  const root = fixture('demo', {'package.json': '{}', 'test/widget.e2e.test.ts': ''})
  expect(findExampleAppTestSetup(root)).toContainEqual({app: 'demo', kind: 'directory', detail: 'test/'})
})

test('flags a colocated spec file', () => {
  const root = fixture('demo', {'package.json': '{}', 'src/thing.spec.tsx': ''})
  expect(findExampleAppTestSetup(root)).toContainEqual({app: 'demo', kind: 'file', detail: 'src/thing.spec.tsx'})
})

test('flags a runner config', () => {
  const root = fixture('demo', {'package.json': '{}', 'vitest.config.ts': ''})
  expect(findExampleAppTestSetup(root)).toContainEqual({app: 'demo', kind: 'file', detail: 'vitest.config.ts'})
})

test('flags test scripts and runner dependencies', () => {
  const root = fixture('demo', {
    'package.json': JSON.stringify({scripts: {'test:e2e': 'playwright test'}, devDependencies: {vitest: '^4'}}),
  })
  const violations = findExampleAppTestSetup(root)
  expect(violations).toContainEqual({app: 'demo', kind: 'script', detail: 'test:e2e'})
  expect(violations).toContainEqual({app: 'demo', kind: 'dependency', detail: 'vitest'})
})

test('accepts a demo app with no test surface', () => {
  const root = fixture('demo', {
    'package.json': JSON.stringify({scripts: {dev: 'vite dev', build: 'vite build'}, dependencies: {vite: '^8'}}),
    'src/main.tsx': '',
  })
  expect(findExampleAppTestSetup(root)).toEqual([])
})
