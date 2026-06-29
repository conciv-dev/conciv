import {Show, type JSX} from 'solid-js'
import {LayoutTemplate} from 'lucide-solid'
import {UiInput} from '@mandarax/tools/defs'
import {ToolCard, parseInput} from '@mandarax/ui-kit-chat'
import type {ToolCardEntry, ToolCardProps} from '@mandarax/protocol/tool-view-types'

// A compact chip for mandarax_ui. The interactive UI itself stays the widget's GenUi (driven by the
// separate mandarax-ui CUSTOM event); this card only notes that a UI was rendered.
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
  const input = () => parseInput(UiInput, props.part)
  const question = () => input()?.question ?? input()?.title
  return (
    <ToolCard Icon={Icon} title={title(input()?.kind)} part={props.part} result={props.result}>
      <Show when={question()}>
        <span class="text-[length:var(--chat-text-md)] [color:var(--chat-text-2)]">{question()}</span>
      </Show>
    </ToolCard>
  )
}

// This card renders the mandarax_ui tool.
export const uiTool: ToolCardEntry = {names: ['mandarax_ui'], render: UiCard}
