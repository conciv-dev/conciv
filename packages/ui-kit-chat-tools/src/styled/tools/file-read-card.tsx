import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import FileText from 'lucide-solid/icons/file-text'
import type {ToolCardEntry, ToolCardProps, ToolRowProjection, ToolRowProps} from '@conciv/protocol/tool-view-types'
import {FileRead, useFileRead} from '../../primitives/tools/file-read.js'
import {
  Chip,
  CodeBlock,
  countLabel,
  parseInput,
  QUIET_TEXT_CLASS,
  resultText,
  rowMarkOf,
  stripReadLineNumbers,
  ToolCard,
  TraceOutputBlock,
} from '@conciv/ui-kit-chat/tools'

function Icon(): JSX.Element {
  return <FileText size={14} aria-hidden="true" />
}

function Body(): JSX.Element {
  const view = useFileRead()
  return (
    <Show
      when={view.contents()}
      fallback={
        <Show when={view.path()} fallback={<p class={QUIET_TEXT_CLASS}>waiting for the file</p>}>
          <Chip kind="pill" value={`${view.path()}${view.range() ?? ''}`} />
        </Show>
      }
    >
      <CodeBlock size="sm" maxHeight="log" file={{name: view.path() || 'file', contents: view.contents()}} />
    </Show>
  )
}

function CardBody(props: ToolCardProps): JSX.Element {
  const view = useFileRead()
  return (
    <ToolCard
      Icon={Icon}
      title={view.path() ? `${view.verb()} ${view.path()}` : `${view.verb()} a file`}
      meta={view.range()}
      part={props.part}
      result={props.result}
    >
      <Body />
    </ToolCard>
  )
}

export function FileReadCard(props: ToolCardProps): JSX.Element {
  return (
    <FileRead.Root part={props.part} result={props.result}>
      <CardBody {...props} />
    </FileRead.Root>
  )
}

const ReadRowInput = z.object({file_path: z.string().optional(), file: z.string().optional()})

const MAX_BLOCK_LINES = 200

function readPath(part: ToolRowProps['part']): string {
  const input = parseInput(ReadRowInput, part)
  return input?.file_path ?? input?.file ?? ''
}

function readLines(source: ToolRowProps): string[] {
  if (source.part.name === 'open' || source.result?.state === 'error') return []
  const raw = stripReadLineNumbers(resultText(source.result))
  return raw ? raw.split('\n') : []
}

function shortPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const tail = segments.slice(-2).join('/')
  return segments.length > 2 ? `…/${tail}` : tail || path
}

function readLanguage(path: string): string | undefined {
  const extension = path.split('.').pop()
  return extension && extension !== path ? extension : undefined
}

function readBlock(preview: string, path: string): () => JSX.Element {
  return () => (
    <TraceOutputBlock text={preview}>
      <CodeBlock size="xs" file={{name: path || 'file', lang: readLanguage(path), contents: preview}} />
    </TraceOutputBlock>
  )
}

export function fileReadRowProjection(source: ToolRowProps): ToolRowProjection {
  const lines = readLines(source)
  const path = readPath(source.part)
  const preview = lines.slice(0, MAX_BLOCK_LINES).join('\n')
  return {
    mark: rowMarkOf(source.part, source.result),
    label: source.part.name === 'open' ? 'open' : 'read',
    target: path ? shortPath(path) : 'a file',
    meta: lines.length === 0 ? undefined : countLabel(lines.length, 'line', 'lines'),
    block: preview ? readBlock(preview, path) : undefined,
  }
}

export const fileReadTool: ToolCardEntry = {names: ['Read', 'open'], render: FileReadCard, row: fileReadRowProjection}
