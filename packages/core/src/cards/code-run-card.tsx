import {Show, type JSX} from 'solid-js'
import type {
  ToolCardEntry,
  ToolCardProps,
  ToolRowMark,
  ToolRowProjection,
  ToolRowProps,
} from '@conciv/protocol/tool-view-types'
import {
  Chip,
  clip,
  CodeBlock,
  ErrorBlock,
  parseInput,
  parseResultPayload,
  rowMarkOf,
  ToolCard,
  toolStatus,
  TraceOutputBlock,
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

export function CodeRunCard(props: ToolCardProps): JSX.Element {
  const code = (): string => codeOf(props.part)
  const output = (): ExecuteResult | null => parseOutput(props.result)
  const statusOverride = (): ToolStatus | undefined => (isFailed(output()) ? 'error' : undefined)
  return (
    <ToolCard
      variant="terminal"
      microlabel="exec"
      title={clip(firstLine(code()), 64)}
      part={props.part}
      result={props.result}
      status={statusOverride()}
      defaultOpen={toolStatus(props.part, props.result) === 'running'}
    >
      <div class="flex flex-col gap-2 min-w-0">
        <CodeBlock size="xs" file={{name: 'run.ts', lang: 'ts', contents: code()}} />
        <Show when={logsOf(output()).length > 0}>
          <ConsoleLogs logs={logsOf(output())} />
        </Show>
        <Show when={hasResult(output())}>
          <Chip kind="pill" value={JSON.stringify(output()?.result)} />
        </Show>
        <Show when={errorOf(output())}>{(error) => <ErrorBox error={error()} />}</Show>
      </div>
    </ToolCard>
  )
}

function isSettledStatus(status: ToolStatus): boolean {
  return status === 'complete' || status === 'error'
}

function codeStatusText(settled: boolean, failed: boolean): string | undefined {
  if (!settled) return undefined
  return failed ? 'error' : 'ok'
}

function codeMark(mark: ToolRowMark, failed: boolean): ToolRowMark {
  return failed ? 'fail' : mark
}

function codeOf(part: ToolRowProps['part']): string {
  return parseInput(ExecuteInputSchema, part)?.typescriptCode ?? ''
}

function runBlock(text: string, failed: boolean, live: boolean): () => JSX.Element {
  return () => (
    <TraceOutputBlock tone={failed ? 'error' : 'normal'} text={text} live={live}>
      <CodeBlock size="xs" maxHeight="none" file={{name: 'output.log', lang: 'ansi', contents: text}} />
    </TraceOutputBlock>
  )
}

function runOutputText(output: ExecuteResult | null): string {
  const parts = [...logsOf(output)]
  const error = errorOf(output)
  if (error) parts.push(errorMessage(error))
  if (hasResult(output)) parts.push(JSON.stringify(output?.result))
  return parts.join('\n')
}

export function codeRunRowProjection(source: ToolRowProps): ToolRowProjection {
  const settled = isSettledStatus(toolStatus(source.part, source.result))
  const output = parseOutput(source.result)
  const failed = settled && isFailed(output)
  const text = runOutputText(output)
  return {
    mark: codeMark(rowMarkOf(source.part, source.result), failed),
    label: 'exec',
    target: clip(firstLine(codeOf(source.part)), 160),
    meta: codeStatusText(settled, failed),
    block: text ? runBlock(text, failed, !settled) : undefined,
  }
}

export const codeRunTool: ToolCardEntry = {
  names: [EXECUTE_TOOL_NAME],
  render: CodeRunCard,
  row: codeRunRowProjection,
}
