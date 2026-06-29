import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import {toolStatus, type ToolStatus} from './tool-status.js'

// Headless generic-tool logic for the faithful ToolFallback compound (assistant-ui parity). Owns
// status + args/result/error serialization; the styled sub-parts (Trigger/Args/Result/Error/Approval)
// read this context. Reads part.arguments — tanstack never sets the public part.input
// ([[tanstack-part-input-empty]]).

function argsText(part: ToolCallPart): string {
  try {
    return JSON.stringify(JSON.parse(part.arguments || '{}'), null, 2)
  } catch {
    return part.arguments || ''
  }
}

function resultText(result: ToolResultPart | undefined): string {
  if (!result) return ''
  if (typeof result.content === 'string') return result.content
  return JSON.stringify(result.content, null, 2)
}

// The error message for a failed call (assistant-ui's status.error), or undefined.
function errorText(result: ToolResultPart | undefined): string | undefined {
  if (result?.state !== 'error') return undefined
  if (result.error) return typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
  return resultText(result) || undefined
}

type ToolFallbackContextValue = {
  part: Accessor<ToolCallPart>
  result: Accessor<ToolResultPart | undefined>
  ctx: Accessor<ToolViewCtx>
  durationMs: Accessor<number | undefined>
  name: Accessor<string>
  status: Accessor<ToolStatus>
  argsText: Accessor<string>
  resultText: Accessor<string>
  // A string result is plain text; anything else was JSON-stringified — drives shiki's language.
  resultName: Accessor<string>
  error: Accessor<string | undefined>
}

const ToolFallbackContext = createContext<ToolFallbackContextValue>()

export function useToolFallback(): ToolFallbackContextValue {
  const context = useContext(ToolFallbackContext)
  if (!context) throw new Error('ToolFallback sub-components must be used within ToolFallback.Root')
  return context
}

function Root(props: {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
  durationMs?: number
  children: JSX.Element
}): JSX.Element {
  const status = createMemo(() => toolStatus(props.part, props.result))
  return (
    <ToolFallbackContext.Provider
      value={{
        part: () => props.part,
        result: () => props.result,
        ctx: () => props.ctx,
        durationMs: () => props.durationMs,
        name: () => props.part.name,
        status,
        argsText: createMemo(() => argsText(props.part)),
        resultText: createMemo(() => resultText(props.result)),
        resultName: () => (typeof props.result?.content === 'string' ? 'result.txt' : 'result.json'),
        error: createMemo(() => errorText(props.result)),
      }}
    >
      {props.children}
    </ToolFallbackContext.Provider>
  )
}

export const ToolFallback = Object.assign(Root, {Root})
