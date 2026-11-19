import {Effect, Option} from 'effect'
import {isSecretPath, readSource, type SourceUnreadable} from './anchor-confine.js'
import {captureSource, hashAt, scanElements, type ElementFingerprint, type SourceAnchor} from './oxc-capture.js'
import {headCommit, isCommittedClean, mapLineAcrossCommits} from './git-track.js'

type Rect = {x: number; y: number; width: number; height: number}
type Anchor = {source: SourceAnchor; instance?: {selector?: string; rect?: Rect; instanceKey?: string}}
type ResolveStatus = 'fresh' | 'moved' | 'drifted' | 'orphaned' | 'ambiguous'
type ResolveResult = {
  status: ResolveStatus
  anchor?: Anchor
  candidates?: Anchor[]
  diff?: {before: string; after: string}
}
type PickedTarget = {file: string; line: number; column: number}
export type AnchorResolver = {
  capture(target: PickedTarget): Effect.Effect<Anchor, SourceUnreadable>
  resolve(anchor: Anchor): Effect.Effect<ResolveResult>
  locate(file: string, component: string): Effect.Effect<PickedTarget | null>
}

const isPlaced = (anchor: Anchor): boolean => anchor.instance?.selector !== undefined

export function createReactAnchorResolver(opts: {root: string}): AnchorResolver {
  const {root} = opts

  const relocated = (src: SourceAnchor, fp: ElementFingerprint, instance: Anchor['instance']): Anchor => ({
    source: {
      ...src,
      line: fp.line,
      column: fp.column,
      hash: fp.hash,
      salt: fp.salt,
      snippet: isSecretPath(src.file) ? '' : fp.snippet,
    },
    instance,
  })

  const capture = Effect.fn('whiteboard.anchor.capture')(function* (target: PickedTarget) {
    const source = yield* captureSource({
      root,
      file: target.file,
      line: target.line,
      column: target.column,
      commit: yield* headCommit(root),
    })
    return {source}
  })

  const resolve = Effect.fn('whiteboard.anchor.resolve')(function* (anchor: Anchor) {
    const src = anchor.source
    const read = yield* Effect.option(readSource(root, src.file))
    if (Option.isNone(read)) return {status: 'orphaned'} satisfies ResolveResult
    const source = read.value

    if (hashAt(source, src.line, src.column).hash === src.hash) return {status: 'fresh', anchor} satisfies ResolveResult

    const matches = scanElements(source).filter((element) => element.hash === src.hash)
    const [first, second] = matches
    if (first && !second)
      return {status: 'moved', anchor: relocated(src, first, anchor.instance)} satisfies ResolveResult
    if (first && second) {
      const sameSalt = matches.filter((m) => m.salt === src.salt)
      const [s0, s1] = sameSalt
      if (s0 && !s1) return {status: 'moved', anchor: relocated(src, s0, anchor.instance)} satisfies ResolveResult
      const pool = sameSalt.length > 0 ? sameSalt : matches
      return {
        status: 'ambiguous',
        candidates: pool.map((m) => relocated(src, m, anchor.instance)),
      } satisfies ResolveResult
    }

    if (src.commit && (yield* isCommittedClean(root, src.file))) {
      const mapped = yield* mapLineAcrossCommits({root, file: src.file, fromCommit: src.commit, line: src.line})
      if (Option.isSome(mapped)) {
        const line = mapped.value
        const at = hashAt(source, line, src.column)
        if (at.hash === src.hash)
          return {
            status: 'moved',
            anchor: {
              source: {...src, line, hash: at.hash, salt: at.salt, snippet: isSecretPath(src.file) ? '' : at.snippet},
              instance: anchor.instance,
            },
          } satisfies ResolveResult
      }
    }

    return {
      status: isPlaced(anchor) ? 'drifted' : 'orphaned',
      diff: {before: src.snippet, after: hashAt(source, src.line, src.column).snippet},
    } satisfies ResolveResult
  })

  const locate = Effect.fn('whiteboard.anchor.locate')(function* (file: string, component: string) {
    const read = yield* Effect.option(readSource(root, file))
    if (Option.isNone(read)) return null
    const elements = scanElements(read.value)
    const hit = elements.find((e) => e.component === component) ?? elements.find((e) => e.tag === component)
    return hit ? {file, line: hit.line, column: hit.column} : null
  })

  return {capture, resolve, locate}
}
