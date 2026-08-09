import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import {
  assertLockNotDrifted,
  closureOf,
  packageCatalogKeys,
  workspacePackages,
  type PackageInfo,
} from '../packed/harness.js'

test('the pack closure follows a workspace dependency whose name carries no scope', () => {
  const packages = new Map<string, PackageInfo>([
    ['@conciv/it', {dir: '/repo/packages/it', version: '1.0.0', deps: {conciv: 'workspace:*', next: '16.2.10'}}],
    ['conciv', {dir: '/repo/packages/cli', version: '1.0.0', deps: {'@conciv/core': 'workspace:*'}}],
    ['@conciv/core', {dir: '/repo/packages/core', version: '1.0.0', deps: {}}],
    ['@conciv/unrelated', {dir: '/repo/packages/unrelated', version: '1.0.0', deps: {}}],
  ])
  expect(closureOf(packages, ['@conciv/it'])).toEqual(['@conciv/core', '@conciv/it', 'conciv'])
})

test('workspace packages come from pnpm workspace state, not from a scanned directory', () => {
  const names = [...workspacePackages().keys()]
  expect(names).toContain('@conciv/it')
  expect(names).toContain('conciv-e2e-nextjs')
})

function fakeLock(entries: string[]): string {
  return [
    'lockfileVersion: 9.0',
    '',
    'importers:',
    '  .: {}',
    '',
    'packages:',
    ...entries.map((entry) => `  '${entry}':`),
    '',
    'snapshots:',
    ...entries.map((entry) => `  '${entry}': {}`),
    '',
  ].join('\n')
}

test('the pack catalog reader collects top-level registry entries and drops file: conciv ones', () => {
  const lock = fakeLock(['@orpc/tanstack-query@1.14.7', '@conciv/it@file:/tmp/x/conciv-it-0.0.18.tgz', 'is-odd@3.0.1'])
  expect(packageCatalogKeys(lock)).toEqual(new Set(['@orpc/tanstack-query@1.14.7', 'is-odd@3.0.1']))
})

test('the drift guard passes when the produced lockfile matches the committed one on registry packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-drift-guard-match-'))
  const committedPath = join(root, 'committed-lock.yaml')
  writeFileSync(committedPath, fakeLock(['@orpc/tanstack-query@1.14.7', '@conciv/it@file:/tmp/a/conciv-it.tgz']))
  writeFileSync(
    join(root, 'pnpm-lock.yaml'),
    fakeLock(['@orpc/tanstack-query@1.14.7', '@conciv/it@file:/tmp/b/conciv-it.tgz']),
  )
  try {
    expect(() => assertLockNotDrifted(root, committedPath)).not.toThrow()
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test('the drift guard throws naming the drifted registry package when a plain install re-resolves it', () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-drift-guard-mismatch-'))
  const committedPath = join(root, 'committed-lock.yaml')
  writeFileSync(committedPath, fakeLock(['@orpc/tanstack-query@1.14.7']))
  writeFileSync(join(root, 'pnpm-lock.yaml'), fakeLock(['@orpc/tanstack-query@1.15.0']))
  try {
    expect(() => assertLockNotDrifted(root, committedPath)).toThrow(
      /@orpc\/tanstack-query@1\.15\.0.*@orpc\/tanstack-query@1\.14\.7|@orpc\/tanstack-query@1\.14\.7.*@orpc\/tanstack-query@1\.15\.0/s,
    )
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
