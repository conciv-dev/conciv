import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import {assertLockNotDrifted, closureOf, workspacePackages, type PackageInfo} from '@conciv/vitest-config/pack'

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

type LockEntry = [key: string, resolution: string]

function fakeLock(entries: LockEntry[]): string {
  return [
    'lockfileVersion: 9.0',
    '',
    'importers:',
    '  .: {}',
    '',
    'packages:',
    ...entries.flatMap(([key, resolution]) => [
      `  '${key}':`,
      `    resolution: {${resolution}}`,
      '    peerDependenciesMeta:',
      '      ajv:',
      '        optional: true',
      '',
    ]),
    'snapshots:',
    ...entries.map(([key]) => `  '${key}': {}`),
    '',
  ].join('\n')
}

function driftError(committed: LockEntry[], produced: LockEntry[]): string {
  const root = mkdtempSync(join(tmpdir(), 'conciv-drift-guard-'))
  const committedPath = join(root, 'committed-lock.yaml')
  writeFileSync(committedPath, fakeLock(committed))
  writeFileSync(join(root, 'pnpm-lock.yaml'), fakeLock(produced))
  try {
    assertLockNotDrifted(root, committedPath)
    return ''
  } catch (error) {
    return String(error)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
}

const ORPC: LockEntry = ['@orpc/tanstack-query@1.14.7', 'integrity: sha512-orpc']
const IS_ODD: LockEntry = ['is-odd@3.0.1', 'integrity: sha512-odd']

function packedConciv(dir: string): LockEntry {
  return [`@conciv/it@file:${dir}/conciv-it.tgz`, `integrity: sha512-${dir}, tarball: file:${dir}/conciv-it.tgz`]
}

test('the drift guard passes when only the packed @conciv file: tarballs differ', () => {
  expect(driftError([ORPC, IS_ODD, packedConciv('/tmp/a')], [ORPC, IS_ODD, packedConciv('/tmp/b')])).toBe('')
})

test('the drift guard names a packed @conciv package the committed lockfile does not have', () => {
  const error = driftError([ORPC, IS_ODD], [ORPC, IS_ODD, packedConciv('/tmp/b')])
  expect(error).toContain('packed fixture install resolved different packages than the committed lockfile')
  expect(error).toContain('\n+ @conciv/it (packed)\n')
  expect(error).not.toContain('@orpc/tanstack-query')
  expect(error).not.toContain('is-odd')
})

test('the drift guard names an added, a removed and a re-integrity registry package', () => {
  const error = driftError(
    [ORPC, IS_ODD],
    [
      ['@orpc/tanstack-query@1.15.0', 'integrity: sha512-orpc-next'],
      ['is-odd@3.0.1', 'integrity: sha512-tampered'],
    ],
  )
  expect(error).toContain('+ @orpc/tanstack-query@1.15.0')
  expect(error).toContain('- @orpc/tanstack-query@1.14.7')
  expect(error).toContain('~ is-odd@3.0.1 (integrity changed)')
  expect(error).toContain('gh run download <run-id> -n packed-fixture-locks -D e2e')
})

test('the drift guard rejects a remote tarball or git resolution outside the packed @conciv entries', () => {
  const remote: LockEntry = ['evil@1.0.0', 'integrity: sha512-evil, tarball: https://example.com/evil.tgz']
  const git: LockEntry = ['forked@1.0.0', 'commit: abc123, repo: https://github.com/x/forked, type: git']
  const unscopedFile: LockEntry = ['conciv@file:/tmp/a/conciv.tgz', 'integrity: sha512-c, tarball: https://x/c.tgz']
  const error = driftError([ORPC], [ORPC, remote, git, unscopedFile])
  expect(error).toContain('outside the npm registry')
  expect(error).toContain('evil@1.0.0')
  expect(error).toContain('forked@1.0.0')
  expect(error).toContain('conciv@file:/tmp/a/conciv.tgz')
})
