import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import MessageSquare from 'lucide-solid/icons/message-square'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {ErrorBlock, parseInput, parseResultMedia, resultText, ToolCard} from '@conciv/ui-kit-chat/tools'
import {clockTime, failureOf, MonoLine, OpTag, type FieldTone} from '../card-util.js'

const TextPartSchema = z.object({type: z.literal('text'), text: z.string()}).loose()

const PartsInput = z.object({cid: z.string().optional(), parts: z.array(z.unknown())}).loose()
const CidInput = z.object({cid: z.string()}).loose()

const CommentRowSchema = z
  .object({
    cid: z.string(),
    parentId: z.string().nullable().optional(),
    status: z.string().optional(),
    parts: z.unknown().optional(),
    authorKind: z.string().optional(),
    authorModel: z.string().nullable().optional(),
    anchorFile: z.string().nullable().optional(),
    anchorComponent: z.string().nullable().optional(),
    createdAt: z.number().optional(),
  })
  .loose()

type CommentRowData = z.infer<typeof CommentRowSchema>

const DetailSchema = z
  .object({
    cid: z.string().optional(),
    status: z.string().optional(),
    deleted: z.boolean().optional(),
    comment: z.unknown().optional(),
    comments: z.array(z.unknown()).optional(),
    replies: z.array(z.unknown()).optional(),
    pinState: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .loose()

const DESTRUCTIVE = new Set(['resolve', 'delete'])

function opOf(name: string): string {
  if (name === 'pin_set_state') return 'pin'
  return name.startsWith('comment_') ? name.slice('comment_'.length) : name
}

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .flatMap((entry) => {
      const parsed = TextPartSchema.safeParse(entry)
      return parsed.success ? [parsed.data.text] : []
    })
    .join(' ')
}

function textPreview(part: ToolCardProps['part']): string {
  return textOf(parseInput(PartsInput, part)?.parts)
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

function parseRows(raw: unknown[] | undefined): CommentRowData[] {
  if (!raw) return []
  return raw.flatMap((entry) => {
    const parsed = CommentRowSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

function threadRows(detail: Detail): CommentRowData[] {
  if (Array.isArray(detail.comments)) return parseRows(detail.comments)
  if (detail.comment !== undefined) return parseRows([detail.comment, ...(detail.replies ?? [])])
  return parseRows(detail.replies)
}

function authorLabel(row: CommentRowData): string {
  if (row.authorKind === 'ai') return row.authorModel ?? 'ai'
  return row.authorKind ?? 'human'
}

function anchorOf(row: CommentRowData): string | undefined {
  return row.anchorComponent ?? row.anchorFile ?? undefined
}

function CommentIcon(): JSX.Element {
  return <MessageSquare size={14} />
}

const THREAD_ROW = 'flex flex-col gap-0.5 min-w-0'
const THREAD_META = 'flex items-baseline gap-1.5 min-w-0'
const THREAD_AUTHOR = 'flex-none text-[10.5px] [font-family:var(--chat-mono)] text-chat-dim'
const THREAD_TIME = 'flex-none text-[10px] [font-family:var(--chat-mono)] text-chat-faint'
const THREAD_STATUS =
  'flex-none text-[9.5px] uppercase tracking-[0.1em] [font-family:var(--chat-mono)] text-chat-microlabel'
const THREAD_TEXT = 'min-w-0 text-[12px] leading-[1.45] text-chat-text-2 [overflow-wrap:anywhere] m-0'
const THREAD_TARGET = 'min-w-0 truncate text-[10.5px] [font-family:var(--chat-mono)] text-chat-target m-0'

function ThreadRows(props: {rows: CommentRowData[]}): JSX.Element {
  return (
    <Show when={props.rows.length > 0}>
      <div class="flex flex-col gap-2 min-w-0">
        <For each={props.rows}>
          {(row) => (
            <div class={THREAD_ROW}>
              <div class={THREAD_META}>
                <span class={THREAD_AUTHOR}>{authorLabel(row)}</span>
                <Show when={row.createdAt}>{(ts) => <span class={THREAD_TIME}>{clockTime(ts())}</span>}</Show>
                <Show when={row.status}>{(status) => <span class={THREAD_STATUS}>{status()}</span>}</Show>
              </div>
              <Show when={textOf(row.parts)}>{(text) => <p class={THREAD_TEXT}>{text()}</p>}</Show>
              <Show when={anchorOf(row)}>{(target) => <p class={THREAD_TARGET}>{target()}</p>}</Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

export function CommentOpCard(props: ToolCardProps): JSX.Element {
  const op = () => opOf(props.part.name)
  const media = () => parseResultMedia(props.result)
  const detail = () => {
    const parsed = DetailSchema.safeParse(media().json)
    return parsed.success ? parsed.data : {}
  }
  const failure = () => {
    if (props.result?.state === 'error') return {error: resultText(props.result) || 'the tool call failed'}
    return failureOf(media().json)
  }
  const preview = () => textPreview(props.part)
  const tone = (): FieldTone | undefined => (DESTRUCTIVE.has(op()) ? 'danger' : undefined)
  return (
    <ToolCard
      Icon={CommentIcon}
      title={props.part.name}
      meta={summarize(op(), props, detail())}
      part={props.part}
      result={props.result}
      status={failure() ? 'error' : undefined}
    >
      <div class="flex flex-col gap-2 min-w-0">
        <div class="flex gap-2 min-w-0 items-baseline">
          <OpTag op={op()} tone={tone()} />
          <Show when={summarize(op(), props, detail())}>{(text) => <MonoLine text={text()} />}</Show>
        </div>
        <Show when={preview()}>{(text) => <p class={THREAD_TEXT}>{text()}</p>}</Show>
        <ThreadRows rows={threadRows(detail())} />
        <Show when={failure()}>
          {(error) => <ErrorBlock message={error().reason ? `${error().error} · ${error().reason}` : error().error} />}
        </Show>
      </div>
    </ToolCard>
  )
}
export const commentOpCard: ToolCardView = {render: CommentOpCard, hasEmbeddedBody: () => true}
