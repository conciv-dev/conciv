import {expect, test} from '@playwright/test'
import {closureOf, workspacePackages, type PackageInfo} from '../packed/harness.js'

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
