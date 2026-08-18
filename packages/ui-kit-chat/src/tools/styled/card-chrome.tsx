import {createContext, createMemo, useContext, type JSX} from 'solid-js'

export type CardChrome = 'card' | 'embedded'

const defaultChrome = (): CardChrome => 'card'

const CardChromeContext = createContext<() => CardChrome>(defaultChrome)

export function CardChromeProvider(props: {value: CardChrome; children: JSX.Element}): JSX.Element {
  const chrome = createMemo(() => props.value)
  return <CardChromeContext.Provider value={chrome}>{props.children}</CardChromeContext.Provider>
}

export function useCardChrome(): () => CardChrome {
  return useContext(CardChromeContext) ?? defaultChrome
}

export function useEmbeddedCard(): () => boolean {
  const chrome = useCardChrome()
  return () => chrome() === 'embedded'
}
