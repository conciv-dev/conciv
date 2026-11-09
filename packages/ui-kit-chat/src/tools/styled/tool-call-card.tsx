import {createMemo, createSignal, Show, splitProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {isEqual} from 'es-toolkit'
import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {
  ToolCardEntry,
  ToolCardProps,
  ToolCardView,
  ToolUIComponent,
  ToolViewCtx,
} from '@conciv/protocol/tool-view-types'
import {ToolFallback} from './tool-fallback.js'
import {
  genericRowProjection,
  headerRowProjection,
  type EmbeddedCardHeader,
  type ToolRowProjection,
} from '../primitives/tool-row.js'
import {MetaToolCard, metaToolHasEmbeddedBody} from './meta-tool-card.js'
import {toolFallbackHasEmbeddedBody} from './tool-fallback.js'
import {PermissionCard} from './permission-card.js'
import {CardChromeProvider, ToolDurationProvider, useEmbeddedCard, type EmbeddedHeaderChannel} from './card-chrome.js'
import {TraceToolRow} from '../../styled/trace/trace-row.js'
import {TraceBodyFrame, type TraceOutputTone} from '../../styled/trace/output-block.js'
import {TracePermissionBlock} from '../../styled/trace/permission-block.js'

export type ToolCallCardProps = Omit<ToolCardProps, 'addResult'> & {
  tools?: () => ToolCardEntry[]

  fallback?: ToolCardView
}

export type CardBodyQuery = {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
  tools: readonly ToolCardEntry[]
  fallback: ToolCardView | undefined
}

export function cardRendersEmbeddedBody(query: CardBodyQuery): boolean {
  const entry = query.tools.find((candidate) => candidate.names.includes(query.part.name))
  if (entry) return entry.hasEmbeddedBody(query.part, query.result, query.ctx)
  if (query.ctx.catalog.meta(query.part.name)) return metaToolHasEmbeddedBody(query.part, query.result, query.ctx)
  const fallback = query.fallback?.hasEmbeddedBody ?? toolFallbackHasEmbeddedBody
  return fallback(query.part, query.result, query.ctx)
}

export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const declared = () => props.ctx.catalog.meta(props.part.name)
  const embedded = useEmbeddedCard()
  const matched = () => matchedEntry(props.tools?.(), props.part.name)
  const ownsApproval = () => !embedded() && (matched() !== undefined || declared() !== undefined)
  const duration = (): number | undefined => props.durationMs
  return (
    <ToolDurationProvider value={duration}>
      <ToolCardView {...props} />
      <Show when={ownsApproval()}>
        <PermissionCard part={props.part} ctx={props.ctx} />
      </Show>
    </ToolDurationProvider>
  )
}

function matchedEntry(tools: ToolCardEntry[] | undefined, name: string): ToolCardEntry | undefined {
  return tools?.find((entry) => entry.names.includes(name))
}

function ToolCardView(props: ToolCallCardProps): JSX.Element {
  const render = (): ToolUIComponent => {
    const card = matchedEntry(props.tools?.(), props.part.name)?.render
    if (card) return card
    if (props.ctx.catalog.meta(props.part.name)) return MetaToolCard
    return props.fallback?.render ?? ToolFallback
  }
  return (
    <Dynamic
      component={render()}
      part={props.part}
      result={props.result}
      ctx={props.ctx}
      addResult={(value) => props.ctx.addResult(props.part.id, value)}
      durationMs={props.durationMs}
      capture={props.ctx.captureFor?.(props.part.id)}
    />
  )
}

export type ToolTraceRowProps = ToolCallCardProps & {ring?: boolean}

const OutsideMarkerSchema = z.object({conciv: z.object({origin: z.literal('hub'), client: z.string().nullable()})})

export function ToolTraceRow(props: ToolTraceRowProps): JSX.Element {
  const [local] = splitProps(props, ['part', 'result', 'ctx', 'tools', 'fallback', 'durationMs', 'ring'])
  const [cardHeader, setCardHeader] = createSignal<{read: () => EmbeddedCardHeader}>()
  const publishHeader: EmbeddedHeaderChannel = (read) => {
    const published = {read}
    setCardHeader(published)
    return () => setCardHeader((current) => (current === published ? undefined : current))
  }
  const projection = createMemo(
    (): ToolRowProjection => {
      const rowProps = {part: local.part, result: local.result, ctx: local.ctx}
      const published = cardHeader()
      return published ? headerRowProjection(published.read(), rowProps) : genericRowProjection(rowProps)
    },
    undefined,
    {equals: isEqual},
  )
  const tag = createMemo(() => outsideTag(local.part))
  const rowLine = () => `${projection().target} ${projection().meta ?? ''}`
  const asked = () => local.part.approval !== undefined && local.ctx.respondApproval !== undefined
  const bodyTone = (): TraceOutputTone => (projection().mark === 'fail' ? 'error' : 'normal')
  const embeddedCard = (): JSX.Element => (
    <CardChromeProvider
      value="embedded"
      headerChannel={publishHeader}
      rowLine={rowLine}
      duration={() => local.durationMs}
    >
      <ToolCardView
        part={local.part}
        result={local.result}
        ctx={local.ctx}
        durationMs={local.durationMs}
        tools={local.tools}
        fallback={local.fallback}
      />
    </CardChromeProvider>
  )
  const framed = createMemo(() =>
    cardRendersEmbeddedBody({
      part: local.part,
      result: local.result,
      ctx: local.ctx,
      tools: local.tools?.() ?? [],
      fallback: local.fallback,
    }),
  )
  const cardBody = (): JSX.Element => (
    <TraceBodyFrame tone={bodyTone()} chrome={framed()}>
      {embeddedCard()}
    </TraceBodyFrame>
  )
  return (
    <>
      <TraceToolRow
        projection={projection()}
        ring={local.ring ?? true}
        body={cardBody}
        foldable={framed()}
        tag={tag()}
      />
      <Show when={asked()}>
        <TracePermissionBlock
          part={local.part}
          ctx={local.ctx}
          target={projection().target}
          explanation={local.ctx.catalog.meta(local.part.name)?.summary}
        />
      </Show>
    </>
  )
}

function outsideTag(part: ToolCallPart): string | undefined {
  const marker = OutsideMarkerSchema.safeParse(part.metadata)
  if (!marker.success) return undefined
  return `from ${marker.data.conciv.client ?? 'outside agent'}`
}
