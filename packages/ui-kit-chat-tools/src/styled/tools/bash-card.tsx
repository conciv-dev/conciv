import {Show, type JSX} from 'solid-js'
import {Terminal} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Bash, useBash} from '../../primitives/tools/bash.js'
import {CollapsibleCard} from '@conciv/ui-kit-chat'

const OUT_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
  overflow: 'wrap',
}
const OUT_CLASS = 'block max-w-full overflow-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)]'

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
            {(stdout) => (
              <SolidCodeBlock
                class={OUT_CLASS}
                options={OUT_OPTIONS}
                file={{name: 'output.txt', lang: 'ansi', contents: stdout()}}
              />
            )}
          </Show>
          <Show when={bash.output().stderr}>
            {(stderr) => (
              <SolidCodeBlock
                class={`${OUT_CLASS}${bash.output().stdout ? ' mt-2' : ''}`}
                options={OUT_OPTIONS}
                file={{name: 'stderr.txt', lang: 'ansi', contents: stderr()}}
              />
            )}
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
