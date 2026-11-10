import type {LiveComponent} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'

export function readStamps(input: {el: Element; above: string | null}): Stamps {
  const {el, above} = input
  const source = readSource(el)
  const below = el.getAttribute(SITE_ATTR) ?? above
  const site = source === null ? below : null
  return {source, site: site ?? undefined, below}
}

type Stamps = {source: SourceLoc | null; site: string | undefined; below: string | null}

type SourceLoc = NonNullable<LiveComponent['source']>

const SOURCE_ATTR = designConfig.attributes.source
const SITE_ATTR = designConfig.attributes.site
const SOURCE_SEPARATOR = ':'

function readSource(el: Element): SourceLoc | null {
  const raw = el.getAttribute(SOURCE_ATTR)
  if (!raw) return null
  const parts = raw.split(SOURCE_SEPARATOR)
  const column = Number(parts.pop())
  const line = Number(parts.pop())
  const file = parts.join(SOURCE_SEPARATOR)
  if (!file || !Number.isFinite(line) || !Number.isFinite(column)) return null
  return {file, line, column}
}
