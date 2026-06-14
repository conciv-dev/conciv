import type {PageQuery} from '@aidx/protocol/page-types'
import type {UiSpec} from '@aidx/protocol/ui-types'

// The runtime bridge each aidx tool's handler closes over. Pure handles to the live buses/runner;
// no transport or CLI knowledge. The MCP server (and tests) supply a concrete context.
export type AidxToolContext = {
  injectUi: (spec: UiSpec) => boolean
  page: (query: PageQuery) => Promise<unknown>
  test: (action: {kind: 'list' | 'run' | 'status'; pattern?: string}) => Promise<unknown>
}
