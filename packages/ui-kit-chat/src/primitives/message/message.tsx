import {createMemo, Index, Show, splitProps, type Component, type JSX, type ParentProps} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {MessagePart as Part, ThinkingPart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {Primitive, type Slottable} from '../util/primitive.js'
import {MessagePart} from '../message-part/message-part.js'
import {useChatContext} from '../../store/chat-context.js'
import {useToolCtx} from '../../store/tool-context.js'
import {groupSegments, type Segment} from '../../store/grouping.js'
import type {CompleteAttachment} from '../attachment/attachment-adapter.js'
import {AttachmentProvider} from '../attachment/attachment.js'
import {PartProvider, useMessage} from './message-context.js'

type DivProps = JSX.HTMLAttributes<HTMLDivElement> & Slottable<JSX.HTMLAttributes<HTMLDivElement>>

function Root(props: DivProps): JSX.Element {
  const message = useMessage()
  const chat = useChatContext()
  const [local, rest] = splitProps(props, ['onMouseEnter', 'onMouseLeave'])
  return (
    <Primitive.div
      data-role={message.message().role}
      data-message-id={message.message().key}
      onMouseEnter={(event) => {
        chat.setView('hovering', message.message().key)
        if (typeof local.onMouseEnter === 'function') local.onMouseEnter(event)
      }}
      onMouseLeave={(event) => {
        chat.setView('hovering', null)
        if (typeof local.onMouseLeave === 'function') local.onMouseLeave(event)
      }}
      {...rest}
    />
  )
}

export type PartsComponents = {
  Text?: Component<{part: Extract<Part, {type: 'text'}>}>
  Thinking?: Component<{part: ThinkingPart}>
  Image?: Component<{part: Extract<Part, {type: 'image'}>}>
  StructuredOutput?: Component<{part: Extract<Part, {type: 'structured-output'}>}>
  tools?: {entries?: ToolCardEntry[]; Fallback?: ToolUIComponent} | {Override: ToolUIComponent}
  Empty?: Component
}

type PartsProps =
  | {components?: PartsComponents; children?: never}
  | {children: (part: () => Part, index: () => number) => JSX.Element; components?: never}

function resolveToolComponent(part: ToolCallPart, tools: PartsComponents['tools']): ToolUIComponent | null {
  if (!tools) return null
  if ('Override' in tools) return tools.Override
  const entry = tools.entries?.find((candidate) => candidate.names.includes(part.name))
  return entry?.render ?? tools.Fallback ?? null
}

function Parts(props: PartsProps): JSX.Element {
  const message = useMessage()
  const ctx = useToolCtx()
  const renderChildren = 'children' in props ? props.children : undefined
  const components = 'components' in props ? (props.components ?? {}) : {}
  return (
    <Index each={message.message().parts}>
      {(part, index) => (
        <PartProvider value={{part, index: () => index}}>
          <Show when={renderChildren} fallback={<DispatchPart part={part} components={components} ctx={ctx} />}>
            {(render) => render()(part, () => index)}
          </Show>
        </PartProvider>
      )}
    </Index>
  )
}

function DispatchPart(props: {
  part: () => Part
  components: PartsComponents
  ctx: ReturnType<typeof useToolCtx>
}): JSX.Element {
  const message = useMessage()
  const part = props.part
  const components = props.components
  const isHiddenResult = () => {
    const value = part()
    return value.type === 'tool-result' && message.pairing().hiddenResultIds.has(value.toolCallId)
  }
  const asText = () => {
    const value = part()
    return value.type === 'text' ? value : null
  }
  const asThinking = () => {
    const value = part()
    return value.type === 'thinking' ? value : null
  }
  const asImage = () => {
    const value = part()
    return value.type === 'image' ? value : null
  }
  const asStructured = () => {
    const value = part()
    return value.type === 'structured-output' ? value : null
  }
  const asToolCall = () => {
    const value = part()
    return value.type === 'tool-call' ? value : null
  }
  return (
    <Show when={!isHiddenResult()} fallback={null}>
      <Show when={asText()} keyed>
        {(text) => (components.Text ? <Dynamic component={components.Text} part={text} /> : <MessagePart.Text />)}
      </Show>
      <Show when={asThinking()} keyed>
        {(thinking) =>
          components.Thinking ? (
            <Dynamic component={components.Thinking} part={thinking} />
          ) : (
            <span>{thinking.content}</span>
          )
        }
      </Show>
      <Show when={asImage()} keyed>
        {(image) => (components.Image ? <Dynamic component={components.Image} part={image} /> : <MessagePart.Image />)}
      </Show>
      <Show when={asStructured()} keyed>
        {(structured) => (
          <Show when={components.StructuredOutput}>{(c) => <Dynamic component={c()} part={structured} />}</Show>
        )}
      </Show>
      <Show when={asToolCall()} keyed>
        {(toolCall) => (
          <Show when={resolveToolComponent(toolCall, components.tools)}>
            {(render) => (
              <Dynamic
                component={render()}
                part={toolCall}
                result={message.pairing().byCallId.get(toolCall.id)}
                ctx={props.ctx}
              />
            )}
          </Show>
        )}
      </Show>
    </Show>
  )
}

type PartByIndexProps = {index: number; components?: PartsComponents}

function PartByIndex(props: PartByIndexProps): JSX.Element {
  const message = useMessage()
  const ctx = useToolCtx()
  const part = () => message.message().parts[props.index]
  return (
    <Show when={part()} keyed>
      {(value) => (
        <PartProvider value={{part: () => value, index: () => props.index}}>
          <DispatchPart part={() => value} components={props.components ?? {}} ctx={ctx} />
        </PartProvider>
      )}
    </Show>
  )
}

type IfConditions = {
  user?: boolean
  assistant?: boolean
  system?: boolean
  hasContent?: boolean
  last?: boolean
  lastOrHover?: boolean
  hasAttachments?: boolean
}

function matchesIf(conditions: IfConditions, message: ReturnType<typeof useMessage>, hovering: string | null): boolean {
  const turn = message.message()
  const checks: boolean[] = []
  if (conditions.user !== undefined) checks.push((turn.role === 'user') === conditions.user)
  if (conditions.assistant !== undefined) checks.push((turn.role === 'assistant') === conditions.assistant)
  if (conditions.system !== undefined) checks.push((turn.role === 'system') === conditions.system)
  if (conditions.hasContent !== undefined) checks.push(turn.parts.length > 0 === conditions.hasContent)
  if (conditions.last !== undefined) checks.push(message.isLast() === conditions.last)
  if (conditions.lastOrHover !== undefined) {
    checks.push((message.isLast() || hovering === turn.key) === conditions.lastOrHover)
  }
  if (conditions.hasAttachments !== undefined) {
    const has = turn.parts.some((part) => part.type === 'image' || part.type === 'document')
    checks.push(has === conditions.hasAttachments)
  }
  return checks.every(Boolean)
}

function If(props: ParentProps<IfConditions>): JSX.Element {
  const message = useMessage()
  const chat = useChatContext()
  const [conditions, rest] = splitProps(props, [
    'user',
    'assistant',
    'system',
    'hasContent',
    'last',
    'lastOrHover',
    'hasAttachments',
  ])
  return <Show when={matchesIf(conditions, message, chat.view.hovering)}>{rest.children}</Show>
}

function MessageError(props: ParentProps): JSX.Element {
  const chat = useChatContext()
  const message = useMessage()
  return (
    <Show when={message.isLast() && message.message().role === 'assistant' && chat.error()}>
      {(error) => <div role="alert">{props.children ?? String(error().message)}</div>}
    </Show>
  )
}

type AttachmentsComponents = {
  Image?: Component
  Document?: Component
  Audio?: Component
  Video?: Component
  File?: Component
  Attachment?: Component
}

type AttachmentPart = Extract<Part, {type: 'image' | 'document' | 'audio' | 'video'}>

function isAttachmentPart(part: Part): part is AttachmentPart {
  return part.type === 'image' || part.type === 'document' || part.type === 'audio' || part.type === 'video'
}

function attachmentName(part: AttachmentPart, index: number): string {
  const source = part.source
  if (source.type === 'url') {
    const tail = source.value.split('/').pop()
    if (tail) return tail
  }
  return `${part.type}-${index + 1}`
}

function partToAttachment(part: AttachmentPart, index: number): CompleteAttachment {
  return {
    id: `attachment-${index}`,
    type: part.type,
    name: attachmentName(part, index),
    content: [part],
    status: {type: 'complete'},
  }
}

function attachmentPart(attachment: CompleteAttachment): AttachmentPart {
  return attachment.content[0] as AttachmentPart
}

function attachmentComponent(part: AttachmentPart, components: AttachmentsComponents): Component | undefined {
  if (part.type === 'image') return components.Image ?? components.Attachment
  if (part.type === 'document') return components.Document ?? components.File ?? components.Attachment
  if (part.type === 'audio') return components.Audio ?? components.Attachment
  return components.Video ?? components.Attachment
}

function Attachments(props: {components: AttachmentsComponents}): JSX.Element {
  const message = useMessage()
  const attachments = createMemo(() =>
    message
      .message()
      .parts.filter(isAttachmentPart)
      .map((part, index) => partToAttachment(part, index)),
  )
  return (
    <Index each={attachments()}>
      {(attachment) => (
        <Show when={attachmentComponent(attachmentPart(attachment()), props.components)}>
          {(component) => (
            <AttachmentProvider value={attachment()}>
              <Dynamic component={component()} />
            </AttachmentProvider>
          )}
        </Show>
      )}
    </Index>
  )
}

function AttachmentByIndex(props: {index: number; components: AttachmentsComponents}): JSX.Element {
  const message = useMessage()
  const attachment = () => {
    const parts = message.message().parts.filter(isAttachmentPart)
    const part = parts[props.index]
    return part ? partToAttachment(part, props.index) : undefined
  }
  return (
    <Show when={attachment()} keyed>
      {(value) => (
        <Show when={attachmentComponent(attachmentPart(value), props.components)}>
          {(component) => (
            <AttachmentProvider value={value}>
              <Dynamic component={component()} />
            </AttachmentProvider>
          )}
        </Show>
      )}
    </Show>
  )
}

type GroupedComponents = PartsComponents & {Group?: Component<ParentProps<{indices: number[]; kind: Segment['kind']}>>}

function segmentIndices(segment: Segment): number[] {
  return segment.kind === 'chain' ? segment.indices : [segment.index]
}

function GroupBody(props: {
  indices: number[]
  components: GroupedComponents
  ctx: ReturnType<typeof useToolCtx>
}): JSX.Element {
  const message = useMessage()
  return (
    <Index each={props.indices}>
      {(partIndex) => (
        <Show when={message.message().parts[partIndex()]} keyed>
          {(value) => (
            <PartProvider value={{part: () => value, index: partIndex}}>
              <DispatchPart part={() => value} components={props.components} ctx={props.ctx} />
            </PartProvider>
          )}
        </Show>
      )}
    </Index>
  )
}

function GroupedParts(props: {components?: GroupedComponents}): JSX.Element {
  const message = useMessage()
  const ctx = useToolCtx()
  const components = props.components ?? {}
  const segments = createMemo(() => groupSegments(message.message().parts))
  return (
    <Index each={segments()}>
      {(segment) => (
        <Show
          when={components.Group}
          fallback={<GroupBody indices={segmentIndices(segment())} components={components} ctx={ctx} />}
        >
          {(group) => (
            <Dynamic component={group()} indices={segmentIndices(segment())} kind={segment().kind}>
              <GroupBody indices={segmentIndices(segment())} components={components} ctx={ctx} />
            </Dynamic>
          )}
        </Show>
      )}
    </Index>
  )
}

export const Message = Object.assign(Root, {
  Root,
  Parts,
  PartByIndex,
  Attachments,
  AttachmentByIndex,
  Unstable_PartsGrouped: GroupedParts,
  If,
  Error: MessageError,
})
