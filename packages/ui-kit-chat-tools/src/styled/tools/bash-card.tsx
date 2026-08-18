import {Show, type JSX} from 'solid-js'
import Terminal from 'lucide-solid/icons/terminal'
import type {
  ToolCardEntry,
  ToolCardProps,
  ToolRowMark,
  ToolRowProjection,
  ToolRowProps,
} from '@conciv/protocol/tool-view-types'
import {Bash, parseBashOutput, useBash} from '../../primitives/tools/bash.js'
import {CodeBlock, TraceOutputBlock, ToolCard, toolStatus, type ToolStatus} from '@conciv/ui-kit-chat/tools'

const ANSI_INTRODUCER = '\u001b['

function outputLanguage(text: string): string {
  return text.includes(ANSI_INTRODUCER) ? 'ansi' : 'log'
}

function Icon(): JSX.Element {
  const bash = useBash()
  return <Terminal size={14} class={bash.isError() ? 'text-chat-danger' : undefined} aria-hidden="true" />
}

function Body(): JSX.Element {
  const bash = useBash()
  return (
    <Show
      when={bash.hasOutput()}
      fallback={
        <span class="text-[length:var(--chat-text-xs)] text-chat-text-3 [font-family:var(--chat-mono)]">no output</span>
      }
    >
      <div class="flex flex-col gap-2">
        <Show when={bash.command()}>
          {(command) => <CodeBlock size="xs" file={{name: 'command.sh', lang: 'shellscript', contents: command()}} />}
        </Show>
        <Show when={bash.output().stdout}>
          {(stdout) => (
            <CodeBlock
              size="xs"
              maxHeight="log"
              file={{name: 'output.log', lang: outputLanguage(stdout()), contents: stdout()}}
            />
          )}
        </Show>
        <Show when={bash.output().stderr}>
          {(stderr) => (
            <CodeBlock
              size="xs"
              maxHeight="log"
              file={{name: 'stderr.log', lang: outputLanguage(stderr()), contents: stderr()}}
            />
          )}
        </Show>
      </div>
    </Show>
  )
}

function CardBody(props: ToolCardProps): JSX.Element {
  const bash = useBash()
  const status = () => (bash.isError() ? 'error' : bash.status())
  return (
    <ToolCard
      Icon={Icon}
      title="bash"
      subtitle={bash.summary() || undefined}
      part={props.part}
      result={props.result}
      status={status()}
    >
      <Body />
    </ToolCard>
  )
}

export function BashCard(props: ToolCardProps): JSX.Element {
  return (
    <Bash.Root part={props.part} result={props.result}>
      <CardBody {...props} />
    </Bash.Root>
  )
}

function firstMeaningfulLine(command: string): string {
  const line = command
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0 && !candidate.startsWith('#'))
  return line ?? command.trim()
}

function commandOf(part: ToolCardProps['part']): string {
  try {
    const value = JSON.parse(part.arguments || '{}').command
    return typeof value === 'string' && value.trim().length > 0 ? firstMeaningfulLine(value) : part.name
  } catch {
    return part.name
  }
}

function exitMeta(settled: boolean, exitCode: number | undefined): string | undefined {
  if (!settled || exitCode === undefined) return undefined
  return `exit ${exitCode}`
}

function bashFailed(status: ToolStatus, exitCode: number | undefined): boolean {
  if (status === 'error') return true
  return exitCode !== undefined && exitCode !== 0
}

function bashMark(settled: boolean, failed: boolean): ToolRowMark {
  if (!settled) return 'run'
  return failed ? 'fail' : 'pass'
}

function bashBlock(text: string, failed: boolean, live: boolean): () => JSX.Element {
  return () => (
    <TraceOutputBlock tone={failed ? 'error' : 'normal'} text={text} live={live}>
      <CodeBlock size="xs" maxHeight="none" file={{name: 'output.log', lang: outputLanguage(text), contents: text}} />
    </TraceOutputBlock>
  )
}

export function bashRowProjection(source: ToolRowProps): ToolRowProjection {
  const status = toolStatus(source.part, source.result)
  const settled = status === 'complete' || status === 'error'
  const output = parseBashOutput(source.result)
  const failed = settled && bashFailed(status, output.exitCode)
  const text = [output.stdout, output.stderr].filter(Boolean).join('\n')
  return {
    mark: bashMark(settled, failed),
    label: 'bash',
    target: commandOf(source.part),
    meta: exitMeta(settled, output.exitCode),
    block: text ? bashBlock(text, failed, !settled) : undefined,
  }
}

export const bashTool: ToolCardEntry = {names: ['Bash'], render: BashCard, row: bashRowProjection}
