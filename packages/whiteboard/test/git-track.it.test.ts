import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtempSync, rmSync, writeFileSync, realpathSync, appendFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {fileHash, headCommit, isCommittedClean, mapLineAcrossCommits} from '../src/anchor/git-track.js'

const run = promisify(execFile)
const git = (root: string, args: string[]): Promise<unknown> =>
  run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {cwd: root})

const ORIGINAL = 'a\nb\nc\nd\n<Bar id="x" />\nf\n'

const state: {root: string; first: string} = {root: '', first: ''}

beforeAll(async () => {
  state.root = realpathSync(mkdtempSync(join(tmpdir(), 'mx-git-')))
  await git(state.root, ['init', '-b', 'main'])
  writeFileSync(join(state.root, 'A.tsx'), ORIGINAL)
  await git(state.root, ['add', 'A.tsx'])
  await git(state.root, ['commit', '-m', 'first'])
  state.first = (await headCommit(state.root)) ?? ''
  writeFileSync(join(state.root, 'A.tsx'), `x1\nx2\nx3\n${ORIGINAL}`)
  await git(state.root, ['add', 'A.tsx'])
  await git(state.root, ['commit', '-m', 'prepend'])
}, 30_000)

afterAll(() => rmSync(state.root, {recursive: true, force: true}))

describe('git-track (it) — real temp repo', () => {
  it('headCommit returns the current SHA', async () => {
    const head = await headCommit(state.root)
    expect(head).toMatch(/^[0-9a-f]{40}$/)
    expect(head).not.toBe(state.first)
  })

  it('maps a line forward across an insertion above it', async () => {
    expect(await mapLineAcrossCommits({root: state.root, file: 'A.tsx', fromCommit: state.first, line: 5})).toBe(8)
  })

  it('hashes the working-tree file content', async () => {
    expect(await fileHash(state.root, 'A.tsx')).toMatch(/^[0-9a-f]{40}$/)
  })

  it('reports committed-clean, then dirty after an uncommitted edit', async () => {
    expect(await isCommittedClean(state.root, 'A.tsx')).toBe(true)
    appendFileSync(join(state.root, 'A.tsx'), 'uncommitted\n')
    expect(await isCommittedClean(state.root, 'A.tsx')).toBe(false)
  })
})
