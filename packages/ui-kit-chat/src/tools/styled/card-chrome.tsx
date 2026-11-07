import {createContext, onCleanup, onMount, useContext, type Accessor, type JSX} from 'solid-js'
import type {EmbeddedCardHeader} from '../primitives/tool-row.js'

export type CardChrome = 'card' | 'embedded'

export type EmbeddedHeaderChannel = (read: () => EmbeddedCardHeader) => () => void

type CardChromeValue = {
  chrome: () => CardChrome
  headerChannel: () => EmbeddedHeaderChannel | undefined
  rowLine: () => string
  duration: Accessor<number | undefined>
}

const defaultValue: CardChromeValue = {
  chrome: () => 'card',
  headerChannel: () => undefined,
  rowLine: () => '',
  duration: () => undefined,
}

const CardChromeContext = createContext<CardChromeValue>(defaultValue)

export function CardChromeProvider(props: {
  value: CardChrome
  headerChannel?: EmbeddedHeaderChannel
  rowLine?: () => string
  duration?: Accessor<number | undefined>
  children: JSX.Element
}): JSX.Element {
  const value: CardChromeValue = {
    chrome: () => props.value,
    headerChannel: () => props.headerChannel,
    rowLine: () => props.rowLine?.() ?? '',
    duration: () => props.duration?.(),
  }
  return <CardChromeContext.Provider value={value}>{props.children}</CardChromeContext.Provider>
}

export function ToolDurationProvider(props: {value: Accessor<number | undefined>; children: JSX.Element}): JSX.Element {
  const value: CardChromeValue = {...useCardChromeValue(), duration: () => props.value()}
  return <CardChromeContext.Provider value={value}>{props.children}</CardChromeContext.Provider>
}

function useCardChromeValue(): CardChromeValue {
  return useContext(CardChromeContext) ?? defaultValue
}

export function useCardChrome(): () => CardChrome {
  return useCardChromeValue().chrome
}

export function useEmbeddedCard(): () => boolean {
  const chrome = useCardChrome()
  return () => chrome() === 'embedded'
}

export function useEmbeddedHeaderChannel(): () => EmbeddedHeaderChannel | undefined {
  return useCardChromeValue().headerChannel
}

export function useEmbeddedRowLine(): () => string {
  return useCardChromeValue().rowLine
}

export function useToolCallDuration(): Accessor<number | undefined> {
  return useCardChromeValue().duration
}

export function publishCardHeader(read: () => EmbeddedCardHeader): void {
  const headerChannel = useEmbeddedHeaderChannel()
  onMount(() => {
    const publish = headerChannel()
    if (publish !== undefined) onCleanup(publish(read))
  })
}
