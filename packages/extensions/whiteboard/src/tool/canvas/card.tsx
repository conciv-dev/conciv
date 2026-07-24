import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Palette, Trash2} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseInput, ToolCard} from '@conciv/ui-kit-chat'
import {ToolChip} from '@conciv/ui-kit-chat-tools'
import {failureOf, toolPayload} from '../card-util.js'

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

function countSummary(_props: ToolCardProps, detail: Detail): string {
  const count = elementCount(detail.elements)
  return count === null ? '' : `${count} element${count === 1 ? '' : 's'}`
}

function previewSummary(props: ToolCardProps, detail: Detail): string {
  return detail.empty ? 'draft is empty' : countSummary(props, detail)
}

function drawSummary(props: ToolCardProps): string {
  const drawn = parseInput(DrawInput, props.part)?.elements.length
  return drawn === undefined ? 'to draft' : `${drawn} element${drawn === 1 ? '' : 's'} to draft`
}

function connectSummary(props: ToolCardProps): string {
  const input = parseInput(ConnectInput, props.part)
  return input ? `${input.fromId} → ${input.toId}` : ''
}

function updateSummary(props: ToolCardProps, detail: Detail): string {
  const target = parseInput(TargetInput, props.part)?.elementId ?? ''
  if (detail.updated === undefined) return target
  return detail.updated ? `updated ${target}` : `${target} not found`
}

function commitSummary(_props: ToolCardProps, detail: Detail): string {
  if (detail.committed === undefined) return ''
  if (!detail.committed) return detail.reason ?? 'nothing to commit'
  return `${elementCount(detail.elements) ?? ''} published`.trim()
}

const SUMMARIES: Record<string, (props: ToolCardProps, detail: Detail) => string> = {
  read: countSummary,
  export: countSummary,
  preview: previewSummary,
  draw: drawSummary,
  svg: () => 'svg to draft',
  diagram: () => 'mermaid to draft',
  connect: connectSummary,
  update: updateSummary,
  delete: (props) => parseInput(TargetInput, props.part)?.elementId ?? '',
  clear: (_props, detail) => (detail.cleared === undefined ? '' : `${detail.cleared} removed`),
  commit: commitSummary,
  discard: (_props, detail) => (detail.discarded === undefined ? '' : `${detail.discarded} discarded`),
}

function summarize(op: string, props: ToolCardProps, detail: Detail): string {
  return SUMMARIES[op]?.(props, detail) ?? ''
}

function CanvasIcon(): JSX.Element {
  return <Palette size={14} />
}

function DangerIcon(): JSX.Element {
  return <Trash2 size={14} />
}

export function CanvasOpCard(props: ToolCardProps): JSX.Element {
  const op = () => opOf(props.part.name)
  const payload = () => toolPayload(props.result)
  const detail = () => {
    const parsed = DetailSchema.safeParse(payload().detail)
    return parsed.success ? parsed.data : {}
  }
  const failure = () => failureOf(payload().detail)
  const destructive = () => DESTRUCTIVE.has(op())
  return (
    <ToolCard
      Icon={destructive() ? DangerIcon : CanvasIcon}
      title={props.part.name}
      meta={summarize(op(), props, detail())}
      part={props.part}
      result={props.result}
      status={failure() ? 'error' : undefined}
    >
      <div class="flex flex-col gap-2">
        <Show when={destructive()}>
          <div class="flex">
            <ToolChip name={`${op()} ${summarize(op(), props, detail())}`.trim()} tone="bad" />
          </div>
        </Show>
        <Show when={payload().image}>
          {(image) => (
            <img
              src={`data:${image().mimeType};base64,${image().value}`}
              alt={`canvas ${op()}`}
              class="max-h-60 max-w-full self-start rounded-[var(--chat-radius-sm)] [border:1px_solid_var(--chat-line)]"
            />
          )}
        </Show>
        <Show when={!payload().image && !destructive() && summarize(op(), props, detail())}>
          {(text) => (
            <div class="flex">
              <ToolChip name={text()} />
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
