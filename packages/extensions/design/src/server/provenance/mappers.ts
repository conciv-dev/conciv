import type {Provenance, ProvenanceMapper} from '../../shared/types.js'
import {classNameMapper} from './classname.js'
import {cssMapper} from './css.js'
import {emotionMapper} from './emotion.js'
import {UNKNOWN} from './jsx.js'
import {libraryMapper} from './library.js'
import {styleMapper} from './style.js'
import {styledMapper} from './styled.js'

export const MAPPERS: ProvenanceMapper[] = [
  styleMapper,
  libraryMapper,
  classNameMapper,
  cssMapper,
  emotionMapper,
  styledMapper,
]

export async function mapDeclaration(input: Parameters<ProvenanceMapper['map']>[0]): Promise<Provenance> {
  for (const mapper of MAPPERS) {
    if (!mapper.applies(input)) continue
    const provenance = await mapper.map(input)
    if (provenance.via !== 'unknown') return provenance
  }
  return UNKNOWN
}
