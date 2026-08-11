import {createContext, splitProps, useContext, type Accessor, type JSX, type ParentProps} from 'solid-js'
import {createAutoCollapse} from '../util/create-auto-collapse.js'

type ChainState = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
  toggle: () => void
  streaming: Accessor<boolean>
  preview: Accessor<boolean>
}

const ChainContext = createContext<ChainState>()

export function useChainOfThought(): ChainState {
  const context = useContext(ChainContext)
  if (!context) throw new Error('ChainOfThought.* must be used within a ChainOfThought.Root')
  return context
}

type RootProps = ParentProps<{
  defaultOpen?: boolean
  streaming?: boolean
  pinnedOpen?: boolean
}>

function Root(props: RootProps): JSX.Element {
  const streaming = () => Boolean(props.streaming)
  const forceOpen = () => Boolean(props.pinnedOpen)
  const collapse = createAutoCollapse({streaming, defaultOpen: props.defaultOpen, forceOpen})
  const state: ChainState = {
    open: collapse.open,
    setOpen: collapse.setOpen,
    toggle: collapse.toggle,
    streaming,
    preview: () => collapse.isAutoOpen() && !forceOpen(),
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
