import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {Effect, Option, Schema} from 'effect'

const run = promisify(execFile)

const GitFailed = Schema.TaggedStruct('GitFailed', {message: Schema.String})
type GitFailed = typeof GitFailed.Type

const git = (root: string, args: string[]) =>
  Effect.tryPromise({
    try: () => run('git', args, {cwd: root, maxBuffer: 16 * 1024 * 1024}),
    catch: (error) => GitFailed.make({message: error instanceof Error ? error.message : String(error)}),
  }).pipe(Effect.map(({stdout}) => stdout))

export const headCommit = (root: string) =>
  git(root, ['rev-parse', 'HEAD']).pipe(
    Effect.map((stdout): string | null => stdout.trim()),
    Effect.catchTag('GitFailed', () => Effect.succeed(null)),
  )

export const isCommittedClean = (root: string, file: string) =>
  git(root, ['diff', '--quiet', 'HEAD', '--', file]).pipe(
    Effect.as(true),
    Effect.catchTag('GitFailed', () => Effect.succeed(false)),
  )

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/

type Shift = {delta: number; lost: boolean}

const shiftLine =
  (line: number) =>
  (shift: Shift, text: string): Shift => {
    const match = HUNK.exec(text)
    if (shift.lost || !match) return shift
    const oldStart = Number(match[1])
    const oldCount = match[2] === undefined ? 1 : Number(match[2])
    const newCount = match[3] === undefined ? 1 : Number(match[3])
    if (oldStart + oldCount - 1 < line) return {delta: shift.delta + newCount - oldCount, lost: false}
    if (oldStart <= line) return {delta: shift.delta, lost: true}
    return shift
  }

export const mapLineAcrossCommits = (opts: {root: string; file: string; fromCommit: string; line: number}) =>
  git(opts.root, ['diff', '-U0', opts.fromCommit, 'HEAD', '--', opts.file]).pipe(
    Effect.map((diff) => {
      const shift = diff.split('\n').reduce(shiftLine(opts.line), {delta: 0, lost: false})
      return shift.lost ? Option.none<number>() : Option.some(opts.line + shift.delta)
    }),
    Effect.catchTag('GitFailed', () => Effect.succeed(Option.none<number>())),
  )
