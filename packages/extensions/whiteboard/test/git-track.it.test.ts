import {execFile} from 'node:child_process'
import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {describe, expect, it} from 'vitest'
import {fileHash, headCommit, isCommittedClean, mapLineAcrossCommits} from '../src/anchor/git-track.js'

const run = promisify(execFile)
const git = (root: string, args: string[]) => run('git', args, {cwd: root})

async function initRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'git-track-'))
  await git(root, ['init', '-q'])
  await git(root, ['config', 'user.email', 'test@test.test'])
  await git(root, ['config', 'user.name', 'Test'])
  await git(root, ['config', 'commit.gpgsign', 'false'])
  return root
}

async function commit(root: string, file: string, content: string, message: string): Promise<string> {
  await writeFile(join(root, file), content)
  await git(root, ['add', file])
  await git(root, ['commit', '-q', '-m', message])
  const head = await headCommit(root)
  if (!head) throw new Error('commit produced no HEAD')
  return head
}

describe('headCommit / fileHash / isCommittedClean', () => {
  it('reports HEAD, a blob hash, and clean→dirty as the file changes', async () => {
    const root = await initRepo()
    await commit(root, 'a.ts', 'one\ntwo\nthree\n', 'init')
    expect(await headCommit(root)).toMatch(/^[0-9a-f]{40}$/)
    expect(await fileHash(root, 'a.ts')).toMatch(/^[0-9a-f]{40}$/)
    expect(await isCommittedClean(root, 'a.ts')).toBe(true)
    await writeFile(join(root, 'a.ts'), 'one\ntwo\nCHANGED\n')
    expect(await isCommittedClean(root, 'a.ts')).toBe(false)
  })

  it('returns null for a directory that is not a git repo', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'not-git-'))
    expect(await headCommit(bare)).toBe(null)
  })
})

describe('mapLineAcrossCommits', () => {
  it('shifts a line down by the count of lines inserted above it', async () => {
    const root = await initRepo()
    const from = await commit(root, 'f.ts', 'L1\nL2\nL3\nTARGET\nL5\n', 'c1')
    await commit(root, 'f.ts', 'NEW1\nNEW2\nL1\nL2\nL3\nTARGET\nL5\n', 'c2')
    expect(await mapLineAcrossCommits({root, file: 'f.ts', fromCommit: from, line: 4})).toBe(6)
  })

  it('returns null when the target line itself was edited (hunk straddles it)', async () => {
    const root = await initRepo()
    const from = await commit(root, 'f.ts', 'L1\nL2\nL3\nTARGET\nL5\n', 'c1')
    await commit(root, 'f.ts', 'L1\nL2\nL3\nTARGET-EDITED\nL5\n', 'c2')
    expect(await mapLineAcrossCommits({root, file: 'f.ts', fromCommit: from, line: 4})).toBe(null)
  })
})
