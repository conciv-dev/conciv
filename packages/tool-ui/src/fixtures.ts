import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from './types.js'

// Builders for fixture tool-call / tool-result parts used by stories and tests. Defaults model a
// finished call (settled at 'input-complete' with a populated output, per the tanstack state model).
export function callPart(over: Partial<ToolCallPart> = {}): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'Bash', arguments: '{}', state: 'input-complete', ...over}
}

export function resultPart(content: string, over: Partial<ToolResultPart> = {}): ToolResultPart {
  return {type: 'tool-result', toolCallId: 't1', content, state: 'complete', ...over}
}

// A page/MCP tool result as it reaches a card AFTER the harness unwraps the MCP content envelope at
// decode: content is the payload JSON as a single-encoded string (e.g. '{"nodes":[...]}'). The
// envelope-unwrap itself is verified in the harness decode test, not faked here.
export function payloadResultPart(payload: unknown, over: Partial<ToolResultPart> = {}): ToolResultPart {
  return resultPart(JSON.stringify(payload), over)
}

// A no-op host context for stories that don't exercise actions; spies override sendMessage.
export function noopCtx(over: Partial<ToolViewCtx> = {}): ToolViewCtx {
  return {apiBase: '', harnessId: 'claude', sendMessage: () => {}, ...over}
}
