import {createContext, createEffect, createMemo, onCleanup, useContext, type JSX} from 'solid-js'
import type {EmbeddedCardHeader} from '../primitives/tool-row.js'

export type CardChrome = 'card' | 'embedded'

export type EmbeddedHeaderChannel = (read: () => EmbeddedCardHeader) => () => void

type CardChromeValue = {
  chrome: () => CardChrome
  headerChannel: () => EmbeddedHeaderChannel | undefined
  rowLine: () => string
}

const defaultValue: CardChromeValue = {chrome: () => 'card', headerChannel: () => undefined, rowLine: () => ''}

const CardChromeContext = createContext<CardChromeValue>(defaultValue)

export function CardChromeProvider(props: {
  value: CardChrome
  headerChannel?: EmbeddedHeaderChannel
  rowLine?: () => string
  children: JSX.Element
}): JSX.Element {
  const chrome = createMemo(() => props.value)
  const value: CardChromeValue = {
    chrome,
    headerChannel: () => props.headerChannel,
    rowLine: () => props.rowLine?.() ?? '',
  }
  return <CardChromeContext.Provider value={value}>{props.children}</CardChromeContext.Provider>
}

export function useCardChrome(): () => CardChrome {
  return (useContext(CardChromeContext) ?? defaultValue).chrome
}

export function useEmbeddedCard(): () => boolean {
  const chrome = useCardChrome()
  return () => chrome() === 'embedded'
}

export function useEmbeddedHeaderChannel(): () => EmbeddedHeaderChannel | undefined {
  return (useContext(CardChromeContext) ?? defaultValue).headerChannel
}

export function useEmbeddedRowLine(): () => string {
  return (useContext(CardChromeContext) ?? defaultValue).rowLine
}

export function publishCardHeader(read: () => EmbeddedCardHeader): void {
  const headerChannel = useEmbeddedHeaderChannel()
  createEffect(() => {
    const publish = headerChannel()
    if (publish === undefined) return
    onCleanup(publish(read))
  })
}
