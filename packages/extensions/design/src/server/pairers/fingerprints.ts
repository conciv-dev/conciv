import type {Match} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'

export const fingerprints = {of: fingerprint, same: samePrint, records: carriedRecords}

type Live = NonNullable<Match['live']>

type Fingerprint = Pick<Live, 'source' | 'key' | 'instance' | 'owner' | 'tag' | 'box'> & {text: string}

type Carried = {path: string; fingerprint: Fingerprint; confidence: number}

function fingerprint(live: Live): Fingerprint {
  const {source, key, instance, owner, tag, box: at} = live
  const text = live.glyphs
    .map((glyph) => glyph.text)
    .join(' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .join(' ')
  return {source, key, instance, owner, tag, box: at, text}
}

function carriedRecords(previous: Match | null): Map<string, Carried> {
  if (previous === null) return new Map()
  return new Map(
    [...walk(previous)].flatMap(({node: match, depth}): [string, Carried][] =>
      depth === 0 || match.live === null
        ? []
        : [
            [
              match.node.id,
              {path: match.live.path, fingerprint: fingerprint(match.live), confidence: match.confidence},
            ],
          ],
    ),
  )
}

function samePrint(input: {a: Fingerprint; b: Fingerprint}): boolean {
  const {a, b} = input
  if (a.key !== null && b.key !== null) return a.key === b.key && a.instance === b.instance
  const edges = [a.box.x - b.box.x, a.box.y - b.box.y, a.box.w - b.box.w, a.box.h - b.box.h]
  return (
    a.tag === b.tag &&
    a.text === b.text &&
    locationKey(a.source) === locationKey(b.source) &&
    edges.every((edge) => Math.abs(edge) <= designConfig.tolerances.tileMargin)
  )
}

function locationKey(source: Fingerprint['source']): string {
  return source === null ? '' : `${source.file}:${source.line}:${source.column}`
}
