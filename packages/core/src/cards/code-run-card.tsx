import {Show, type JSX} from 'solid-js'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {
  Chip,
  clip,
  CodeBlock,
  ErrorBlock,
  parseInput,
  parseResultPayload,
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

function isFailed(output: ExecuteResult | null): boolean {
  return output?.success === false
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

function EmbeddedOutput(props: {output: ExecuteResult | null}): JSX.Element {
  const text = () => runOutputText(props.output)
  return (
    <Show when={text()}>
      {(value) => (
        <TraceOutputBlock tone={isFailed(props.output) ? 'error' : 'normal'} text={value()}>
          <CodeBlock size="xs" maxHeight="none" file={{name: 'output.log', lang: 'ansi', contents: value()}} />
        </TraceOutputBlock>
      )}
    </Show>
  )
}

function FullOutput(props: {output: ExecuteResult | null; code: string}): JSX.Element {
  return (
    <div class="flex flex-col gap-2 min-w-0">
      <CodeBlock size="xs" file={{name: 'run.ts', lang: 'ts', contents: props.code}} />
      <Show when={logsOf(props.output).length > 0}>
        <ConsoleLogs logs={logsOf(props.output)} />
      </Show>
      <Show when={hasResult(props.output)}>
        <Chip kind="pill" value={JSON.stringify(props.output?.result)} />
      </Show>
      <Show when={errorOf(props.output)}>{(error) => <ErrorBox error={error()} />}</Show>
    </div>
  )
}

export function CodeRunCard(props: ToolCardProps): JSX.Element {
  const code = (): string => codeOf(props.part)
  const output = (): ExecuteResult | null => parseOutput(props.result)
  const statusOverride = (): ToolStatus | undefined => (isFailed(output()) ? 'error' : undefined)
  const settled = () => isSettledStatus(toolStatus(props.part, props.result))
  const embedded = useEmbeddedCard()
  return (
    <ToolCard
      variant="terminal"
      microlabel="exec"
      title={clip(firstLine(code()), 64)}
      part={props.part}
      result={props.result}
      status={statusOverride()}
      meta={codeStatusText(settled(), isFailed(output()))}
      defaultOpen={toolStatus(props.part, props.result) === 'running'}
    >
      <Show when={embedded()} fallback={<FullOutput output={output()} code={code()} />}>
        <EmbeddedOutput output={output()} />
      </Show>
    </ToolCard>
  )
}

export const codeRunTool: ToolCardEntry = {
  names: [EXECUTE_TOOL_NAME],
  render: CodeRunCard,
}
