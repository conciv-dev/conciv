import {z} from 'zod'
import type {PageQuery} from '@conciv/protocol/page-types'
import type {UiSpec} from '@conciv/protocol/ui-types'

// The runtime bridge each conciv tool's handler closes over. Pure handles to the live buses/runner;
// no transport or CLI knowledge. The MCP server (and tests) supply a concrete context. Maps cleanly
// to tanstack's client-tool ctx.context for the future page agent.
export type ConcivToolContext = {
  injectUi: (spec: UiSpec) => boolean
  // The page-bus ask shape: a query without the bus-assigned requestId.
  page: (query: Omit<PageQuery, 'requestId'>) => Promise<unknown>
  // Open a source file (optionally at a line) in the user's editor — the follow-up to locate/inspect.
  open: (file: string, line?: number) => void
}

// A bound conciv tool the MCP server iterates: the tool name/description, its zod inputSchema (the SDK
// registers `.shape` and validates against it), and an `execute` that validates args once at the
// boundary before running the tanstack server tool. The per-tool ServerTool generics are erased to
// this uniform shape so the MCP server registers a homogeneous list — without any cast (execute
// re-parses with the concrete schema, so its input is typed inside the factory).
export type ConcivServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}
