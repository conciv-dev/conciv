import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {MessageSquare} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseInput, ToolCard} from '@conciv/ui-kit-chat'
import {ToolChip} from '@conciv/ui-kit-chat-tools'
import {failureOf, toolPayload} from '../card-util.js'

const TextPartSchema = z.object({type: z.literal('text'), text: z.string()}).loose()

const PartsInput = z.object({cid: z.string().optional(), parts: z.array(z.unknown())}).loose()
const CidInput = z.object({cid: z.string()}).loose()

const DetailSchema = z
  .object({
    cid: z.string().optional(),
    status: z.string().optional(),
    deleted: z.boolean().optional(),
    comments: z.array(z.unknown()).optional(),
    replies: z.array(z.unknown()).optional(),
    pinState: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .loose()

const DESTRUCTIVE = new Set(['resolve', 'delete'])

function opOf(name: string): string {
  if (name === 'pin.setState') return 'pin'
  return name.startsWith('comment.') ? name.slice('comment.'.length) : name
}

function textPreview(props: ToolCardProps): string {
  const parts = parseInput(PartsInput, props.part)?.parts ?? []
  return parts
    .flatMap((part) => {
      const parsed = TextPartSchema.safeParse(part)
      return parsed.success ? [parsed.data.text] : []
    })
    .join(' ')
}

type Detail = z.infer<typeof DetailSchema>

const SUMMARIES: Record<string, (detail: Detail) => string | undefined> = {
  list: (detail) => detail.comments && `${detail.comments.length} comment${detail.comments.length === 1 ? '' : 's'}`,
  read: (detail) => detail.replies && `${detail.replies.length} repl${detail.replies.length === 1 ? 'y' : 'ies'}`,
  resolve: (detail) => detail.status,
  delete: (detail) => (detail.deleted ? 'deleted' : undefined),
  move: (detail) => (detail.x === undefined || detail.y === undefined ? undefined : `to ${detail.x},${detail.y}`),
  pin: (detail) => detail.pinState,
}

function summarize(op: string, props: ToolCardProps, detail: Detail): string {
  const summary = SUMMARIES[op]?.(detail)
  return summary ?? detail.cid ?? parseInput(CidInput, props.part)?.cid ?? ''
}

function CommentIcon(): JSX.Element {
  return <MessageSquare size={14} />
}

export function CommentOpCard(props: ToolCardProps): JSX.Element {
  const op = () => opOf(props.part.name)
  const payload = () => toolPayload(props.result)
  const detail = () => {
    const parsed = DetailSchema.safeParse(payload().detail)
    return parsed.success ? parsed.data : {}
  }
  const failure = () => failureOf(payload().detail)
  const preview = () => textPreview(props)
  return (
    <ToolCard
      Icon={CommentIcon}
      title={props.part.name}
      meta={summarize(op(), props, detail())}
      part={props.part}
      result={props.result}
      status={failure() ? 'error' : undefined}
    >
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-1.5">
          <ToolChip name={op()} tone={DESTRUCTIVE.has(op()) ? 'bad' : undefined} />
          <Show when={summarize(op(), props, detail())}>{(text) => <ToolChip name={text()} />}</Show>
        </div>
        <Show when={preview()}>
          {(text) => (
            <div class="text-[length:var(--chat-text-sm)] leading-[1.45] [color:var(--chat-text-2)] [overflow-wrap:anywhere]">
              {text()}
            </div>
          )}
        </Show>
        <Show when={failure()}>
          {(error) => (
            <div class="rounded-[var(--chat-radius-sm)] p-2 text-[length:var(--chat-text-xs)] [border:1px_solid_var(--chat-danger-line)] [color:var(--chat-danger)] [font-family:var(--chat-mono)]">
              {error().error}
              <Show when={error().reason}>
                <span class="[color:var(--chat-text-3)]"> · {error().reason}</span>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </ToolCard>
  )
}
