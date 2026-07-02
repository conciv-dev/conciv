import {Show, type JSX} from 'solid-js'
import {FileText} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {FileRead, useFileRead} from '../../primitives/tools/file-read.js'
import {CollapsibleCard} from '@conciv/ui-kit-chat'

const CODE_OPTIONS: FileOptions<undefined> = {theme: {light: 'github-light', dark: 'github-dark'}, themeType: 'system'}
const CODE_CLASS =
  'text-[length:var(--chat-text-sm)] rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] max-h-80 max-w-full block overflow-auto'

function Header(): JSX.Element {
  const view = useFileRead()
  return (
    <>
      <FileText size={14} class="text-[color:var(--chat-text-3)] shrink-0" aria-hidden="true" />
      <span class="text-[color:var(--chat-text)] truncate [overflow-wrap:anywhere]">
        {view.path() ? `${view.verb()} ${view.path()}` : `${view.verb()} a file`}
      </span>
      <Show when={view.range()}>
        <span class="text-[color:var(--chat-text-3)] ml-auto [font-family:var(--chat-mono)]">{view.range()}</span>
      </Show>
    </>
  )
}

function Body(): JSX.Element {
  const view = useFileRead()
  return (
    <CollapsibleCard header={<Header />}>
      <Show
        when={view.contents()}
        fallback={
          <Show when={view.path()}>
            <code class="text-[color:var(--chat-text-2)] text-[length:var(--chat-text-sm)] block [font-family:var(--chat-mono)] [overflow-wrap:anywhere]">
              {view.path()}
              {view.range()}
            </code>
          </Show>
        }
      >
        <SolidCodeBlock
          class={CODE_CLASS}
          options={CODE_OPTIONS}
          file={{name: view.path() || 'file', contents: view.contents()}}
        />
      </Show>
    </CollapsibleCard>
  )
}

export function FileReadCard(props: ToolCardProps): JSX.Element {
  return (
    <FileRead.Root part={props.part} result={props.result}>
      <Body />
    </FileRead.Root>
  )
}

export const fileReadTool: ToolCardEntry = {names: ['Read', 'conciv_open'], render: FileReadCard}
