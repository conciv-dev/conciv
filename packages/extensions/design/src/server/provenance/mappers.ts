import {toolError} from '@conciv/extension'
import type {ProvenanceMapper, Provenance} from '../../shared/types.js'

export function mapDeclaration(_input: Parameters<ProvenanceMapper['map']>[0]): Promise<Provenance> {
  return Promise.reject(toolError('not-implemented'))
}
