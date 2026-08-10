import type {JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {clip, InlineRow, parseInput, toolStatus} from '@conciv/ui-kit-chat'
import {ExtensionsInput} from '../extensions-tool.js'

const TITLE_BY_VERB: Record<'catalog' | 'scaffold' | 'validate', string> = {
  catalog: 'Extension catalog',
  scaffold: 'Extension scaffold',
  validate: 'Extension check',
}

export function ExtensionsCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(ExtensionsInput, props.part)
  const label = (): string => {
    const verb = input()?.verb
    return verb ? TITLE_BY_VERB[verb] : props.part.name
  }
  const detail = (): string => clip([input()?.kind, input()?.name].filter(Boolean).join(' '), 80)
  return <InlineRow label={label()} status={toolStatus(props.part, props.result)} value={detail()} />
}
