import {createContext, createSignal, splitProps, useContext, type Accessor, type JSX, type ParentProps} from 'solid-js'

type ChainState = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
  toggle: () => void
  streaming: Accessor<boolean>
}

const ChainContext = createContext<ChainState>()

export function useChainOfThought(): ChainState {
  const context = useContext(ChainContext)
  if (!context) throw new Error('ChainOfThought.* must be used within a ChainOfThought.Root')
  return context
}

type RootProps = ParentProps<{defaultOpen?: boolean; streaming?: boolean}>

function Root(props: RootProps): JSX.Element {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const open = () => userOpen() ?? props.streaming ?? false
  const state: ChainState = {
    open,
    setOpen: (next) => setUserOpen(next),
    toggle: () => setUserOpen(!open()),
    streaming: () => props.streaming ?? false,
  }
  return <ChainContext.Provider value={state}>{props.children}</ChainContext.Provider>
}

function AccordionTrigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const chain = useChainOfThought()
  const [local, rest] = splitProps(props, ['onClick'])
  return (
    <button
      type="button"
      aria-expanded={chain.open()}
      onClick={(event) => {
        chain.toggle()
        if (typeof local.onClick === 'function') local.onClick(event)
      }}
      {...rest}
    />
  )
}

export const ChainOfThought = Object.assign(Root, {Root, AccordionTrigger})
