import type {JSX} from 'solid-js'
import type {ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {InlineRow, toolStatus} from '@conciv/ui-kit-chat'
import {basename, inlineValue, shortenPath, SUMMARY_KEYS, truncate} from '../../primitives/tools/inline-tool.js'

export function inlineTool(
  argKeys: string | readonly string[],
  format: (value: string) => string = truncate,
): ToolUIComponent {
  const keys = typeof argKeys === 'string' ? [argKeys] : argKeys
  return (props: ToolCardProps): JSX.Element => {
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
