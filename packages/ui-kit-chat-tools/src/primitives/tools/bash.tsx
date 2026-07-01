import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat'

// Headless bash/shell logic + structure (ported from with-opencode tool-ui-bash). Parses the command
// args + the {stdout,stderr,exitCode} result; the styled layer (styled/tools/bash-card) adds tokens.

export type BashOutput = {stdout?: string; stderr?: string; exitCode?: number}

function argString(part: ToolCallPart, key: string): string {
  try {
    const value = JSON.parse(part.arguments || '{}')[key]
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

export function parseBashOutput(result: ToolResultPart | undefined): BashOutput {
  if (!result) return {}
  const content = result.content
  if (typeof content !== 'string') return {stdout: JSON.stringify(content, null, 2)}
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object') return parsed as BashOutput
  } catch {
    // plain text output
  }
  return {stdout: content}
}

function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

type BashContextValue = {
  command: Accessor<string>
  summary: Accessor<string>
  output: Accessor<BashOutput>
  status: Accessor<ToolStatus>
  isError: Accessor<boolean>
  hasOutput: Accessor<boolean>
}

const BashContext = createContext<BashContextValue>()

export function useBash(): BashContextValue {
  const context = useContext(BashContext)
  if (!context) throw new Error('Bash sub-components must be used within Bash.Root')
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const status = createMemo(() => toolStatus(props.part, props.result))
  const running = () => status() === 'running'
  const output = createMemo<BashOutput>(() => (running() ? {} : parseBashOutput(props.result)))
  const command = () => argString(props.part, 'command')
  const summary = () => argString(props.part, 'description') || truncate(command())
  const isError = () => !running() && ((output().exitCode ?? 0) !== 0 || status() === 'error')
  const hasOutput = () => Boolean(output().stdout || output().stderr)
  return (
    <BashContext.Provider value={{command, summary, output, status, isError, hasOutput}}>
      {props.children}
    </BashContext.Provider>
  )
}

export const Bash = Object.assign(Root, {Root})
