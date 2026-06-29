import {createContext, useContext, type Accessor, type JSX} from 'solid-js'

const ToolDurationContext = createContext<Accessor<number | undefined>>(() => undefined)

export function ToolDurationProvider(props: {value: Accessor<number | undefined>; children: JSX.Element}): JSX.Element {
  return <ToolDurationContext.Provider value={props.value}>{props.children}</ToolDurationContext.Provider>
}

export function useToolCallDuration(): Accessor<number | undefined> {
  return useContext(ToolDurationContext)
}
