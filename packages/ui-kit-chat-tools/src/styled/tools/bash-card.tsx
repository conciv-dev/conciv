import {Show, type JSX} from 'solid-js'
import Terminal from 'lucide-solid/icons/terminal'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Bash, useBash} from '../../primitives/tools/bash.js'
import {CodeBlock, ToolCard, TraceOutputBlock} from '@conciv/ui-kit-chat/tools'

const ANSI_INTRODUCER = '['

function outputLanguage(text: string): string {
  return text.includes(ANSI_INTRODUCER) ? 'ansi' : 'log'
}

function Icon(): JSX.Element {
  const bash = useBash()
  return <Terminal size={14} class={bash.isError() ? 'text-chat-danger' : undefined} aria-hidden="true" />
}

function outputText(stdout: string | undefined, stderr: string | undefined): string {
  return [stdout, stderr].filter(Boolean).join('\n')
}

function exitMeta(settled: boolean, exitCode: number | undefined): string | undefined {
  if (!settled || exitCode === undefined) return undefined
  return `exit ${exitCode}`
}

function Body(): JSX.Element {
  const bash = useBash()
  const text = () => outputText(bash.output().stdout, bash.output().stderr)
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
        <Show when={text()}>
          {(value) => (
            <TraceOutputBlock tone={bash.isError() ? 'error' : 'normal'} text={value()}>
              <CodeBlock
                size="xs"
                maxHeight="none"
                file={{name: 'output.log', lang: outputLanguage(value()), contents: value()}}
              />
            </TraceOutputBlock>
          )}
        </Show>
      </div>
    </Show>
  )
}

function CardBody(props: ToolCardProps): JSX.Element {
  const bash = useBash()
  const status = () => (bash.isError() ? 'error' : bash.status())
  const settled = () => bash.status() === 'complete' || bash.status() === 'error'
  return (
    <ToolCard
      Icon={Icon}
      title="bash"
      subtitle={bash.summary() || undefined}
      part={props.part}
      result={props.result}
      status={status()}
      meta={exitMeta(settled(), bash.output().exitCode)}
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

export const bashTool: ToolCardEntry = {names: ['Bash'], render: BashCard, hasEmbeddedBody: () => true}
