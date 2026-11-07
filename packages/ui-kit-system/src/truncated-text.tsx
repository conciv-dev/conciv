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

type RevealTarget =
  | {kind: 'clip'; text: Accessor<string>; element: Accessor<HTMLElement | undefined>}
  | {kind: 'label'; render: () => JSX.Element}

export type SharedTooltip = {
  side: () => TruncatedTextSide
  owns: (api: ReturnType<typeof useTooltipContext>) => boolean
  register: (value: string, target: RevealTarget) => void
  release: (value: string) => void
  describe: <T extends {'aria-describedby'?: string | undefined}>(value: string, triggerProps: T) => T
}

type Shown = {key: string; value: string; target: RevealTarget}

const SharedTooltipContext = createContext<SharedTooltip>()

export function useSharedTooltip(): SharedTooltip | undefined {
  return useContext(SharedTooltipContext)
}

export type TruncatedTextGroupProps = {side?: TruncatedTextSide; children?: JSX.Element}

export function TruncatedTextGroup(props: TruncatedTextGroupProps): JSX.Element {
  const [local] = splitProps(props, ['side', 'children'])
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}} lazyMount unmountOnExit>
      <SharedReveal side={local.side ?? 'top'}>{local.children}</SharedReveal>
    </Tooltip.Root>
  )
}

function shownTarget(value: string, target: RevealTarget | undefined): Shown | undefined {
  if (target?.kind === 'label') return {key: value, value, target}
  if (target?.kind === 'clip' && isClipped(target.element())) return {key: 'clip', value, target}
  return undefined
}

function revealedContent(shown: Shown | undefined): JSX.Element {
  if (shown?.target.kind === 'label') return shown.target.render()
  if (shown?.target.kind === 'clip') return shown.target.text()
  return undefined
}

function SharedReveal(props: {side: TruncatedTextSide; children?: JSX.Element}): JSX.Element {
  const api = useTooltipContext()
  const [targets, setTargets] = createStore<Record<string, RevealTarget | undefined>>({})
  const shown = createMemo(() => {
    const value = api().triggerValue
    if (!api().open || value === null) return undefined
    return shownTarget(value, targets[value])
  })
  const scope: SharedTooltip = {
    side: () => props.side,
    owns: (candidate) => candidate === api,
    register: (value, target) => setTargets(value, target),
    release: (value) => setTargets(value, undefined),
    describe: (value, triggerProps) => describedWhen(shown()?.value === value, triggerProps),
  }
  return (
    <SharedTooltipContext.Provider value={scope}>
      {props.children}
      <Show when={shown()?.key} keyed>
        {(key) => (
          <Tooltip.Positioner>
            <Tooltip.Content class={key === 'clip' ? CLIP_REVEAL : undefined}>
              {revealedContent(shown())}
            </Tooltip.Content>
          </Tooltip.Positioner>
        )}
      </Show>
    </SharedTooltipContext.Provider>
  )
}

function ScopedTruncatedText(props: TruncatedTextProps & {scope: SharedTooltip}): JSX.Element {
  const [local] = splitProps(props, ['text', 'class', 'children', 'scope'])
  const value = createUniqueId()
  const node: {element?: HTMLElement} = {}
  onMount(() => {
    const scope = local.scope
    scope.register(value, {kind: 'clip', text: () => local.text, element: () => node.element})
    onCleanup(() => scope.release(value))
  })
  return (
    <Tooltip.Trigger
      value={value}
      asChild={(triggerProps) => (
        <span
          {...local.scope.describe(value, triggerProps())}
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
    <Show when={useContext(SharedTooltipContext)} fallback={<OwnTruncatedText {...props} />}>
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
