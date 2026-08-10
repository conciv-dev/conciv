import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Palette, Trash2} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, ErrorBlock, parseInput, parseResultMedia, ResultImage, ToolCard} from '@conciv/ui-kit-chat/tools'
import {failureOf} from '../card-util.js'

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

function CanvasIcon(): JSX.Element {
  return <Palette size={14} />
}

function DangerIcon(): JSX.Element {
  return <Trash2 size={14} />
}

export function CanvasOpCard(props: ToolCardProps): JSX.Element {
  const op = () => opOf(props.part.name)
  const media = () => parseResultMedia(props.result)
  const detail = () => {
    const parsed = DetailSchema.safeParse(media().json)
    return parsed.success ? parsed.data : {}
  }
  const failure = () => failureOf(media().json)
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
      <div class="flex flex-col gap-2">
        <Show when={destructive()}>
          <div class="flex">
            <Chip kind="pill" tone="danger" value={`${op()} ${summarize(op(), props.part, detail())}`.trim()} />
          </div>
        </Show>
        <Show when={media().imageUrl}>{(imageUrl) => <ResultImage src={imageUrl()} alt={`canvas ${op()}`} />}</Show>
        <Show when={!media().imageUrl && !destructive() && summarize(op(), props.part, detail())}>
          {(text) => (
            <div class="flex">
              <Chip kind="pill" value={text()} />
            </div>
          )}
        </Show>
        <Show when={failure()}>
          {(error) => <ErrorBlock message={error().reason ? `${error().error} · ${error().reason}` : error().error} />}
        </Show>
      </div>
    </ToolCard>
  )
}
