import {Show, type JSX} from 'solid-js'
import {LayoutTemplate} from 'lucide-solid'
import {UiInputSchema} from '@conciv/protocol/ui-types'
import {ToolCard, parseInput} from '@conciv/ui-kit-chat'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'

const LABEL: Record<'choices' | 'confirm' | 'diff' | 'form', string> = {
  choices: 'choices',
  confirm: 'a confirmation',
  diff: 'a diff',
  form: 'a form',
}

function Icon(): JSX.Element {
  return <LayoutTemplate size={14} />
}

function title(kind: keyof typeof LABEL | undefined): string {
  return kind ? `Rendered ${LABEL[kind]}` : 'Rendered UI'
}

export function UiCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(UiInputSchema, props.part)
  const question = () => input()?.question ?? input()?.title
  return (
    <ToolCard Icon={Icon} title={title(input()?.kind)} part={props.part} result={props.result}>
      <Show when={question()}>
        <span class="text-[length:var(--chat-text-md)] [color:var(--chat-text-2)]">{question()}</span>
      </Show>
    </ToolCard>
  )
}

export const uiTool: ToolCardEntry = {names: ['conciv_ui'], render: UiCard}
