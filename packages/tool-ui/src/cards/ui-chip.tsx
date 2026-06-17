import {Show, type JSX} from 'solid-js'
import {UiInput} from '@opendui/aidx-tools/defs'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import type {ToolCardProps} from '../types.js'

// A compact chip for aidx_ui. The interactive UI itself stays the widget's GenUi (driven by the
// separate aidx-ui CUSTOM event); this card only notes that a UI was rendered.
const LABEL: Record<'choices' | 'confirm' | 'diff' | 'form', string> = {
  choices: 'choices',
  confirm: 'a confirmation',
  diff: 'a diff',
  form: 'a form',
}

function UiIcon(): JSX.Element {
  return (
    <span class="pw-tool-glyph-ui" aria-hidden="true">
      ◧
    </span>
  )
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
    >
      <Show when={question()}>
        <span class="pw-ui-q">{question()}</span>
      </Show>
    </ToolCard>
  )
}
