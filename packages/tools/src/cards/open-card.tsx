import type {JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {clip, InlineRow, parseInput, toolStatus} from '@conciv/ui-kit-chat/tools'
import {OpenInput} from '../builtins/server-tools.js'

export function OpenCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(OpenInput, props.part)
  const target = (): string => {
    const parsed = input()
    if (!parsed) return ''
    return clip(parsed.line === undefined ? parsed.file : `${parsed.file}:${parsed.line}`, 80)
  }
  return <InlineRow label="Open in editor" status={toolStatus(props.part, props.result)} value={target()} />
}
