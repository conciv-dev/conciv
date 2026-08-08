import {execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {computeAffected} from '../src/ci-shards.ts'

function git(root: string, args: string[]): void {
  execFileSync('git', args, {cwd: root})
}

function initRepo(root: string): void {
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'test'])
}

let originalEventName: string | undefined

beforeEach(() => {
  originalEventName = process.env.GITHUB_EVENT_NAME
})

afterEach(() => {
  if (originalEventName === undefined) delete process.env.GITHUB_EVENT_NAME
  else process.env.GITHUB_EVENT_NAME = originalEventName
})

test('computeAffected leaves the full set alone outside pull_request events (rail 1)', () => {
  delete process.env.GITHUB_EVENT_NAME
  const result = computeAffected(mkdtempSync(join(tmpdir(), 'ci-shards-')))
  expect(result.affected).toBeNull()
  expect(result.baseSha).toBeNull()
  expect(result.rail).toMatch(/^rail-1-not-a-pull-request/)
})

test('computeAffected also falls back to the full set on a push event', () => {
  process.env.GITHUB_EVENT_NAME = 'push'
  const result = computeAffected(mkdtempSync(join(tmpdir(), 'ci-shards-')))
  expect(result.affected).toBeNull()
  expect(result.rail).toMatch(/^rail-1-not-a-pull-request/)
})

test('computeAffected fails open when there is no origin/main to diff against (rail 2)', () => {
  process.env.GITHUB_EVENT_NAME = 'pull_request'
  const root = mkdtempSync(join(tmpdir(), 'ci-shards-'))
  initRepo(root)
  writeFileSync(join(root, 'a.txt'), 'x')
  git(root, ['add', 'a.txt'])
  git(root, ['commit', '-q', '-m', 'first'])
  const result = computeAffected(root)
  expect(result.affected).toBeNull()
  expect(result.baseSha).toBeNull()
  expect(result.rail).toMatch(/^rail-2-fail-open/)
})

test('computeAffected falls back to the full set when the diff touches a global-dependency file (rail 3)', () => {
  process.env.GITHUB_EVENT_NAME = 'pull_request'
  const root = mkdtempSync(join(tmpdir(), 'ci-shards-'))
  initRepo(root)
  writeFileSync(join(root, 'turbo.json'), JSON.stringify({globalDependencies: []}))
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'base'])
  git(root, ['branch', 'origin/main'])
  writeFileSync(join(root, 'turbo.json'), JSON.stringify({globalDependencies: ['other.json']}))
  git(root, ['commit', '-q', '-am', 'touch turbo.json'])
  const result = computeAffected(root)
  expect(result.affected).toBeNull()
  expect(result.baseSha).not.toBeNull()
  expect(result.rail).toContain('rail-3-global-file-changed(turbo.json)')
})

test('computeAffected fails open when turbo itself is unreachable from the sandbox (rail 2)', () => {
  process.env.GITHUB_EVENT_NAME = 'pull_request'
  const root = mkdtempSync(join(tmpdir(), 'ci-shards-'))
  initRepo(root)
  writeFileSync(join(root, 'turbo.json'), JSON.stringify({globalDependencies: []}))
  writeFileSync(join(root, 'package.json'), JSON.stringify({devDependencies: {turbo: '^2.10.3'}}))
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'base'])
  git(root, ['branch', 'origin/main'])
  writeFileSync(join(root, 'readme.txt'), 'docs only')
  git(root, ['add', 'readme.txt'])
  git(root, ['commit', '-q', '-m', 'docs'])
  const result = computeAffected(root, {pnpmBin: '/nonexistent/pnpm-does-not-exist'})
  expect(result.affected).toBeNull()
  expect(result.rail).toMatch(/^rail-2-fail-open/)
})
