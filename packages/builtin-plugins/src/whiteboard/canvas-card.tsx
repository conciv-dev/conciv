import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {groupBy} from 'es-toolkit'
import Palette from 'lucide-solid/icons/palette'
import Trash2 from 'lucide-solid/icons/trash'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {CodeBlock, ErrorBlock, parseInput, parseResultMedia, ResultImage, ToolCard} from '@conciv/ui-kit-chat/tools'
import {countLabel} from '../page/cards/shared.js'
import {failureMessage, FieldRows, MonoLine, readFailure, type Field} from './card-shared.js'

const DetailSchema = z
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

type Detail = z.infer<typeof DetailSchema>

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

const DESTRUCTIVE: ReadonlyArray<string> = ['delete', 'clear']

function readOperation(name: string): string {
  return name.startsWith(CANVAS_TOOL_PREFIX) ? name.slice(CANVAS_TOOL_PREFIX.length) : name
}

function elementCount(elements: Detail['elements']): number | null {
  if (typeof elements === 'number') return elements
  if (Array.isArray(elements)) return elements.length
  return null
}

function elementsLabel(count: number): string {
  return countLabel(count, 'element', 'elements')
}

function countSummary(_part: ToolCardProps['part'], detail: Detail): string {
  const count = elementCount(detail.elements)
  return count === null ? '' : elementsLabel(count)
}

function previewSummary(part: ToolCardProps['part'], detail: Detail): string {
  return detail.empty ? 'draft is empty' : countSummary(part, detail)
}

function drawSummary(part: ToolCardProps['part']): string {
  const drawn = parseInput(DrawInput, part)?.elements.length
  return drawn === undefined ? 'to draft' : `${elementsLabel(drawn)} to draft`
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

function summarize(operation: string, part: ToolCardProps['part'], detail: Detail): string {
  return SUMMARIES[operation]?.(part, detail) ?? ''
}

function parseElements(elements: Detail['elements']): ParsedElement[] {
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

function structureFields(elements: Detail['elements']): Field[] {
  const parsed = parseElements(elements)
  return [...typeCountFields(parsed), ...boundsFields(parsed)]
}

function readExportFields(detail: Detail, summary: string): Field[] {
  const scope = detail.scope ? [{label: 'scope', value: detail.scope}] : []
  const count = summary ? [{label: 'elements', value: summary}] : []
  return [...scope, ...count, ...structureFields(detail.elements)]
}

function drawFields(part: ToolCardProps['part'], summary: string): Field[] {
  return [{label: 'draft', value: summary}, ...structureFields(parseInput(DrawInput, part)?.elements)]
}

function commitFields(detail: Detail, summary: string): Field[] {
  return summary ? [{label: 'commit', value: summary, tone: detail.committed === false ? 'danger' : 'default'}] : []
}

function singleField(label: string, summary: string): Field[] {
  return summary ? [{label, value: summary}] : []
}

const OPERATION_FIELDS: Record<string, (part: ToolCardProps['part'], detail: Detail, summary: string) => Field[]> = {
  read: (_part, detail, summary) => readExportFields(detail, summary),
  export: (_part, detail, summary) => readExportFields(detail, summary),
  preview: (_part, _detail, summary) => singleField('draft', summary),
  draw: (part, _detail, summary) => drawFields(part, summary),
  connect: (_part, _detail, summary) => singleField('arrow', summary),
  update: (_part, _detail, summary) => singleField('target', summary),
  commit: (_part, detail, summary) => commitFields(detail, summary),
  discard: (_part, _detail, summary) => singleField('discard', summary),
}

function operationFields(operation: string, part: ToolCardProps['part'], detail: Detail): Field[] {
  return OPERATION_FIELDS[operation]?.(part, detail, summarize(operation, part, detail)) ?? []
}

function CanvasIcon(): JSX.Element {
  return <Palette size={14} />
}

function DangerIcon(): JSX.Element {
  return <Trash2 size={14} />
}

function SourceBlock(props: {part: ToolCardProps['part']; operation: string}): JSX.Element {
  const svg = () => (props.operation === 'svg' ? parseInput(SvgInput, props.part)?.svg : undefined)
  const mermaid = () => (props.operation === 'diagram' ? parseInput(DiagramInput, props.part)?.mermaid : undefined)
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

function CanvasOperationCard(props: ToolCardProps): JSX.Element {
  const operation = () => readOperation(props.part.name)
  const media = () => parseResultMedia(props.result)
  const detail = (): Detail => {
    const parsed = DetailSchema.safeParse(media().json)
    return parsed.success ? parsed.data : {}
  }
  const failure = () => readFailure(props.result)
  const destructive = () => DESTRUCTIVE.includes(operation())
  const summary = () => summarize(operation(), props.part, detail())
  return (
    <ToolCard
      Icon={destructive() ? DangerIcon : CanvasIcon}
      title={props.part.name}
      meta={summary()}
      part={props.part}
      result={props.result}
      status={failure() ? 'error' : undefined}
    >
      <div class="flex flex-col gap-2 min-w-0">
        <Show
          when={destructive()}
          fallback={
            <>
              <FieldRows rows={operationFields(operation(), props.part, detail())} />
              <SourceBlock part={props.part} operation={operation()} />
            </>
          }
        >
          <MonoLine text={`${operation()} ${summary()}`.trim()} tone="danger" />
        </Show>
        <Show when={media().imageUrl}>
          {(imageUrl) => <ResultImage src={imageUrl()} alt={`canvas ${operation()}`} />}
        </Show>
        <Show when={failure()}>{(error) => <ErrorBlock message={failureMessage(error())} />}</Show>
      </div>
    </ToolCard>
  )
}

export const canvasCard: ToolCardView = {render: CanvasOperationCard, hasEmbeddedBody: () => true}
