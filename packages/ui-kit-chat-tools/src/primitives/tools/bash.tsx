import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat/tools'
import {z} from 'zod'

const BashOutputSchema = z
  .object({stdout: z.string().optional(), stderr: z.string().optional(), exitCode: z.number().optional()})
  .refine((output) => output.stdout !== undefined || output.stderr !== undefined || output.exitCode !== undefined)

export type BashOutput = z.infer<typeof BashOutputSchema>

function argString(part: ToolCallPart, key: string): string {
  try {
    const value = JSON.parse(part.arguments || '{}')[key]
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function parseBashOutput(result: ToolResultPart | undefined): BashOutput {
  if (!result) return {}
  const content = result.content
  if (typeof content !== 'string') return {stdout: JSON.stringify(content, null, 2)}
  const parsed = BashOutputSchema.safeParse(parsedJson(content))
  return parsed.success ? parsed.data : {stdout: content}
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
  if (!context) throw new Error('Bash sub-components must be used within Bash.Root')
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
  const isError = () =>
    !running() && outcome() === undefined && ((output().exitCode ?? 0) !== 0 || status() === 'error')
  const hasOutput = () => Boolean(output().stdout || output().stderr)
  return (
    <BashContext.Provider value={{command, summary, output, status, isError, hasOutput, outcome, stoppedReason}}>
      {props.children}
    </BashContext.Provider>
  )
}

export const Bash = Object.assign(Root, {Root})
