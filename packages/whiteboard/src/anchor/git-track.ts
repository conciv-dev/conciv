import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const run = promisify(execFile)

// Shell-free git: execFile (no shell), and every path arg goes after `--` as a single argv element so
// a crafted file name can never become a flag.
const git = async (root: string, args: string[]): Promise<string> => {
  const {stdout} = await run('git', args, {cwd: root, maxBuffer: 16 * 1024 * 1024})
  return stdout
}

export async function headCommit(root: string): Promise<string | null> {
  try {
    return (await git(root, ['rev-parse', 'HEAD'])).trim()
  } catch {
    return null
  }
}

export async function fileHash(root: string, file: string): Promise<string> {
  return (await git(root, ['hash-object', '--', file])).trim()
}

export async function isCommittedClean(root: string, file: string): Promise<boolean> {
  try {
    await git(root, ['diff', '--quiet', 'HEAD', '--', file])
    return true
  } catch {
    return false
  }
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/

// Map a 1-based line from `fromCommit` to its position at HEAD, commit-granular. Sums the line delta of
// every hunk that lies entirely above the target; returns null if a hunk straddles the line (the line
// itself was edited/removed, so it can't be cleanly relocated) or git can't diff the range.
export async function mapLineAcrossCommits(opts: {
  root: string
  file: string
  fromCommit: string
  line: number
}): Promise<number | null> {
  const diff = await git(opts.root, ['diff', '-U0', opts.fromCommit, 'HEAD', '--', opts.file]).catch(() => null)
  if (diff === null) return null
  let delta = 0
  for (const text of diff.split('\n')) {
    const match = HUNK.exec(text)
    if (!match) continue
    const oldStart = Number(match[1])
    const oldCount = match[2] === undefined ? 1 : Number(match[2])
    const newCount = match[3] === undefined ? 1 : Number(match[3])
    const oldLast = oldStart + oldCount - 1
    if (oldLast < opts.line) delta += newCount - oldCount
    else if (oldStart <= opts.line) return null
  }
  return opts.line + delta
}
