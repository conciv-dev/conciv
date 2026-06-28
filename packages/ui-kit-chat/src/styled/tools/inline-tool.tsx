import {Show, type JSX} from 'solid-js'
import {Check, CircleAlert, CircleX, LoaderCircle} from 'lucide-solid'
import type {ToolCardProps, ToolUIComponent} from '@mandarax/protocol/tool-view-types'
import {toolStatus, type ToolStatus} from '../../primitives/tools/tool-status.js'
import {basename, inlineValue, shortenPath, SUMMARY_KEYS, truncate} from '../../primitives/tools/inline-tool.js'

// Compact one-line tool display for the rail (ported from with-opencode tool-ui-inline). Thin --chat-*
// wrapper over the headless inline helpers.
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
        class="text-[color:var(--chat-text-3)] anim-spin shrink-0 motion-reduce:[animation:none]"
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

// Factory: a single-line card showing the first non-empty arg among `argKeys`, formatted.
export function inlineTool(
  argKeys: string | readonly string[],
  format: (value: string) => string = truncate,
): ToolUIComponent {
  const keys = Array.isArray(argKeys) ? argKeys : [argKeys as string]
  return (props: ToolCardProps) => {
    const status = () => toolStatus(props.part, props.result)
    const value = () => {
      const raw = inlineValue(props.part, keys)
      return raw ? format(raw) : ''
    }
    return (
      <Shell name={props.part.name} status={status()}>
        <Show when={value()}>
          <span class="text-[color:var(--chat-text-3)] truncate">{value()}</span>
        </Show>
      </Shell>
    )
  }
}

export const ReadInline = inlineTool(['file_path', 'filePath', 'path', 'file'], (value) => truncate(shortenPath(value)))
export const EditInline = inlineTool('file_path', basename)
export const WriteInline = inlineTool('file_path', basename)
export const GrepInline = inlineTool('pattern')
export const GlobInline = inlineTool('pattern')
export const WebSearchInline = inlineTool('query')
export const WebFetchInline = inlineTool('url')

// Generic inline fallback for unknown/MCP tools — first matching summary key.
export const ToolCallInline = inlineTool(SUMMARY_KEYS, truncate)
