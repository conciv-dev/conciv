import {Show, type JSX} from 'solid-js'
import {Terminal} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Bash, useBash} from '../../primitives/tools/bash.js'
import {CodeBlock, ToolCard} from '@conciv/ui-kit-chat/tools'

function Icon(): JSX.Element {
  const bash = useBash()
  return (
    <Terminal size={14} class={bash.isError() ? 'text-[color:var(--chat-danger)]' : undefined} aria-hidden="true" />
  )
}

function Body(): JSX.Element {
  const bash = useBash()
  return (
    <Show
      when={bash.hasOutput()}
      fallback={
        <span class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)]">
          no output
        </span>
      }
    >
      <div class="flex flex-col gap-2">
        <Show when={bash.command()}>
          {(command) => (
            <CodeBlock size="xs" file={{name: 'command.sh', lang: 'shellsession', contents: `$ ${command()}`}} />
          )}
        </Show>
        <Show when={bash.output().stdout}>
          {(stdout) => (
            <CodeBlock size="xs" maxHeight="log" file={{name: 'output.txt', lang: 'ansi', contents: stdout()}} />
          )}
        </Show>
        <Show when={bash.output().stderr}>
          {(stderr) => (
            <CodeBlock size="xs" maxHeight="log" file={{name: 'stderr.txt', lang: 'ansi', contents: stderr()}} />
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
