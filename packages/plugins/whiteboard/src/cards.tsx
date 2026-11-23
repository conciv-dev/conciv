import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {groupBy} from 'es-toolkit'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import type {ConcivBasicToolProps, ConcivUi} from '@conciv/plugin-internal'

type ToolInput = ToolProps['input']

type SubtitleTone = NonNullable<ConcivBasicToolProps['subtitleTone']>

type FieldTone = 'default' | 'danger'

type Field = {label: string; value: string; tone?: FieldTone}

const ImagePartSchema = z
  .object({
    type: z.literal('image'),
    source: z.object({type: z.literal('data'), value: z.string(), mimeType: z.string()}).loose(),
  })
  .loose()

const ResultTextPartSchema = z.object({type: z.literal('text'), content: z.string()}).loose()

const FailureDetailSchema = z.object({error: z.string(), reason: z.string().optional()}).loose()

type Failure = z.infer<typeof FailureDetailSchema>

const COUNT_FORMAT = new Intl.NumberFormat()
const COUNT_PLURAL = new Intl.PluralRules('en')

function countLabel(count: number, one: string, other: string): string {
  return `${COUNT_FORMAT.format(count)} ${COUNT_PLURAL.select(count) === 'one' ? one : other}`
}

function parseOutput(output: string | undefined): unknown {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

function readInput<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> | undefined {
  const parsed = schema.safeParse(input)
  return parsed.success ? parsed.data : undefined
}

function readMedia(output: string | undefined): {json: unknown; imageUrl?: string} {
  const raw = parseOutput(output)
  if (!Array.isArray(raw)) return {json: raw}
  const image = raw.map((part) => ImagePartSchema.safeParse(part)).find((parsed) => parsed.success)?.data
  const textPart = raw.map((part) => ResultTextPartSchema.safeParse(part)).find((parsed) => parsed.success)?.data
  const json = textPart ? (parseOutput(textPart.content) ?? textPart.content) : undefined
  return image === undefined ? {json} : {json, imageUrl: `data:${image.source.mimeType};base64,${image.source.value}`}
}

function readFailure(output: string | undefined): Failure | null {
  const parsed = FailureDetailSchema.safeParse(readMedia(output).json)
  return parsed.success ? parsed.data : null
}

function failureMessage(failure: Failure): string {
  return failure.reason ? `${failure.error} · ${failure.reason}` : failure.error
}

const VALUE_TONE: Record<FieldTone, string> = {
  default: 'text-chat-target',
  danger: 'text-chat-danger',
}

const OP_TAG_TONE: Record<FieldTone, string> = {
  default: 'text-chat-microlabel',
  danger: 'text-chat-danger',
}

const MICROLABEL = 'text-chat-micro font-chat-mono uppercase tracking-wider'

function FieldRows(props: {rows: Field[]}): JSX.Element {
  return (
    <Show when={props.rows.length > 0}>
      <div class="flex flex-col gap-0.5 min-w-0">
        <For each={props.rows}>
          {(field) => (
            <div class="flex gap-2 min-w-0 items-baseline">
              <span class={`${MICROLABEL} text-chat-microlabel leading-4.5 flex-none w-20 truncate`}>
                {field.label}
              </span>
              <span
                class={`text-chat-sm font-chat-mono flex-1 min-w-0 truncate ${VALUE_TONE[field.tone ?? 'default']}`}
              >
                {field.value}
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function OpTag(props: {op: string; tone?: FieldTone}): JSX.Element {
  return (
    <span class={`${MICROLABEL} leading-4 inline-flex flex-none items-center ${OP_TAG_TONE[props.tone ?? 'default']}`}>
      {props.op}
    </span>
  )
}

function MonoLine(props: {text: string; tone?: FieldTone}): JSX.Element {
  return (
    <p class={`text-chat-sm font-chat-mono min-w-0 truncate ${VALUE_TONE[props.tone ?? 'default']}`}>{props.text}</p>
  )
}

const AnchorInput = z.object({cid: z.string()})
const AnchorStatus = z.enum(['fresh', 'moved', 'drifted', 'orphaned', 'ambiguous'])
const AnchorOutput = z.object({status: AnchorStatus}).loose()

const ANCHOR_TONE: Record<z.infer<typeof AnchorStatus>, SubtitleTone> = {
  fresh: 'muted',
  moved: 'warning',
  drifted: 'warning',
  orphaned: 'danger',
  ambiguous: 'warning',
}

function readAnchorStatus(output: string | undefined): z.infer<typeof AnchorStatus> | undefined {
  return readInput(AnchorOutput, parseOutput(output))?.status
}

function anchorValue(input: ToolInput, output: string | undefined): string {
  const cid = readInput(AnchorInput, input)?.cid ?? ''
  const resolved = readAnchorStatus(output)
  return resolved === undefined ? cid : `${cid} · ${resolved}`
}

function anchorCard(ui: ConcivUi): ToolComponent {
  return (props) => {
    const tone = (): SubtitleTone => {
      const resolved = readAnchorStatus(props.output)
      return resolved ? ANCHOR_TONE[resolved] : 'muted'
    }
    return (
      <ui.BasicTool
        {...props}
        icon="presentation"
        title={props.tool}
        subtitle={anchorValue(props.input, props.output) || undefined}
        subtitleTone={tone()}
      />
    )
  }
}

const ElementInput = z.object({file: z.string(), component: z.string()})
const ElementOutput = z.object({found: z.boolean()}).loose()

function readFound(output: string | undefined): boolean | undefined {
  return readInput(ElementOutput, parseOutput(output))?.found
}

function elementValue(input: ToolInput, output: string | undefined): string {
  const component = readInput(ElementInput, input)?.component ?? ''
  if (component === '') return ''
  return readFound(output) === false ? `${component} not found` : component
}

function elementCard(ui: ConcivUi): ToolComponent {
  return (props) => {
    const missing = () => readFound(props.output) === false
    return (
      <ui.BasicTool
        {...props}
        icon="presentation"
        title={props.tool}
        subtitle={elementValue(props.input, props.output) || undefined}
        subtitleTone={missing() ? 'danger' : 'muted'}
        failed={missing()}
      />
    )
  }
}

const CanvasDetailSchema = z
  .object({
    elements: z.union([z.array(z.unknown()), z.number()]).optional(),
    scope: z.string().optional(),
    updated: z.boolean().optional(),
    cleared: z.number().optional(),
    committed: z.boolean().optional(),
    discarded: z.number().optional(),
    empty: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .loose()

type CanvasDetail = z.infer<typeof CanvasDetailSchema>

const ConnectInput = z.object({fromId: z.string(), toId: z.string()})
const DrawInput = z.object({elements: z.array(z.unknown())})
const TargetInput = z.object({elementId: z.string()})
const SvgInput = z.object({svg: z.string()})
const DiagramInput = z.object({mermaid: z.string()})

const ElementSkeleton = z
  .object({
    type: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .loose()

type ParsedElement = z.infer<typeof ElementSkeleton>

const CANVAS_TOOL_PREFIX = 'whiteboard_canvas_'

const CANVAS_DESTRUCTIVE: ReadonlyArray<string> = ['delete', 'clear']

function readCanvasOperation(name: string): string {
  return name.startsWith(CANVAS_TOOL_PREFIX) ? name.slice(CANVAS_TOOL_PREFIX.length) : name
}

function elementCount(elements: CanvasDetail['elements']): number | null {
  if (typeof elements === 'number') return elements
  if (Array.isArray(elements)) return elements.length
  return null
}

function elementsLabel(count: number): string {
  return countLabel(count, 'element', 'elements')
}

function countSummary(_input: ToolInput, detail: CanvasDetail): string {
  const count = elementCount(detail.elements)
  return count === null ? '' : elementsLabel(count)
}

function previewSummary(input: ToolInput, detail: CanvasDetail): string {
  return detail.empty ? 'draft is empty' : countSummary(input, detail)
}

function drawSummary(input: ToolInput): string {
  const drawn = readInput(DrawInput, input)?.elements.length
  return drawn === undefined ? 'to draft' : `${elementsLabel(drawn)} to draft`
}

function connectSummary(input: ToolInput): string {
  const arrow = readInput(ConnectInput, input)
  return arrow ? `${arrow.fromId} → ${arrow.toId}` : ''
}

function updateSummary(input: ToolInput, detail: CanvasDetail): string {
  const target = readInput(TargetInput, input)?.elementId ?? ''
  if (detail.updated === undefined) return target
  return detail.updated ? `updated ${target}` : `${target} not found`
}

function commitSummary(_input: ToolInput, detail: CanvasDetail): string {
  if (detail.committed === undefined) return ''
  if (!detail.committed) return detail.reason ?? 'nothing to commit'
  return `${elementCount(detail.elements) ?? ''} published`.trim()
}

const CANVAS_SUMMARIES: Record<string, (input: ToolInput, detail: CanvasDetail) => string> = {
  read: countSummary,
  export: countSummary,
  preview: previewSummary,
  draw: drawSummary,
  svg: () => 'svg to draft',
  diagram: () => 'mermaid to draft',
  connect: connectSummary,
  update: updateSummary,
  delete: (input) => readInput(TargetInput, input)?.elementId ?? '',
  clear: (_input, detail) => (detail.cleared === undefined ? '' : `${detail.cleared} removed`),
  commit: commitSummary,
  discard: (_input, detail) => (detail.discarded === undefined ? '' : `${detail.discarded} discarded`),
}

function summarizeCanvas(operation: string, input: ToolInput, detail: CanvasDetail): string {
  return CANVAS_SUMMARIES[operation]?.(input, detail) ?? ''
}

function parseElements(elements: CanvasDetail['elements']): ParsedElement[] {
  if (!Array.isArray(elements)) return []
  return elements.flatMap((entry) => {
    const parsed = ElementSkeleton.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

function typeCountFields(elements: ParsedElement[]): Field[] {
  const byType = groupBy(
    elements.flatMap((element) => (element.type === undefined ? [] : [element.type])),
    (type) => type,
  )
  return Object.entries(byType)
    .map(([type, group]) => ({type, count: group.length}))
    .toSorted((left, right) => right.count - left.count)
    .map((entry) => ({label: entry.type, value: String(entry.count)}))
}

function boundsFields(elements: ParsedElement[]): Field[] {
  const points = elements.flatMap((element) =>
    element.x === undefined || element.y === undefined ? [] : [{x: element.x, y: element.y}],
  )
  if (points.length === 0) return []
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return [{label: 'bounds', value: `x ${Math.min(...xs)}…${Math.max(...xs)} · y ${Math.min(...ys)}…${Math.max(...ys)}`}]
}

function structureFields(elements: CanvasDetail['elements']): Field[] {
  const parsed = parseElements(elements)
  return [...typeCountFields(parsed), ...boundsFields(parsed)]
}

function readExportFields(detail: CanvasDetail, summary: string): Field[] {
  const scope = detail.scope ? [{label: 'scope', value: detail.scope}] : []
  const count = summary ? [{label: 'elements', value: summary}] : []
  return [...scope, ...count, ...structureFields(detail.elements)]
}

function drawFields(input: ToolInput, summary: string): Field[] {
  return [{label: 'draft', value: summary}, ...structureFields(readInput(DrawInput, input)?.elements)]
}

function commitFields(detail: CanvasDetail, summary: string): Field[] {
  return summary ? [{label: 'commit', value: summary, tone: detail.committed === false ? 'danger' : 'default'}] : []
}

function singleField(label: string, summary: string): Field[] {
  return summary ? [{label, value: summary}] : []
}

const OPERATION_FIELDS: Record<string, (input: ToolInput, detail: CanvasDetail, summary: string) => Field[]> = {
  read: (_input, detail, summary) => readExportFields(detail, summary),
  export: (_input, detail, summary) => readExportFields(detail, summary),
  preview: (_input, _detail, summary) => singleField('draft', summary),
  draw: (input, _detail, summary) => drawFields(input, summary),
  connect: (_input, _detail, summary) => singleField('arrow', summary),
  update: (_input, _detail, summary) => singleField('target', summary),
  commit: (_input, detail, summary) => commitFields(detail, summary),
  discard: (_input, _detail, summary) => singleField('discard', summary),
}

function operationFields(operation: string, input: ToolInput, detail: CanvasDetail): Field[] {
  return OPERATION_FIELDS[operation]?.(input, detail, summarizeCanvas(operation, input, detail)) ?? []
}

function SourceBlock(props: {ui: ConcivUi; input: ToolInput; operation: string}): JSX.Element {
  const svg = () => (props.operation === 'svg' ? readInput(SvgInput, props.input)?.svg : undefined)
  const mermaid = () => (props.operation === 'diagram' ? readInput(DiagramInput, props.input)?.mermaid : undefined)
  return (
    <>
      <Show when={svg()}>{(source) => <props.ui.Code content={source()} language="xml" />}</Show>
      <Show when={mermaid()}>{(source) => <props.ui.Code content={source()} language="text" />}</Show>
    </>
  )
}

function canvasCard(ui: ConcivUi): ToolComponent {
  return (props) => {
    const operation = () => readCanvasOperation(props.tool)
    const media = () => readMedia(props.output)
    const detail = (): CanvasDetail => {
      const parsed = CanvasDetailSchema.safeParse(media().json)
      return parsed.success ? parsed.data : {}
    }
    const failure = () => readFailure(props.output)
    const destructive = () => CANVAS_DESTRUCTIVE.includes(operation())
    const summary = () => summarizeCanvas(operation(), props.input, detail())
    return (
      <ui.BasicTool
        {...props}
        icon="presentation"
        title={props.tool}
        subtitle={summary()}
        failed={Boolean(failure())}
        expandable
      >
        <div class="flex flex-col gap-2 min-w-0">
          <Show
            when={destructive()}
            fallback={
              <>
                <FieldRows rows={operationFields(operation(), props.input, detail())} />
                <SourceBlock ui={ui} input={props.input} operation={operation()} />
              </>
            }
          >
            <MonoLine text={`${operation()} ${summary()}`.trim()} tone="danger" />
          </Show>
          <Show when={media().imageUrl}>
            {(imageUrl) => <ui.Image src={imageUrl()} alt={`canvas ${operation()}`} />}
          </Show>
          <Show when={failure()}>{(error) => <ui.ErrorMessage message={failureMessage(error())} />}</Show>
        </div>
      </ui.BasicTool>
    )
  }
}

const CommentTextPartSchema = z.object({type: z.literal('text'), text: z.string()}).loose()

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

const CommentDetailSchema = z
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

type CommentDetail = z.infer<typeof CommentDetailSchema>

const COMMENT_TOOL_PREFIX = 'whiteboard_comment_'

const PIN_TOOL = 'whiteboard_pin_set_state'

const COMMENT_DESTRUCTIVE: ReadonlyArray<string> = ['resolve', 'delete']

const CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'})

const THREAD_TEXT = 'text-chat-sm text-chat-text-2 min-w-0 break-words'

function readCommentOperation(name: string): string {
  if (name === PIN_TOOL) return 'pin'
  return name.startsWith(COMMENT_TOOL_PREFIX) ? name.slice(COMMENT_TOOL_PREFIX.length) : name
}

function readText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .flatMap((entry) => {
      const parsed = CommentTextPartSchema.safeParse(entry)
      return parsed.success ? [parsed.data.text] : []
    })
    .join(' ')
}

const COMMENT_SUMMARIES: Record<string, (detail: CommentDetail) => string | undefined> = {
  list: (detail) => detail.comments && countLabel(detail.comments.length, 'comment', 'comments'),
  read: (detail) => detail.replies && countLabel(detail.replies.length, 'reply', 'replies'),
  resolve: (detail) => detail.status,
  delete: (detail) => (detail.deleted ? 'deleted' : undefined),
  move: (detail) => (detail.x === undefined || detail.y === undefined ? undefined : `to ${detail.x},${detail.y}`),
  pin: (detail) => detail.pinState,
}

function summarizeComment(operation: string, input: ToolInput, detail: CommentDetail): string {
  return COMMENT_SUMMARIES[operation]?.(detail) ?? detail.cid ?? readInput(CidInput, input)?.cid ?? ''
}

function parseRows(raw: unknown[]): CommentRow[] {
  return raw.flatMap((entry) => {
    const parsed = CommentRowSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

function threadRows(detail: CommentDetail): CommentRow[] {
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

function commentCard(ui: ConcivUi): ToolComponent {
  return (props) => {
    const operation = () => readCommentOperation(props.tool)
    const detail = (): CommentDetail => {
      const parsed = CommentDetailSchema.safeParse(readMedia(props.output).json)
      return parsed.success ? parsed.data : {}
    }
    const failure = () => readFailure(props.output)
    const preview = () => readText(readInput(PartsInput, props.input)?.parts)
    const summary = () => summarizeComment(operation(), props.input, detail())
    const tone = (): FieldTone => (COMMENT_DESTRUCTIVE.includes(operation()) ? 'danger' : 'default')
    return (
      <ui.BasicTool
        {...props}
        icon="presentation"
        title={props.tool}
        subtitle={summary()}
        failed={Boolean(failure())}
        expandable
      >
        <div class="flex flex-col gap-2 min-w-0">
          <div class="flex gap-2 min-w-0 items-baseline">
            <OpTag op={operation()} tone={tone()} />
            <Show when={summary()}>{(text) => <MonoLine text={text()} />}</Show>
          </div>
          <Show when={preview()}>{(text) => <p class={THREAD_TEXT}>{text()}</p>}</Show>
          <ThreadRows rows={threadRows(detail())} />
          <Show when={failure()}>{(error) => <ui.ErrorMessage message={failureMessage(error())} />}</Show>
        </div>
      </ui.BasicTool>
    )
  }
}

const CANVAS_TOOLS = [
  'whiteboard_canvas_read',
  'whiteboard_canvas_svg',
  'whiteboard_canvas_preview',
  'whiteboard_canvas_export',
  'whiteboard_canvas_draw',
  'whiteboard_canvas_diagram',
  'whiteboard_canvas_connect',
  'whiteboard_canvas_update',
  'whiteboard_canvas_delete',
  'whiteboard_canvas_clear',
  'whiteboard_canvas_commit',
  'whiteboard_canvas_discard',
] as const

const COMMENT_TOOLS = [
  'whiteboard_comment_create',
  'whiteboard_comment_reply',
  'whiteboard_comment_read',
  'whiteboard_comment_list',
  'whiteboard_comment_resolve',
  'whiteboard_comment_delete',
  'whiteboard_comment_move',
  'whiteboard_pin_set_state',
] as const

export function whiteboardToolCards(ui: ConcivUi): {name: string; render: ToolComponent}[] {
  const canvas = canvasCard(ui)
  const comment = commentCard(ui)
  return [
    ...CANVAS_TOOLS.map((name) => ({name, render: canvas})),
    ...COMMENT_TOOLS.map((name) => ({name, render: comment})),
    {name: 'whiteboard_element_reference', render: elementCard(ui)},
    {name: 'whiteboard_anchor_resolve', render: anchorCard(ui)},
  ]
}
