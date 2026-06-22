import {readFile} from 'node:fs/promises'
import {confineToRoot, isSecretPath} from './confine.js'
import {captureSource, hashAt, scanElements, type ElementFingerprint, type SourceAnchor} from './oxc-capture.js'
import {headCommit, isCommittedClean, mapLineAcrossCommits} from './git-track.js'

export type Rect = {x: number; y: number; width: number; height: number}
export type Anchor = {source: SourceAnchor; instance?: {selector?: string; rect?: Rect; instanceKey?: string}}
export type ResolveStatus = 'fresh' | 'moved' | 'drifted' | 'orphaned' | 'ambiguous'
export type ResolveResult = {
  status: ResolveStatus
  anchor?: Anchor
  dom?: {selector: string; rect?: Rect; instanceKey?: string}
  candidates?: Anchor[]
  diff?: {before: string; after: string}
}
export type PickedTarget = {file: string; line: number; column: number; rect?: Rect; selector?: string}
export type AnchorResolver = {
  capture(target: PickedTarget): Promise<Anchor>
  resolve(anchor: Anchor): Promise<ResolveResult>
  reanchor(anchor: Anchor, target: PickedTarget): Promise<Anchor>
}

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

  const domOf = (anchor: Anchor): ResolveResult['dom'] =>
    anchor.instance?.selector
      ? {selector: anchor.instance.selector, rect: anchor.instance.rect, instanceKey: anchor.instance.instanceKey}
      : undefined

  const capture: AnchorResolver['capture'] = async (target) => {
    const source = await captureSource({
      root,
      file: target.file,
      line: target.line,
      column: target.column,
      commit: await headCommit(root),
    })
    const instance =
      target.selector !== undefined || target.rect !== undefined
        ? {selector: target.selector, rect: target.rect}
        : undefined
    return {source, instance}
  }

  const resolve: AnchorResolver['resolve'] = async (anchor) => {
    const src = anchor.source
    const dom = domOf(anchor)
    const abs = await confineToRoot(root, src.file).catch(() => null)
    if (abs === null) return {status: 'orphaned', dom}
    const source = await readFile(abs, 'utf8').catch(() => null)
    if (source === null) return {status: 'orphaned', dom}

    if (hashAt(source, src.line, src.column).hash === src.hash) return {status: 'fresh', anchor, dom}

    const matches = scanElements(source).filter((element) => element.hash === src.hash)
    const [first, second] = matches
    if (first && !second) return {status: 'moved', anchor: relocated(src, first, anchor.instance), dom}
    if (first && second) {
      const sameSalt = matches.filter((m) => m.salt === src.salt)
      const [s0, s1] = sameSalt
      if (s0 && !s1) return {status: 'moved', anchor: relocated(src, s0, anchor.instance), dom}
      const pool = sameSalt.length > 0 ? sameSalt : matches
      return {status: 'ambiguous', candidates: pool.map((m) => relocated(src, m, anchor.instance)), dom}
    }

    if (src.commit && (await isCommittedClean(root, src.file))) {
      const line = await mapLineAcrossCommits({root, file: src.file, fromCommit: src.commit, line: src.line})
      if (line !== null) {
        const at = hashAt(source, line, src.column)
        if (at.hash === src.hash)
          return {
            status: 'moved',
            anchor: {
              source: {...src, line, hash: at.hash, salt: at.salt, snippet: isSecretPath(src.file) ? '' : at.snippet},
              instance: anchor.instance,
            },
            dom,
          }
      }
    }

    return {
      status: dom ? 'drifted' : 'orphaned',
      dom,
      diff: {before: src.snippet, after: hashAt(source, src.line, src.column).snippet},
    }
  }

  const reanchor: AnchorResolver['reanchor'] = async (anchor, target) => {
    const next = await capture(target)
    return {source: next.source, instance: next.instance ?? anchor.instance}
  }

  return {capture, resolve, reanchor}
}
