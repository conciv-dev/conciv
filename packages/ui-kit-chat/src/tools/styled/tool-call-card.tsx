import {createMemo, Show, splitProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardEntry, ToolCardProps, ToolRowProjection, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {ToolFallback} from './tool-fallback.js'
import {ToolDurationProvider} from '../primitives/tool-duration.js'
import {genericRowProjection} from '../primitives/tool-row.js'
import {resultText} from '../primitives/tool-util.js'
import {MetaToolCard} from './meta-tool-card.js'
import {PermissionCard} from './permission-card.js'
import {CardChromeProvider, useEmbeddedCard} from './card-chrome.js'
import {TraceToolRow} from '../../styled/trace/trace-row.js'
import {TraceBodyFrame} from '../../styled/trace/output-block.js'
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

export type ToolTraceRowProps = ToolCallCardProps & {last?: boolean; ring?: boolean}

function hasArguments(part: ToolCallCardProps['part']): boolean {
  const text = (part.arguments ?? '').trim()
  return text.length > 0 && text !== '{}'
}

export function ToolTraceRow(props: ToolTraceRowProps): JSX.Element {
  const [local] = splitProps(props, ['part', 'result', 'ctx', 'tools', 'fallback', 'durationMs', 'last', 'ring'])
  const matched = () => local.tools?.().find((entry) => entry.names.includes(local.part.name))
  const projection = createMemo<ToolRowProjection>(() => {
    const rowProps = {part: local.part, result: local.result, ctx: local.ctx}
    const project = matched()?.row
    return project ? project(rowProps) : genericRowProjection(rowProps)
  })
  const asking = () => local.part.approval !== undefined && local.ctx.respondApproval !== undefined
  const cardBody = (): JSX.Element => (
    <TraceBodyFrame>
      <CardChromeProvider value="embedded">
        <ToolCallCard
          part={local.part}
          result={local.result}
          ctx={local.ctx}
          durationMs={local.durationMs}
          tools={local.tools}
          fallback={local.fallback}
        />
      </CardChromeProvider>
    </TraceBodyFrame>
  )
  const body = (): (() => JSX.Element) | undefined =>
    hasArguments(local.part) || resultText(local.result).length > 0 ? cardBody : undefined
  return (
    <>
      <TraceToolRow projection={projection()} last={local.last ?? false} ring={local.ring ?? true} body={body()} />
      <Show when={asking()}>
        <TracePermissionBlock
          part={local.part}
          ctx={local.ctx}
          target={projection().target}
          explanation={local.ctx.catalog.meta(local.part.name)?.summary}
          last={local.last ?? false}
        />
      </Show>
    </>
  )
}
