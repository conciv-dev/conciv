import {createContext, createSignal, Show, splitProps, useContext, type JSX, type ParentProps} from 'solid-js'
import {Primitive} from '../util/primitive.js'

// A "chain" = the consecutive thinking + tool parts grouped by groupSegments. The Root owns the
// collapse state (open while streaming, collapsible once settled). AccordionTrigger toggles; Parts
// renders the chain body when open. View-state collapse can be wired by the styled layer.
type ChainState = {open: () => boolean; toggle: () => void; streaming: () => boolean}

const ChainContext = createContext<ChainState>()

function useChain(): ChainState {
  const context = useContext(ChainContext)
  if (!context) throw new Error('ChainOfThought.* must be used within a ChainOfThought.Root')
  return context
}

type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {defaultOpen?: boolean; streaming?: boolean}

function Root(props: RootProps): JSX.Element {
  const [local, rest] = splitProps(props, ['defaultOpen', 'streaming'])
  const [open, setOpen] = createSignal(local.defaultOpen ?? false)
  const state: ChainState = {
    open: () => open() || (local.streaming ?? false),
    toggle: () => setOpen((value) => !value),
    streaming: () => local.streaming ?? false,
  }
  return (
    <ChainContext.Provider value={state}>
      <Primitive.div
        data-streaming={local.streaming ? '' : undefined}
        data-state={state.open() ? 'open' : 'closed'}
        {...rest}
      />
    </ChainContext.Provider>
  )
}

function AccordionTrigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const chain = useChain()
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

function Parts(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>): JSX.Element {
  const chain = useChain()
  const [local, rest] = splitProps(props, ['children'])
  return (
    <Show when={chain.open()}>
      <Primitive.div {...rest}>{local.children}</Primitive.div>
    </Show>
  )
}

export const ChainOfThought = Object.assign(Root, {Root, AccordionTrigger, Parts})
