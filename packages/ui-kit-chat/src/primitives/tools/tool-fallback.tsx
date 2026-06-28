import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from './tool-status.js'

// Headless generic-tool logic: status + args/result serialization. The styled ToolFallback renders
// this through the shared Pierre code block. parseInput reads part.arguments — tanstack never sets
// the public part.input ([[tanstack-part-input-empty]]).

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

type ToolFallbackContextValue = {
  name: Accessor<string>
  status: Accessor<ToolStatus>
  argsText: Accessor<string>
  resultText: Accessor<string>
  // A string result is plain text; anything else was JSON-stringified — drives shiki's language.
  resultName: Accessor<string>
}

const ToolFallbackContext = createContext<ToolFallbackContextValue>()

export function useToolFallback(): ToolFallbackContextValue {
  const context = useContext(ToolFallbackContext)
  if (!context) throw new Error('ToolFallback sub-components must be used within ToolFallback.Root')
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const status = createMemo(() => toolStatus(props.part, props.result))
  return (
    <ToolFallbackContext.Provider
      value={{
        name: () => props.part.name,
        status,
        argsText: createMemo(() => argsText(props.part)),
        resultText: createMemo(() => resultText(props.result)),
        resultName: () => (typeof props.result?.content === 'string' ? 'result.txt' : 'result.json'),
      }}
    >
      {props.children}
    </ToolFallbackContext.Provider>
  )
}

export const ToolFallback = Object.assign(Root, {Root})
