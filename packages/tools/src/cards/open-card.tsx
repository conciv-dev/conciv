import type {JSX} from 'solid-js'
import FileText from 'lucide-solid/icons/file-text'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseInput, QUIET_TEXT_CLASS, toolStatus, ToolCard, type ToolStatus} from '@conciv/ui-kit-chat/tools'
import {OpenInput} from '../builtins/open-input.js'

function Icon(): JSX.Element {
  return <FileText size={14} aria-hidden="true" />
}

function shortPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const tail = segments.slice(-2).join('/')
  return segments.length > 2 ? `…/${tail}` : tail || path
}

function formatTarget(input: {file: string; line?: number} | undefined, fallback: string): string {
  if (!input) return fallback
  return input.line === undefined ? shortPath(input.file) : `${shortPath(input.file)}:${input.line}`
}

function statusNote(status: ToolStatus): string {
  if (status === 'error') return 'Could not open the file.'
  if (status === 'denied') return 'Opening the file was denied.'
  if (status === 'cancelled') return 'Opening the file was cancelled.'
  if (status === 'complete') return 'Opened in your editor.'
  return 'Opening…'
}

export function OpenCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(OpenInput, props.part)
  const status = () => toolStatus(props.part, props.result)
  return (
    <ToolCard
      Icon={Icon}
      title="Open in editor"
      subtitle={formatTarget(input(), props.part.name)}
      part={props.part}
      result={props.result}
    >
      <p class={QUIET_TEXT_CLASS}>{statusNote(status())}</p>
    </ToolCard>
  )
}
