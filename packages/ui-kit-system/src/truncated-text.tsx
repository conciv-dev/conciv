import {
  createContext,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  Show,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useTooltipContext} from '@ark-ui/solid/tooltip'
import {Tooltip} from './tooltip.js'

export type TruncatedTextSide = 'top' | 'bottom' | 'left' | 'right'

const ROUNDING_SLACK = 1

export const CLIP_REVEAL = 'max-w-[25rem] [overflow-wrap:anywhere]'

function isClipped(element: HTMLElement | undefined): boolean {
  if (element === undefined) return false
  return element.scrollWidth - element.clientWidth > ROUNDING_SLACK
}

export type ClipReveal = {
  clipped: Accessor<boolean>
  ref: (node: HTMLElement) => void
  onOpenChange: (details: {open: boolean}) => void
}

function describedWhen<T extends {'aria-describedby'?: string | undefined}>(revealed: boolean, triggerProps: T): T {
  return {...triggerProps, 'aria-describedby': revealed ? triggerProps['aria-describedby'] : undefined}
}

export function revealTriggerProps<T extends {'aria-describedby'?: string | undefined}>(
  reveal: ClipReveal,
  triggerProps: T,
): T {
  return describedWhen(reveal.clipped(), triggerProps)
}

export function createClipReveal(): ClipReveal {
  const [clipped, setClipped] = createSignal(false)
  let element: HTMLElement | undefined
  return {
    clipped,
    ref: (node) => {
      element = node
    },
    onOpenChange: (details) => setClipped(details.open && isClipped(element)),
  }
}

export type TruncatedTextProps = {
  text: string
  class?: string
  side?: TruncatedTextSide
  children?: JSX.Element
}

type RevealTarget = {text: Accessor<string>; element: Accessor<HTMLElement | undefined>}

type TruncatedTextScope = {
  register: (value: string, target: RevealTarget) => void
  release: (value: string) => void
  revealing: (value: string) => boolean
}

const TruncatedTextScopeContext = createContext<TruncatedTextScope>()

export type TruncatedTextGroupProps = {side?: TruncatedTextSide; children?: JSX.Element}

export function TruncatedTextGroup(props: TruncatedTextGroupProps): JSX.Element {
  const [local] = splitProps(props, ['side', 'children'])
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}} lazyMount unmountOnExit>
      <SharedReveal>{local.children}</SharedReveal>
    </Tooltip.Root>
  )
}

function SharedReveal(props: {children?: JSX.Element}): JSX.Element {
  const api = useTooltipContext()
  const [targets, setTargets] = createStore<Record<string, RevealTarget | undefined>>({})
  const shown = createMemo(() => {
    const value = api().triggerValue
    if (!api().open || value === null) return undefined
    const target = targets[value]
    return target && isClipped(target.element()) ? {value, text: target.text} : undefined
  })
  const scope: TruncatedTextScope = {
    register: (value, target) => setTargets(value, target),
    release: (value) => setTargets(value, undefined),
    revealing: (value) => shown()?.value === value,
  }
  return (
    <TruncatedTextScopeContext.Provider value={scope}>
      {props.children}
      <Show when={shown()}>
        {(target) => (
          <Tooltip.Positioner>
            <Tooltip.Content class={CLIP_REVEAL}>{target().text()}</Tooltip.Content>
          </Tooltip.Positioner>
        )}
      </Show>
    </TruncatedTextScopeContext.Provider>
  )
}

function ScopedTruncatedText(props: TruncatedTextProps & {scope: TruncatedTextScope}): JSX.Element {
  const [local] = splitProps(props, ['text', 'class', 'children', 'scope'])
  const value = createUniqueId()
  const node: {element?: HTMLElement} = {}
  onMount(() => {
    const scope = local.scope
    scope.register(value, {text: () => local.text, element: () => node.element})
    onCleanup(() => scope.release(value))
  })
  return (
    <Tooltip.Trigger
      value={value}
      asChild={(triggerProps) => (
        <span
          {...describedWhen(local.scope.revealing(value), triggerProps())}
          ref={(element) => {
            node.element = element
          }}
          class={`truncate ${local.class ?? ''}`}
        >
          {local.children ?? local.text}
        </span>
      )}
    />
  )
}

export function TruncatedText(props: TruncatedTextProps): JSX.Element {
  return (
    <Show when={useContext(TruncatedTextScopeContext)} fallback={<OwnTruncatedText {...props} />}>
      {(scope) => <ScopedTruncatedText {...props} scope={scope()} />}
    </Show>
  )
}

function OwnTruncatedText(props: TruncatedTextProps): JSX.Element {
  const [local] = splitProps(props, ['text', 'class', 'side', 'children'])
  const reveal = createClipReveal()
  return (
    <Tooltip.Root
      onOpenChange={reveal.onOpenChange}
      positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}}
      lazyMount
      unmountOnExit
    >
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <span
            {...revealTriggerProps(reveal, triggerProps())}
            ref={reveal.ref}
            class={`truncate ${local.class ?? ''}`}
          >
            {local.children ?? local.text}
          </span>
        )}
      />
      <Show when={reveal.clipped()}>
        <Tooltip.Positioner>
          <Tooltip.Content class={CLIP_REVEAL}>{local.text}</Tooltip.Content>
        </Tooltip.Positioner>
      </Show>
    </Tooltip.Root>
  )
}
