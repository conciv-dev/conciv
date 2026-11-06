import type {Match} from '../../shared/defs.js'

export const fingerprints = {of: fingerprint}

type Live = NonNullable<Match['live']>

type Fingerprint = Pick<Live, 'source' | 'key' | 'instance' | 'owner' | 'tag' | 'box'> & {text: string}

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
