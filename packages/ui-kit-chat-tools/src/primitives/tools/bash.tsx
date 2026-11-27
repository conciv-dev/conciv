import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@conciv/types/chat-message-types'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat/tools'
import {parseBashOutput, type BashOutput} from './bash-output.js'
import {chatToolsErrors} from './errors.js'

function argString(part: ToolCallPart, key: string): string {
  try {
    const value = JSON.parse(part.arguments || '{}')[key]
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
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
  outcome: Accessor<ToolResultPart['outcome']>
  stoppedReason: Accessor<string>
}

const BashContext = createContext<BashContextValue>()

export function useBash(): BashContextValue {
  const context = useContext(BashContext)
  if (!context) throw chatToolsErrors.OUTSIDE_ROOT({tool: 'Bash'})
  return context
}

function Root(props: {part: ToolCallPart; result: ToolResultPart | undefined; children: JSX.Element}): JSX.Element {
  const status = createMemo(() => toolStatus(props.part, props.result))
  const running = () => status() === 'running'
  const output = createMemo<BashOutput>(() => (running() ? {} : parseBashOutput(props.result)))
  const command = () => argString(props.part, 'command')
  const summary = () => argString(props.part, 'description') || truncate(command())
  const outcome = () => props.result?.outcome
  const stoppedReason = () => props.result?.error ?? ''
  const isError = () => !running() && ((output().exitCode ?? 0) !== 0 || status() === 'error')
  const hasOutput = () => Boolean(output().stdout || output().stderr)
  return (
    <BashContext.Provider value={{command, summary, output, status, isError, hasOutput, outcome, stoppedReason}}>
      {props.children}
    </BashContext.Provider>
  )
}

export const Bash = Object.assign(Root, {Root})
