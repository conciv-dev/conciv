import {Show, splitProps, type Accessor, type JSX, type ValidComponent} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {MessagePart as Part} from '@tanstack/ai-client'
import {Primitive, type Slottable} from '../util/primitive.js'
import {usePart} from '../message/message-context.js'

type TextPart = Extract<Part, {type: 'text'}>
type ThinkingPart = Extract<Part, {type: 'thinking'}>
type ImagePart = Extract<Part, {type: 'image'}>
type ToolCallPart = Extract<Part, {type: 'tool-call'}>
type ToolResultPart = Extract<Part, {type: 'tool-result'}>

export function useMessagePartText(): Accessor<TextPart | null> {
  const {part} = usePart()
  return () => {
    const value = part()
    return value.type === 'text' ? value : null
  }
}

export function useMessagePartReasoning(): Accessor<ThinkingPart | null> {
  const {part} = usePart()
  return () => {
    const value = part()
    return value.type === 'thinking' ? value : null
  }
}

export function useMessagePartImage(): Accessor<ImagePart | null> {
  const {part} = usePart()
  return () => {
    const value = part()
    return value.type === 'image' ? value : null
  }
}

export function useMessagePartToolCall(): Accessor<ToolCallPart | null> {
  const {part} = usePart()
  return () => {
    const value = part()
    return value.type === 'tool-call' ? value : null
  }
}

type DocumentPart = Extract<Part, {type: 'document'}>
type StructuredOutputPart = Extract<Part, {type: 'structured-output'}>

export function useMessagePartFile(): Accessor<DocumentPart | null> {
  const {part} = usePart()
  return () => {
    const value = part()
    return value.type === 'document' ? value : null
  }
}

export function useMessagePartData(): Accessor<StructuredOutputPart | null> {
  const {part} = usePart()
  return () => {
    const value = part()
    return value.type === 'structured-output' ? value : null
  }
}

export function useMessagePartSource(): Accessor<null> {
  return () => null
}

function isTerminal(part: Part): boolean {
  if (part.type === 'tool-call') return part.state === 'complete' || part.state === 'approval-responded'
  if (part.type === 'tool-result') return part.state !== 'streaming'
  if (part.type === 'structured-output') return part.status !== 'streaming'
  return true
}

function sourceUrl(part: ImagePart): string {
  const source = part.source
  return source.type === 'url' ? source.value : `data:${source.mimeType};base64,${source.value}`
}

type TextProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  component?: ValidComponent
  streaming?: boolean
}

function Text(props: TextProps): JSX.Element {
  const text = useMessagePartText()
  const [local, rest] = splitProps(props, ['component', 'streaming'])
  return (
    <Show when={text()}>
      {(part) => (
        <Show when={local.component} fallback={<Primitive.span {...rest}>{part().content}</Primitive.span>}>
          {(component) => <Dynamic component={component()} part={part()} streaming={local.streaming} />}
        </Show>
      )}
    </Show>
  )
}

function Image(
  props: JSX.ImgHTMLAttributes<HTMLImageElement> & Slottable<JSX.ImgHTMLAttributes<HTMLImageElement>>,
): JSX.Element {
  const image = useMessagePartImage()
  return <Show when={image()}>{(part) => <Primitive.img src={sourceUrl(part())} {...props} />}</Show>
}

function InProgress(props: {children: JSX.Element}): JSX.Element {
  const {part} = usePart()
  return <Show when={!isTerminal(part())}>{props.children}</Show>
}

export const MessagePart = {Text, Image, InProgress}
export type {TextPart, ThinkingPart, ImagePart, ToolCallPart, ToolResultPart}
