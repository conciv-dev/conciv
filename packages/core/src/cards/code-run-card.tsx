import {Show, type JSX} from 'solid-js'
import {Code} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {
  clip,
  Markdown,
  parseInput,
  parseResultPayload,
  ToolCard,
  toolStatus,
  type ToolStatus,
} from '@conciv/ui-kit-chat'
import {ExecuteInputSchema, ExecuteResultSchema, type ExecuteError, type ExecuteResult} from '../api/execute-schemas.js'

const CONSOLE_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
}
const CONSOLE_CLASS =
  'block overflow-x-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border-left:2px_solid_var(--chat-line)]'

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

function CodeIcon(failed: boolean): JSX.Element {
  return <Code size={14} class={failed ? 'text-[color:var(--chat-danger)]' : undefined} />
}

function ConsoleLogs(props: {logs: string[]}): JSX.Element {
  return (
    <>
      <span class="text-[color:var(--chat-text-3)] text-[length:0.625rem] tracking-[0.08em] uppercase">console</span>
      <SolidCodeBlock
        class={CONSOLE_CLASS}
        options={CONSOLE_OPTIONS}
        file={{name: 'console.txt', lang: 'ansi', contents: props.logs.join('\n')}}
      />
    </>
  )
}

function ResultChip(props: {value: unknown}): JSX.Element {
  return (
    <span class="text-[length:var(--chat-text-xs)] px-2 py-0.5 rounded-[var(--chat-radius-sm)] inline-flex max-w-full whitespace-nowrap text-ellipsis [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)] [font-family:var(--chat-mono)] overflow-hidden">
      {JSON.stringify(props.value)}
    </span>
  )
}

function ErrorBox(props: {error: ExecuteError}): JSX.Element {
  return (
    <div class="text-[length:var(--chat-text-xs)] p-2 rounded-[var(--chat-radius-sm)] [border:1px_solid_var(--chat-danger-line)] [color:var(--chat-danger)] [font-family:var(--chat-mono)] overflow-x-auto">
      {props.error.name ?? 'Error'}: {props.error.message}
      <Show when={props.error.line !== undefined}>
        <span class="text-[color:var(--chat-text-3)]"> · line {props.error.line}</span>
      </Show>
    </div>
  )
}

export function CodeRunCard(props: ToolCardProps): JSX.Element {
  const code = (): string => parseInput(ExecuteInputSchema, props.part)?.typescriptCode ?? ''
  const output = (): ExecuteResult | null => parseOutput(props.result)
  const statusOverride = (): ToolStatus | undefined => (isFailed(output()) ? 'error' : undefined)
  return (
    <ToolCard
      Icon={() => CodeIcon(isFailed(output()))}
      title="run code"
      meta={clip(firstLine(code()), 48)}
      part={props.part}
      result={props.result}
      status={statusOverride()}
      defaultOpen={toolStatus(props.part, props.result) === 'running'}
    >
      <div class="flex flex-col gap-2 min-w-0">
        <Markdown content={`\`\`\`ts\n${code()}\n\`\`\``} />
        <Show when={logsOf(output()).length > 0}>
          <ConsoleLogs logs={logsOf(output())} />
        </Show>
        <Show when={hasResult(output())}>
          <ResultChip value={output()?.result} />
        </Show>
        <Show when={errorOf(output())}>{(error) => <ErrorBox error={error()} />}</Show>
      </div>
    </ToolCard>
  )
}
