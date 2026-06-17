import {Show, type JSX} from 'solid-js'
import {MousePointerClick, Target} from 'lucide-solid'
import {PageInput} from '@opendui/aidx-tools/defs'
import {ToolCard} from '../shell.js'
import {parseInput} from '../util.js'
import type {ToolCardProps} from '../types.js'

// The element a page verb targets, in priority order.
function target(input: ReturnType<typeof readInput>): string | undefined {
  return input?.selector || input?.name || input?.ref || undefined
}

function readInput(props: ToolCardProps) {
  return parseInput(PageInput, props.part)
}

// Human label for a page verb (the on-page mirror in Plan C reuses the same shape).
function pageTitle(props: ToolCardProps): string {
  const input = readInput(props)
  const t = target(input)
  const at = t ? ` ${t}` : ''
  const value = input?.value || input?.text
  switch (input?.verb) {
    case 'click':
      return `Clicked${at || ' element'}`
    case 'fill':
      return value ? `Typed "${value}" into${at || ' field'}` : `Filled${at || ' field'}`
    case 'select':
      return value ? `Selected "${value}"` : `Selected an option${at}`
    case 'check':
      return `Checked${at || ' box'}`
    case 'uncheck':
      return `Unchecked${at || ' box'}`
    case 'press':
      return `Pressed ${input?.key ?? 'a key'}`
    case 'hover':
      return `Hovered${at || ' element'}`
    case 'scroll':
      return 'Scrolled the page'
    case 'submit':
      return `Submitted${at || ' the form'}`
    case 'find':
      return `Found${at || ' elements'}`
    case 'locate':
      return `Located${at || ' element'}`
    case 'inspect':
      return `Inspected${at || ' element'}`
    case 'tree':
      return 'Read the page tree'
    case 'wait':
      return `Waited for${at || ' the page'}`
    case 'eval':
      return 'Ran a script on the page'
    case undefined:
      return 'Page action'
    default:
      return `${input?.verb}${at}`
  }
}

function PageActionIcon(): JSX.Element {
  return <MousePointerClick size={14} />
}

export function PageActionCard(props: ToolCardProps): JSX.Element {
  const t = () => target(readInput(props))
  return (
    <ToolCard accent="page" Icon={PageActionIcon} title={pageTitle(props)} part={props.part} result={props.result}>
      <Show when={t()}>
        <span class="pw-elchip">
          <Target size={12} />
          {t()}
        </span>
      </Show>
    </ToolCard>
  )
}
