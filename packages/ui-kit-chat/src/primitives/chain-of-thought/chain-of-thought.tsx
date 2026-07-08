import {createContext, createSignal, splitProps, useContext, type Accessor, type JSX, type ParentProps} from 'solid-js'
import {createSettled, SETTLE_DELAY_MS} from '../../behaviors/create-settled.js'

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
  settleDelayMs?: number
}>

function Root(props: RootProps): JSX.Element {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const settled = createSettled(() => props.streaming ?? false, props.settleDelayMs ?? SETTLE_DELAY_MS)
  const active = () => Boolean(props.streaming) || !settled()
  const open = () => userOpen() ?? (active() || Boolean(props.pinnedOpen))
  const state: ChainState = {
    open,
    setOpen: (next) => setUserOpen(next),
    toggle: () => setUserOpen(!open()),
    streaming: () => props.streaming ?? false,
    preview: () => userOpen() === undefined && !props.pinnedOpen && active(),
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
