import {Show, type JSX} from 'solid-js'
import {LayoutTemplate} from 'lucide-solid'
import {UiInput} from '@mandarax/tools/defs'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import type {ToolCardEntry, ToolCardProps} from '../types.js'

// A compact chip for mandarax_ui. The interactive UI itself stays the widget's GenUi (driven by the
// separate mandarax-ui CUSTOM event); this card only notes that a UI was rendered.
const LABEL: Record<'choices' | 'confirm' | 'diff' | 'form', string> = {
  choices: 'choices',
  confirm: 'a confirmation',
  diff: 'a diff',
  form: 'a form',
}

function UiIcon(): JSX.Element {
  return <LayoutTemplate size={14} />
}

export function UiCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(UiInput, props.part)
  const kind = () => input()?.kind
  const question = () => input()?.question ?? input()?.title
  return (
    <ToolCard
      accent="neutral"
      Icon={UiIcon}
      title={kind() ? `Rendered ${LABEL[kind()!]}` : 'Rendered UI'}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <Show when={question()}>
        <span class="text-[0.78125rem] text-pw-text-2">{question()}</span>
      </Show>
    </ToolCard>
  )
}

// This card renders the mandarax_ui tool.
export const uiTool: ToolCardEntry = {names: ['mandarax_ui'], render: UiCard}
