import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {BasicTool, ErrorBlock} from '@conciv/ui-kit-chat/tools'
import {countLabel} from '../page/cards/shared.js'
import {readInput} from '../tanstack/card-shared.js'
import {failureMessage, MonoLine, OpTag, readFailure, readMedia, type FieldTone} from './card-shared.js'

const TextPartSchema = z.object({type: z.literal('text'), text: z.string()}).loose()

const PartsInput = z.object({parts: z.array(z.unknown())}).loose()
const CidInput = z.object({cid: z.string()}).loose()

const CommentRowSchema = z
  .object({
    cid: z.string(),
    status: z.string().optional(),
    parts: z.unknown().optional(),
    authorKind: z.string().optional(),
    authorModel: z.string().nullable().optional(),
    anchorFile: z.string().nullable().optional(),
    anchorComponent: z.string().nullable().optional(),
    createdAt: z.number().optional(),
  })
  .loose()

type CommentRow = z.infer<typeof CommentRowSchema>

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

type Detail = z.infer<typeof DetailSchema>

const COMMENT_TOOL_PREFIX = 'whiteboard_comment_'

const PIN_TOOL = 'whiteboard_pin_set_state'

const DESTRUCTIVE: ReadonlyArray<string> = ['resolve', 'delete']

const CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'})

function readOperation(name: string): string {
  if (name === PIN_TOOL) return 'pin'
  return name.startsWith(COMMENT_TOOL_PREFIX) ? name.slice(COMMENT_TOOL_PREFIX.length) : name
}

function readText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .flatMap((entry) => {
      const parsed = TextPartSchema.safeParse(entry)
      return parsed.success ? [parsed.data.text] : []
    })
    .join(' ')
}

const SUMMARIES: Record<string, (detail: Detail) => string | undefined> = {
  list: (detail) => detail.comments && countLabel(detail.comments.length, 'comment', 'comments'),
  read: (detail) => detail.replies && countLabel(detail.replies.length, 'reply', 'replies'),
  resolve: (detail) => detail.status,
  delete: (detail) => (detail.deleted ? 'deleted' : undefined),
  move: (detail) => (detail.x === undefined || detail.y === undefined ? undefined : `to ${detail.x},${detail.y}`),
  pin: (detail) => detail.pinState,
}

function summarize(operation: string, input: ToolProps['input'], detail: Detail): string {
  return SUMMARIES[operation]?.(detail) ?? detail.cid ?? readInput(CidInput, input)?.cid ?? ''
}

function parseRows(raw: unknown[]): CommentRow[] {
  return raw.flatMap((entry) => {
    const parsed = CommentRowSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

function threadRows(detail: Detail): CommentRow[] {
  if (detail.comments !== undefined) return parseRows(detail.comments)
  if (detail.comment !== undefined) return parseRows([detail.comment, ...(detail.replies ?? [])])
  return parseRows(detail.replies ?? [])
}

function authorLabel(row: CommentRow): string {
  if (row.authorKind === 'ai') return row.authorModel ?? 'ai'
  return row.authorKind ?? 'human'
}

function readAnchor(row: CommentRow): string | undefined {
  return row.anchorComponent ?? row.anchorFile ?? undefined
}

const THREAD_TEXT = 'text-chat-sm text-chat-text-2 min-w-0 break-words'

function ThreadRows(props: {rows: CommentRow[]}): JSX.Element {
  return (
    <Show when={props.rows.length > 0}>
      <div class="flex flex-col gap-2 min-w-0">
        <For each={props.rows}>
          {(row) => (
            <div class="flex flex-col gap-0.5 min-w-0">
              <div class="text-chat-micro leading-4 font-chat-mono flex gap-1.5 min-w-0 items-baseline">
                <span class="text-chat-dim flex-none">{authorLabel(row)}</span>
                <Show when={row.createdAt}>
                  {(createdAt) => <span class="text-chat-faint flex-none">{CLOCK_FORMAT.format(createdAt())}</span>}
                </Show>
                <Show when={row.status}>
                  {(status) => <span class="text-chat-microlabel tracking-wider flex-none uppercase">{status()}</span>}
                </Show>
              </div>
              <Show when={readText(row.parts)}>{(text) => <p class={THREAD_TEXT}>{text()}</p>}</Show>
              <Show when={readAnchor(row)}>
                {(target) => (
                  <p class="text-chat-micro text-chat-target leading-4 font-chat-mono min-w-0 truncate">{target()}</p>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function CommentOperationCard(props: ToolProps): JSX.Element {
  const operation = () => readOperation(props.tool)
  const detail = (): Detail => {
    const parsed = DetailSchema.safeParse(readMedia(props.output).json)
    return parsed.success ? parsed.data : {}
  }
  const failure = () => readFailure(props.output)
  const preview = () => readText(readInput(PartsInput, props.input)?.parts)
  const summary = () => summarize(operation(), props.input, detail())
  const tone = (): FieldTone => (DESTRUCTIVE.includes(operation()) ? 'danger' : 'default')
  return (
    <BasicTool
      {...props}
      status={failure() ? 'error' : props.status}
      trigger={{title: props.tool, subtitle: summary()}}
      hasContent={true}
    >
      <div class="flex flex-col gap-2 min-w-0">
        <div class="flex gap-2 min-w-0 items-baseline">
          <OpTag op={operation()} tone={tone()} />
          <Show when={summary()}>{(text) => <MonoLine text={text()} />}</Show>
        </div>
        <Show when={preview()}>{(text) => <p class={THREAD_TEXT}>{text()}</p>}</Show>
        <ThreadRows rows={threadRows(detail())} />
        <Show when={failure()}>{(error) => <ErrorBlock message={failureMessage(error())} />}</Show>
      </div>
    </BasicTool>
  )
}

export const commentCard: ToolComponent = CommentOperationCard
