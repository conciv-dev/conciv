import {Show, type JSX} from 'solid-js'

export type TraceJoint = 'junction' | 'line' | 'corner'

const SPINE_X = '[inset-inline-start:calc(var(--chat-trace-gutter)/2)]'
const ARM_WIDTH = 'w-[calc(var(--chat-trace-gutter)/2)]'
const MID = '[inset-block-start:calc(var(--chat-trace-gutter)/2_-_0.5px)]'
const CORNER_HEIGHT = 'h-[calc(var(--chat-trace-gutter)/2_+_0.5px)]'

const VERTICAL = `pointer-events-none absolute ${SPINE_X} [inset-block-start:0] [inset-block-end:0] w-px [background:var(--chat-glyph)]`
const ARM = `pointer-events-none absolute ${SPINE_X} ${MID} ${ARM_WIDTH} h-px [background:var(--chat-glyph)]`
const CORNER = `pointer-events-none absolute ${SPINE_X} [inset-block-start:0] ${ARM_WIDTH} ${CORNER_HEIGHT} [border-inline-start:1px_solid_var(--chat-glyph)] [border-block-end:1px_solid_var(--chat-glyph)] [border-end-start-radius:3px]`

export const TRACE_LINE = 'relative flex items-center gap-[9px] min-w-0 h-[var(--chat-trace-gutter)]'
export const TRACE_INDENT = 'ps-[var(--chat-trace-gutter)]'
export const TRACE_HOVER_INDENT = '-mx-2 px-2 ps-[calc(var(--chat-trace-gutter)+0.5rem)]'

export function TraceConnector(props: {joint: TraceJoint}): JSX.Element {
  return (
    <Show when={props.joint !== 'corner'} fallback={<span aria-hidden="true" class={CORNER} />}>
      <span aria-hidden="true" class={VERTICAL} />
      <Show when={props.joint === 'junction'}>
        <span aria-hidden="true" class={ARM} />
      </Show>
    </Show>
  )
}
