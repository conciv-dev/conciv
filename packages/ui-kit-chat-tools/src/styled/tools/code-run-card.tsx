import {Show, type JSX} from 'solid-js'
import {Code} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CollapsibleCard, Markdown, parseInput, parseResultPayload, toolStatus} from '@conciv/ui-kit-chat'

const Input = z.object({typescriptCode: z.string()})
const CodeError = z.object({message: z.string(), name: z.string().optional(), line: z.number().optional()})
const Output = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  logs: z.array(z.string()).optional(),
  error: CodeError.optional(),
})

type CodeOutput = z.infer<typeof Output>
type CodeErrorValue = z.infer<typeof CodeError>

function parseOutput(result: ToolCardProps['result']): CodeOutput | null {
  const parsed = Output.safeParse(parseResultPayload(result))
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

function logsOf(output: CodeOutput | null): string[] {
  return output?.logs ?? []
}

function errorOf(output: CodeOutput | null): CodeErrorValue | undefined {
  return output?.error
}

function isFailed(output: CodeOutput | null): boolean {
  return output?.success === false
}

function hasResult(output: CodeOutput | null): boolean {
  return output?.success === true && output.result !== undefined
}

function Header(props: {failed: boolean; summary: string}): JSX.Element {
  return (
    <>
      <Code
        size={14}
        class={`shrink-0 ${props.failed ? 'text-[color:var(--chat-danger)]' : 'text-[color:var(--chat-text-3)]'}`}
        aria-hidden="true"
      />
      <span class="text-[color:var(--chat-text)] [font-family:var(--chat-mono)]">run code</span>
      <span class="text-[color:var(--chat-text-3)] truncate">{props.summary}</span>
      <Show when={props.failed}>
        <span class="text-[color:var(--chat-danger)] text-[length:var(--chat-text-xs)]">failed</span>
      </Show>
    </>
  )
}

function ConsoleLogs(props: {logs: string[]}): JSX.Element {
  return (
    <>
      <span class="text-[color:var(--chat-text-3)] text-[length:0.625rem] tracking-[0.08em] uppercase">console</span>
      <pre class="text-[length:var(--chat-text-xs)] m-0 p-2 rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border-left:2px_solid_var(--chat-line)] [font-family:var(--chat-mono)] overflow-x-auto">
        {props.logs.join('\n')}
      </pre>
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

function ErrorBox(props: {error: CodeErrorValue}): JSX.Element {
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
  const code = (): string => parseInput(Input, props.part)?.typescriptCode ?? ''
  const output = (): CodeOutput | null => parseOutput(props.result)
  return (
    <CollapsibleCard
      defaultOpen={toolStatus(props.part, props.result) === 'running'}
      header={<Header failed={isFailed(output())} summary={firstLine(code())} />}
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
    </CollapsibleCard>
  )
}

export const codeRunTool: ToolCardEntry = {names: ['execute_typescript'], render: CodeRunCard}
