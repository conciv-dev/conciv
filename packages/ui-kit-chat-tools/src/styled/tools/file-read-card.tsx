import type {JSX} from 'solid-js'
import FileText from 'lucide-solid/icons/file-text'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {FileRead, useFileRead} from '../../primitives/tools/file-read.js'
import {Chip, CodeBlock, countLabel, QUIET_TEXT_CLASS, ToolCard} from '@conciv/ui-kit-chat/tools'

function Icon(): JSX.Element {
  return <FileText size={14} aria-hidden="true" />
}

function lineCountMeta(contents: string): string | undefined {
  if (!contents) return undefined
  const trimmed = contents.endsWith('\n') ? contents.slice(0, -1) : contents
  return countLabel(trimmed.split('\n').length, 'line', 'lines')
}

function Body(): JSX.Element {
  const view = useFileRead()
  return (
    <>
      {view.contents() ? (
        <CodeBlock size="sm" maxHeight="log" file={{name: view.path() || 'file', contents: view.contents()}} />
      ) : view.path() ? (
        <Chip kind="pill" value={`${view.path()}${view.range() ?? ''}`} />
      ) : (
        <p class={QUIET_TEXT_CLASS}>waiting for the file</p>
      )}
    </>
  )
}

function CardBody(props: ToolCardProps): JSX.Element {
  const view = useFileRead()
  const title = () => (view.path() ? `${view.verb()} ${view.path()}` : `${view.verb()} a file`)
  return (
    <ToolCard
      Icon={Icon}
      title={title()}
      meta={view.range() ?? lineCountMeta(view.contents())}
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

export const fileReadTool: ToolCardEntry = {
  names: ['Read', 'open'],
  render: FileReadCard,
  hasEmbeddedBody: () => true,
}
