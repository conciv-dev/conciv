import {createContext, Show, splitProps, useContext, type JSX} from 'solid-js'
import {createActionButton} from '../util/create-action-button.js'
import {Primitive} from '../util/primitive.js'

export type BranchState = {count: number; index: number; previous: () => void; next: () => void}

const inert: BranchState = {count: 1, index: 0, previous: () => {}, next: () => {}}

const BranchContext = createContext<BranchState>(inert)

export const BranchProvider = BranchContext.Provider

export function useBranch(): BranchState {
  return useContext(BranchContext)
}

function Root(props: JSX.HTMLAttributes<HTMLDivElement> & {hideWhenSingleBranch?: boolean}): JSX.Element {
  const branch = useBranch()
  const [local, rest] = splitProps(props, ['hideWhenSingleBranch'])
  const hidden = () => (local.hideWhenSingleBranch ?? false) && branch.count <= 1
  return (
    <Show when={!hidden()}>
      <Primitive.div {...rest} />
    </Show>
  )
}

const Previous = createActionButton('Previous', () => {
  const branch = useBranch()
  return () => ({run: () => branch.previous(), disabled: branch.index <= 0})
})

const Next = createActionButton('Next', () => {
  const branch = useBranch()
  return () => ({run: () => branch.next(), disabled: branch.index >= branch.count - 1})
})

function Count(): JSX.Element {
  const branch = useBranch()
  return <>{branch.count}</>
}

function Number(): JSX.Element {
  const branch = useBranch()
  return <>{branch.index + 1}</>
}

export const BranchPicker = Object.assign(Root, {Root, Previous, Next, Count, Number})
