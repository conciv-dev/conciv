import {Match, Show, Switch, type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {
  Chip,
  clip,
  CodeBlock,
  ErrorBlock,
  parseInput,
  parseResultPayload,
  resultText,
  ToolCard,
  toolStatus,
  TraceOutputBlock,
  useEmbeddedCard,
  type ToolStatus,
} from '@conciv/ui-kit-chat/tools'
import {
  ExecuteInputSchema,
  ExecuteResultSchema,
  EXECUTE_TOOL_NAME,
  type ExecuteError,
  type ExecuteResult,
} from '../api/execute-schemas.js'

function parseOutput(result: ToolCardProps['result']): ExecuteResult | null {
  const parsed = ExecuteResultSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function firstLine(code: string): string {
  return (
    code
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ''
  )
}

function logsOf(output: ExecuteResult | null): string[] {
  return output?.logs ?? []
}

function errorOf(output: ExecuteResult | null): ExecuteError | undefined {
  return output?.error
}

function isFailed(output: ExecuteResult | null, status: ToolStatus): boolean {
  if (output) return output.success === false
  return status === 'error'
}

function transportErrorText(result: ToolCardProps['result']): string {
  const direct = result?.error
  if (typeof direct === 'string' && direct.length > 0) return direct
  return resultText(result)
}

function hasResult(output: ExecuteResult | null): boolean {
  return output?.success === true && output.result !== undefined
}

function ConsoleLogs(props: {logs: string[]}): JSX.Element {
  return (
    <>
      <span class="text-[length:var(--chat-text-micro)] text-chat-microlabel leading-none tracking-[0.13em] uppercase [font-family:var(--chat-mono)]">
        console
      </span>
      <CodeBlock file={{name: 'console.txt', lang: 'ansi', contents: props.logs.join('\n')}} />
    </>
  )
}

function errorMessage(error: ExecuteError): string {
  return error.line === undefined ? error.message : `${error.message} · line ${error.line}`
}

function ErrorBox(props: {error: ExecuteError}): JSX.Element {
  return <ErrorBlock label={props.error.name ?? 'Error'} message={errorMessage(props.error)} />
}

function codeOf(part: ToolCardProps['part']): string {
  return parseInput(ExecuteInputSchema, part)?.typescriptCode ?? ''
}

function isSettledStatus(status: ToolStatus): boolean {
  return status === 'complete' || status === 'error'
}

function codeStatusText(settled: boolean, failed: boolean): string | undefined {
  if (!settled) return undefined
  return failed ? 'error' : 'ok'
}

function runOutputText(output: ExecuteResult | null): string {
  const parts = [...logsOf(output)]
  const error = errorOf(output)
  if (error) parts.push(errorMessage(error))
  if (hasResult(output)) parts.push(JSON.stringify(output?.result))
  return parts.join('\n')
}

function EmbeddedOutput(props: {
  output: ExecuteResult | null
  failed: boolean
  result: ToolCardProps['result']
}): JSX.Element {
  const text = () => runOutputText(props.output)
  return (
    <Switch>
      <Match when={props.output === null && props.failed}>
        <ErrorBlock label="Error" message={transportErrorText(props.result)} />
      </Match>
      <Match when={text()}>
        {(value) => (
          <TraceOutputBlock tone={props.failed ? 'error' : 'normal'} text={value()}>
            <CodeBlock size="xs" maxHeight="none" file={{name: 'output.log', lang: 'ansi', contents: value()}} />
          </TraceOutputBlock>
        )}
      </Match>
    </Switch>
  )
}

function FullOutput(props: {
  output: ExecuteResult | null
  code: string
  failed: boolean
  result: ToolCardProps['result']
}): JSX.Element {
  return (
    <div class="flex flex-col gap-2 min-w-0">
      <CodeBlock size="xs" file={{name: 'run.ts', lang: 'ts', contents: props.code}} />
      <Show when={logsOf(props.output).length > 0}>
        <ConsoleLogs logs={logsOf(props.output)} />
      </Show>
      <Show when={hasResult(props.output)}>
        <Chip kind="pill" value={JSON.stringify(props.output?.result)} />
      </Show>
      <Switch>
        <Match when={errorOf(props.output)}>{(error) => <ErrorBox error={error()} />}</Match>
        <Match when={props.output === null && props.failed}>
          <ErrorBlock label="Error" message={transportErrorText(props.result)} />
        </Match>
      </Switch>
    </div>
  )
}

export function CodeRunCard(props: ToolCardProps): JSX.Element {
  const code = (): string => codeOf(props.part)
  const output = (): ExecuteResult | null => parseOutput(props.result)
  const status = (): ToolStatus => toolStatus(props.part, props.result)
  const failed = (): boolean => isFailed(output(), status())
  const statusOverride = (): ToolStatus | undefined => (failed() ? 'error' : undefined)
  const settled = () => isSettledStatus(status())
  const embedded = useEmbeddedCard()
  return (
    <ToolCard
      variant="terminal"
      microlabel="exec"
      title={clip(firstLine(code()), 64)}
      part={props.part}
      result={props.result}
      status={statusOverride()}
      meta={codeStatusText(settled(), failed())}
      defaultOpen={status() === 'running'}
    >
      <Show
        when={embedded()}
        fallback={<FullOutput output={output()} code={code()} failed={failed()} result={props.result} />}
      >
        <EmbeddedOutput output={output()} failed={failed()} result={props.result} />
      </Show>
    </ToolCard>
  )
}

function codeRunHasEmbeddedBody(part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  const output = parseOutput(result)
  if (runOutputText(output).length > 0) return true
  return output === null && toolStatus(part, result) === 'error'
}

export const codeRunTool: ToolCardEntry = {
  names: [EXECUTE_TOOL_NAME],
  render: CodeRunCard,
  hasEmbeddedBody: codeRunHasEmbeddedBody,
}
