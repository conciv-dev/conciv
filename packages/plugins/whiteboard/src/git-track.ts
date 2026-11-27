import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {Effect, Option} from 'effect'
import {sourceErrors} from './errors/source-errors.js'
import {causeFrom} from './errors/cause.js'

const run = promisify(execFile)

const git = (root: string, args: string[]) =>
  Effect.tryPromise({
    try: () => run('git', args, {cwd: root, maxBuffer: 16 * 1024 * 1024}),
    catch: (error) => sourceErrors.GIT_FAILED({command: args[0] ?? '', ...causeFrom(error)}),
  }).pipe(Effect.map(({stdout}) => stdout))

export const headCommit = (root: string) =>
  git(root, ['rev-parse', 'HEAD']).pipe(
    Effect.map((stdout): string | null => stdout.trim()),
    Effect.orElseSucceed(() => null),
  )

export const isCommittedClean = (root: string, file: string) =>
  git(root, ['diff', '--quiet', 'HEAD', '--', file]).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
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
    Effect.orElseSucceed(() => Option.none<number>()),
  )
