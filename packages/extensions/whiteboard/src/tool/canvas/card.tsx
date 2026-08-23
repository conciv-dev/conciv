import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {groupBy} from 'es-toolkit'
import Palette from 'lucide-solid/icons/palette'
import Trash2 from 'lucide-solid/icons/trash-2'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {
  CodeBlock,
  ErrorBlock,
  parseInput,
  parseResultMedia,
  resultText,
  ResultImage,
  ToolCard,
} from '@conciv/ui-kit-chat/tools'
import {failureOf, FieldRows, MonoLine, type Field} from '../card-util.js'

const DetailSchema = z
  .object({
    elements: z.union([z.array(z.unknown()), z.number()]).optional(),
    scope: z.string().optional(),
    pending: z.string().optional(),
    updated: z.boolean().optional(),
    deleted: z.string().optional(),
    cleared: z.number().optional(),
    committed: z.boolean().optional(),
    discarded: z.number().optional(),
    empty: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .loose()

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
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .loose()

type ParsedElement = z.infer<typeof ElementSkeleton>

const DESTRUCTIVE = new Set(['delete', 'clear'])

function elementCount(elements: unknown[] | number | undefined): number | null {
  if (typeof elements === 'number') return elements
  if (Array.isArray(elements)) return elements.length
  return null
}

function opOf(name: string): string {
  return name.startsWith('canvas.') ? name.slice('canvas.'.length) : name
}

type Detail = z.infer<typeof DetailSchema>

function countSummary(_part: ToolCardProps['part'], detail: Detail): string {
  const count = elementCount(detail.elements)
  return count === null ? '' : `${count} element${count === 1 ? '' : 's'}`
}

function previewSummary(part: ToolCardProps['part'], detail: Detail): string {
  return detail.empty ? 'draft is empty' : countSummary(part, detail)
}

function drawSummary(part: ToolCardProps['part']): string {
  const drawn = parseInput(DrawInput, part)?.elements.length
  return drawn === undefined ? 'to draft' : `${drawn} element${drawn === 1 ? '' : 's'} to draft`
}

function connectSummary(part: ToolCardProps['part']): string {
  const input = parseInput(ConnectInput, part)
  return input ? `${input.fromId} → ${input.toId}` : ''
}

function updateSummary(part: ToolCardProps['part'], detail: Detail): string {
  const target = parseInput(TargetInput, part)?.elementId ?? ''
  if (detail.updated === undefined) return target
  return detail.updated ? `updated ${target}` : `${target} not found`
}

function commitSummary(_part: ToolCardProps['part'], detail: Detail): string {
  if (detail.committed === undefined) return ''
  if (!detail.committed) return detail.reason ?? 'nothing to commit'
  return `${elementCount(detail.elements) ?? ''} published`.trim()
}

const SUMMARIES: Record<string, (part: ToolCardProps['part'], detail: Detail) => string> = {
  read: countSummary,
  export: countSummary,
  preview: previewSummary,
  draw: drawSummary,
  svg: () => 'svg to draft',
  diagram: () => 'mermaid to draft',
  connect: connectSummary,
  update: updateSummary,
  delete: (part) => parseInput(TargetInput, part)?.elementId ?? '',
  clear: (_part, detail) => (detail.cleared === undefined ? '' : `${detail.cleared} removed`),
  commit: commitSummary,
  discard: (_part, detail) => (detail.discarded === undefined ? '' : `${detail.discarded} discarded`),
}

function summarize(op: string, part: ToolCardProps['part'], detail: Detail): string {
  return SUMMARIES[op]?.(part, detail) ?? ''
}

function parseElements(elements: unknown[] | number | undefined): ParsedElement[] {
  if (!Array.isArray(elements)) return []
  return elements.flatMap((entry) => {
    const parsed = ElementSkeleton.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

function typeCountFields(elements: ParsedElement[]): Field[] {
  const named = elements.filter((element) => element.type !== undefined)
  if (named.length === 0) return []
  const byType = groupBy(named, (element) => element.type ?? 'unknown')
  return Object.entries(byType)
    .map(([type, group]) => ({type, count: group.length}))
    .toSorted((left, right) => right.count - left.count)
    .map((entry) => ({label: entry.type, value: String(entry.count)}))
}

function boundsField(elements: ParsedElement[]): Field | undefined {
  const points = elements.filter((element) => element.x !== undefined && element.y !== undefined)
  if (points.length === 0) return undefined
  const xs = points.map((element) => element.x as number)
  const ys = points.map((element) => element.y as number)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {label: 'bounds', value: `x ${minX}…${maxX} · y ${minY}…${maxY}`}
}

function structureFields(elements: unknown[] | number | undefined): Field[] {
  const parsed = parseElements(elements)
  const bounds = boundsField(parsed)
  return [...typeCountFields(parsed), ...(bounds ? [bounds] : [])]
}

function readExportFields(detail: Detail, summary: string): Field[] {
  const fields: Field[] = []
  if (detail.scope) fields.push({label: 'scope', value: detail.scope})
  if (summary) fields.push({label: 'elements', value: summary})
  return [...fields, ...structureFields(detail.elements)]
}

function drawFields(part: ToolCardProps['part'], summary: string): Field[] {
  const elements = parseInput(DrawInput, part)?.elements
  return [{label: 'draft', value: summary}, ...structureFields(elements)]
}

function commitFields(detail: Detail, summary: string): Field[] {
  const tone = detail.committed === false ? 'danger' : undefined
  return summary ? [{label: 'commit', value: summary, tone}] : []
}

function singleField(label: string, summary: string): Field[] {
  return summary ? [{label, value: summary}] : []
}

type OpFieldsHandler = (part: ToolCardProps['part'], detail: Detail, summary: string) => Field[]

const OP_FIELDS: Record<string, OpFieldsHandler> = {
  read: (_part, detail, summary) => readExportFields(detail, summary),
  export: (_part, detail, summary) => readExportFields(detail, summary),
  preview: (_part, _detail, summary) => singleField('draft', summary),
  draw: (part, _detail, summary) => drawFields(part, summary),
  connect: (_part, _detail, summary) => singleField('arrow', summary),
  update: (_part, _detail, summary) => singleField('target', summary),
  commit: (_part, detail, summary) => commitFields(detail, summary),
  discard: (_part, _detail, summary) => singleField('discard', summary),
}

function opFields(op: string, part: ToolCardProps['part'], detail: Detail): Field[] {
  const summary = summarize(op, part, detail)
  return OP_FIELDS[op]?.(part, detail, summary) ?? []
}

function CanvasIcon(): JSX.Element {
  return <Palette size={14} />
}

function DangerIcon(): JSX.Element {
  return <Trash2 size={14} />
}

function SourceBlock(props: {part: ToolCardProps['part']; op: string}): JSX.Element {
  const svg = () => (props.op === 'svg' ? parseInput(SvgInput, props.part)?.svg : undefined)
  const mermaid = () => (props.op === 'diagram' ? parseInput(DiagramInput, props.part)?.mermaid : undefined)
  return (
    <>
      <Show when={svg()}>
        {(source) => <CodeBlock size="xs" file={{name: 'draw.svg', lang: 'xml', contents: source()}} />}
      </Show>
      <Show when={mermaid()}>
        {(source) => <CodeBlock size="xs" file={{name: 'diagram.mmd', lang: 'mermaid', contents: source()}} />}
      </Show>
    </>
  )
}

export function CanvasOpCard(props: ToolCardProps): JSX.Element {
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
  const destructive = () => DESTRUCTIVE.has(op())
  return (
    <ToolCard
      Icon={destructive() ? DangerIcon : CanvasIcon}
      title={props.part.name}
      meta={summarize(op(), props.part, detail())}
      part={props.part}
      result={props.result}
      status={failure() ? 'error' : undefined}
    >
      <div class="flex flex-col gap-2 min-w-0">
        <Show
          when={destructive()}
          fallback={
            <>
              <FieldRows rows={opFields(op(), props.part, detail())} />
              <SourceBlock part={props.part} op={op()} />
            </>
          }
        >
          <MonoLine text={`${op()} ${summarize(op(), props.part, detail())}`.trim()} tone="danger" />
        </Show>
        <Show when={media().imageUrl}>{(imageUrl) => <ResultImage src={imageUrl()} alt={`canvas ${op()}`} />}</Show>
        <Show when={failure()}>
          {(error) => <ErrorBlock message={error().reason ? `${error().error} · ${error().reason}` : error().error} />}
        </Show>
      </div>
    </ToolCard>
  )
}
export const canvasOpCard: ToolCardView = {render: CanvasOpCard, hasEmbeddedBody: () => true}
