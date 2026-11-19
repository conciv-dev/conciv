import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {BasicTool} from '@conciv/ui-kit-chat/tools'
import {parseOutput, readInput} from '../tanstack/card-shared.js'

const InputSchema = z.object({cid: z.string()})
const AnchorStatus = z.enum(['fresh', 'moved', 'drifted', 'orphaned', 'ambiguous'])
const OutputSchema = z.object({status: AnchorStatus}).loose()

const STATUS_TONE: Record<z.infer<typeof AnchorStatus>, string> = {
  fresh: 'text-chat-text-3',
  moved: 'text-chat-warn',
  drifted: 'text-chat-warn',
  orphaned: 'text-chat-danger',
  ambiguous: 'text-chat-warn',
}

function readStatus(output: string | undefined): z.infer<typeof AnchorStatus> | undefined {
  return readInput(OutputSchema, parseOutput(output))?.status
}

function anchorValue(input: ToolProps['input'], output: string | undefined): string {
  const cid = readInput(InputSchema, input)?.cid ?? ''
  const resolved = readStatus(output)
  return resolved === undefined ? cid : `${cid} · ${resolved}`
}

function AnchorResolveCard(props: ToolProps): JSX.Element {
  const tone = () => {
    const resolved = readStatus(props.output)
    return resolved ? STATUS_TONE[resolved] : 'text-chat-text-3'
  }
  return (
    <BasicTool
      {...props}
      trigger={{
        title: props.tool,
        subtitle: anchorValue(props.input, props.output) || undefined,
        subtitleClass: tone(),
      }}
      hasContent={false}
    />
  )
}

export const anchorCard: ToolComponent = AnchorResolveCard
