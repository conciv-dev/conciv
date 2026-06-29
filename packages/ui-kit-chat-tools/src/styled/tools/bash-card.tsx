import {Show, type JSX} from 'solid-js'
import {Terminal} from 'lucide-solid'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'
import {Bash, useBash} from '../../primitives/tools/bash.js'
import {CollapsibleCard} from '@mandarax/ui-kit-chat'

// Styled bash card: a thin --chat-* / terminal wrapper over the headless Bash primitive (which owns
// command/{stdout,stderr,exitCode} parsing + status).
function Header(): JSX.Element {
  const bash = useBash()
  return (
    <>
      <Terminal
        size={14}
        class={`shrink-0 ${bash.isError() ? 'text-[color:var(--chat-danger)]' : 'text-[color:var(--chat-text-3)]'}`}
        aria-hidden="true"
      />
      <span class="text-[color:var(--chat-text)] [font-family:var(--chat-mono)]">bash</span>
      <Show when={bash.summary()}>
        <span class="text-[color:var(--chat-text-3)] truncate">{bash.summary()}</span>
      </Show>
    </>
  )
}

function Body(): JSX.Element {
  const bash = useBash()
  return (
    <CollapsibleCard header={<Header />}>
      <Show
        when={bash.hasOutput()}
        fallback={
          <span class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)]">
            no output
          </span>
        }
      >
        <div class="text-[length:var(--chat-text-xs)] leading-[1.5] p-3 rounded-[var(--chat-radius-sm)] max-h-96 [background:var(--chat-sunken)] [font-family:var(--chat-mono)] overflow-y-auto">
          <Show when={bash.command()}>
            <div class="text-[color:var(--chat-text-3)] mb-2 [overflow-wrap:anywhere]">$ {bash.command()}</div>
          </Show>
          <Show when={bash.output().stdout}>
            <pre class="text-[color:var(--chat-text)] whitespace-pre-wrap [margin:0] [overflow-wrap:anywhere]">
              {bash.output().stdout}
            </pre>
          </Show>
          <Show when={bash.output().stderr}>
            <pre
              class="text-[color:var(--chat-danger)] whitespace-pre-wrap [margin:0] [overflow-wrap:anywhere]"
              classList={{'mt-2': Boolean(bash.output().stdout)}}
            >
              {bash.output().stderr}
            </pre>
          </Show>
        </div>
      </Show>
    </CollapsibleCard>
  )
}

export function BashCard(props: ToolCardProps): JSX.Element {
  return (
    <Bash.Root part={props.part} result={props.result}>
      <Body />
    </Bash.Root>
  )
}
