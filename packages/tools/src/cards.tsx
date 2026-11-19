import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {UiCard} from './cards/ui-card.js'
import type {JSX} from 'solid-js'
import FileText from 'lucide-solid/icons/file-text'
import {parseInput, QUIET_TEXT_CLASS, toolStatus, ToolCard, type ToolStatus} from '@conciv/ui-kit-chat/tools'
import {z} from 'zod'

const OpenInput = z.object({
  file: z.string().min(1).describe('the file to open'),
  line: z.coerce.number().int().min(1).optional().describe('line number to jump to'),
  column: z.coerce.number().int().min(1).optional().describe('column to jump to, used only with a line'),
})

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

function OpenCard(props: ToolCardProps): JSX.Element {
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

export const concivToolCards: ToolCardEntry[] = [
  {
    names: ['conciv_ui'],
    render: UiCard,
    hasEmbeddedBody: () => true,
    display: 'standalone',
  },
  {names: ['open'], render: OpenCard, hasEmbeddedBody: () => true},
]
