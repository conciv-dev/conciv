import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, test} from 'vitest'
import {
  WORKER_LIMIT_KIB,
  WORKER_NAME,
  formatWorkerOverBudget,
  measureSizes,
  parseSizes,
  parseWorkerSize,
  renderSizes,
  type WorkerReport,
} from '../src/measure.ts'

let root = ''

afterEach(async () => {
  if (root !== '') await rm(root, {recursive: true, force: true})
  root = ''
})

async function scaffold(entries: {dir: string; name: string; isPrivate?: boolean; dist?: Record<string, string>}[]) {
  root = await mkdtemp(join(tmpdir(), 'conciv-bundle-size-'))
  await mkdir(join(root, 'packages/extensions'), {recursive: true})
  for (const entry of entries) {
    await mkdir(join(root, entry.dir, 'dist'), {recursive: true})
    await writeFile(
      join(root, entry.dir, 'package.json'),
      JSON.stringify({name: entry.name, private: entry.isPrivate ?? false}),
    )
    for (const [file, content] of Object.entries(entry.dist ?? {})) {
      await writeFile(join(root, entry.dir, 'dist', file), content)
    }
  }
}

test('measureSizes reports published dists only, with gzip and raw bytes', async () => {
  await scaffold([
    {dir: 'packages/core', name: '@conciv/core', dist: {'index.js': 'export const answer = 42\n'.repeat(50)}},
    {dir: 'packages/secret', name: '@conciv/secret', isPrivate: true, dist: {'index.js': 'hidden'}},
    {dir: 'packages/empty', name: '@conciv/empty'},
  ])
  const sizes = measureSizes(root)
  expect(sizes.map((size) => size.name)).toEqual(['@conciv/core'])
  const core = sizes[0]
  expect(core?.files).toBe(1)
  expect(core?.raw).toBe('export const answer = 42\n'.repeat(50).length)
  expect(core?.gzip).toBeGreaterThan(0)
  expect(core?.gzip).toBeLessThan(core?.raw ?? 0)
})

test('measureSizes lists the embed widget bundle as its own entry', async () => {
  await scaffold([
    {dir: 'packages/embed', name: '@conciv/embed', dist: {'conciv-widget.global.js': 'widget'.repeat(100)}},
  ])
  const names = measureSizes(root).map((size) => size.name)
  expect(names).toEqual(['widget bundle (packages/embed/dist/conciv-widget.global.js)', '@conciv/embed'])
})

test('renderSizes diffs gzip sizes against a baseline', () => {
  const current = parseSizes(JSON.stringify([{name: '@conciv/core', raw: 10240, gzip: 3072, files: 1}]))
  const baseline = parseSizes(JSON.stringify([{name: '@conciv/core', raw: 9216, gzip: 2048, files: 1}]))
  const output = renderSizes(current, baseline)
  expect(output).toContain('| @conciv/core | 3.0 kB | +1.0 kB (+50.0%) | 10.0 kB | 1 |')
  expect(output).toContain('**3.0 kB gzip total** (+1.0 kB (+50.0%) vs main)')
  expect(renderSizes(current, null)).toContain('**3.0 kB gzip total**\n')
  expect(renderSizes(current, [])).toContain('| new |')
})

test('parseWorkerSize reads the raw and gzip totals from wrangler output', () => {
  expect(parseWorkerSize('Total Upload: 10016.85 KiB / gzip: 2220.11 KiB\nNo bindings found.')).toEqual({
    raw: Math.round(10016.85 * 1024),
    gzip: Math.round(2220.11 * 1024),
  })
})

test('parseWorkerSize throws when the totals are absent', () => {
  for (const bad of ['', 'gzip: 47 KiB', 'Total Upload: 100 KiB']) {
    expect(() => parseWorkerSize(bad), bad).toThrow(/could not read the worker size/)
  }
})

const overBudget: WorkerReport = {
  size: {name: WORKER_NAME, raw: 26_000_000, gzip: 5190 * 1024, files: 3},
  chunks: [
    {file: 'assets/dist-transformers.js', gzip: 374 * 1024},
    {file: 'assets/mount-impl.js', gzip: 296 * 1024},
  ],
}

test('formatWorkerOverBudget reports the overage and names the largest chunks', () => {
  const message = formatWorkerOverBudget(overBudget, WORKER_LIMIT_KIB)
  expect(message).toContain(WORKER_NAME)
  expect(message).toContain('5190.0 KiB gzip')
  expect(message).toContain(`over the ${WORKER_LIMIT_KIB} KiB budget`)
  expect(message).toContain('assets/dist-transformers.js')
  expect(message).toContain('trimServerBundle')
})
