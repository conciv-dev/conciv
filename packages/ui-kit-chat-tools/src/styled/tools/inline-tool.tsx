import {Show, type JSX} from 'solid-js'
import {Check, CircleAlert, CircleX, LoaderCircle} from 'lucide-solid'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {toolStatus, type ToolStatus} from '@conciv/ui-kit-chat'
import {
  basename,
  extensionsSummary,
  inlineValue,
  shortenPath,
  SUMMARY_KEYS,
  truncate,
} from '../../primitives/tools/inline-tool.js'

function StatusIcon(props: {status: ToolStatus}): JSX.Element {
  return (
    <Show when={props.status === 'complete'} fallback={<Pending status={props.status} />}>
      <Check size={13} class="text-[color:var(--chat-success)] shrink-0" aria-hidden="true" />
    </Show>
  )
}

function Pending(props: {status: ToolStatus}): JSX.Element {
  return (
    <Show
      when={props.status === 'running'}
      fallback={
        <Show
          when={props.status === 'error'}
          fallback={<CircleAlert size={13} class="text-[color:var(--chat-accent)] shrink-0" aria-hidden="true" />}
        >
          <CircleX size={13} class="text-[color:var(--chat-danger)] shrink-0" aria-hidden="true" />
        </Show>
      }
    >
      <LoaderCircle
        size={13}
        class="text-[color:var(--chat-text-3)] shrink-0 anim-tool-spin motion-reduce:[animation:none]"
        aria-hidden="true"
      />
    </Show>
  )
}

function Shell(props: {name: string; status: ToolStatus; children?: JSX.Element}): JSX.Element {
  return (
    <div class="text-[color:var(--chat-text-2)] text-[length:var(--chat-text-md)] py-0.5 flex gap-2 items-center">
      <StatusIcon status={props.status} />
      <span class="flex gap-1.5 min-w-0 truncate items-center">
        <span class="text-[color:var(--chat-text)] font-medium [font-family:var(--chat-mono)]">{props.name}</span>
        {props.children}
      </span>
    </div>
  )
}

function InlineRow(props: {label: string; status: ToolStatus; value: string}): JSX.Element {
  return (
    <Shell name={props.label} status={props.status}>
      <Show when={props.value}>
        <span class="text-[color:var(--chat-text-3)] truncate">{props.value}</span>
      </Show>
    </Shell>
  )
}

export function inlineTool(
  argKeys: string | readonly string[],
  format: (value: string) => string = truncate,
): ToolUIComponent {
  const keys = Array.isArray(argKeys) ? argKeys : [argKeys as string]
  return (props: ToolCardProps) => {
    const value = () => {
      const raw = inlineValue(props.part, keys)
      return raw ? format(raw) : ''
    }
    return <InlineRow label={props.part.name} status={toolStatus(props.part, props.result)} value={value()} />
  }
}

export const ReadInline = inlineTool(['file_path', 'filePath', 'path', 'file'], (value) => truncate(shortenPath(value)))
export const EditInline = inlineTool('file_path', basename)
export const WriteInline = inlineTool('file_path', basename)
export const GrepInline = inlineTool('pattern')
export const GlobInline = inlineTool('pattern')
export const WebSearchInline = inlineTool('query')
export const WebFetchInline = inlineTool('url')

export const ToolCallInline = inlineTool(SUMMARY_KEYS, truncate)

export function ExtensionsInline(props: ToolCardProps): JSX.Element {
  const summary = () => extensionsSummary(props.part)
  return <InlineRow label={summary().label} status={toolStatus(props.part, props.result)} value={summary().detail} />
}

export const extensionsTool: ToolCardEntry = {names: ['conciv_extensions'], render: ExtensionsInline}
