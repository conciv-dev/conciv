import {createMemo, createSignal, Show, splitProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {ToolFallback} from './tool-fallback.js'
import {ToolDurationProvider} from '../primitives/tool-duration.js'
import {
  genericRowProjection,
  headerRowProjection,
  type EmbeddedCardHeader,
  type ToolRowProjection,
} from '../primitives/tool-row.js'
import {resultText} from '../primitives/tool-util.js'
import {MetaToolCard} from './meta-tool-card.js'
import {PermissionCard} from './permission-card.js'
import {CardChromeProvider, useEmbeddedCard, type EmbeddedHeaderChannel} from './card-chrome.js'
import {TraceToolRow} from '../../styled/trace/trace-row.js'
import {TraceBodyFrame, type TraceOutputTone} from '../../styled/trace/output-block.js'
import {TracePermissionBlock} from '../../styled/trace/permission-block.js'

export type ToolCallCardProps = Omit<ToolCardProps, 'addResult'> & {
  tools?: () => ToolCardEntry[]

  fallback?: ToolUIComponent
}

export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const matched = () => props.tools?.().find((entry) => entry.names.includes(props.part.name))
  const declared = () => props.ctx.catalog.meta(props.part.name)
  const render = (): ToolUIComponent => {
    const card = matched()?.render
    if (card) return card
    if (declared()) return MetaToolCard
    return props.fallback ?? ToolFallback
  }
  const embedded = useEmbeddedCard()
  const ownsApproval = () => !embedded() && (matched() !== undefined || declared() !== undefined)
  const duration = (): number | undefined => props.durationMs
  return (
    <ToolDurationProvider value={duration}>
      <Dynamic
        component={render()}
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        addResult={(value) => props.ctx.addResult(props.part.id, value)}
        durationMs={props.durationMs}
        capture={props.ctx.captureFor?.(props.part.id)}
      />
      <Show when={ownsApproval()}>
        <PermissionCard part={props.part} ctx={props.ctx} />
      </Show>
    </ToolDurationProvider>
  )
}

export type ToolTraceRowProps = ToolCallCardProps & {ring?: boolean}

function hasArguments(part: ToolCallCardProps['part']): boolean {
  const text = (part.arguments ?? '').trim()
  return text.length > 0 && text !== '{}'
}

function hasEmbeddedBody(
  entry: ToolCardEntry | undefined,
  part: ToolCallCardProps['part'],
  result: ToolCallCardProps['result'],
): boolean {
  const declared = entry?.hasEmbeddedBody
  if (declared) return declared(part, result)
  return hasArguments(part) || resultText(result).length > 0
}

export function ToolTraceRow(props: ToolTraceRowProps): JSX.Element {
  const [local] = splitProps(props, ['part', 'result', 'ctx', 'tools', 'fallback', 'durationMs', 'ring'])
  const [cardHeader, setCardHeader] = createSignal<{read: () => EmbeddedCardHeader}>()
  const publishHeader: EmbeddedHeaderChannel = (read) => {
    const published = {read}
    setCardHeader(published)
    return () => setCardHeader((current) => (current === published ? undefined : current))
  }
  const projection = createMemo<ToolRowProjection>(() => {
    const rowProps = {part: local.part, result: local.result, ctx: local.ctx}
    const published = cardHeader()
    return published ? headerRowProjection(published.read(), rowProps) : genericRowProjection(rowProps)
  })
  const rowLine = () => `${projection().target} ${projection().meta ?? ''}`
  const asking = () =>
    local.part.state === 'approval-requested' &&
    local.part.approval !== undefined &&
    local.ctx.respondApproval !== undefined
  const bodyTone = (): TraceOutputTone => (projection().mark === 'fail' ? 'error' : 'normal')
  const embeddedCard = (): JSX.Element => (
    <CardChromeProvider value="embedded" headerChannel={publishHeader} rowLine={rowLine}>
      <ToolCallCard
        part={local.part}
        result={local.result}
        ctx={local.ctx}
        durationMs={local.durationMs}
        tools={local.tools}
        fallback={local.fallback}
      />
    </CardChromeProvider>
  )
  const cardBody = (): JSX.Element => <TraceBodyFrame tone={bodyTone()}>{embeddedCard()}</TraceBodyFrame>
  const matched = () => local.tools?.().find((entry) => entry.names.includes(local.part.name))
  const framed = () => hasEmbeddedBody(matched(), local.part, local.result)
  const headerOnly = () => matched()?.hasEmbeddedBody !== undefined && !framed()
  return (
    <>
      <TraceToolRow projection={projection()} ring={local.ring ?? true} body={framed() ? cardBody : undefined} />
      <Show when={headerOnly()}>{embeddedCard()}</Show>
      <Show when={asking()}>
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
