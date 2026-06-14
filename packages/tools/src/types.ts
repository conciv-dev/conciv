import {z} from 'zod'
import type {PageQuery} from '@aidx/protocol/page-types'
import type {UiSpec} from '@aidx/protocol/ui-types'

// The runtime bridge each aidx tool's handler closes over. Pure handles to the live buses/runner;
// no transport or CLI knowledge. The MCP server (and tests) supply a concrete context.
export type AidxToolContext = {
  injectUi: (spec: UiSpec) => boolean
  // The page-bus ask shape: a query without the bus-assigned requestId.
  page: (query: Omit<PageQuery, 'requestId'>) => Promise<unknown>
  test: (action: {kind: 'list' | 'run' | 'status'; pattern?: string}) => Promise<unknown>
}

// Uniform, MCP-facing view of an aidx tool. The per-tool ServerTool types are erased here so the
// MCP server can iterate a homogeneous list: it registers `inputSchema` (a ZodObject the SDK
// validates against) and invokes `run` with the validated args.
export type AidxMcpTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  run: (args: Record<string, unknown>) => Promise<unknown>
}
